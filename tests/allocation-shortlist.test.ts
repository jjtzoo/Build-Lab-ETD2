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

import {
  legalAllocations,
} from "@/lib/engine/allocation";

describe(
  "allocation shortlist",
  () => {
    const core: ElementName[] = [
      "Darkness",
      "Earth",
      "Fire",
    ];

    it(
      "returns only legal allocations",
      () => {
        const legal =
          new Set(
            legalAllocations(
              core,
            ).map(
              (allocation) =>
                allocation.join(","),
            ),
          );

        const shortlist =
          getAllocationShortlist(
            core,
          );

        expect(
          shortlist.length,
        ).toBeGreaterThan(0);

        for (
          const allocation of
          shortlist
        ) {
          expect(
            legal.has(
              allocation.join(","),
            ),
          ).toBe(true);
        }
      },
    );

    it(
      "reduces the search space",
      () => {
        const legal =
          legalAllocations(
            core,
          );

        const shortlist =
          getAllocationShortlist(
            core,
          );

        expect(
          shortlist.length,
        ).toBeLessThan(
          legal.length,
        );

        expect(
          shortlist.length,
        ).toBeLessThanOrEqual(
          32,
        );
      },
    );

    it(
      "preserves an explicit anchor blueprint",
      () => {
        const shortlist =
          getAllocationShortlist(
            core,
            "Howitzer",
          );

        const hasAnchorReady =
          shortlist.some(
            (
              allocation: Allocation,
            ) =>
              allocation[1] >=
                3 &&
              allocation[5] >=
                3,
          );

        expect(
          hasAnchorReady,
        ).toBe(true);
      },
    );

    it(
      "does not become anchor-biased in Auto mode",
      () => {
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

        expect(
          auto,
        ).not.toEqual(
          anchored,
        );
      },
    );

    it(
    "preserves multiple distinct allocations",
    () => {
        const shortlist =
        getAllocationShortlist(
            core,
            "Auto",
        );

        const uniqueAllocations =
        new Set(
            shortlist.map(
            (allocation) =>
                allocation.join(","),
            ),
        );

        expect(
        uniqueAllocations.size,
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