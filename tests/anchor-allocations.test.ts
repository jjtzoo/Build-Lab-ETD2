import { describe, expect, it } from "vitest";

import {
  legalAllocationsForAnchor,
} from "@/lib/engine/allocation";

describe("anchor-aware allocation filtering", () => {
  it("only returns allocations that can build the requested anchor", () => {
    const allocations =
      legalAllocationsForAnchor(
        [
          "Darkness",
          "Earth",
          "Fire",
        ],
        "Howitzer",
      );

    expect(allocations.length).toBeGreaterThan(0);

    for (const allocation of allocations) {
      const darkness = allocation[1];
      const earth = allocation[5];

      expect(darkness).toBeGreaterThanOrEqual(1);
      expect(earth).toBeGreaterThanOrEqual(1);
    }
  });
});