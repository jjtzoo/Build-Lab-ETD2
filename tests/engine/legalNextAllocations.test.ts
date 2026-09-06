import { describe, expect, it } from "vitest";

import {
  ELEMENTS,
  type ElementAllocation,
} from "@/lib/domain/elements";

import {
  legalNextAllocations,
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

describe("legal next allocations", () => {
  it("counts normal element keystones", () => {
    const state = allocation({
      Light: 3,
      Darkness: 3,
      Water: 2,
      Fire: 2,
    });

    expect(
      totalKeystones(state),
    ).toBe(10);
  });

  it("generates every legal one-keystone continuation", () => {
    const state = allocation({
      Light: 3,
      Darkness: 3,
      Water: 2,
      Fire: 2,
    });

    expect(
      legalNextAllocations(state),
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

  it("does not increase an element beyond level 3", () => {
    const state = allocation({
      Light: 3,
      Darkness: 2,
      Water: 2,
      Fire: 2,
    });

    const next =
      legalNextAllocations(state);

    expect(
      next.some(
        (candidate) =>
          candidate.Light > 3,
      ),
    ).toBe(false);
  });

  it("changes exactly one element per continuation", () => {
    const state = allocation({
      Light: 2,
      Darkness: 2,
      Water: 2,
      Fire: 2,
    });

    for (
      const candidate
      of legalNextAllocations(state)
    ) {
      const changedElements =
        ELEMENTS.filter(
          (element) =>
            candidate[element] !==
            state[element],
        );

      expect(
        changedElements,
      ).toHaveLength(1);

      expect(
        totalKeystones(candidate),
      ).toBe(
        totalKeystones(state) + 1,
      );
    }
  });

  it("returns no continuations at the 11-keystone limit", () => {
    const state = allocation({
      Light: 3,
      Darkness: 3,
      Water: 3,
      Fire: 2,
    });

    expect(
      legalNextAllocations(state),
    ).toEqual([]);
  });

  it("can introduce a previously unused element", () => {
    const state = allocation({
      Light: 3,
      Darkness: 3,
      Water: 2,
      Fire: 1,
    });

    const next =
      legalNextAllocations(state);

    expect(next).toContainEqual(
      allocation({
        Light: 3,
        Darkness: 3,
        Water: 2,
        Fire: 1,
        Nature: 1,
      }),
    );

    expect(next).toContainEqual(
      allocation({
        Light: 3,
        Darkness: 3,
        Water: 2,
        Fire: 1,
        Earth: 1,
      }),
    );
  });
});