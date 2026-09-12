import type {
  GridPoint,
  MapConfig,
  MapPath,
  PixelPoint,
  WaveMode,
} from "@/lib/domain/mapConfig";

/**
 * Map placement geometry.
 *
 * Converts a traced path + buildable-cell grid (authored per map, see
 * `data/maps/*.json`) into "how much of the wave's route does a tower at
 * this spot actually cover" — the core question the Map panel answers.
 * Everything here is pure: no store, no React.
 */

export function gridToWorld(
  map: MapConfig,
  cell: GridPoint,
): PixelPoint {
  const { origin, colVector, rowVector } = map.grid;
  return {
    x: origin.x + cell.col * colVector.x + cell.row * rowVector.x,
    y: origin.y + cell.col * colVector.y + cell.row * rowVector.y,
  };
}

/** Inverse of {@link gridToWorld} — a pixel position back to grid coords. */
export function worldToGrid(
  map: MapConfig,
  point: PixelPoint,
): GridPoint {
  const { origin, colVector, rowVector } = map.grid;
  const px = point.x - origin.x;
  const py = point.y - origin.y;
  const det =
    colVector.x * rowVector.y - rowVector.x * colVector.y;
  if (det === 0) return { col: 0, row: 0 };

  return {
    col: (px * rowVector.y - py * rowVector.x) / det,
    row: (colVector.x * py - colVector.y * px) / det,
  };
}

/**
 * Distance between two cells, in cells.
 *
 * All coverage math runs in grid space rather than pixel space, because
 * the game's camera is tilted: a tower's range is a circle in the game
 * world but projects to a squashed ellipse on screen. Grid coordinates
 * are the undistorted space — cells are square there — so Euclidean
 * distance over (col, row) is the true in-game distance. Pixels are only
 * for drawing over a screenshot.
 */
function cellDistance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.col - b.col, a.row - b.row);
}


/** Every path the given wave mode runs creeps down. */
export function pathsForMode(
  map: MapConfig,
  mode: WaveMode,
): MapPath[] {
  return map.paths.filter((path) => path.modes.includes(mode));
}

export function pathLengthCells(
  map: MapConfig,
  path: MapPath,
): number {
  if (path.points.length < 2) return 0;

  let total = 0;
  for (let i = 1; i < path.points.length; i++) {
    total += cellDistance(path.points[i - 1], path.points[i]);
  }
  return total;
}

/**
 * Creep speed, from the standard path's traced length against the map's
 * official "Path Length" stat. The same speed applies to every path on the
 * map, so an advance-mode route's duration follows from its own length.
 */
export function creepSpeedCellsPerSecond(map: MapConfig): number {
  const duration = map.pathDurationSeconds;
  if (duration == null || duration <= 0) return 0;

  const reference = pathsForMode(map, "standard")[0];
  if (!reference) return 0;

  return pathLengthCells(map, reference) / duration;
}

/**
 * The covered stretch of segment a->b as a fraction of the segment,
 * or null when the circle misses it entirely. Returning the interval
 * rather than just its length is what lets callers tell a single long
 * stretch from a "double-pass" — two separate stretches of the same
 * route within one tower's reach.
 */
function circleSegmentOverlap(
  a: GridPoint,
  b: GridPoint,
  center: GridPoint,
  radius: number,
): { from: number; to: number; length: number } | null {
  const dx = b.col - a.col;
  const dy = b.row - a.row;
  const segLen = Math.hypot(dx, dy);
  if (segLen === 0) return null;

  const fx = a.col - center.col;
  const fy = a.row - center.row;

  const A = dx * dx + dy * dy;
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - radius * radius;

  const discriminant = B * B - 4 * A * C;
  if (discriminant < 0) return null;

  const sqrtDisc = Math.sqrt(discriminant);
  const from = Math.max(0, (-B - sqrtDisc) / (2 * A));
  const to = Math.min(1, (-B + sqrtDisc) / (2 * A));
  if (to <= from) return null;

  return { from, to, length: (to - from) * segLen };
}

export type SpotCoverage = {
  coveredLengthCells: number;
  coveredSeconds: number;
  /** 0-100 */
  coveragePercent: number;
  /**
   * How many separate stretches of the route this spot reaches. The game
   * calls a spot that sees the path more than once a "double-pass", and
   * flags it as what makes short-ranged towers viable — the route comes
   * back to them instead of them having to reach further.
   */
  passes: number;
  /**
   * The longest single unbroken stretch, in seconds of creep travel.
   *
   * Deliberately separate from `coveredSeconds`: a double-pass spot can
   * total more exposure while never holding a creep for long, whereas a
   * tower that ramps up wants one uninterrupted stretch and gets nothing
   * from the total being split in two. Maximise this for ramping towers,
   * `coveredSeconds` for everything else.
   */
  longestRunSeconds: number;
  /**
   * When a creep first enters this spot's reach, in seconds from spawn —
   * null when the route never comes within range at all.
   *
   * This is what makes a lasting debuff placeable. Polar removes HP over
   * 30 seconds, so applied 5s into a 48s route the whole window lands,
   * while applied at 40s two thirds of it is thrown away because the
   * creep exits first. Coverage alone cannot see that difference — the
   * two cells can cover identical amounts of route.
   */
  firstContactSeconds: number | null;
  /** When a creep last leaves this spot's reach, in seconds from spawn. */
  lastContactSeconds: number | null;
  /**
   * Route left after first contact — `pathDuration - firstContactSeconds`,
   * and 0 when the route never comes into range. The ceiling on any
   * effect that keeps paying out after it has been applied.
   */
  routeRemainingSeconds: number;
  /**
   * Covered seconds split across the range circle's inner, middle and
   * outer third.
   *
   * This is "a lot of its theoretical range goes to waste" as a number.
   * A long-ranged tower parked at the edge of the map reaches the route
   * only with the far rim of its circle, so everything lands in the
   * outer band, while the same tower beside a bend uses the whole
   * radius. Coverage percent cannot tell those apart — both can cover a
   * similar share of the route.
   */
  coveredSecondsByBand: readonly [number, number, number];
  /** Mean distance from tower to route while in reach, in cells. */
  meanContactRadiusCells: number;
};

const EMPTY_COVERAGE: SpotCoverage = {
  coveredLengthCells: 0,
  coveredSeconds: 0,
  coveragePercent: 0,
  passes: 0,
  longestRunSeconds: 0,
  firstContactSeconds: null,
  lastContactSeconds: null,
  routeRemainingSeconds: 0,
  coveredSecondsByBand: [0, 0, 0],
  meanContactRadiusCells: 0,
};

/**
 * Samples the covered stretch of one segment to find how far from the
 * tower the route actually runs, bucketed into thirds of the radius.
 *
 * Sampling rather than solving: the exact arc-length-weighted radial
 * distribution of a chord through a circle has a closed form, but the
 * route is a polyline whose segments enter and leave at arbitrary
 * angles, and a few samples per covered cell is accurate well past what
 * a placement ranking can act on.
 */
function accumulateRadialBands(
  a: GridPoint,
  b: GridPoint,
  center: GridPoint,
  radius: number,
  overlap: { from: number; to: number; length: number },
  bandCells: [number, number, number],
): number {
  const dx = b.col - a.col;
  const dy = b.row - a.row;
  const third = radius / 3;
  const samples = Math.max(3, Math.ceil((overlap.length / radius) * 8));
  const share = overlap.length / samples;
  let radiusWeightedCells = 0;

  for (let s = 0; s < samples; s++) {
    const t = overlap.from + ((s + 0.5) / samples) * (overlap.to - overlap.from);
    const r = Math.hypot(
      a.col + dx * t - center.col,
      a.row + dy * t - center.row,
    );
    const band = Math.min(2, Math.floor(r / third));
    bandCells[band] += share;
    radiusWeightedCells += r * share;
  }

  return radiusWeightedCells;
}

/**
 * What fraction of one path a tower with `towerRangeUnits` range would
 * cover if built at `cell`.
 */
export function coverageForSpot(
  map: MapConfig,
  cell: GridPoint,
  towerRangeUnits: number,
  path: MapPath,
): SpotCoverage {
  const totalLengthCells = pathLengthCells(map, path);
  if (totalLengthCells <= 0) return EMPTY_COVERAGE;
  if (map.rangeUnitsPerCell <= 0) return EMPTY_COVERAGE;

  const rangeCells = towerRangeUnits / map.rangeUnitsPerCell;

  let coveredLengthCells = 0;
  let passes = 0;
  let longestRunCells = 0;
  let currentRunCells = 0;
  // A run continues across a segment boundary only when coverage reaches
  // the end of one segment and resumes at the start of the next; any gap
  // means the route left the tower's reach and came back.
  let continuing = false;
  // Distance along the route to the start of the segment being tested —
  // what turns a covered interval into "how far into the run this is".
  let travelledCells = 0;
  let firstContactCells: number | null = null;
  let lastContactCells: number | null = null;
  const bandCells: [number, number, number] = [0, 0, 0];
  let radiusWeightedCells = 0;

  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1];
    const b = path.points[i];
    const segLen = cellDistance(a, b);
    const overlap = circleSegmentOverlap(a, b, cell, rangeCells);
    if (!overlap) {
      continuing = false;
      currentRunCells = 0;
      travelledCells += segLen;
      continue;
    }

    const enterAt = travelledCells + overlap.from * segLen;
    const exitAt = travelledCells + overlap.to * segLen;
    if (firstContactCells === null) firstContactCells = enterAt;
    lastContactCells = exitAt;

    coveredLengthCells += overlap.length;
    radiusWeightedCells += accumulateRadialBands(
      a,
      b,
      cell,
      rangeCells,
      overlap,
      bandCells,
    );

    if (continuing && overlap.from === 0) {
      currentRunCells += overlap.length;
    } else {
      passes++;
      currentRunCells = overlap.length;
    }
    longestRunCells = Math.max(longestRunCells, currentRunCells);
    continuing = overlap.to === 1;
    travelledCells += segLen;
  }

  const speed = creepSpeedCellsPerSecond(map);
  const toSeconds = (cells: number) => (speed > 0 ? cells / speed : 0);
  const firstContactSeconds =
    firstContactCells === null ? null : toSeconds(firstContactCells);
  const totalSeconds = toSeconds(totalLengthCells);

  return {
    coveredLengthCells,
    coveredSeconds: toSeconds(coveredLengthCells),
    coveragePercent: (coveredLengthCells / totalLengthCells) * 100,
    passes,
    longestRunSeconds: toSeconds(longestRunCells),
    firstContactSeconds,
    lastContactSeconds:
      lastContactCells === null ? null : toSeconds(lastContactCells),
    routeRemainingSeconds:
      firstContactSeconds === null
        ? 0
        : Math.max(0, totalSeconds - firstContactSeconds),
    coveredSecondsByBand: [
      toSeconds(bandCells[0]),
      toSeconds(bandCells[1]),
      toSeconds(bandCells[2]),
    ],
    meanContactRadiusCells:
      coveredLengthCells > 0 ? radiusWeightedCells / coveredLengthCells : 0,
  };
}

export type ModeCoverage = SpotCoverage & {
  perPath: readonly { pathId: string; coverage: SpotCoverage }[];
};

const EMPTY_MODE_COVERAGE: ModeCoverage = {
  ...EMPTY_COVERAGE,
  perPath: [],
};

/**
 * Coverage pooled across every path the mode runs. Advance mode splits one
 * wave over several paths, so a spot's worth is how much of the *combined*
 * route it reaches — with the per-path split kept alongside, since a spot
 * covering one lane fully and another not at all is worth knowing about.
 */
export function coverageForMode(
  map: MapConfig,
  cell: GridPoint,
  towerRangeUnits: number,
  mode: WaveMode,
): ModeCoverage {
  const paths = pathsForMode(map, mode);
  if (paths.length === 0) return EMPTY_MODE_COVERAGE;

  const perPath = paths.map((path) => ({
    pathId: path.id,
    coverage: coverageForSpot(map, cell, towerRangeUnits, path),
  }));

  const totalLengthCells = paths.reduce(
    (sum, path) => sum + pathLengthCells(map, path),
    0,
  );
  if (totalLengthCells <= 0) return { ...EMPTY_MODE_COVERAGE, perPath };

  const coveredLengthCells = perPath.reduce(
    (sum, entry) => sum + entry.coverage.coveredLengthCells,
    0,
  );

  const reached = perPath.filter(
    (entry) => entry.coverage.firstContactSeconds !== null,
  );
  const band = (i: 0 | 1 | 2) =>
    perPath.reduce(
      (sum, entry) => sum + entry.coverage.coveredSecondsByBand[i],
      0,
    );

  return {
    coveredLengthCells,
    coveredSeconds: perPath.reduce(
      (sum, entry) => sum + entry.coverage.coveredSeconds,
      0,
    ),
    coveragePercent: (coveredLengthCells / totalLengthCells) * 100,
    passes: perPath.reduce(
      (sum, entry) => sum + entry.coverage.passes,
      0,
    ),
    // Lanes run at once, so the best single stretch is the best any one
    // lane offers — not the sum, which no creep would ever sit through.
    longestRunSeconds: Math.max(
      ...perPath.map((entry) => entry.coverage.longestRunSeconds),
    ),
    /*
     * Earliest contact across the lanes, and the route remaining measured
     * from it. Deliberately the earliest rather than an average: a debuff
     * tower is judged on the lane it catches soonest, since that is the
     * creeps it can still affect for the longest.
     */
    firstContactSeconds:
      reached.length === 0
        ? null
        : Math.min(...reached.map((e) => e.coverage.firstContactSeconds!)),
    lastContactSeconds:
      reached.length === 0
        ? null
        : Math.max(...reached.map((e) => e.coverage.lastContactSeconds!)),
    routeRemainingSeconds:
      reached.length === 0
        ? 0
        : Math.max(...reached.map((e) => e.coverage.routeRemainingSeconds)),
    coveredSecondsByBand: [band(0), band(1), band(2)],
    meanContactRadiusCells:
      coveredLengthCells > 0
        ? perPath.reduce(
            (sum, entry) =>
              sum +
              entry.coverage.meanContactRadiusCells *
                entry.coverage.coveredLengthCells,
            0,
          ) / coveredLengthCells
        : 0,
    perPath,
  };
}

export type RouteSample = {
  /** Position along the route, in grid space. */
  at: GridPoint;
  /** When a creep reaches it, in seconds from spawn. */
  seconds: number;
  /** Creep-seconds this sample stands for. */
  weightSeconds: number;
};

/**
 * The mode's route(s) walked at a fixed step, each sample tagged with when
 * a creep gets there.
 *
 * The analytic coverage above answers "how much route does one tower
 * reach", which is all a single tower needs. It cannot answer "how much
 * route do *two* towers reach at the same time" — and that question is
 * the whole value of a support tower, which does nothing unless its
 * effect lands on the creeps something else is shooting. Sampling makes
 * that an intersection test instead of interval algebra over polylines.
 */
export function sampleRoute(
  map: MapConfig,
  mode: WaveMode,
  stepCells = 0.25,
): RouteSample[] {
  const speed = creepSpeedCellsPerSecond(map);
  if (speed <= 0 || stepCells <= 0) return [];

  const samples: RouteSample[] = [];

  for (const path of pathsForMode(map, mode)) {
    let travelled = 0;
    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1];
      const b = path.points[i];
      const segLen = cellDistance(a, b);
      if (segLen === 0) continue;

      for (let d = 0; d < segLen; d += stepCells) {
        // A trailing part-step keeps its real length, so the samples' own
        // weights still sum to the route's true duration.
        const span = Math.min(stepCells, segLen - d);
        const mid = d + span / 2;
        const t = mid / segLen;
        samples.push({
          at: {
            col: a.col + (b.col - a.col) * t,
            row: a.row + (b.row - a.row) * t,
          },
          seconds: (travelled + mid) / speed,
          weightSeconds: span / speed,
        });
      }
      travelled += segLen;
    }
  }

  return samples;
}

/** Whether a route sample falls inside a tower's range circle. */
export function sampleInRange(
  map: MapConfig,
  sample: RouteSample,
  cell: GridPoint,
  towerRangeUnits: number,
): boolean {
  if (map.rangeUnitsPerCell <= 0) return false;
  return (
    cellDistance(sample.at, cell) <= towerRangeUnits / map.rangeUnitsPerCell
  );
}

export type RankedSpot = {
  cell: GridPoint;
  coverage: ModeCoverage;
};

/**
 * Every buildable cell, ranked best-first by how much of the mode's route
 * it covers.
 *
 * Coverage percent alone saturates to ~100% for anything but a short-range
 * tower — once a spot sees the whole path, a second and third spot doing
 * the same tie exactly, and plain insertion order isn't a ranking. Broken
 * by the longest unbroken pass next (the stat that actually distinguishes
 * two "fully covered" spots for a ramp-up tower — see the island/double-
 * pass doctrine), then total covered time.
 */
export function bestSpotsForTower(
  map: MapConfig,
  towerRangeUnits: number,
  mode: WaveMode,
  topN = 5,
  /**
   * Cells already holding a tower. A slot is permanent once taken, so a
   * recommendation that lands on one is not a suggestion, it's a
   * relocation — excluded rather than ranked and ignored.
   */
  occupied: readonly GridPoint[] = [],
): RankedSpot[] {
  const taken = new Set(
    occupied.map((cell) => `${cell.col},${cell.row}`),
  );
  return map.buildableCells
    .filter((cell) => !taken.has(`${cell.col},${cell.row}`))
    .map((cell) => ({
      cell,
      coverage: coverageForMode(map, cell, towerRangeUnits, mode),
    }))
    .sort((a, b) => {
      if (b.coverage.coveragePercent !== a.coverage.coveragePercent) {
        return b.coverage.coveragePercent - a.coverage.coveragePercent;
      }
      if (b.coverage.longestRunSeconds !== a.coverage.longestRunSeconds) {
        return b.coverage.longestRunSeconds - a.coverage.longestRunSeconds;
      }
      return b.coverage.coveredSeconds - a.coverage.coveredSeconds;
    })
    .slice(0, topN);
}

/**
 * Buildable cells grouped into connected clusters — the game's "islands"
 * (Tropical: "a pair of islands"). Two cells belong to the same island
 * when they're grid-adjacent, including diagonally; a wider gap reads as
 * open water separating them, even with no terrain data of our own,
 * because only cells that could physically connect ever end up that
 * close together on the traced grid in the first place.
 *
 * A camp can't span two islands, and a cheap precursor tower is only a
 * free upgrade path if its island has room for what it's meant to grow
 * into — both need this before they can be built for real.
 */
export function islands(map: MapConfig): GridPoint[][] {
  const key = (cell: GridPoint) => `${cell.col},${cell.row}`;
  const byKey = new Map(
    map.buildableCells.map((cell) => [key(cell), cell] as const),
  );
  const visited = new Set<string>();
  const groups: GridPoint[][] = [];

  for (const start of map.buildableCells) {
    const startKey = key(start);
    if (visited.has(startKey)) continue;

    const group: GridPoint[] = [];
    const stack = [start];
    visited.add(startKey);

    while (stack.length > 0) {
      const cell = stack.pop()!;
      group.push(cell);

      for (let dCol = -1; dCol <= 1; dCol++) {
        for (let dRow = -1; dRow <= 1; dRow++) {
          if (dCol === 0 && dRow === 0) continue;
          const neighborKey = `${cell.col + dCol},${cell.row + dRow}`;
          const neighbor = byKey.get(neighborKey);
          if (neighbor && !visited.has(neighborKey)) {
            visited.add(neighborKey);
            stack.push(neighbor);
          }
        }
      }
    }

    groups.push(group);
  }

  return groups;
}

/** Which island (by index into {@link islands}) a buildable cell sits on. */
export function islandIndexOf(
  groups: readonly (readonly GridPoint[])[],
  cell: GridPoint,
): number {
  return groups.findIndex((group) =>
    group.some((c) => c.col === cell.col && c.row === cell.row),
  );
}

/**
 * Every cell inside each island's own bounding rectangle that isn't
 * itself buildable — the "dead" cells for a full grid-table view.
 * Deliberately scoped per island rather than the whole map: Forest has
 * three disconnected plazas, and one rectangle spanning all of them
 * would paint a fake uniform grid across the real forest and water
 * gaps between them. Not persisted anywhere — a cell is dead by
 * absence from `buildableCells`, this just enumerates that for display.
 */
export function deadCells(map: MapConfig): GridPoint[] {
  const buildableKeys = new Set(
    map.buildableCells.map((c) => `${c.col},${c.row}`),
  );
  const seen = new Set<string>();
  const dead: GridPoint[] = [];

  for (const group of islands(map)) {
    const cols = group.map((c) => c.col);
    const rows = group.map((c) => c.row);
    const minCol = Math.min(...cols);
    const maxCol = Math.max(...cols);
    const minRow = Math.min(...rows);
    const maxRow = Math.max(...rows);

    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const key = `${col},${row}`;
        // Two islands' bounding rectangles can overlap when the layout
        // interlocks (e.g. one island's box sits partly inside another's
        // empty corner) — dedupe so a shared cell isn't emitted twice.
        if (!buildableKeys.has(key) && !seen.has(key)) {
          seen.add(key);
          dead.push({ col, row });
        }
      }
    }
  }

  return dead;
}
