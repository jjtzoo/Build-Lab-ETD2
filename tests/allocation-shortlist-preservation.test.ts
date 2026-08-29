import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  Allocation,
  ElementName,
} from "@/lib/types";

import {
  getAllocationShortlist,
} from "@/lib/engine/allocation-shortlist";

function activeElements(
  allocation: Allocation,
): number {
  return allocation.filter(
    (level) => level > 0,
  ).length;
}

function hasDeepAllocation(
    allocations: Allocation[],
  ): boolean {
    return allocations.some(
      (allocation) => {
        const sorted =
          [...allocation].sort(
            (a, b) => b - a,
          );

        return (
          sorted[0] === 3 &&
          sorted[1] === 3
        );
      },
    );
  }

function hasBroadAllocation(
  allocations: Allocation[],
): boolean {
  return allocations.some(
    (allocation) =>
      activeElements(
        allocation,
      ) >= 5,
  );
}

function hasThirdLevelDual(
  allocations: Allocation[],
): boolean {
  return allocations.some(
    (allocation) =>
      allocation.some(
        (level, index) =>
          index !== 0 &&
          level === 3,
      ) &&
      allocations.length > 0,
  );
}

describe(
  "allocation shortlist preservation",
  () => {
    it(
      "preserves deep allocations",
      () => {
        const core: ElementName[] = [
          "Darkness",
          "Earth",
          "Fire",
        ];

        const shortlist =
          getAllocationShortlist(
            core,
            "Auto",
          );

        expect(
          hasDeepAllocation(
            shortlist,
          ),
        ).toBe(true);
      },
    );

    it(
      "preserves broad allocations",
      () => {
        const core: ElementName[] = [
          "Nature",
          "Water",
          "Fire",
        ];

        const shortlist =
          getAllocationShortlist(
            core,
            "Auto",
          );

        expect(
          hasBroadAllocation(
            shortlist,
          ),
        ).toBe(true);
      },
    );

    it(
      "preserves multiple structural families",
      () => {
        const core: ElementName[] = [
          "Darkness",
          "Earth",
          "Fire",
        ];

        const shortlist =
          getAllocationShortlist(
            core,
            "Auto",
          );

        expect(
          hasDeepAllocation(
            shortlist,
          ),
        ).toBe(true);

        expect(
          hasBroadAllocation(
            shortlist,
          ),
        ).toBe(true);
      },
    );

    it(
      "preserves a meaningful high-depth Dual path",
      () => {
        const core: ElementName[] = [
          "Darkness",
          "Earth",
          "Fire",
        ];

        const shortlist =
          getAllocationShortlist(
            core,
            "Auto",
          );

        expect(
          shortlist.some(
            (allocation) => {
              const sorted =
                [...allocation].sort(
                  (a, b) =>
                    b - a,
                );

              return (
                sorted[0] === 3 &&
                sorted[1] === 3
              );
            },
          ),
        ).toBe(true);
      },
    );

    it(
      "preserves an allocation capable of realizing Howitzer",
      () => {
        const core: ElementName[] = [
          "Darkness",
          "Earth",
          "Fire",
        ];

        const shortlist =
          getAllocationShortlist(
            core,
            "Howitzer",
          );

        /*
         * Howitzer is Darkness + Earth.
         * We care that the shortlist contains
         * an allocation that can actually reach
         * its full modeled Lv3 blueprint.
         *
         * We deliberately do not require a
         * particular use of the remaining points.
         */
        const hasHowitzerReady =
          shortlist.some(
            (allocation) =>
              allocation[1] >= 3 &&
              allocation[5] >= 3,
          );

        expect(
          hasHowitzerReady,
        ).toBe(true);
      },
    );

    it(
      "keeps Auto mode distinct from explicit-anchor mode",
      () => {
        const core: ElementName[] = [
          "Darkness",
          "Earth",
          "Fire",
        ];

        const auto =
          getAllocationShortlist(
            core,
            "Auto",
          );

        const anchored =
          getAllocationShortlist(
            core,
            "Howitzer",
          );

        expect(
          auto.length,
        ).toBeGreaterThan(0);

        expect(
          anchored.length,
        ).toBeGreaterThan(0);

        const autoKeys =
          new Set(
            auto.map(
              (allocation) =>
                allocation.join(","),
            ),
          );

        const anchoredKeys =
          new Set(
            anchored.map(
              (allocation) =>
                allocation.join(","),
            ),
          );

        const intersection =
          [...autoKeys].filter(
            (key) =>
              anchoredKeys.has(
                key,
              ),
          ).length;

        expect(
          intersection,
        ).toBeLessThan(
          Math.max(
            autoKeys.size,
            anchoredKeys.size,
          ),
        );
      },
    );

    it(
      "does not collapse to one identical allocation",
      () => {
        const core: ElementName[] = [
          "Darkness",
          "Earth",
          "Fire",
        ];

        const shortlist =
          getAllocationShortlist(
            core,
            "Auto",
          );

        const unique =
          new Set(
            shortlist.map(
              (allocation) =>
                allocation.join(","),
            ),
          );

        expect(
          unique.size,
        ).toBe(
          shortlist.length,
        );

        expect(
          shortlist.length,
        ).toBeGreaterThan(1);
      },
    );
  },
);