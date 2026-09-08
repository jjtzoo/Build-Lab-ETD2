import {
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  getEndGameTowerFact,
} from "@/lib/domain/endGameTowerFacts";

import type {
  ElementAllocation,
} from "@/lib/domain/elements";

import {
  evaluateAnchorPackages,
} from "@/lib/engine/anchorPackageEvaluations";

import type {
  CorePackageEvidence,
} from "@/lib/engine/corePackageEvidence";

import {
  enumerateEndGamePackages,
  evaluateEndGameAccess,
} from "@/lib/engine/endGameAccess";

import {
  evaluateEndGamePackage,
  rankEndGamePackages,
} from "@/lib/engine/endGamePackageEvaluation";

let normalEvidence:
  CorePackageEvidence;

beforeAll(() => {
  const baseline =
    evaluateAnchorPackages(
      "laser",
    ).find((entry) =>
      entry.package.coreDeveloped,
    );

  if (!baseline) {
    throw new Error(
      "Missing developed Laser baseline.",
    );
  }

  normalEvidence = baseline.evidence;
});

function allocation(
  partial:
    Partial<ElementAllocation>,
): ElementAllocation {
  return {
    Light: 0,
    Darkness: 0,
    Water: 0,
    Fire: 0,
    Nature: 0,
    Earth: 0,
    ...partial,
  };
}

describe(
  "Phase 7 endgame package evaluation",
  () => {
    it("uses latest-live reconciled cost, range, and damage facts", () => {
      expect(
        getEndGameTowerFact(
          "pure-water",
        ),
      ).toMatchObject({
        minimumFieldCost: 13_750,
        damage: 41_040,
      });
      expect(
        getEndGameTowerFact(
          "periodic",
        ),
      ).toMatchObject({
        minimumFieldCost: 13_750,
        damage: 52_000,
        range: 1125,
        element: "Composite",
      });
      expect(
        getEndGameTowerFact(
          "pure-earth",
        ).ability
          .perAttackMagnitude,
      ).toBe(17_280);
    });

    it("derives transparent base and verified scenario DPS", () => {
      const access =
        evaluateEndGameAccess(
          allocation({
            Fire: 3,
            Nature: 3,
          }),
        );
      const fireTwice =
        enumerateEndGamePackages(
          access,
        ).find((candidate) =>
          candidate.selections
            .length === 1 &&
          candidate.selections[0]
            .towerId ===
              "pure-fire",
        );

      expect(fireTwice)
        .toBeDefined();

      const evaluation =
        evaluateEndGamePackage(
          fireTwice!,
          "Light",
          normalEvidence,
        );

      expect(
        evaluation.contributions[0]
          .baseDpsPerCopy,
      ).toBe(38_880);
      expect(
        evaluation.contributions[0]
          .verifiedNormalWaveDpsPerCopy,
      ).toBe(116_640);
      expect(
        evaluation
          .minimumEndGameOptionCapital,
      ).toBe(27_500);
    });

    it("ranks complete packages and returns distinct best and second-best choices", () => {
      const ranked =
        rankEndGamePackages(
          evaluateEndGameAccess(
            allocation({
              Fire: 3,
              Nature: 3,
            }),
          ),
          "Light",
          normalEvidence,
        );

      expect(ranked.ranked).toHaveLength(3);
      expect(ranked.best).not.toBeNull();
      expect(ranked.secondBest)
        .not.toBeNull();
      expect(
        ranked.best!.package
          .selections,
      ).not.toEqual(
        ranked.secondBest!.package
          .selections,
      );
    });

    it("does not contain a hidden Fire preference", () => {
      const ranked =
        rankEndGamePackages(
          evaluateEndGameAccess(
            allocation({
              Fire: 3,
              Nature: 3,
            }),
          ),
          "Light",
          normalEvidence,
        );

      expect(
        ranked.best!.package
          .selections,
      ).toEqual([{
        towerId: "pure-nature",
        quantity: 2,
      }]);
    });

    it("preserves unknown duplicate interactions instead of inventing stacking", () => {
      const access =
        evaluateEndGameAccess(
          allocation({
            Light: 3,
          }),
        );
      const doubled =
        enumerateEndGamePackages(
          access,
        )[0];
      const evaluation =
        evaluateEndGamePackage(
          doubled,
          "Fire",
          normalEvidence,
        );

      expect(
        evaluation.contributions[0]
          .unresolvedFacts,
      ).toContain(
        "duplicate-stacking-or-target-competition",
      );
    });
  },
);
