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
};

const EMPTY_COVERAGE: SpotCoverage = {
  coveredLengthCells: 0,
  coveredSeconds: 0,
  coveragePercent: 0,
  passes: 0,
  longestRunSeconds: 0,
};

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
  for (let i = 1; i < path.points.length; i++) {
    const overlap = circleSegmentOverlap(
      path.points[i - 1],
      path.points[i],
      cell,
      rangeCells,
    );
    if (!overlap) {
      continuing = false;
      currentRunCells = 0;
      continue;
    }
    coveredLengthCells += overlap.length;
    if (continuing && overlap.from === 0) {
      currentRunCells += overlap.length;
    } else {
      passes++;
      currentRunCells = overlap.length;
    }
    longestRunCells = Math.max(longestRunCells, currentRunCells);
    continuing = overlap.to === 1;
  }

  const speed = creepSpeedCellsPerSecond(map);

  return {
    coveredLengthCells,
    coveredSeconds: speed > 0 ? coveredLengthCells / speed : 0,
    coveragePercent: (coveredLengthCells / totalLengthCells) * 100,
    passes,
    longestRunSeconds: speed > 0 ? longestRunCells / speed : 0,
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
    perPath,
  };
}

export type RankedSpot = {
  cell: GridPoint;
  coverage: ModeCoverage;
};

/** Every buildable cell, ranked best-first by how much of the mode's route it covers. */
export function bestSpotsForTower(
  map: MapConfig,
  towerRangeUnits: number,
  mode: WaveMode,
  topN = 5,
): RankedSpot[] {
  return map.buildableCells
    .map((cell) => ({
      cell,
      coverage: coverageForMode(map, cell, towerRangeUnits, mode),
    }))
    .sort(
      (a, b) => b.coverage.coveragePercent - a.coverage.coveragePercent,
    )
    .slice(0, topN);
}
