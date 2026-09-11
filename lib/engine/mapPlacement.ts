import type {
  GridPoint,
  MapConfig,
  PixelPoint,
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

function distance(a: PixelPoint, b: PixelPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * One grid cell's edge length in pixels, averaged across the two basis
 * vectors. The camera tilt means they're not always equal — this is an
 * approximation, good enough to turn pixel distances into "cell units".
 */
function pixelsPerCell(map: MapConfig): number {
  const { colVector, rowVector } = map.grid;
  const colLen = Math.hypot(colVector.x, colVector.y);
  const rowLen = Math.hypot(rowVector.x, rowVector.y);
  return (colLen + rowLen) / 2;
}

export function pathLengthCells(map: MapConfig): number {
  if (map.path.length < 2) return 0;
  const px = pixelsPerCell(map);
  if (px <= 0) return 0;

  let total = 0;
  for (let i = 1; i < map.path.length; i++) {
    total +=
      distance(
        gridToWorld(map, map.path[i - 1]),
        gridToWorld(map, map.path[i]),
      ) / px;
  }
  return total;
}

/** Derived from the traced path length and the map's known path duration. */
export function creepSpeedCellsPerSecond(map: MapConfig): number {
  if (map.pathDurationSeconds <= 0) return 0;
  return pathLengthCells(map) / map.pathDurationSeconds;
}

/**
 * Length of segment a->b that lies within `radius` of `center`, via the
 * standard line/circle intersection (quadratic in the segment's
 * parameter t, clipped to t in [0,1]).
 */
function circleSegmentOverlapLength(
  a: PixelPoint,
  b: PixelPoint,
  center: PixelPoint,
  radius: number,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const segLen = Math.hypot(dx, dy);
  if (segLen === 0) return 0;

  const fx = a.x - center.x;
  const fy = a.y - center.y;

  const A = dx * dx + dy * dy;
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - radius * radius;

  const discriminant = B * B - 4 * A * C;
  if (discriminant < 0) return 0;

  const sqrtDisc = Math.sqrt(discriminant);
  const t1 = Math.max(0, (-B - sqrtDisc) / (2 * A));
  const t2 = Math.min(1, (-B + sqrtDisc) / (2 * A));
  if (t2 <= t1) return 0;

  return (t2 - t1) * segLen;
}

export type SpotCoverage = {
  coveredLengthCells: number;
  coveredSeconds: number;
  /** 0-100 */
  coveragePercent: number;
};

const EMPTY_COVERAGE: SpotCoverage = {
  coveredLengthCells: 0,
  coveredSeconds: 0,
  coveragePercent: 0,
};

/**
 * What fraction of the wave's route a tower with `towerRangeUnits` range
 * would cover if built at `cell`.
 */
export function coverageForSpot(
  map: MapConfig,
  cell: GridPoint,
  towerRangeUnits: number,
): SpotCoverage {
  const totalLengthCells = pathLengthCells(map);
  if (totalLengthCells <= 0) return EMPTY_COVERAGE;

  const px = pixelsPerCell(map);
  if (px <= 0 || map.rangeUnitsPerCell <= 0) return EMPTY_COVERAGE;

  const rangePixels = (towerRangeUnits / map.rangeUnitsPerCell) * px;
  const spotWorld = gridToWorld(map, cell);

  let coveredPixels = 0;
  for (let i = 1; i < map.path.length; i++) {
    coveredPixels += circleSegmentOverlapLength(
      gridToWorld(map, map.path[i - 1]),
      gridToWorld(map, map.path[i]),
      spotWorld,
      rangePixels,
    );
  }

  const coveredLengthCells = coveredPixels / px;
  const speed = creepSpeedCellsPerSecond(map);

  return {
    coveredLengthCells,
    coveredSeconds: speed > 0 ? coveredLengthCells / speed : 0,
    coveragePercent: (coveredLengthCells / totalLengthCells) * 100,
  };
}

export type RankedSpot = {
  cell: GridPoint;
  coverage: SpotCoverage;
};

/** Every buildable cell, ranked best-first by how much of the route it covers. */
export function bestSpotsForTower(
  map: MapConfig,
  towerRangeUnits: number,
  topN = 5,
): RankedSpot[] {
  return map.buildableCells
    .map((cell) => ({
      cell,
      coverage: coverageForSpot(map, cell, towerRangeUnits),
    }))
    .sort(
      (a, b) => b.coverage.coveragePercent - a.coverage.coveragePercent,
    )
    .slice(0, topN);
}
