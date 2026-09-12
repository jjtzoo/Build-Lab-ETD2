"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { TOWERS } from "@/lib/domain/towerCatalog";
import {
  cellLabel,
  type GridPoint,
  type MapConfig,
  type MapPath,
  type PixelPoint,
  type WaveMode,
} from "@/lib/domain/mapConfig";
import { MAPS } from "@/lib/domain/mapCatalog";
import {
  bestSpotsForTower,
  coverageForMode,
  deadCells,
  gridToWorld,
  pathsForMode,
  worldToGrid,
  type ModeCoverage,
} from "@/lib/engine/mapPlacement";
import { isTowerLoggable, liveTowerReachableLevel } from "@/lib/engine/liveGame";
import { evolutionTargets } from "@/lib/domain/towerEvolution";
import { roman } from "@/components/build-lab/primitives";
import { useLiveGame } from "@/components/live/store";
import { LiveTowerIcon } from "@/components/live/LiveTowerIcon";

type EditMode = "calibrate" | "trace" | "buildable" | "measure" | null;

const TOP_N = 6;
/** Padding around the traced extent, in cells, for the schematic view. */
const SCHEMATIC_PAD = 1.5;

/**
 * Reference shots of one tower's in-game range circle, one per distinct
 * `range` value in the catalog. All taken on Forest at the same zoom, so
 * the grid calibrated on one applies to the others — load one as the
 * editor backdrop to measure `rangeUnitsPerCell` against.
 */
const RANGE_REFERENCES = [625, 875, 1000, 1125, 1500, 1750] as const;

/** The game's own word for a spot the route runs past more than once. */
function passLabel(passes: number): string | null {
  if (passes >= 3) return `${passes}× pass`;
  if (passes === 2) return "double-pass";
  return null;
}

function toSvgPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): PixelPoint {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const local = point.matrixTransform(ctm.inverse());
  return { x: local.x, y: local.y };
}

/**
 * Two coordinate spaces are in play. The editor draws over a screenshot,
 * so it works in the image's pixel space via `gridToWorld`. The player's
 * schematic draws in grid space directly — an undistorted top-down view,
 * where cells are square and a tower's range is a true circle rather than
 * the ellipse the tilted game camera shows.
 */
type Projector = (cell: GridPoint) => PixelPoint;

function pathD(project: Projector, path: MapPath): string {
  if (path.points.length < 2) return "";
  return path.points
    .map((cell, i) => {
      const p = project(cell);
      return `${i === 0 ? "M" : "L"}${p.x},${p.y}`;
    })
    .join(" ");
}

type ArrowMarker = { x: number; y: number; angle: number };

/**
 * Direction chevrons along a path, evenly spaced by arc length in grid
 * units (not by point count — traced polylines have wildly uneven segment
 * lengths, so walking points directly would bunch arrows on short hops
 * and leave long straights bare).
 */
function arrowMarkers(
  points: readonly GridPoint[],
  spacing: number,
): ArrowMarker[] {
  if (points.length < 2 || spacing <= 0) return [];
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.col - a.col;
    const dy = b.row - a.row;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) {
      segments.push({ a, dx, dy, len, angle: (Math.atan2(dy, dx) * 180) / Math.PI });
    }
  }
  const total = segments.reduce((sum, seg) => sum + seg.len, 0);
  if (total === 0) return [];

  const markers: ArrowMarker[] = [];
  let target = Math.min(spacing * 0.6, total / 2);
  let travelled = 0;
  for (const seg of segments) {
    while (target <= travelled + seg.len) {
      const t = (target - travelled) / seg.len;
      markers.push({
        x: seg.a.col + seg.dx * t,
        y: seg.a.row + seg.dy * t,
        angle: seg.angle,
      });
      target += spacing;
    }
    travelled += seg.len;
  }
  return markers;
}

function cellPolygon(project: Projector, cell: GridPoint): string {
  return (
    [
      { col: cell.col - 0.5, row: cell.row - 0.5 },
      { col: cell.col + 0.5, row: cell.row - 0.5 },
      { col: cell.col + 0.5, row: cell.row + 0.5 },
      { col: cell.col - 0.5, row: cell.row + 0.5 },
    ] as GridPoint[]
  )
    .map((corner) => {
      const p = project(corner);
      return `${p.x},${p.y}`;
    })
    .join(" ");
}

/** Tight grid-space viewBox around everything traced. */
function schematicViewBox(map: MapConfig): string | null {
  const cells: GridPoint[] = [
    ...map.buildableCells,
    ...map.paths.flatMap((path) => [...path.points]),
  ];
  if (cells.length === 0) return null;

  const cols = cells.map((cell) => cell.col);
  const rows = cells.map((cell) => cell.row);
  const minCol = Math.min(...cols) - SCHEMATIC_PAD;
  const maxCol = Math.max(...cols) + SCHEMATIC_PAD;
  const minRow = Math.min(...rows) - SCHEMATIC_PAD;
  const maxRow = Math.max(...rows) + SCHEMATIC_PAD;

  return `${minCol} ${minRow} ${maxCol - minCol} ${maxRow - minRow}`;
}

/**
 * Where should this tower go — a per-map, grid-traced coverage view.
 *
 * The player view is a schematic: buildable cells as blocks, the wave's
 * route as a line, drawn straight from the authored geometry in
 * `data/maps/*.json`. The reference screenshot only appears in the
 * authoring mode (`?edit=1`), where you're tracing against it.
 */
export function MapPanel({ assets }: { assets: BuildLabAssets }) {
  const reduce = useReducedMotion();
  const searchParams = useSearchParams();
  const editEnabled = searchParams.get("edit") === "1";

  const [mapId, setMapId] = useState(MAPS[0].id);
  const baseMap = useMemo(
    () => MAPS.find((entry) => entry.id === mapId) ?? MAPS[0],
    [mapId],
  );
  const [draft, setDraft] = useState<MapConfig | null>(null);
  const map = draft?.id === baseMap.id ? draft : baseMap;

  const [mode, setMode] = useState<WaveMode>("standard");
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [tracePathId, setTracePathId] = useState<string>("main");
  const [calibrationClicks, setCalibrationClicks] = useState<PixelPoint[]>(
    [],
  );
  const [measureClicks, setMeasureClicks] = useState<PixelPoint[]>([]);
  /** First corner of a rectangle fill, while the second is being chosen. */
  const [fillAnchor, setFillAnchor] = useState<GridPoint | null>(null);
  const [measureRange, setMeasureRange] = useState("1000");
  /** Editor backdrop override — a tower-range reference shot, or the map's own image. */
  const [backdrop, setBackdrop] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  const [query, setQuery] = useState("");
  const [selectedTowerId, setSelectedTowerId] = useState<string | null>(
    null,
  );
  const [selectedCell, setSelectedCell] = useState<GridPoint | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  function updateMap(change: (current: MapConfig) => MapConfig) {
    setDraft(change(map));
  }

  const allocation = useLiveGame((s) => s.allocation);
  const built = useLiveGame((s) => s.built);

  // Only towers this game's own picks can actually reach — the same gate
  // Field/Summon use. Ranking placement for a tower you can't summon yet
  // is noise, not help.
  const availableTowers = useMemo(
    () => TOWERS.filter((t) => isTowerLoggable(t.id, allocation)),
    [allocation],
  );

  /**
   * What's standing on the field right now, ready to tap.
   *
   * This panel is reading the same game state the field log already
   * holds, so asking the player to retype a tower's name mid-match is
   * busywork. Rows are per (tower, level); a tower held at two levels
   * collapses to its highest, since that's the copy worth placing well.
   *
   * Mono and basic towers are deliberately absent: `monoTowers.v1.json`
   * carries no range, damage, or attack speed, so there is nothing
   * honest to rank them with.
   */
  const fieldPicks = useMemo(() => {
    const highestLevel = new Map<string, number>();
    for (const row of built) {
      highestLevel.set(
        row.towerId,
        Math.max(highestLevel.get(row.towerId) ?? 0, row.level),
      );
    }
    return [...highestLevel.entries()]
      .map(([towerId, level]) => {
        const tower = TOWERS.find((t) => t.id === towerId);
        return tower ? { tower, level } : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [built]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return availableTowers
      .filter((t) => t.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, availableTowers]);

  // Looked up across the whole catalog, not just what's reachable: an
  // evolution target you're saving toward is a legitimate thing to plan a
  // cell around before its keystones are in hand.
  const selectedTower = selectedTowerId
    ? TOWERS.find((t) => t.id === selectedTowerId) ?? null
    : null;
  const selectionReachable = selectedTower
    ? isTowerLoggable(selectedTower.id, allocation)
    : false;

  // A tower picked off the field is evaluated at the level it is actually
  // standing at; one picked from search, at the level this game's picks
  // could reach. Either way the damage below is what you'd really get,
  // not the tower's max-level stat sheet.
  const fieldLevel = selectedTower
    ? fieldPicks.find((entry) => entry.tower.id === selectedTower.id)?.level
    : undefined;
  const towerLevel = selectedTower
    ? Math.max(
        1,
        fieldLevel ?? liveTowerReachableLevel(selectedTower.id, allocation),
      )
    : 1;

  /**
   * Where the selected tower can still grow.
   *
   * A cheap precursor is routinely fielded as a placeholder for something
   * bigger — evolving deducts what was already sunk, so the slot is really
   * being bought for the tower that ends up standing in it. Judge the cell
   * on that one, not on the tower holding it today. Targets out of reach
   * are kept and marked rather than hidden: planning the cell is the whole
   * point of looking before the keystones land.
   */
  const evolutionPicks = useMemo(() => {
    if (!selectedTower) return [];
    return evolutionTargets(selectedTower.id, towerLevel)
      .map((step) => TOWERS.find((t) => t.id === step.towerId))
      .filter((tower): tower is NonNullable<typeof tower> => tower != null);
  }, [selectedTower, towerLevel]);

  // Damage per attack x attacks/sec, deliberately narrow — the same
  // "baseDps" discipline used elsewhere in this codebase. Doesn't model
  // AoE hitting more than one creep, ramp-up, elemental resist, or
  // ability damage; a spot's # of passes and longest run (shown
  // alongside) are the signal for whether ramp-up towers benefit.
  const towerDps = selectedTower
    ? (selectedTower.stats.damage[
        Math.min(towerLevel, selectedTower.stats.damage.length) - 1
      ] ?? 0) * selectedTower.stats.attackSpeed
    : 0;

  const activePaths = useMemo(
    () => pathsForMode(map, mode),
    [map, mode],
  );
  const hasAdvance = useMemo(
    () => pathsForMode(map, "advance").length > 0,
    [map],
  );

  const ranked = useMemo(() => {
    if (!selectedTower) return [];
    return bestSpotsForTower(
      map,
      selectedTower.stats.range,
      mode,
      TOP_N,
    );
  }, [map, selectedTower, mode]);

  const rankByKey = useMemo(() => {
    const byKey = new Map<string, number>();
    ranked.forEach((entry, index) => {
      byKey.set(`${entry.cell.col},${entry.cell.row}`, index);
    });
    return byKey;
  }, [ranked]);

  const spotCoverage: ModeCoverage | null =
    selectedTower && selectedCell
      ? coverageForMode(
          map,
          selectedCell,
          selectedTower.stats.range,
          mode,
        )
      : null;

  const traced =
    map.buildableCells.length > 0 ||
    map.paths.some((path) => path.points.length >= 2);
  const viewBox = schematicViewBox(map);
  const showScreenshot = editEnabled;

  // One shared coordinate space for the whole map, even though the dead
  // cells behind it are filled in separately per plaza — so two
  // different plazas never land on the same label (no two "D7"s).
  const labelOrigin = useMemo(() => {
    const cells = [...map.buildableCells, ...map.paths.flatMap((p) => p.points)];
    if (cells.length === 0) return { col: 0, row: 0 };
    return {
      col: Math.floor(Math.min(...cells.map((c) => c.col))),
      row: Math.floor(Math.min(...cells.map((c) => c.row))),
    };
  }, [map.buildableCells, map.paths]);

  const dead = useMemo(() => deadCells(map), [map]);

  // Editor draws over the screenshot in pixel space; the schematic draws
  // in grid space, where cells are square and range is a true circle.
  const project: Projector = showScreenshot
    ? (cell) => gridToWorld(map, cell)
    : (cell) => ({ x: cell.col, y: cell.row });
  const rangeRadius = selectedTower
    ? selectedTower.stats.range / map.rangeUnitsPerCell
    : 0;

  // Cell size in whatever unit the current view draws in: 1 in the
  // schematic (grid space, where a cell is literally 1 unit), the actual
  // pixel span of a cell in the editor. Text has no non-scaling-stroke
  // equivalent in SVG, so font-size has to be computed relative to this
  // rather than set as a fixed CSS value, or it renders illegibly tiny
  // or cell-sized-and-huge depending on which view is active.
  const cellUnitSize = showScreenshot
    ? (Math.hypot(map.grid.colVector.x, map.grid.colVector.y) +
        Math.hypot(map.grid.rowVector.x, map.grid.rowVector.y)) /
      2
    : 1;

  function handleSvgClick(event: React.MouseEvent<SVGSVGElement>) {
    if (!editMode || !svgRef.current) return;
    const p = toSvgPoint(svgRef.current, event.clientX, event.clientY);

    if (editMode === "calibrate") {
      const next = [...calibrationClicks, p].slice(-3);
      setCalibrationClicks(next);
      if (next.length === 3) {
        const [origin, colPt, rowPt] = next;
        updateMap((current) => ({
          ...current,
          grid: {
            origin,
            colVector: { x: colPt.x - origin.x, y: colPt.y - origin.y },
            rowVector: { x: rowPt.x - origin.x, y: rowPt.y - origin.y },
          },
        }));
      }
      return;
    }

    if (editMode === "measure") {
      // Click the range circle's centre, then any point on its edge.
      setMeasureClicks((clicks) => [...clicks, p].slice(-2));
      return;
    }

    if (editMode === "trace") {
      const cell = worldToGrid(map, p);
      updateMap((current) => ({
        ...current,
        paths: current.paths.map((path) =>
          path.id === tracePathId
            ? { ...path, points: [...path.points, cell] }
            : path,
        ),
      }));
      return;
    }

    if (editMode === "buildable") {
      const raw = worldToGrid(map, p);
      const cell = { col: Math.round(raw.col), row: Math.round(raw.row) };

      // Plazas are rectangular blocks, so marking one is two clicks —
      // opposite corners — rather than one per cell. A second click on
      // the same cell just toggles it, which keeps single cells easy.
      if (!fillAnchor) {
        setFillAnchor(cell);
        return;
      }

      const anchor = fillAnchor;
      setFillAnchor(null);

      if (anchor.col === cell.col && anchor.row === cell.row) {
        updateMap((current) => {
          const exists = current.buildableCells.some(
            (c) => c.col === cell.col && c.row === cell.row,
          );
          return {
            ...current,
            buildableCells: exists
              ? current.buildableCells.filter(
                  (c) => !(c.col === cell.col && c.row === cell.row),
                )
              : [...current.buildableCells, cell],
          };
        });
        return;
      }

      const minCol = Math.min(anchor.col, cell.col);
      const maxCol = Math.max(anchor.col, cell.col);
      const minRow = Math.min(anchor.row, cell.row);
      const maxRow = Math.max(anchor.row, cell.row);

      updateMap((current) => {
        const present = new Set(
          current.buildableCells.map((c) => `${c.col},${c.row}`),
        );
        const added: GridPoint[] = [];
        for (let col = minCol; col <= maxCol; col++) {
          for (let row = minRow; row <= maxRow; row++) {
            if (!present.has(`${col},${row}`)) added.push({ col, row });
          }
        }
        return {
          ...current,
          buildableCells: [...current.buildableCells, ...added],
        };
      });
    }
  }

  function mutateTracePath(
    change: (path: MapPath) => MapPath,
  ) {
    updateMap((current) => ({
      ...current,
      paths: current.paths.map((path) =>
        path.id === tracePathId ? change(path) : path,
      ),
    }));
  }

  function addPath() {
    const id = `path-${map.paths.length + 1}`;
    updateMap((current) => ({
      ...current,
      paths: [
        ...current.paths,
        { id, points: [], modes: ["advance"] as WaveMode[] },
      ],
    }));
    setTracePathId(id);
  }

  function togglePathMode(pathId: string, target: WaveMode) {
    updateMap((current) => ({
      ...current,
      paths: current.paths.map((path) =>
        path.id === pathId
          ? {
              ...path,
              modes: path.modes.includes(target)
                ? path.modes.filter((m) => m !== target)
                : [...path.modes, target],
            }
          : path,
      ),
    }));
  }

  /** The reciprocal case: Lava/Tropical's advance lane is the main path backwards. */
  function addReversedPath() {
    const source = map.paths.find((path) => path.id === tracePathId);
    if (!source || source.points.length < 2) return;
    const id = `${source.id}-reverse`;
    updateMap((current) => ({
      ...current,
      paths: [
        ...current.paths,
        {
          id,
          points: [...source.points].reverse(),
          modes: ["advance"] as WaveMode[],
        },
      ],
    }));
    setTracePathId(id);
  }

  async function exportJson() {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      /* clipboard unavailable — the textarea below still has it */
    }
  }

  const exportText = useMemo(() => JSON.stringify(map, null, 2), [map]);
  const tracePath = map.paths.find((path) => path.id === tracePathId);

  /**
   * Ratio between a tower's `range` stat and one grid cell, read straight
   * off a screenshot of that tower's in-game range circle. Both distances
   * come from the same image, so the camera's zoom cancels out.
   */
  const measurement = useMemo(() => {
    if (measureClicks.length < 2) return null;
    const [centre, edge] = measureClicks;
    const radiusPixels = Math.hypot(
      edge.x - centre.x,
      edge.y - centre.y,
    );
    const cellPixels =
      (Math.hypot(map.grid.colVector.x, map.grid.colVector.y) +
        Math.hypot(map.grid.rowVector.x, map.grid.rowVector.y)) /
      2;
    const range = Number(measureRange);
    if (!(radiusPixels > 0) || !(cellPixels > 0) || !(range > 0)) {
      return null;
    }
    const radiusCells = radiusPixels / cellPixels;
    return {
      radiusPixels,
      radiusCells,
      rangeUnitsPerCell: range / radiusCells,
    };
  }, [measureClicks, map.grid, measureRange]);

  return (
    <motion.section
      className="live-map-panel"
      aria-label="Map placement"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="live-panel-head">
        <h2>Where to build</h2>
        <span className="live-panel-note">
          {map.pathDurationSeconds != null ? (
            <>
              path length{" "}
              <b className="mono">{map.pathDurationSeconds}s</b>
            </>
          ) : (
            "path length unknown"
          )}
        </span>
      </header>

      <div className="live-map-controls">
        <label className="live-map-select">
          <span>Map</span>
          <select
            value={map.id}
            onChange={(e) => {
              setMapId(e.target.value);
              setDraft(null);
              setSelectedCell(null);
              setMode("standard");
              setTracePathId("main");
              setCalibrationClicks([]);
            }}
          >
            {MAPS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>

        <div
          className="live-map-modes"
          role="group"
          aria-label="Wave mode"
        >
          {(["standard", "advance"] as const).map((waveMode) => (
            <button
              key={waveMode}
              type="button"
              className="live-view-tab"
              data-on={mode === waveMode || undefined}
              disabled={waveMode === "advance" && !hasAdvance}
              title={
                waveMode === "advance" && !hasAdvance
                  ? "No advance-mode path traced for this map yet"
                  : undefined
              }
              onClick={() => {
                setMode(waveMode);
                setSelectedCell(null);
              }}
            >
              {waveMode === "standard" ? "Standard" : "Advance"}
            </button>
          ))}
        </div>
      </div>

      {fieldPicks.length > 0 && (
        <div className="live-map-picks">
          <span className="live-map-picks-label">On your field</span>
          <div className="live-map-chiprow">
            {fieldPicks.map(({ tower, level }) => (
              <button
                key={tower.id}
                type="button"
                className="live-map-chip"
                data-on={tower.id === selectedTowerId || undefined}
                onClick={() => {
                  setSelectedTowerId(
                    tower.id === selectedTowerId ? null : tower.id,
                  );
                  setSelectedCell(null);
                }}
              >
                <LiveTowerIcon
                  towerId={tower.id}
                  assets={assets}
                  size={18}
                />
                <span>{tower.name}</span>
                {tower.maxLevel > 1 && (
                  <span className="mono live-map-chip-level">
                    {roman(level)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {evolutionPicks.length > 0 && (
        <div className="live-map-picks">
          <span className="live-map-picks-label">
            {selectedTower?.name} evolves into — judge the cell on where it
            ends up
          </span>
          <div className="live-map-chiprow">
            {evolutionPicks.map((tower) => {
              const reachable = isTowerLoggable(tower.id, allocation);
              return (
                <button
                  key={tower.id}
                  type="button"
                  className="live-map-chip"
                  data-on={tower.id === selectedTowerId || undefined}
                  data-locked={!reachable || undefined}
                  title={
                    reachable
                      ? undefined
                      : "Not reachable yet — shown so you can plan the cell for it"
                  }
                  onClick={() => {
                    setSelectedTowerId(tower.id);
                    setSelectedCell(null);
                  }}
                >
                  <LiveTowerIcon
                    towerId={tower.id}
                    assets={assets}
                    size={18}
                  />
                  <span>{tower.name}</span>
                  <span className="mono live-map-chip-level">
                    {tower.stats.range}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="live-log">
        <input
          type="text"
          className="live-log-input"
          placeholder={
            availableTowers.length > 0
              ? fieldPicks.length > 0
                ? "＋ or search another tower you could build"
                : "＋ pick a tower to place — type a name"
              : "no towers available yet — spend a pick first"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={availableTowers.length === 0}
          aria-label="Search for a tower to evaluate placement for"
        />
        {query.trim() && matches.length === 0 && (
          <p className="live-panel-note">
            No tower you can currently build matches &quot;{query}&quot;.
          </p>
        )}
        {matches.length > 0 && (
          <ul className="live-log-results">
            {matches.map((tower) => (
              <li key={tower.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTowerId(tower.id);
                    setSelectedCell(null);
                    setQuery("");
                  }}
                >
                  <LiveTowerIcon
                    towerId={tower.id}
                    assets={assets}
                    size={20}
                  />
                  <span>{tower.name}</span>
                  <span className="live-log-max mono">
                    {tower.stats.range} range
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedTower && (
        <p className="live-map-selection">
          <LiveTowerIcon
            towerId={selectedTower.id}
            assets={assets}
            size={22}
          />
          <span>
            <b>{selectedTower.name}</b> · level{" "}
            <span className="mono">{roman(towerLevel)}</span> · range{" "}
            <span className="mono">{selectedTower.stats.range}</span> ·{" "}
            <span className="mono">
              {Math.round(towerDps).toLocaleString()}
            </span>{" "}
            DPS
            {!selectionReachable && (
              <span className="live-map-planning"> · planning ahead</span>
            )}
          </span>
          <button
            type="button"
            className="live-map-clear"
            onClick={() => {
              setSelectedTowerId(null);
              setSelectedCell(null);
            }}
          >
            clear
          </button>
        </p>
      )}

      <p className="live-map-assumption">
        Assumes 1 range unit = 1 grid cell — unverified against the game.
        Damage estimates are single-target uptime (time in range × damage ×
        attacks/sec) — they don&apos;t model AoE hitting more than one
        creep, ramp-up, or resist.
      </p>

      {!traced && !editEnabled ? (
        <p className="live-empty">
          {map.name} hasn&apos;t been traced yet — no path or buildable
          cells are recorded for it.
        </p>
      ) : (
        <div className="live-map-stage" data-schematic={!showScreenshot || undefined}>
          <svg
            ref={svgRef}
            className="live-map-svg"
            viewBox={
              showScreenshot
                ? `0 0 ${map.imageSize.w} ${map.imageSize.h}`
                : viewBox ?? `0 0 ${map.imageSize.w} ${map.imageSize.h}`
            }
            onClick={handleSvgClick}
            data-editing={editMode !== null || undefined}
          >
            {showScreenshot && (
              <image
                href={backdrop ?? map.image}
                x={0}
                y={0}
                width={map.imageSize.w}
                height={map.imageSize.h}
              />
            )}

            {dead.map((cell) => {
              const center = project(cell);
              return (
                <g key={`dead-${cell.col},${cell.row}`}>
                  <polygon
                    points={cellPolygon(project, cell)}
                    className="live-map-dead"
                  />
                  <text
                    x={center.x}
                    y={center.y}
                    className="live-map-cell-label"
                    style={{ fontSize: cellUnitSize * 0.22 }}
                    data-dead
                  >
                    {cellLabel(cell, labelOrigin)}
                  </text>
                </g>
              );
            })}

            {map.buildableCells.map((cell) => {
              const key = `${cell.col},${cell.row}`;
              const rank = rankByKey.get(key);
              const isSelected =
                selectedCell?.col === cell.col &&
                selectedCell?.row === cell.row;
              const center = project(cell);
              return (
                <g key={key}>
                  <polygon
                    points={cellPolygon(project, cell)}
                    className="live-map-block"
                    data-rank={rank !== undefined ? rank : undefined}
                    data-selected={isSelected || undefined}
                    onClick={(e) => {
                      if (editMode) return;
                      e.stopPropagation();
                      setSelectedCell(cell);
                    }}
                  />
                  <text
                    x={center.x}
                    y={center.y}
                    className="live-map-cell-label"
                    style={{ fontSize: cellUnitSize * 0.32 }}
                  >
                    {cellLabel(cell, labelOrigin)}
                  </text>
                </g>
              );
            })}

            {activePaths.map((path) => {
              const d = pathD(project, path);
              return (
                <g key={path.id}>
                  {!showScreenshot && (
                    <path d={d} className="live-map-path-glow" fill="none" />
                  )}
                  <path d={d} className="live-map-path" fill="none" />
                </g>
              );
            })}

            {!showScreenshot &&
              activePaths.map((path) => (
                <g key={`arrows-${path.id}`} className="live-map-arrows">
                  {arrowMarkers(path.points, 1.6).map((arrow, i) => (
                    <path
                      key={i}
                      d="M -0.11,-0.15 L 0.15,0 L -0.11,0.15 Z"
                      transform={`translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle})`}
                      className="live-map-arrow"
                    />
                  ))}
                </g>
              ))}

            {!showScreenshot &&
              activePaths.map((path) => {
                if (path.points.length < 2) return null;
                const start = path.points[0];
                const end = path.points[path.points.length - 1];
                return (
                  <g key={`portals-${path.id}`}>
                    <g className="live-map-portal" data-kind="in">
                      <circle cx={start.col} cy={start.row} r={0.62} className="live-map-portal-glow" />
                      <circle cx={start.col} cy={start.row} r={0.34} className="live-map-portal-core" />
                      <text
                        x={start.col}
                        y={start.row + 0.95}
                        className="live-map-portal-label"
                        style={{ fontSize: cellUnitSize * 0.24 }}
                      >
                        IN
                      </text>
                    </g>
                    <g className="live-map-portal" data-kind="out">
                      <circle cx={end.col} cy={end.row} r={0.62} className="live-map-portal-glow" />
                      <circle cx={end.col} cy={end.row} r={0.34} className="live-map-portal-core" />
                      <text
                        x={end.col}
                        y={end.row + 0.95}
                        className="live-map-portal-label"
                        style={{ fontSize: cellUnitSize * 0.24 }}
                      >
                        OUT
                      </text>
                    </g>
                  </g>
                );
              })}

            {editMode === "calibrate" &&
              calibrationClicks.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={10}
                  className="live-map-calib-point"
                />
              ))}

            {fillAnchor && (
              <polygon
                points={cellPolygon(project, fillAnchor)}
                className="live-map-block"
                data-selected
              />
            )}

            {editMode === "measure" && (
              <>
                {measureClicks.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={8}
                    className="live-map-calib-point"
                  />
                ))}
                {measurement && (
                  <circle
                    cx={measureClicks[0].x}
                    cy={measureClicks[0].y}
                    r={measurement.radiusPixels}
                    className="live-map-range"
                  />
                )}
              </>
            )}

            {/* Grid space only: over the screenshot this would have to be
                the ellipse the tilted camera projects, not a circle. */}
            {!showScreenshot && selectedCell && rangeRadius > 0 && (
              <circle
                cx={selectedCell.col}
                cy={selectedCell.row}
                r={rangeRadius}
                className="live-map-range"
              />
            )}
          </svg>
        </div>
      )}

      {selectedTower && spotCoverage && selectedCell && (
        <p className="live-map-readout mono">
          <b>{cellLabel(selectedCell, labelOrigin)}</b> · ≈
          {Math.round(
            spotCoverage.coveredSeconds * towerDps,
          ).toLocaleString()}{" "}
          dmg · {spotCoverage.coveragePercent.toFixed(1)}% of the route ·{" "}
          {spotCoverage.coveredSeconds.toFixed(1)}s
          {passLabel(spotCoverage.passes) && (
            <> · {passLabel(spotCoverage.passes)}</>
          )}
          {spotCoverage.perPath.length > 1 && (
            <>
              {" "}
              ·{" "}
              {spotCoverage.perPath
                .map(
                  (entry) =>
                    `${entry.pathId} ${entry.coverage.coveragePercent.toFixed(0)}%`,
                )
                .join(" / ")}
            </>
          )}
        </p>
      )}

      {selectedTower && ranked.length > 0 && (
        <div className="live-map-ranked">
          <h4>
            Best spots for {selectedTower.name}
            {mode === "advance" ? " — advance" : ""}
          </h4>
          <ul>
            {ranked.map((entry, i) => (
              <li
                key={`${entry.cell.col},${entry.cell.row}`}
                data-selected={
                  selectedCell?.col === entry.cell.col &&
                  selectedCell?.row === entry.cell.row
                    ? true
                    : undefined
                }
                onClick={() => setSelectedCell(entry.cell)}
              >
                <span className="live-map-rank mono">#{i + 1}</span>
                <span className="live-map-cell-name mono">
                  {cellLabel(entry.cell, labelOrigin)}
                </span>
                <span className="mono">
                  ≈
                  {Math.round(
                    entry.coverage.coveredSeconds * towerDps,
                  ).toLocaleString()}{" "}
                  dmg
                </span>
                <span className="mono">
                  {entry.coverage.coveragePercent.toFixed(1)}%
                </span>
                {passLabel(entry.coverage.passes) && (
                  <span className="live-map-pass">
                    {passLabel(entry.coverage.passes)}
                  </span>
                )}
                <span className="live-map-rank-seconds mono">
                  {entry.coverage.coveredSeconds.toFixed(1)}s
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editEnabled && (
        <div className="live-map-editor">
          <h4>Map editor</h4>
          <div className="live-map-editor-modes">
            {(
              [
                ["calibrate", "Calibrate grid"],
                ["trace", "Trace path"],
                ["buildable", "Mark buildable"],
                ["measure", "Measure range"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="live-view-tab"
                data-on={editMode === id || undefined}
                onClick={() => {
                  setEditMode((m) => (m === id ? null : id));
                  if (id !== "calibrate") setCalibrationClicks([]);
                  if (id !== "measure") setMeasureClicks([]);
                  setFillAnchor(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {editMode === "calibrate" && (
            <p className="live-panel-note">
              Click the grid origin, then one cell to the right, then one
              cell down. {calibrationClicks.length}/3 clicked.
            </p>
          )}

          {editMode === "trace" && (
            <div className="live-map-trace">
              <div className="live-map-paths">
                {map.paths.map((path) => (
                  <button
                    key={path.id}
                    type="button"
                    className="live-map-path-tab"
                    data-on={path.id === tracePathId || undefined}
                    onClick={() => setTracePathId(path.id)}
                  >
                    {path.id}{" "}
                    <span className="mono">{path.points.length}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className="live-map-path-tab"
                  onClick={addPath}
                >
                  ＋ path
                </button>
              </div>

              {tracePath && (
                <p className="live-panel-note">
                  Click along <b>{tracePath.id}</b>, spawn → exit (
                  {tracePath.points.length} points). Runs in:{" "}
                  {(["standard", "advance"] as const).map((waveMode) => (
                    <label key={waveMode} className="live-map-mode-check">
                      <input
                        type="checkbox"
                        checked={tracePath.modes.includes(waveMode)}
                        onChange={() =>
                          togglePathMode(tracePath.id, waveMode)
                        }
                      />
                      {waveMode}
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      mutateTracePath((path) => ({
                        ...path,
                        points: path.points.slice(0, -1),
                      }))
                    }
                  >
                    undo
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      mutateTracePath((path) => ({ ...path, points: [] }))
                    }
                  >
                    clear
                  </button>
                  <button type="button" onClick={addReversedPath}>
                    add reversed copy
                  </button>
                </p>
              )}
            </div>
          )}

          {editMode === "buildable" && (
            <p className="live-panel-note">
              {fillAnchor ? (
                <>
                  Corner set at{" "}
                  <b className="mono">
                    {fillAnchor.col},{fillAnchor.row}
                  </b>{" "}
                  — click the opposite corner to fill the block, or the
                  same cell again to toggle just it.{" "}
                  <button
                    type="button"
                    onClick={() => setFillAnchor(null)}
                  >
                    cancel
                  </button>
                </>
              ) : (
                <>
                  Click two opposite corners to fill a plaza (
                  {map.buildableCells.length} marked).{" "}
                  <button
                    type="button"
                    onClick={() =>
                      updateMap((current) => ({
                        ...current,
                        buildableCells: [],
                      }))
                    }
                  >
                    clear all
                  </button>
                </>
              )}
            </p>
          )}

          {editMode === "measure" && (
            <p className="live-panel-note">
              Calibrate the grid first, then click the range circle&apos;s
              centre and its edge.{" "}
              <label className="live-map-mode-check">
                backdrop
                <select
                  value={backdrop ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    setBackdrop(value || null);
                    setMeasureClicks([]);
                    if (value) {
                      setMeasureRange(
                        value.replace(/\D+/g, "").slice(-4),
                      );
                    }
                  }}
                >
                  <option value="">map image</option>
                  {RANGE_REFERENCES.map((range) => (
                    <option
                      key={range}
                      value={`/tower ranges/${range}.png`}
                    >
                      {range} range
                    </option>
                  ))}
                </select>
              </label>{" "}
              <label className="live-map-mode-check">
                tower range
                <input
                  type="number"
                  value={measureRange}
                  onChange={(e) => setMeasureRange(e.target.value)}
                  style={{ width: 72 }}
                />
              </label>
              <button
                type="button"
                onClick={() => setMeasureClicks([])}
              >
                reset
              </button>
              {measurement && (
                <>
                  {" "}
                  → radius{" "}
                  <b className="mono">
                    {measurement.radiusCells.toFixed(2)}
                  </b>{" "}
                  cells ={" "}
                  <b className="mono">
                    {measurement.rangeUnitsPerCell.toFixed(1)}
                  </b>{" "}
                  range units per cell{" "}
                  <button
                    type="button"
                    onClick={() =>
                      updateMap((current) => ({
                        ...current,
                        rangeUnitsPerCell:
                          Math.round(
                            measurement.rangeUnitsPerCell * 10,
                          ) / 10,
                      }))
                    }
                  >
                    apply
                  </button>
                </>
              )}
            </p>
          )}

          <div className="live-map-export">
            <button type="button" onClick={exportJson}>
              {copyState === "copied" ? "Copied!" : "Copy JSON"}
            </button>
            <span className="tc-export-note">
              Paste into <code>data/maps/{map.id}.json</code> to save.
            </span>
          </div>
          <textarea
            readOnly
            className="live-map-export-text"
            value={exportText}
          />
        </div>
      )}
    </motion.section>
  );
}
