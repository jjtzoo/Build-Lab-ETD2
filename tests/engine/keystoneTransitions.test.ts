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
  type ElementAllocation,
} from "@/lib/domain/elements";

import {
  availableTowers,
  legalNextAllocations,
} from "@/lib/engine/allocation";

import {
  getAnchorRouteStates,
} from "@/lib/engine/anchorRouteStates";

import {
  evaluateKeystoneTransition,
  getAnchorKeystoneTransitions,
} from "@/lib/engine/keystoneTransitions";

function key(
  allocation: ElementAllocation,
): string {
  return ELEMENTS
    .map(
      (element) =>
        allocation[element],
    )
    .join("-");
}

describe(
  "keystone transitions",
  () => {
    it("identifies the single element changed by a legal transition", () => {
      const before =
        getAnchorAssumedAllocation(
          "laser",
        );

      const after =
        legalNextAllocations(
          before,
        )[0];

      expect(after)
        .toBeDefined();

      const transition =
        evaluateKeystoneTransition(
          before,
          after,
        );

      const changed =
        ELEMENTS.filter(
          (element) =>
            before[element] !==
            after[element],
        );

      expect(changed)
        .toEqual([
          transition.element,
        ]);

      expect(
        transition.toElementLevel,
      ).toBe(
        transition
          .fromElementLevel + 1,
      );
    });

    it("rejects a transition that spends more than one keystone", () => {
      const before:
        ElementAllocation = {
          Light: 0,
          Darkness: 0,
          Water: 0,
          Fire: 0,
          Nature: 0,
          Earth: 0,
        };

      const after:
        ElementAllocation = {
          Light: 1,
          Darkness: 1,
          Water: 0,
          Fire: 0,
          Nature: 0,
          Earth: 0,
        };

      expect(() =>
        evaluateKeystoneTransition(
          before,
          after,
        ),
      ).toThrow(
        "Allocation is not a legal one-keystone continuation.",
      );
    });

    it("reports exactly the towers whose reachable access changed", () => {
      const before =
        getAnchorAssumedAllocation(
          "laser",
        );

      const after =
        legalNextAllocations(
          before,
        )[0];

      expect(after)
        .toBeDefined();

      const transition =
        evaluateKeystoneTransition(
          before,
          after,
        );

      const beforeLevels =
        new Map(
          availableTowers(
            before,
          ).map(
            (entry) => [
              entry.tower.id,
              entry.maxLevel,
            ],
          ),
        );

      const expectedChanged =
        availableTowers(
          after,
        )
          .filter(
            (entry) =>
              entry.maxLevel !==
              (
                beforeLevels.get(
                  entry.tower.id,
                ) ?? 0
              ),
          )
          .map(
            (entry) =>
              entry.tower.id,
          )
          .sort();

      expect(
        transition
          .towerAccessChanges
          .map(
            (change) =>
              change.towerId,
          )
          .sort(),
      ).toEqual(
        expectedChanged,
      );
    });

    it("classifies newly unlocked towers from level zero", () => {
      const transitions =
        getAnchorKeystoneTransitions(
          "laser",
        );

      const unlock =
        transitions
          .flatMap(
            (transition) =>
              transition
                .towerAccessChanges,
          )
          .find(
            (change) =>
              change.change ===
              "newly-unlocked",
          );

      expect(unlock)
        .toBeDefined();

      expect(
        unlock!.beforeLevel,
      ).toBe(0);

      expect(
        unlock!.afterLevel,
      ).toBeGreaterThan(0);
    });

    it("classifies increased reachable tower levels as deepening", () => {
      const transitions =
        getAnchorKeystoneTransitions(
          "laser",
        );

      const deepening =
        transitions
          .flatMap(
            (transition) =>
              transition
                .towerAccessChanges,
          )
          .find(
            (change) =>
              change.change ===
              "deepened",
          );

      expect(deepening)
        .toBeDefined();

      expect(
        deepening!.beforeLevel,
      ).toBeGreaterThan(0);

      expect(
        deepening!.afterLevel,
      ).toBeGreaterThan(
        deepening!.beforeLevel,
      );
    });

    it("every anchor transition spends exactly one normal keystone", () => {
      const transitions =
        getAnchorKeystoneTransitions(
          "laser",
        );

      expect(
        transitions.length,
      ).toBeGreaterThan(0);

      for (const transition of transitions) {
        expect(
          transition
            .toTotalKeystones,
        ).toBe(
          transition
            .fromTotalKeystones + 1,
        );
      }
    });

    it("keeps both ends of every transition inside the anchor route graph", () => {
      const states =
        getAnchorRouteStates(
          "laser",
        );

      const stateKeys =
        new Set(
          states.map(
            (state) =>
              key(
                state.allocation,
              ),
          ),
        );

      const transitions =
        getAnchorKeystoneTransitions(
          "laser",
        );

      for (const transition of transitions) {
        expect(
          stateKeys.has(
            key(
              transition
                .fromAllocation,
            ),
          ),
        ).toBe(true);

        expect(
          stateKeys.has(
            key(
              transition
                .toAllocation,
            ),
          ),
        ).toBe(true);
      }
    });

    it("never creates a transition beyond the 11-keystone limit", () => {
      const transitions =
        getAnchorKeystoneTransitions(
          "laser",
        );

      for (const transition of transitions) {
        expect(
          transition
            .toTotalKeystones,
        ).toBeLessThanOrEqual(
          11,
        );
      }
    });
  },
);