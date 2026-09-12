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
   * How many units of a tower's `range` stat span one grid cell.
   *
   * Measured, not assumed — 128, from the reference range-circle
   * screenshots in `public/tower ranges/`. Three of them (875, 1000,
   * 1125) were shot at one camera zoom; fitting each ring's ellipse and
   * dividing its horizontal semi-axis by the cell pitch measured on the
   * same screenshot gives 127.2, 127.0 and 129.0 — under 1% apart, on a
   * power of two. (The 625 shot is at a slightly different zoom and its
   * ring fits worse; 1500/1750 each stack two screenshots in one file
   * and were excluded.) The ratio is per-map only because a map could in
   * principle be shot at a different zoom — the underlying game constant
   * is the same everywhere.
   */
  rangeUnitsPerCell: number;
};

/**
 * Chess/spreadsheet-style cell labels (A1, D7, AA3, ...) — a display
 * convention only, not a storage format. Buildable cells are always
 * integers, so they label cleanly; path points are deliberately
 * fractional (creeps walk the line, not cell centers), so they're never
 * labeled — the path renders as a line, not a sequence of cells.
 *
 * `origin` re-bases the label so a map's authored coordinates (tied to
 * wherever the calibration clicks happened to land, which can be
 * negative or off-grid) still start at A1 for anyone reading them.
 */
export function cellLabel(
  cell: GridPoint,
  origin: GridPoint = { col: 0, row: 0 },
): string {
  const col = Math.round(cell.col - origin.col);
  const row = Math.round(cell.row - origin.row);
  return `${columnLetters(col)}${row + 1}`;
}

function columnLetters(col: number): string {
  let n = Math.max(0, col);
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/** Inverse of {@link cellLabel} — "D7" back to grid coordinates, or `null` if unparseable. */
export function parseCellLabel(
  label: string,
  origin: GridPoint = { col: 0, row: 0 },
): GridPoint | null {
  const match = /^([A-Za-z]+)(\d+)$/.exec(label.trim());
  if (!match) return null;

  const [, letters, digits] = match;
  let col = 0;
  for (const char of letters.toUpperCase()) {
    col = col * 26 + (char.charCodeAt(0) - 64);
  }

  return {
    col: col - 1 + origin.col,
    row: Number(digits) - 1 + origin.row,
  };
}
