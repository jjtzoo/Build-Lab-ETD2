export type GridPoint = { col: number; row: number };
export type PixelPoint = { x: number; y: number };

/**
 * Affine grid basis: pixel position of a cell = origin + col*colVector +
 * row*rowVector. Two independent vectors (not just a uniform cell size)
 * because the game's camera has a fixed tilt, so equal grid cells are not
 * simple axis-aligned squares on screen.
 */
export type MapGridBasis = {
  origin: PixelPoint;
  colVector: PixelPoint;
  rowVector: PixelPoint;
};

export type MapConfig = {
  id: string;
  name: string;
  /** Path under /public to the reference screenshot. */
  image: string;
  imageSize: { w: number; h: number };
  grid: MapGridBasis;
  buildableCells: readonly GridPoint[];
  /** Ordered polyline, spawn -> exit, in grid coordinates. */
  path: readonly GridPoint[];
  /** Official in-game "Path Length" stat, in seconds. */
  pathDurationSeconds: number;
  /**
   * ASSUMPTION, not a verified game fact: how many grid cells one unit of
   * a tower's `range` stat spans. Defaults to 1:1 pending a range-circle
   * screenshot to calibrate against. Keep this the single place that
   * ratio lives so it's trivial to correct.
   */
  rangeUnitsPerCell: number;
};
