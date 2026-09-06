import { describe, expect, it } from "vitest";

import type { Allocation } from "@/lib/types";

import {
  MAX_ELEMENT_LEVEL,
  MAX_KEYSTONES,
  reachableAllocations,
  totalKeystones,
} from "@/lib/engine/allocation";

function key(
  allocation: Allocation,
): string {
  return allocation.join("-");
}

describe("reachable allocations", () => {
  it("returns all one-step states when only one keystone remains", () => {
    const start: Allocation = [
      3, 3, 2, 2, 0, 0,
    ];

    expect(
      reachableAllocations(start),
    ).toEqual([
      [3, 3, 3, 2, 0, 0],
      [3, 3, 2, 3, 0, 0],
      [3, 3, 2, 2, 1, 0],
      [3, 3, 2, 2, 0, 1],
    ]);
  });

  it("returns no future states when already at 11 keystones", () => {
    const start: Allocation = [
      3, 3, 3, 2, 0, 0,
    ];

    expect(
      reachableAllocations(start),
    ).toEqual([]);
  });

  it("reaches states requiring multiple future keystones", () => {
    const start: Allocation = [
      3, 3, 1, 1, 0, 0,
    ];

    const reachable =
      reachableAllocations(start);

    expect(reachable).toContainEqual(
      [3, 3, 2, 2, 0, 0],
    );

    expect(reachable).toContainEqual(
      [3, 3, 2, 1, 1, 0],
    );
  });

  it("does not return duplicate allocation states", () => {
    const start: Allocation = [
      3, 3, 1, 1, 0, 0,
    ];

    const reachable =
      reachableAllocations(start);

    const keys = reachable.map(key);

    expect(
      new Set(keys).size,
    ).toBe(keys.length);
  });

  it("never exceeds element or total keystone limits", () => {
    const start: Allocation = [
      2, 2, 1, 1, 0, 0,
    ];

    for (
      const allocation
      of reachableAllocations(start)
    ) {
      expect(
        totalKeystones(allocation),
      ).toBeGreaterThan(
        totalKeystones(start),
      );

      expect(
        totalKeystones(allocation),
      ).toBeLessThanOrEqual(
        MAX_KEYSTONES,
      );

      for (const level of allocation) {
        expect(level).toBeLessThanOrEqual(
          MAX_ELEMENT_LEVEL,
        );
      }
    }
  });

  it("can discover a new element several steps into the route", () => {
    const start: Allocation = [
      3, 3, 1, 0, 0, 0,
    ];

    const reachable =
      reachableAllocations(start);

    expect(reachable).toContainEqual(
      [3, 3, 2, 1, 1, 0],
    );
  });
});