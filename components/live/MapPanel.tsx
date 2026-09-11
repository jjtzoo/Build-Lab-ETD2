"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { TOWERS } from "@/lib/domain/towerCatalog";
import type { GridPoint, MapConfig } from "@/lib/domain/mapConfig";
import { getMap } from "@/lib/domain/mapCatalog";
import {
  bestSpotsForTower,
  coverageForSpot,
  gridToWorld,
  worldToGrid,
  type SpotCoverage,
} from "@/lib/engine/mapPlacement";
import { LiveTowerIcon } from "@/components/live/LiveTowerIcon";

type EditMode = "calibrate" | "trace" | "buildable" | null;

const TOP_N = 6;

function toSvgPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const local = point.matrixTransform(ctm.inverse());
  return { x: local.x, y: local.y };
}

function pathD(map: MapConfig): string {
  if (map.path.length < 2) return "";
  return map.path
    .map((cell, i) => {
      const p = gridToWorld(map, cell);
      return `${i === 0 ? "M" : "L"}${p.x},${p.y}`;
    })
    .join(" ");
}

/**
 * Where should this tower go — a per-map, grid-traced coverage view.
 *
 * Reads authored geometry from `data/maps/*.json` (see `lib/domain/mapConfig`)
 * and ranks buildable cells by how much of the wave's route a tower's range
 * would reach from there. `?edit=1` unlocks the authoring controls used to
 * trace a new map's grid/path/buildable cells in the first place — normal
 * players never see them.
 */
export function MapPanel({ assets }: { assets: BuildLabAssets }) {
  const reduce = useReducedMotion();
  const searchParams = useSearchParams();
  const editEnabled = searchParams.get("edit") === "1";

  const baseMap = useMemo(() => getMap("forest"), []);
  const [map, setMap] = useState<MapConfig>(baseMap);
  const [mode, setMode] = useState<EditMode>(null);
  const [calibrationClicks, setCalibrationClicks] = useState<
    { x: number; y: number }[]
  >([]);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  const [query, setQuery] = useState("");
  const [selectedTowerId, setSelectedTowerId] = useState<string | null>(
    null,
  );
  const [selectedCell, setSelectedCell] = useState<GridPoint | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return TOWERS
      .filter((t) => t.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query]);

  const selectedTower = selectedTowerId
    ? TOWERS.find((t) => t.id === selectedTowerId) ?? null
    : null;

  const ranked = useMemo(() => {
    if (!selectedTower) return [];
    return bestSpotsForTower(map, selectedTower.stats.range, TOP_N);
  }, [map, selectedTower]);

  const rankByKey = useMemo(() => {
    const byKey = new Map<string, number>();
    ranked.forEach((entry, index) => {
      byKey.set(`${entry.cell.col},${entry.cell.row}`, index);
    });
    return byKey;
  }, [ranked]);

  const traced = map.path.length >= 2 && map.buildableCells.length > 0;

  const spotCoverage: SpotCoverage | null =
    selectedTower && selectedCell
      ? coverageForSpot(map, selectedCell, selectedTower.stats.range)
      : null;

  function handleSvgClick(event: React.MouseEvent<SVGSVGElement>) {
    if (!mode || !svgRef.current) return;
    const p = toSvgPoint(svgRef.current, event.clientX, event.clientY);

    if (mode === "calibrate") {
      const next = [...calibrationClicks, p].slice(-3);
      setCalibrationClicks(next);
      if (next.length === 3) {
        const [origin, colPt, rowPt] = next;
        setMap((m) => ({
          ...m,
          grid: {
            origin,
            colVector: { x: colPt.x - origin.x, y: colPt.y - origin.y },
            rowVector: { x: rowPt.x - origin.x, y: rowPt.y - origin.y },
          },
        }));
      }
      return;
    }

    if (mode === "trace") {
      const cell = worldToGrid(map, p);
      setMap((m) => ({ ...m, path: [...m.path, cell] }));
      return;
    }

    if (mode === "buildable") {
      const raw = worldToGrid(map, p);
      const cell = { col: Math.round(raw.col), row: Math.round(raw.row) };
      setMap((m) => {
        const exists = m.buildableCells.some(
          (c) => c.col === cell.col && c.row === cell.row,
        );
        return {
          ...m,
          buildableCells: exists
            ? m.buildableCells.filter(
                (c) => !(c.col === cell.col && c.row === cell.row),
              )
            : [...m.buildableCells, cell],
        };
      });
    }
  }

  function undoTracePoint() {
    setMap((m) => ({ ...m, path: m.path.slice(0, -1) }));
  }

  function clearTrace() {
    setMap((m) => ({ ...m, path: [] }));
  }

  async function exportJson() {
    const json = JSON.stringify(map, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      /* clipboard unavailable — the textarea below still has it */
    }
  }

  const exportText = useMemo(() => JSON.stringify(map, null, 2), [map]);

  return (
    <motion.section
      className="live-map-panel"
      aria-label="Map placement"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="live-panel-head">
        <h2>{map.name}</h2>
        <span className="live-panel-note">
          Path length <b className="mono">{map.pathDurationSeconds}s</b>
        </span>
      </header>

      <div className="live-log">
        <input
          type="text"
          className="live-log-input"
          placeholder="＋ pick a tower to place — type a name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search for a tower to evaluate placement for"
        />
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
            <b>{selectedTower.name}</b> · range{" "}
            <span className="mono">{selectedTower.stats.range}</span>
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
      </p>

      {!traced && !editEnabled && (
        <p className="live-empty">
          This map hasn&apos;t been traced yet — no path or buildable cells
          are recorded.
        </p>
      )}

      <div className="live-map-stage">
        <svg
          ref={svgRef}
          className="live-map-svg"
          viewBox={`0 0 ${map.imageSize.w} ${map.imageSize.h}`}
          onClick={handleSvgClick}
          data-editing={mode !== null || undefined}
        >
          <image
            href={map.image}
            x={0}
            y={0}
            width={map.imageSize.w}
            height={map.imageSize.h}
          />

          {map.path.length >= 2 && (
            <path
              d={pathD(map)}
              className="live-map-path"
              fill="none"
            />
          )}

          {mode === "calibrate" &&
            calibrationClicks.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={10}
                className="live-map-calib-point"
              />
            ))}

          {map.buildableCells.map((cell) => {
            const key = `${cell.col},${cell.row}`;
            const rank = rankByKey.get(key);
            const world = gridToWorld(map, cell);
            const isSelected =
              selectedCell?.col === cell.col &&
              selectedCell?.row === cell.row;
            return (
              <circle
                key={key}
                cx={world.x}
                cy={world.y}
                r={isSelected ? 14 : rank !== undefined ? 12 : 7}
                className="live-map-cell"
                data-rank={rank !== undefined ? rank : undefined}
                data-selected={isSelected || undefined}
                onClick={(e) => {
                  if (mode) return;
                  e.stopPropagation();
                  setSelectedCell(cell);
                }}
              />
            );
          })}

          {selectedTower && selectedCell && (
            <circle
              cx={gridToWorld(map, selectedCell).x}
              cy={gridToWorld(map, selectedCell).y}
              r={
                (selectedTower.stats.range / map.rangeUnitsPerCell) *
                ((Math.hypot(map.grid.colVector.x, map.grid.colVector.y) +
                  Math.hypot(map.grid.rowVector.x, map.grid.rowVector.y)) /
                  2)
              }
              className="live-map-range"
            />
          )}
        </svg>
      </div>

      {selectedTower && spotCoverage && (
        <p className="live-map-readout mono">
          {spotCoverage.coveragePercent.toFixed(1)}% of the route ·{" "}
          {spotCoverage.coveredSeconds.toFixed(1)}s of {map.pathDurationSeconds}
          s
        </p>
      )}

      {selectedTower && ranked.length > 0 && (
        <div className="live-map-ranked">
          <h4>Best spots for {selectedTower.name}</h4>
          <ul>
            {ranked.map((entry, i) => (
              <li
                key={i}
                data-selected={
                  selectedCell?.col === entry.cell.col &&
                  selectedCell?.row === entry.cell.row
                    ? true
                    : undefined
                }
                onClick={() => setSelectedCell(entry.cell)}
              >
                <span className="live-map-rank mono">#{i + 1}</span>
                <span className="mono">
                  {entry.coverage.coveragePercent.toFixed(1)}%
                </span>
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
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="live-view-tab"
                data-on={mode === id || undefined}
                onClick={() => {
                  setMode((m) => (m === id ? null : id));
                  if (id !== "calibrate") setCalibrationClicks([]);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "calibrate" && (
            <p className="live-panel-note">
              Click the grid origin, then one cell to the right, then one
              cell down. {calibrationClicks.length}/3 clicked.
            </p>
          )}
          {mode === "trace" && (
            <p className="live-panel-note">
              Click along the path, spawn → exit ({map.path.length} points).{" "}
              <button type="button" onClick={undoTracePoint}>
                undo
              </button>{" "}
              <button type="button" onClick={clearTrace}>
                clear
              </button>
            </p>
          )}
          {mode === "buildable" && (
            <p className="live-panel-note">
              Click a grid cell to toggle it buildable (
              {map.buildableCells.length} marked).
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
