import { describe, expect, it } from "vitest";

import type { MapConfig } from "@/lib/domain/mapConfig";
import {
  bestSpotsForTower,
  coverageForSpot,
  creepSpeedCellsPerSecond,
  gridToWorld,
  pathLengthCells,
  worldToGrid,
} from "@/lib/engine/mapPlacement";

/**
 * Synthetic map — deliberately not the real Forest trace, so this locks
 * the coverage math itself rather than depending on authored data.
 *
 * Axis-aligned grid, 100px per cell. Path is a straight 10-cell line along
 * row 0, col 0 -> col 10, traversed in 10 seconds (1 cell/sec).
 */
function straightPathMap(
  overrides: Partial<MapConfig> = {},
): MapConfig {
  return {
    id: "test",
    name: "Test",
    image: "/maps/test.png",
    imageSize: { w: 1200, h: 400 },
    grid: {
      origin: { x: 0, y: 0 },
      colVector: { x: 100, y: 0 },
      rowVector: { x: 0, y: 100 },
    },
    buildableCells: [
      { col: 5, row: 1 }, // near the midpoint
      { col: 5, row: 5 }, // far from the path
      { col: 0, row: 1 }, // near the start
    ],
    path: [
      { col: 0, row: 0 },
      { col: 10, row: 0 },
    ],
    pathDurationSeconds: 10,
    rangeUnitsPerCell: 1,
    ...overrides,
  };
}

describe("pathLengthCells / creepSpeedCellsPerSecond", () => {
  it("measures a straight 10-cell path as 10 cells", () => {
    expect(pathLengthCells(straightPathMap())).toBeCloseTo(10, 6);
  });

  it("derives speed from the known path duration", () => {
    expect(creepSpeedCellsPerSecond(straightPathMap())).toBeCloseTo(1, 6);
  });

  it("is zero for a path with fewer than two points", () => {
    const map = straightPathMap({ path: [{ col: 0, row: 0 }] });
    expect(pathLengthCells(map)).toBe(0);
    expect(creepSpeedCellsPerSecond(map)).toBe(0);
  });
});

describe("coverageForSpot", () => {
  it("covers 2*sqrt(3) cells for a spot 1 cell off the path with 2-cell range", () => {
    // Spot at (5,1) is 1 cell (100px) perpendicular from the path.
    // A 2-cell (200px) range circle intersects the line y=0 across
    // x in [500 - 100*sqrt(3), 500 + 100*sqrt(3)] -> length 200*sqrt(3)px
    // = 2*sqrt(3) cells, by the Pythagorean chord-length formula.
    const map = straightPathMap();
    const coverage = coverageForSpot(map, { col: 5, row: 1 }, 2);
    expect(coverage.coveredLengthCells).toBeCloseTo(2 * Math.sqrt(3), 6);
    expect(coverage.coveragePercent).toBeCloseTo(
      (2 * Math.sqrt(3) * 10) / 1,
      6,
    );
    expect(coverage.coveredSeconds).toBeCloseTo(2 * Math.sqrt(3), 6);
  });

  it("covers nothing for a spot outside the tower's range", () => {
    const map = straightPathMap();
    const coverage = coverageForSpot(map, { col: 5, row: 5 }, 2);
    expect(coverage.coveredLengthCells).toBe(0);
    expect(coverage.coveragePercent).toBe(0);
  });

  it("clips coverage to the path's start/end, not the infinite line", () => {
    // Spot at (0,1) is right by the path's start — a huge range would
    // overshoot past col 0, but there's no path there to cover.
    const map = straightPathMap();
    const coverage = coverageForSpot(map, { col: 0, row: 1 }, 100);
    expect(coverage.coveredLengthCells).toBeCloseTo(10, 6);
    expect(coverage.coveragePercent).toBeCloseTo(100, 6);
  });

  it("respects rangeUnitsPerCell as a single tunable ratio", () => {
    // Same spot/range as the first case, but 2 range units = 1 cell, so a
    // "2-range" tower only reaches 1 cell, not 2.
    const map = straightPathMap({ rangeUnitsPerCell: 2 });
    const coverage = coverageForSpot(map, { col: 5, row: 1 }, 2);
    expect(coverage.coveredLengthCells).toBe(0);
  });
});

describe("worldToGrid", () => {
  it("inverts gridToWorld for an axis-aligned grid", () => {
    const map = straightPathMap();
    const cell = { col: 3.5, row: 2 };
    expect(worldToGrid(map, gridToWorld(map, cell))).toEqual(cell);
  });

  it("inverts gridToWorld for a tilted (non-axis-aligned) grid", () => {
    const map = straightPathMap({
      grid: {
        origin: { x: 10, y: 20 },
        colVector: { x: 90, y: 15 },
        rowVector: { x: -10, y: 80 },
      },
    });
    const cell = { col: 4, row: 6.25 };
    const world = gridToWorld(map, cell);
    const back = worldToGrid(map, world);
    expect(back.col).toBeCloseTo(cell.col, 6);
    expect(back.row).toBeCloseTo(cell.row, 6);
  });
});

describe("bestSpotsForTower", () => {
  it("ranks buildable cells best-first by coverage", () => {
    const map = straightPathMap();
    const ranked = bestSpotsForTower(map, 2, 3);
    expect(ranked).toHaveLength(3);
    // (5,1) sits mid-path, so its whole range circle falls on the route;
    // (0,1) sits right at the path's start, so half its circle is
    // clipped off by the boundary and it covers less despite being
    // just as close.
    expect(ranked[0].cell).toEqual({ col: 5, row: 1 });
    expect(ranked[1].cell).toEqual({ col: 0, row: 1 });
    expect(ranked[2].cell).toEqual({ col: 5, row: 5 });
    expect(ranked[0].coverage.coveragePercent).toBeGreaterThan(
      ranked[1].coverage.coveragePercent,
    );
    expect(ranked[2].coverage.coveragePercent).toBe(0);
  });
});
