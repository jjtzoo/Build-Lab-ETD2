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

/**
 * Standard spawns the whole wave on the one main path. Advance splits the
 * same wave across every path it has — sometimes genuinely separate routes
 * (Forest), sometimes the main path run in reverse (Lava, Tropical, where
 * the portals show blended entrance/exit colours).
 */
export type WaveMode = "standard" | "advance";

export const WAVE_MODES: readonly WaveMode[] = ["standard", "advance"];

export type MapPath = {
  id: string;
  /** Ordered polyline, spawn -> exit, in grid coordinates. */
  points: readonly GridPoint[];
  /** Which mode(s) run creeps down this path. */
  modes: readonly WaveMode[];
};

export type MapConfig = {
  id: string;
  name: string;
  /** Path under /public to the reference screenshot. */
  image: string;
  imageSize: { w: number; h: number };
  grid: MapGridBasis;
  buildableCells: readonly GridPoint[];
  paths: readonly MapPath[];
  /**
   * Official in-game "Path Length" stat, in seconds — it times the
   * standard path, and the creep speed derived from it applies to every
   * path on the map. `null` where the stat hasn't been captured yet:
   * never guess it.
   */
  pathDurationSeconds: number | null;
  /**
   * ASSUMPTION, not a verified game fact: how many grid cells one unit of
   * a tower's `range` stat spans. Defaults to 1:1 pending a range-circle
   * screenshot to calibrate against. Keep this the single place that
   * ratio lives so it's trivial to correct.
   */
  rangeUnitsPerCell: number;
};
