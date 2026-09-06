import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getAnchorAssumedAllocation,
} from "@/lib/domain/anchorPolicy";

import {
  ELEMENTS,
} from "@/lib/domain/elements";

import {
  getTower,
} from "@/lib/domain/towerCatalog";

import {
  MAX_KEYSTONES,
  totalKeystones,
} from "@/lib/engine/allocation";

import {
  getAnchorRouteStates,
  getEarliestCoreDevelopedStates,
  getEarliestCoreFeasibleStates,
} from "@/lib/engine/anchorRouteStates";

function allocationKey(
  allocation: Record<
    (typeof ELEMENTS)[number],
    number
  >,
): string {
  return ELEMENTS
    .map(
      (element) =>
        allocation[element],
    )
    .join("-");
}

describe("anchor route states", () => {
    
    it("returns only the earliest core-feasible states", () => {
    const states =
        getAnchorRouteStates("laser");

    const earliest =
        getEarliestCoreFeasibleStates(
        "laser",
        );

    expect(earliest.length)
        .toBeGreaterThan(0);

    const earliestDepth =
        Math.min(
        ...states
            .filter(
            (state) =>
                state.coreFeasible,
            )
            .map(
            (state) =>
                state.additionalKeystones,
            ),
        );

    expect(
        earliest.every(
        (state) =>
            state.coreFeasible &&
            state.additionalKeystones ===
            earliestDepth,
        ),
    ).toBe(true);
    });

    it("does not include later feasible states when an earlier completion exists", () => {
    const states =
        getAnchorRouteStates("laser");

    const earliest =
        getEarliestCoreFeasibleStates(
        "laser",
        );

    const earliestDepth =
        earliest[0]?.additionalKeystones;

    expect(
        earliestDepth,
    ).toBeDefined();

    const laterFeasibleExists =
        states.some(
        (state) =>
            state.coreFeasible &&
            state.additionalKeystones >
            earliestDepth!,
        );

    expect(
        laterFeasibleExists,
    ).toBe(true);

    expect(
        earliest.some(
        (state) =>
            state.additionalKeystones >
            earliestDepth!,
        ),
    ).toBe(false);
    });

    it("returns only the earliest developed-core states", () => {
    const states =
        getAnchorRouteStates("laser");

    const earliest =
        getEarliestCoreDevelopedStates(
        "laser",
        );

    expect(earliest.length)
        .toBeGreaterThan(0);

    const earliestDepth =
        Math.min(
        ...states
            .filter(
            (state) =>
                state.coreDeveloped,
            )
            .map(
            (state) =>
                state.additionalKeystones,
            ),
        );

    expect(
        earliest.every(
        (state) =>
            state.coreDeveloped &&
            state.additionalKeystones ===
            earliestDepth,
        ),
    ).toBe(true);
    });

    it("developed completion cannot occur earlier than feasible completion", () => {
    const feasible =
        getEarliestCoreFeasibleStates(
        "laser",
        );

    const developed =
        getEarliestCoreDevelopedStates(
        "laser",
        );

    expect(feasible.length)
        .toBeGreaterThan(0);

    expect(developed.length)
        .toBeGreaterThan(0);

    expect(
        developed[0].additionalKeystones,
    ).toBeGreaterThanOrEqual(
        feasible[0].additionalKeystones,
    );
    });
    
  it("includes the assumed anchor allocation as state zero", () => {
    const expected =
      getAnchorAssumedAllocation(
        "atom",
      );

    const states =
      getAnchorRouteStates(
        "atom",
      );

    expect(states[0].allocation)
      .toEqual(expected);

    expect(
      states[0].additionalKeystones,
    ).toBe(0);
  });

  it("starts a Dual anchor fully developed at its assumed level", () => {
    const anchor =
      getTower("atom");

    const first =
      getAnchorRouteStates(
        anchor.id,
      )[0];

    expect(
      first.anchorReachableLevel,
    ).toBe(anchor.maxLevel);

    expect(
      first.anchorTargetLevel,
    ).toBe(anchor.maxLevel);

    expect(
      first.anchorSatisfied,
    ).toBe(true);
  });

  it("starts a Trio anchor fully developed at its assumed level", () => {
    const anchor =
      getTower("laser");

    const first =
      getAnchorRouteStates(
        anchor.id,
      )[0];

    expect(
      first.anchorReachableLevel,
    ).toBe(anchor.maxLevel);

    expect(
      first.anchorTargetLevel,
    ).toBe(anchor.maxLevel);

    expect(
      first.anchorSatisfied,
    ).toBe(true);
  });

  it("measures additional keystones relative to the anchor start", () => {
    const start =
      getAnchorAssumedAllocation(
        "atom",
      );

    const startTotal =
      totalKeystones(start);

    const states =
      getAnchorRouteStates(
        "atom",
      );

    for (const state of states) {
      expect(
        state.additionalKeystones,
      ).toBe(
        state.totalKeystones -
        startTotal,
      );
    }
  });

  it("never exceeds the normal keystone limit", () => {
    const states =
      getAnchorRouteStates(
        "atom",
      );

    for (const state of states) {
      expect(
        state.totalKeystones,
      ).toBeLessThanOrEqual(
        MAX_KEYSTONES,
      );
    }
  });

  it("does not return duplicate allocation states", () => {
    const states =
      getAnchorRouteStates(
        "atom",
      );

    const keys =
      states.map(
        (state) =>
          allocationKey(
            state.allocation,
          ),
      );

    expect(
      new Set(keys).size,
    ).toBe(keys.length);
  });

  it("never loses the selected anchor along a future route", () => {
    const anchor =
      getTower("laser");

    const states =
      getAnchorRouteStates(
        anchor.id,
      );

    for (const state of states) {
      expect(
        state.anchorSatisfied,
      ).toBe(true);

      expect(
        state.anchorReachableLevel,
      ).toBe(anchor.maxLevel);
    }
  });

  it("defines core feasibility from the selected anchor plus the three support roles", () => {
    const states =
      getAnchorRouteStates(
        "laser",
      );

    for (const state of states) {
      const supports =
        state.roleFeasibility.filter(
          (status) =>
            status.role !==
            "main-dps",
        );

      expect(
        state.coreFeasible,
      ).toBe(
        state.anchorSatisfied &&
          supports.every(
            (status) =>
              status.available,
          ),
      );
    }
  });

  it("defines developed core from the selected anchor plus developed support roles", () => {
    const states =
      getAnchorRouteStates(
        "laser",
      );

    for (const state of states) {
      const supports =
        state.roleFeasibility.filter(
          (status) =>
            status.role !==
            "main-dps",
        );

      expect(
        state.coreDeveloped,
      ).toBe(
        state.anchorSatisfied &&
          supports.every(
            (status) =>
              status.developed,
          ),
      );
    }
  });
});