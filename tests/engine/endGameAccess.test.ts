import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  ElementAllocation,
} from "@/lib/domain/elements";

import {
  enumerateEndGamePackages,
  evaluateEndGameAccess,
} from "@/lib/engine/endGameAccess";

function allocation(
  values: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
  ],
): ElementAllocation {
  const [
    Light,
    Darkness,
    Water,
    Fire,
    Nature,
    Earth,
  ] = values;

  return {
    Light,
    Darkness,
    Water,
    Fire,
    Nature,
    Earth,
  };
}

describe(
  "Phase 6 Pure and Periodic access",
  () => {
    it("gives three Pure candidates and no Periodic for 3-3-3-2", () => {
      const access =
        evaluateEndGameAccess(
          allocation([
            3, 3, 3, 2, 0, 0,
          ]),
        );

      expect(
        access.pureCandidates.map(
          (candidate) =>
            candidate.towerId,
        ),
      ).toEqual([
        "pure-light",
        "pure-darkness",
        "pure-water",
      ]);
      expect(
        access.periodicCandidate,
      ).toBeNull();
    });

    it("gives Periodic and no Pure for 2-2-2-2-2-1", () => {
      const access =
        evaluateEndGameAccess(
          allocation([
            2, 2, 2, 2, 2, 1,
          ]),
        );

      expect(
        access.pureCandidates,
      ).toEqual([]);
      expect(
        access.periodicCandidate
          ?.towerId,
      ).toBe("periodic");
    });

    it("gives one Pure plus Periodic for 3-2-2-2-1-1", () => {
      const access =
        evaluateEndGameAccess(
          allocation([
            3, 2, 2, 2, 1, 1,
          ]),
        );

      expect(
        access.candidates.map(
          (candidate) =>
            candidate.towerId,
        ),
      ).toEqual([
        "pure-light",
        "periodic",
      ]);
    });

    it("does not treat the invalid 3-2-2-2-2-1 total as an 11-allocation example", () => {
      const invalidTotal = [
        3, 2, 2, 2, 2, 1,
      ].reduce(
        (total, level) =>
          total + level,
        0,
      );

      expect(invalidTotal).toBe(12);
    });

    it("enumerates complete two-use multisets including duplicates", () => {
      const packages =
        enumerateEndGamePackages(
          evaluateEndGameAccess(
            allocation([
              3, 2, 2, 2, 1, 1,
            ]),
          ),
        );

      expect(packages).toEqual([
        {
          selections: [{
            towerId: "periodic",
            quantity: 2,
          }],
          totalEssenceUses: 2,
        },
        {
          selections: [
            {
              towerId: "periodic",
              quantity: 1,
            },
            {
              towerId: "pure-light",
              quantity: 1,
            },
          ],
          totalEssenceUses: 2,
        },
        {
          selections: [{
            towerId: "pure-light",
            quantity: 2,
          }],
          totalEssenceUses: 2,
        },
      ]);
    });

    it("keeps normal tower identity separate from special quantities", () => {
      const repeated =
        enumerateEndGamePackages(
          evaluateEndGameAccess(
            allocation([
              3, 3, 3, 2, 0, 0,
            ]),
          ),
        ).find(
          (candidate) =>
            candidate.selections
              .length === 1 &&
            candidate.selections[0]
              .towerId ===
                "pure-light",
        );

      expect(
        repeated?.selections,
      ).toEqual([{
        towerId: "pure-light",
        quantity: 2,
      }]);
    });
  },
);
