import { describe, expect, it } from "vitest";

import type { MapConfig } from "@/lib/domain/mapConfig";
import {
  bestSpotsForTower,
  coverageForMode,
  coverageForSpot,
  creepSpeedCellsPerSecond,
  deadCells,
  gridToWorld,
  islandIndexOf,
  islands,
  pathLengthCells,
  pathsForMode,
  worldToGrid,
} from "@/lib/engine/mapPlacement";

/**
 * Synthetic maps — deliberately not a real traced map, so these lock the
 * coverage math itself rather than depending on authored data.
 *
 * Axis-aligned grid, 100px per cell. The standard path is a straight
 * 10-cell line along row 0, col 0 -> col 10, traversed in 10 seconds
 * (1 cell/sec).
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
    paths: [
      {
        id: "main",
        points: [
          { col: 0, row: 0 },
          { col: 10, row: 0 },
        ],
        modes: ["standard", "advance"],
      },
    ],
    pathDurationSeconds: 10,
    rangeUnitsPerCell: 1,
    ...overrides,
  };
}

const MAIN_PATH = straightPathMap().paths[0];

/**
 * Advance mode adds a second, parallel 10-cell lane 4 cells below the
 * first (row 4, col 0 -> col 10) — far enough that a 2-cell-range tower
 * sitting by one lane can't touch the other.
 */
function twoLaneMap(): MapConfig {
  return straightPathMap({
    paths: [
      {
        id: "main",
        points: [
          { col: 0, row: 0 },
          { col: 10, row: 0 },
        ],
        modes: ["standard", "advance"],
      },
      {
        id: "south",
        points: [
          { col: 0, row: 4 },
          { col: 10, row: 4 },
        ],
        modes: ["advance"],
      },
    ],
  });
}

describe("pathsForMode", () => {
  it("returns only the paths the mode runs", () => {
    const map = twoLaneMap();
    expect(pathsForMode(map, "standard").map((p) => p.id)).toEqual([
      "main",
    ]);
    expect(pathsForMode(map, "advance").map((p) => p.id)).toEqual([
      "main",
      "south",
    ]);
  });
});

describe("pathLengthCells / creepSpeedCellsPerSecond", () => {
  it("measures a straight 10-cell path as 10 cells", () => {
    expect(pathLengthCells(straightPathMap(), MAIN_PATH)).toBeCloseTo(
      10,
      6,
    );
  });

  it("derives speed from the standard path and its known duration", () => {
    expect(creepSpeedCellsPerSecond(straightPathMap())).toBeCloseTo(1, 6);
  });

  it("uses the standard path for speed even when advance adds lanes", () => {
    // The second lane must not change the creep speed — the official
    // Path Length stat times the standard route only.
    expect(creepSpeedCellsPerSecond(twoLaneMap())).toBeCloseTo(1, 6);
  });

  it("is zero for a path with fewer than two points", () => {
    const map = straightPathMap({
      paths: [
        { id: "main", points: [{ col: 0, row: 0 }], modes: ["standard"] },
      ],
    });
    expect(pathLengthCells(map, map.paths[0])).toBe(0);
    expect(creepSpeedCellsPerSecond(map)).toBe(0);
  });

  it("is zero when the map has no captured path duration", () => {
    expect(
      creepSpeedCellsPerSecond(
        straightPathMap({ pathDurationSeconds: null }),
      ),
    ).toBe(0);
  });
});

describe("coverageForSpot", () => {
  it("covers 2*sqrt(3) cells for a spot 1 cell off the path with 2-cell range", () => {
    // Spot at (5,1) is 1 cell (100px) perpendicular from the path.
    // A 2-cell (200px) range circle intersects the line y=0 across
    // x in [500 - 100*sqrt(3), 500 + 100*sqrt(3)] -> length 200*sqrt(3)px
    // = 2*sqrt(3) cells, by the Pythagorean chord-length formula.
    const map = straightPathMap();
    const coverage = coverageForSpot(map, { col: 5, row: 1 }, 2, MAIN_PATH);
    expect(coverage.coveredLengthCells).toBeCloseTo(2 * Math.sqrt(3), 6);
    expect(coverage.coveragePercent).toBeCloseTo(
      (2 * Math.sqrt(3) * 10) / 1,
      6,
    );
    expect(coverage.coveredSeconds).toBeCloseTo(2 * Math.sqrt(3), 6);
  });

  it("covers nothing for a spot outside the tower's range", () => {
    const map = straightPathMap();
    const coverage = coverageForSpot(map, { col: 5, row: 5 }, 2, MAIN_PATH);
    expect(coverage.coveredLengthCells).toBe(0);
    expect(coverage.coveragePercent).toBe(0);
  });

  it("clips coverage to the path's start/end, not the infinite line", () => {
    // Spot at (0,1) is right by the path's start — a huge range would
    // overshoot past col 0, but there's no path there to cover.
    const map = straightPathMap();
    const coverage = coverageForSpot(
      map,
      { col: 0, row: 1 },
      100,
      MAIN_PATH,
    );
    expect(coverage.coveredLengthCells).toBeCloseTo(10, 6);
    expect(coverage.coveragePercent).toBeCloseTo(100, 6);
  });

  it("is unaffected by the camera's on-screen squash", () => {
    // The game camera is tilted, so grid cells render shorter vertically
    // than horizontally and a range circle projects to an ellipse. None
    // of that is real distance — coverage must come out identical to the
    // same map drawn without any squash.
    const square = straightPathMap();
    const squashed = straightPathMap({
      grid: {
        origin: { x: 400, y: 90 },
        colVector: { x: 120, y: 0 },
        rowVector: { x: 0, y: 44 }, // ~2.7x vertical compression
      },
    });

    const from = (map: MapConfig) =>
      coverageForSpot(map, { col: 5, row: 1 }, 2, map.paths[0])
        .coveredLengthCells;

    expect(from(squashed)).toBeCloseTo(from(square), 6);
  });

  it("respects rangeUnitsPerCell as a single tunable ratio", () => {
    // Same spot/range as the first case, but 2 range units = 1 cell, so a
    // "2-range" tower only reaches 1 cell, not 2.
    const map = straightPathMap({ rangeUnitsPerCell: 2 });
    const coverage = coverageForSpot(map, { col: 5, row: 1 }, 2, MAIN_PATH);
    expect(coverage.coveredLengthCells).toBe(0);
  });
});

describe("coverageForMode", () => {
  it("matches single-path coverage when the mode runs one path", () => {
    const map = twoLaneMap();
    const mode = coverageForMode(map, { col: 5, row: 1 }, 2, "standard");
    const single = coverageForSpot(
      map,
      { col: 5, row: 1 },
      2,
      map.paths[0],
    );
    expect(mode.coveredLengthCells).toBeCloseTo(
      single.coveredLengthCells,
      6,
    );
    expect(mode.coveragePercent).toBeCloseTo(single.coveragePercent, 6);
    expect(mode.perPath).toHaveLength(1);
  });

  it("pools covered length over the combined route in advance mode", () => {
    // Same spot, same tower: it still only reaches the first lane, but
    // advance mode's total route is now 20 cells, so the *percentage*
    // halves even though the covered length is unchanged.
    const map = twoLaneMap();
    const standard = coverageForMode(
      map,
      { col: 5, row: 1 },
      2,
      "standard",
    );
    const advance = coverageForMode(map, { col: 5, row: 1 }, 2, "advance");

    expect(advance.coveredLengthCells).toBeCloseTo(
      standard.coveredLengthCells,
      6,
    );
    expect(advance.coveragePercent).toBeCloseTo(
      standard.coveragePercent / 2,
      6,
    );
    expect(advance.perPath).toHaveLength(2);
    expect(advance.perPath[1].coverage.coveredLengthCells).toBe(0);
  });

  it("credits a spot that reaches both lanes", () => {
    // (5,2) sits midway between the two lanes, 2 cells from each. A
    // 3-cell range reaches both, so each lane contributes an equal chord.
    const map = twoLaneMap();
    const coverage = coverageForMode(map, { col: 5, row: 2 }, 3, "advance");
    const chord = 2 * Math.sqrt(3 * 3 - 2 * 2); // half-chord via Pythagoras
    expect(coverage.coveredLengthCells).toBeCloseTo(chord * 2, 6);
    expect(coverage.perPath[0].coverage.coveredLengthCells).toBeCloseTo(
      chord,
      6,
    );
    expect(coverage.perPath[1].coverage.coveredLengthCells).toBeCloseTo(
      chord,
      6,
    );
  });

  it("is empty for a mode with no paths", () => {
    const map = straightPathMap({
      paths: [
        {
          id: "main",
          points: [
            { col: 0, row: 0 },
            { col: 10, row: 0 },
          ],
          modes: ["standard"],
        },
      ],
    });
    const coverage = coverageForMode(map, { col: 5, row: 1 }, 2, "advance");
    expect(coverage.coveragePercent).toBe(0);
    expect(coverage.perPath).toEqual([]);
  });
});

describe("passes (the game's 'double-pass')", () => {
  it("counts one pass for a single stretch within reach", () => {
    const map = straightPathMap();
    expect(
      coverageForSpot(map, { col: 5, row: 1 }, 2, MAIN_PATH).passes,
    ).toBe(1);
  });

  it("counts none when the route never enters reach", () => {
    const map = straightPathMap();
    expect(
      coverageForSpot(map, { col: 5, row: 5 }, 2, MAIN_PATH).passes,
    ).toBe(0);
  });

  it("counts two when the route doubles back past the same spot", () => {
    // A hairpin: out along row 0, back along row 2. A spot between the
    // two legs reaches both, but loses the route around the far turn —
    // the shape Lava's description calls a double-pass.
    const map = straightPathMap({
      paths: [
        {
          id: "hairpin",
          points: [
            { col: 0, row: 0 },
            { col: 10, row: 0 },
            { col: 10, row: 2 },
            { col: 0, row: 2 },
          ],
          modes: ["standard"],
        },
      ],
    });
    const coverage = coverageForSpot(map, { col: 2, row: 1 }, 1.5, map.paths[0]);
    expect(coverage.passes).toBe(2);
    expect(coverage.coveredLengthCells).toBeGreaterThan(0);
  });

  it("keeps a pass whole across the vertices inside it", () => {
    // A tower parked on the hairpin's turn sees one continuous stretch,
    // even though that stretch spans three traced segments.
    const map = straightPathMap({
      paths: [
        {
          id: "hairpin",
          points: [
            { col: 0, row: 0 },
            { col: 10, row: 0 },
            { col: 10, row: 2 },
            { col: 0, row: 2 },
          ],
          modes: ["standard"],
        },
      ],
    });
    expect(
      coverageForSpot(map, { col: 10, row: 1 }, 4, map.paths[0]).passes,
    ).toBe(1);
  });
});

describe("longestRunSeconds (ramp-up vs double-pass)", () => {
  const hairpin = () =>
    straightPathMap({
      paths: [
        {
          id: "hairpin",
          points: [
            { col: 0, row: 0 },
            { col: 10, row: 0 },
            { col: 10, row: 2 },
            { col: 0, row: 2 },
          ],
          modes: ["standard"],
        },
      ],
    });

  it("equals total exposure when there is only one run", () => {
    const map = straightPathMap();
    const coverage = coverageForSpot(map, { col: 5, row: 1 }, 2, MAIN_PATH);
    expect(coverage.passes).toBe(1);
    expect(coverage.longestRunSeconds).toBeCloseTo(
      coverage.coveredSeconds,
      6,
    );
  });

  it("falls short of total exposure on a double-pass", () => {
    // The whole point of the metric: a spot between the hairpin's legs
    // racks up exposure across two stretches, but a ramping tower only
    // ever gets the longer of the two before the route leaves it.
    const map = hairpin();
    const coverage = coverageForSpot(
      map,
      { col: 2, row: 1 },
      1.5,
      map.paths[0],
    );
    expect(coverage.passes).toBe(2);
    expect(coverage.longestRunSeconds).toBeLessThan(
      coverage.coveredSeconds,
    );
    expect(coverage.longestRunSeconds).toBeGreaterThan(0);
  });

  it("prefers one long stretch over a split one for the same total", () => {
    // Corner spot: one unbroken run wrapping the turn. Mid-leg spot:
    // two separate runs. The corner can win on continuity even when it
    // loses on total.
    const map = hairpin();
    const corner = coverageForSpot(
      map,
      { col: 10, row: 1 },
      2.5,
      map.paths[0],
    );
    const between = coverageForSpot(
      map,
      { col: 3, row: 1 },
      1.5,
      map.paths[0],
    );
    expect(corner.passes).toBe(1);
    expect(between.passes).toBe(2);
    expect(corner.longestRunSeconds).toBeGreaterThan(
      between.longestRunSeconds,
    );
  });
});

describe("islands", () => {
  it("keeps a solid block as one island", () => {
    const map = straightPathMap({
      buildableCells: [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
        { col: 0, row: 1 },
        { col: 1, row: 1 },
      ],
    });
    expect(islands(map)).toHaveLength(1);
    expect(islands(map)[0]).toHaveLength(4);
  });

  it("treats diagonal touch as connected", () => {
    // Two cells sharing only a corner still read as one landmass — the
    // gap that actually separates islands is wider than that.
    const map = straightPathMap({
      buildableCells: [
        { col: 0, row: 0 },
        { col: 1, row: 1 },
      ],
    });
    expect(islands(map)).toHaveLength(1);
  });

  it("splits Tropical's 'pair of islands' shape into two groups", () => {
    const map = straightPathMap({
      buildableCells: [
        // Island A: a 2x2 block.
        { col: 0, row: 0 },
        { col: 1, row: 0 },
        { col: 0, row: 1 },
        { col: 1, row: 1 },
        // A gap of open water — col 2-3 has no buildable cells.
        // Island B: a 2x2 block, far enough that it can't touch A.
        { col: 4, row: 0 },
        { col: 5, row: 0 },
        { col: 4, row: 1 },
        { col: 5, row: 1 },
      ],
    });
    const groups = islands(map);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.length).sort()).toEqual([4, 4]);
  });

  it("locates which island a given cell belongs to", () => {
    const map = straightPathMap({
      buildableCells: [
        { col: 0, row: 0 },
        { col: 5, row: 0 },
      ],
    });
    const groups = islands(map);
    expect(groups).toHaveLength(2);
    expect(islandIndexOf(groups, { col: 0, row: 0 })).toBe(0);
    expect(islandIndexOf(groups, { col: 5, row: 0 })).toBe(1);
    expect(islandIndexOf(groups, { col: 99, row: 99 })).toBe(-1);
  });

  it("is empty when there are no buildable cells", () => {
    const map = straightPathMap({ buildableCells: [] });
    expect(islands(map)).toEqual([]);
  });
});

describe("deadCells", () => {
  it("fills the notch of an L-shape without needing the shape modeled specially", () => {
    // An L: a 3x2 block with the top-right cell missing. The coordinate
    // system doesn't need to know about L-shapes — the bounding
    // rectangle is regular, and the one uncovered cell inside it is
    // just "dead" by not appearing in buildableCells.
    const map = straightPathMap({
      buildableCells: [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
        // (2,0) missing — the notch.
        { col: 0, row: 1 },
        { col: 1, row: 1 },
        { col: 2, row: 1 },
      ],
    });
    const dead = deadCells(map);
    expect(dead).toEqual([{ col: 2, row: 0 }]);
  });

  it("never paints across the gap between two separate islands", () => {
    // Two 1x1 cells far apart. A single bounding rectangle across both
    // would fill in a huge false grid over the empty space between
    // them; scoped per-island, there should be no dead cells at all.
    const map = straightPathMap({
      buildableCells: [
        { col: 0, row: 0 },
        { col: 10, row: 10 },
      ],
    });
    expect(deadCells(map)).toEqual([]);
  });

  it("is empty for a solid rectangle", () => {
    const map = straightPathMap({
      buildableCells: [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
        { col: 0, row: 1 },
        { col: 1, row: 1 },
      ],
    });
    expect(deadCells(map)).toEqual([]);
  });

  it("dedupes a cell claimed by two islands whose bounding boxes overlap", () => {
    // An "L" island (row 0 plus a right-hand column) whose bounding box
    // is cols 0-4 / rows 0-4, and a second, disconnected diagonal island
    // sitting entirely inside that box. Both islands' rectangle-fills
    // land on (2,2) and (1,3) — a real shape this session traced onto
    // Forest hits this exact case, and without dedup those two cells
    // were emitted twice, breaking React's key uniqueness.
    const map = straightPathMap({
      buildableCells: [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
        { col: 2, row: 0 },
        { col: 3, row: 0 },
        { col: 4, row: 0 },
        { col: 4, row: 1 },
        { col: 4, row: 2 },
        { col: 4, row: 3 },
        { col: 4, row: 4 },
        // Disconnected from the L above (no shared edge or corner) —
        // its own island, but its bounding box sits inside the L's.
        { col: 1, row: 2 },
        { col: 2, row: 3 },
      ],
    });
    const dead = deadCells(map);
    const keys = dead.map((c) => `${c.col},${c.row}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((k) => k === "2,2")).toHaveLength(1);
    expect(keys.filter((k) => k === "1,3")).toHaveLength(1);
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
    const ranked = bestSpotsForTower(map, 2, "standard", 3);
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

  it("re-ranks for advance mode when a spot only serves one lane", () => {
    // (5,5) is useless in standard mode but sits 1 cell from the south
    // lane, so advance mode should rank it above the far-from-both spots.
    const map = twoLaneMap();
    const ranked = bestSpotsForTower(map, 2, "advance", 3);
    expect(ranked[0].cell).toEqual({ col: 5, row: 1 });
    expect(
      ranked.find((entry) => entry.cell.row === 5)?.coverage
        .coveragePercent,
    ).toBeGreaterThan(0);
  });
});
