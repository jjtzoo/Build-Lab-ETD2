import { describe, expect, it } from "vitest";

import type { Allocation } from "@/lib/types";
import {
  legalNextAllocations,
  totalKeystones,
} from "@/lib/engine/allocation";

describe("legal next allocations", () => {
  it("counts normal element keystones", () => {
    const allocation: Allocation = [
      3, 3, 2, 2, 0, 0,
    ];

    expect(
      totalKeystones(allocation),
    ).toBe(10);
  });

  it("generates every legal one-keystone continuation", () => {
    const allocation: Allocation = [
      3, 3, 2, 2, 0, 0,
    ];

    expect(
      legalNextAllocations(allocation),
    ).toEqual([
      [3, 3, 3, 2, 0, 0],
      [3, 3, 2, 3, 0, 0],
      [3, 3, 2, 2, 1, 0],
      [3, 3, 2, 2, 0, 1],
    ]);
  });

  it("does not increase an element beyond level 3", () => {
    const allocation: Allocation = [
      3, 2, 2, 2, 0, 0,
    ];

    const next =
      legalNextAllocations(allocation);

    expect(
      next.some(
        (candidate) =>
          candidate[0] === 4,
      ),
    ).toBe(false);
  });

  it("changes exactly one element per continuation", () => {
    const allocation: Allocation = [
      2, 2, 2, 2, 0, 0,
    ];

    for (
      const candidate
      of legalNextAllocations(allocation)
    ) {
      const differences =
        candidate.filter(
          (value, index) =>
            value !== allocation[index],
        );

      expect(differences).toHaveLength(1);

      expect(
        totalKeystones(candidate),
      ).toBe(
        totalKeystones(allocation) + 1,
      );
    }
  });

  it("returns no continuations at the 11-keystone limit", () => {
    const allocation: Allocation = [
      3, 3, 3, 2, 0, 0,
    ];

    expect(
      legalNextAllocations(allocation),
    ).toEqual([]);
  });

  it("can introduce a previously unused element", () => {
    const allocation: Allocation = [
      3, 3, 2, 1, 0, 0,
    ];

    const next =
      legalNextAllocations(allocation);

    expect(next).toContainEqual(
      [3, 3, 2, 1, 1, 0],
    );

    expect(next).toContainEqual(
      [3, 3, 2, 1, 0, 1],
    );
  });
});