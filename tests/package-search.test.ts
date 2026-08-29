import { describe, expect, it } from "vitest";

import { searchPackage } from "@/lib/engine/package-search";

describe("package search", () => {
  it("finds a package for a legal allocation", () => {
    const result = searchPackage(
      [2, 2, 2, 1, 2, 2],
      ["Light", "Darkness", "Fire"],
    );

    expect(result).not.toBeNull();
    expect(result?.towers.length).toBeGreaterThan(0);
    expect(result?.bundles.length).toBe(
      result?.towers.length,
    );
  });

  it("preserves a requested anchor", () => {
    const result = searchPackage(
      [2, 2, 2, 1, 2, 2],
      ["Light", "Darkness", "Fire"],
      "Nuclear",
    );

    expect(result).not.toBeNull();
    expect(
      result?.towers.some(
        (tower) => tower.name === "Nuclear",
      ),
    ).toBe(true);
  });

  it("rejects an unavailable anchor", () => {
    const result = searchPackage(
      [2, 2, 2, 1, 2, 2],
      ["Light", "Darkness", "Fire"],
      "Definitely Not A Tower",
    );

    expect(result).toBeNull();
  });
});