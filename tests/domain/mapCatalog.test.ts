import { describe, expect, it } from "vitest";

import {
  MAPS,
  getMap,
  isMapTraced,
  tracedMaps,
} from "@/lib/domain/mapCatalog";

describe("map catalog", () => {
  it("ships every map with its confirmed facts, traced or not", () => {
    // A skeleton is a legitimate state: the official path length is a
    // fact worth recording before anyone has traced the geometry. What it
    // must never carry is invented geometry.
    for (const map of MAPS) {
      expect(map.id).toBeTruthy();
      expect(map.name).toBeTruthy();
      expect(map.rangeUnitsPerCell).toBeGreaterThan(0);
    }
    expect(getMap("forest").id).toBe("forest");
    expect(() => getMap("nope")).toThrow();
  });

  it("counts a map as traced only with both a path and buildable cells", () => {
    expect(isMapTraced(getMap("forest"))).toBe(true);

    const skeleton = { ...getMap("forest"), buildableCells: [] };
    expect(isMapTraced(skeleton)).toBe(false);

    const noPath = {
      ...getMap("forest"),
      paths: [{ id: "main", points: [], modes: ["standard" as const] }],
    };
    expect(isMapTraced(noPath)).toBe(false);
  });

  it("never offers a map that cannot answer anything", () => {
    // The regression this guards: the player-facing picker listed all
    // four maps while three had zero cells and zero path points, so three
    // of four options were dead ends. Maps are digitised one at a time,
    // so the picker has to follow the data rather than the catalog.
    const offered = tracedMaps();
    expect(offered.length).toBeGreaterThan(0);
    for (const map of offered) {
      expect(map.buildableCells.length).toBeGreaterThan(0);
      expect(
        map.paths.some((path) => path.points.length >= 2),
      ).toBe(true);
      // Coverage math divides by this, so a traced map needs it real.
      expect(map.pathDurationSeconds).toBeGreaterThan(0);
    }
  });
});
