import { describe, expect, it } from "vitest";

import {
  ELEMENTS,
  type ElementAllocation,
} from "@/lib/domain/elements";

import {
  MAX_ELEMENT_LEVEL,
  MAX_KEYSTONES,
  reachableAllocations,
  totalKeystones,
} from "@/lib/engine/allocation";

function allocation(
  values: Partial<ElementAllocation>,
): ElementAllocation {
  return {
    Light: 0,
    Darkness: 0,
    Water: 0,
    Fire: 0,
    Nature: 0,
    Earth: 0,
    ...values,
  };
}

function key(
  state: ElementAllocation,
): string {
  return ELEMENTS
    .map(
      (element) =>
        state[element],
    )
    .join("-");
}

describe("reachable allocations", () => {
  it("returns all one-step states when only one keystone remains", () => {
    const start = allocation({
      Light: 3,
      Darkness: 3,
      Water: 2,
      Fire: 2,
    });

    expect(
      reachableAllocations(start),
    ).toEqual([
      allocation({
        Light: 3,
        Darkness: 3,
        Water: 3,
        Fire: 2,
      }),
      allocation({
        Light: 3,
        Darkness: 3,
        Water: 2,
        Fire: 3,
      }),
      allocation({
        Light: 3,
        Darkness: 3,
        Water: 2,
        Fire: 2,
        Nature: 1,
      }),
      allocation({
        Light: 3,
        Darkness: 3,
        Water: 2,
        Fire: 2,
        Earth: 1,
      }),
    ]);
  });

  it("returns no future states when already at 11 keystones", () => {
    const start = allocation({
      Light: 3,
      Darkness: 3,
      Water: 3,
      Fire: 2,
    });

    expect(
      reachableAllocations(start),
    ).toEqual([]);
  });

  it("reaches states requiring multiple future keystones", () => {
    const start = allocation({
      Light: 3,
      Darkness: 3,
      Water: 1,
      Fire: 1,
    });

    const reachable =
      reachableAllocations(start);

    expect(reachable).toContainEqual(
      allocation({
        Light: 3,
        Darkness: 3,
        Water: 2,
        Fire: 2,
      }),
    );

    expect(reachable).toContainEqual(
      allocation({
        Light: 3,
        Darkness: 3,
        Water: 2,
        Fire: 1,
        Nature: 1,
      }),
    );
  });

  it("does not return duplicate allocation states", () => {
    const start = allocation({
      Light: 3,
      Darkness: 3,
      Water: 1,
      Fire: 1,
    });

    const reachable =
      reachableAllocations(start);

    const keys =
      reachable.map(key);

    expect(
      new Set(keys).size,
    ).toBe(keys.length);
  });

  it("never exceeds element or total keystone limits", () => {
    const start = allocation({
      Light: 2,
      Darkness: 2,
      Water: 1,
      Fire: 1,
    });

    for (
      const state
      of reachableAllocations(start)
    ) {
      expect(
        totalKeystones(state),
      ).toBeGreaterThan(
        totalKeystones(start),
      );

      expect(
        totalKeystones(state),
      ).toBeLessThanOrEqual(
        MAX_KEYSTONES,
      );

      for (const element of ELEMENTS) {
        expect(
          state[element],
        ).toBeLessThanOrEqual(
          MAX_ELEMENT_LEVEL,
        );
      }
    }
  });

  it("can discover a new element several steps into the route", () => {
    const start = allocation({
      Light: 3,
      Darkness: 3,
      Water: 1,
    });

    const reachable =
      reachableAllocations(start);

    expect(reachable).toContainEqual(
      allocation({
        Light: 3,
        Darkness: 3,
        Water: 2,
        Fire: 1,
        Nature: 1,
      }),
    );
  });
});