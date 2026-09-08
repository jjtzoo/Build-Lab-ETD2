import {
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  END_GAME_ENGAGEMENT_MODEL,
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
  sustainedEngagementDps,
} from "@/lib/engine/endGamePackageEvaluation";

let normalEvidence: CorePackageEvidence;

beforeAll(() => {
  const baseline = evaluateAnchorPackages(
    "laser",
  ).find(
    (entry) => entry.package.coreDeveloped,
  );

  if (!baseline) {
    throw new Error(
      "Missing developed Laser baseline.",
    );
  }

  normalEvidence = baseline.evidence;
});

function allocation(
  partial: Partial<ElementAllocation>,
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
    it("uses the latest-live 1.9.4/1.9.5 reconciled Pure and Periodic facts", () => {
      expect(
        getEndGameTowerFact("pure-fire"),
      ).toMatchObject({
        minimumFieldCost: 13_750,
        damage: 17_280,
      });
      expect(
        getEndGameTowerFact("pure-fire")
          .ability.perAttackMagnitude,
      ).toBe(576);

      expect(
        getEndGameTowerFact("pure-light"),
      ).toMatchObject({ damage: 70_200 });
      expect(
        getEndGameTowerFact("pure-nature"),
      ).toMatchObject({ damage: 47_880 });
      expect(
        getEndGameTowerFact("pure-darkness"),
      ).toMatchObject({ damage: 151_200 });
      expect(
        getEndGameTowerFact("periodic"),
      ).toMatchObject({
        damage: 39_000,
        element: "Composite",
        minimumFieldCost: 13_750,
      });
    });

    it("integrates each ability from its own verified facts over one documented engagement", () => {
      const seconds =
        END_GAME_ENGAGEMENT_MODEL
          .sustainedEngagementSeconds;

      // Blaze: base 17280 * 3, plus a bonus that ramps 0 -> 576*seconds
      // (uncapped at 20s), averaged.
      const fire = sustainedEngagementDps(
        getEndGameTowerFact("pure-fire"),
      );
      expect(fire.baseDps).toBe(51_840);
      expect(fire.abilityDps).toBe(
        ((576 * seconds) / 2) * 3,
      );

      // Burst resets only after an idle second, so in a sustained
      // engagement it fires once: a +250% opener amortised over the
      // window, never a sustained multiplier.
      const nature = sustainedEngagementDps(
        getEndGameTowerFact("pure-nature"),
      );
      const openerShare =
        (1 * 3.5 + (seconds - 1)) / seconds;
      expect(nature.abilityDps).toBeCloseTo(
        nature.baseDps *
          (openerShare - 1),
        4,
      );

      // Overkill depends on unverified creep HP: no modelled damage,
      // surfaced as unresolved instead.
      const darkness =
        sustainedEngagementDps(
          getEndGameTowerFact(
            "pure-darkness",
          ),
        );
      expect(darkness.abilityDps).toBe(0);
      expect(
        darkness.unresolvedFactors,
      ).toContain(
        "overkill-spread-value-depends-on-creep-max-hp",
      );
    });

    it("does not sustain Nature's opener burst as if it never recharged", () => {
      const nature = sustainedEngagementDps(
        getEndGameTowerFact("pure-nature"),
      );
      // The old model credited base * 3.5. The opener is worth far less
      // than that once amortised.
      expect(nature.sustainedDps).toBeLessThan(
        nature.baseDps * 1.5,
      );
    });

    it("optimises both Essence uses as one package and returns a distinct second best", () => {
      const ranked = rankEndGamePackages(
        evaluateEndGameAccess(
          allocation({
            Light: 3,
            Darkness: 3,
            Water: 3,
            Fire: 2,
          }),
        ),
        "Light",
        normalEvidence,
      );

      expect(ranked.best).not.toBeNull();
      expect(
        ranked.secondBest,
      ).not.toBeNull();
      expect(
        ranked.best!.package.selections,
      ).not.toEqual(
        ranked.secondBest!.package
          .selections,
      );
      // Every candidate is a complete two-Essence package.
      for (const evaluation of ranked.ranked) {
        expect(
          evaluation.package
            .totalEssenceUses,
        ).toBe(2);
        expect(
          evaluation.minimumEndGameOptionCapital,
        ).toBe(27_500);
      }
    });

    it("has no hardcoded Fire preference — Fire wins only on its own merits", () => {
      // Allocation where Fire is a legal Pure candidate.
      const ranked = rankEndGamePackages(
        evaluateEndGameAccess(
          allocation({
            Light: 3,
            Fire: 3,
            Nature: 3,
            Water: 2,
          }),
        ),
        "Water",
        normalEvidence,
      );

      const fireDouble = ranked.ranked.find(
        (evaluation) =>
          evaluation.package.selections
            .length === 1 &&
          evaluation.package.selections[0]
            .towerId === "pure-fire",
      );
      const natureDouble =
        ranked.ranked.find(
          (evaluation) =>
            evaluation.package.selections
              .length === 1 &&
            evaluation.package
              .selections[0].towerId ===
              "pure-nature",
        );

      expect(fireDouble).toBeDefined();
      expect(natureDouble).toBeDefined();
      // On the current verified numbers Pure Fire's sustained output is
      // well below Pure Nature's, so Fire x2 does not outrank Nature x2
      // here. This asserts the engine reflects the facts, not a bias.
      expect(
        natureDouble!.decision
          .totalSustainedEngagementDps,
      ).toBeGreaterThan(
        fireDouble!.decision
          .totalSustainedEngagementDps,
      );
    });

    it("credits a duplicate second copy contextually and flags unverified duplicate interactions", () => {
      const access = evaluateEndGameAccess(
        allocation({ Light: 3 }),
      );
      const doubled = enumerateEndGamePackages(
        access,
      )[0];
      const evaluation = evaluateEndGamePackage(
        doubled,
        "Fire",
        normalEvidence,
      );

      // Two copies are credited as roughly twice one copy — no penalty,
      // no bonus...
      const one = sustainedEngagementDps(
        getEndGameTowerFact("pure-light"),
      );
      expect(
        evaluation.decision
          .totalSustainedEngagementDps,
      ).toBeCloseTo(one.sustainedDps * 2, 3);

      // ...but Pure Light's duplicate behaviour is unverified, so it is
      // surfaced rather than assumed.
      expect(
        evaluation.contributions[0]
          .unresolvedFacts,
      ).toContain(
        "duplicate-copy-interaction-unverified",
      );
    });

    it("prefers a package that patches the Anchor's own element weakness", () => {
      // Light anchor is half-damage into Earth armour. A second Pure
      // Light does nothing about that; Pure Darkness (neutral vs Earth)
      // does.
      const ranked = rankEndGamePackages(
        evaluateEndGameAccess(
          allocation({
            Light: 3,
            Darkness: 3,
            Water: 3,
            Fire: 2,
          }),
        ),
        "Light",
        normalEvidence,
      );

      expect(
        ranked.best!.decision
          .anchorWeaknessesImproved,
      ).toBeGreaterThan(0);

      const lightDouble = ranked.ranked.find(
        (evaluation) =>
          evaluation.package.selections
            .length === 1 &&
          evaluation.package.selections[0]
            .towerId === "pure-light",
      )!;
      expect(
        lightDouble.decision
          .anchorWeaknessesImproved,
      ).toBe(0);
      expect(
        ranked.ranked.indexOf(lightDouble),
      ).toBeGreaterThan(0);
    });
  },
);
