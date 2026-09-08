import {
  ELEMENTS,
  type ElementName,
} from "@/lib/domain/elements";

import {
  getEndGameTowerFact,
  type EndGameTowerFact,
} from "@/lib/domain/endGameTowerFacts";

import type {
  EndGamePackage,
  EndGameTowerId,
} from "@/lib/domain/endGameTower";

import {
  ELEMENT_MATCHUPS,
} from "@/lib/domain/elementMatchupCatalog";

import type {
  CorePackageEvidence,
} from "@/lib/engine/corePackageEvidence";

import type {
  EndGameAccessResult,
} from "@/lib/engine/endGameAccess";

import {
  enumerateEndGamePackages,
} from "@/lib/engine/endGameAccess";

export type EndGameTowerContribution = {
  towerId: EndGameTowerId;
  quantity: number;
  fact: EndGameTowerFact;
  baseDpsPerCopy: number;
  totalBaseDps: number;
  verifiedNormalWaveScenario:
    string;
  verifiedNormalWaveDpsPerCopy:
    number;
  totalVerifiedNormalWaveDps:
    number;
  duplicateInteraction: string;
  unresolvedFacts: readonly string[];
};

export type EndGamePackageDecision = {
  anchorWeaknessesImproved: number;
  compositeCopies: number;
  totalBaseDps: number;
  totalVerifiedNormalWaveDps:
    number;
  aoeCopies: number;
  maximumRange: number;
  unresolvedDuplicateInteractions:
    number;
  minimumEndGameOptionCapital:
    number;
};

export type EndGamePackageEvaluation = {
  package: EndGamePackage;
  contributions:
    readonly EndGameTowerContribution[];
  normalPackageBuffSignals:
    readonly string[];
  decision: EndGamePackageDecision;
  minimumEndGameOptionCapital:
    number;
};

export type RankedEndGamePackages = {
  best: EndGamePackageEvaluation | null;
  secondBest:
    EndGamePackageEvaluation | null;
  ranked:
    readonly EndGamePackageEvaluation[];
};

function normalWaveScenario(
  fact: EndGameTowerFact,
): {
  label: string;
  dps: number;
} {
  const baseDps =
    fact.damage * fact.attackSpeed;

  switch (fact.towerId) {
    case "pure-fire":
      return {
        label:
          "verified-60-second-max-ramp",
        dps:
          (
            fact.damage +
            (fact.ability
              .maximumMagnitude ?? 0)
          ) * fact.attackSpeed,
      };
    case "pure-nature":
      return {
        label:
          "verified-first-second-burst",
        dps:
          baseDps *
          (
            1 +
            (fact.ability
              .perAttackMagnitude ?? 0)
          ),
      };
    case "pure-water":
      return {
        label:
          "verified-one-secondary-target",
        dps:
          baseDps *
          (
            1 +
            (fact.ability
              .perAttackMagnitude ?? 0)
          ),
      };
    default:
      return {
        label:
          "basic-attacks-only",
        dps: baseDps,
      };
  }
}

function unresolvedFacts(
  fact: EndGameTowerFact,
  quantity: number,
): readonly string[] {
  const unresolved: string[] = [];

  if (
    fact.ability.bossBehavior ===
      "unknown"
  ) {
    unresolved.push(
      "boss-behavior",
    );
  }

  if (
    quantity > 1 &&
    fact.ability
      .duplicateBehavior ===
      "unknown"
  ) {
    unresolved.push(
      "duplicate-stacking-or-target-competition",
    );
  }

  return unresolved;
}

function weaknessImprovementCount(
  anchorElement: ElementName,
  contributions:
    readonly EndGameTowerContribution[],
): number {
  return ELEMENTS.filter(
    (defender) => {
      if (
        ELEMENT_MATCHUPS[
          anchorElement
        ][defender] !== 0.5
      ) {
        return false;
      }

      return contributions.some(
        (contribution) =>
          contribution.fact.element ===
            "Composite" ||
          ELEMENT_MATCHUPS[
            contribution.fact.element as
              ElementName
          ][defender] > 0.5,
      );
    },
  ).length;
}

function normalPackageBuffSignals(
  evidence: CorePackageEvidence,
): readonly string[] {
  return [
    ...new Set(
      evidence.resolvedContributions
        .flatMap((contribution) =>
          contribution
            .mechanicsAvailableAtLevel
            .provides,
        )
        .filter((provider) =>
          provider.signal ===
            "attack-damage-buff" ||
          provider.signal ===
            "attack-speed-buff",
        )
        .map((provider) =>
          `${provider.signal}:${provider.strength}`,
        ),
    ),
  ].sort();
}

export function evaluateEndGamePackage(
  specialPackage: EndGamePackage,
  anchorElement: ElementName,
  normalEvidence: CorePackageEvidence,
): EndGamePackageEvaluation {
  const contributions =
    specialPackage.selections.map(
      (selection) => {
        const fact =
          getEndGameTowerFact(
            selection.towerId,
          );
        const baseDpsPerCopy =
          fact.damage *
          fact.attackSpeed;
        const scenario =
          normalWaveScenario(fact);

        return {
          towerId:
            selection.towerId,
          quantity:
            selection.quantity,
          fact,
          baseDpsPerCopy,
          totalBaseDps:
            baseDpsPerCopy *
            selection.quantity,
          verifiedNormalWaveScenario:
            scenario.label,
          verifiedNormalWaveDpsPerCopy:
            scenario.dps,
          totalVerifiedNormalWaveDps:
            scenario.dps *
            selection.quantity,
          duplicateInteraction:
            selection.quantity > 1
              ? fact.ability
                  .duplicateBehavior
              : "not-applicable",
          unresolvedFacts:
            unresolvedFacts(
              fact,
              selection.quantity,
            ),
        } satisfies EndGameTowerContribution;
      });

  const minimumEndGameOptionCapital =
    contributions.reduce(
      (total, contribution) =>
        total +
        contribution.fact
          .minimumFieldCost *
        contribution.quantity,
      0,
    );

  const decision: EndGamePackageDecision = {
    anchorWeaknessesImproved:
      weaknessImprovementCount(
        anchorElement,
        contributions,
      ),
    compositeCopies:
      contributions
        .filter((contribution) =>
          contribution.fact.element ===
            "Composite",
        )
        .reduce(
          (total, contribution) =>
            total +
            contribution.quantity,
          0,
        ),
    totalBaseDps:
      contributions.reduce(
        (total, contribution) =>
          total +
          contribution.totalBaseDps,
        0,
      ),
    totalVerifiedNormalWaveDps:
      contributions.reduce(
        (total, contribution) =>
          total +
          contribution
            .totalVerifiedNormalWaveDps,
        0,
      ),
    aoeCopies:
      contributions
        .filter((contribution) =>
          contribution.fact.aoe > 0,
        )
        .reduce(
          (total, contribution) =>
            total +
            contribution.quantity,
          0,
        ),
    maximumRange:
      Math.max(
        ...contributions.map(
          (contribution) =>
            contribution.fact.range,
        ),
      ),
    unresolvedDuplicateInteractions:
      contributions.filter(
        (contribution) =>
          contribution.unresolvedFacts
            .includes(
              "duplicate-stacking-or-target-competition",
            ),
      ).length,
    minimumEndGameOptionCapital,
  };

  return {
    package: specialPackage,
    contributions,
    normalPackageBuffSignals:
      normalPackageBuffSignals(
        normalEvidence,
      ),
    decision,
    minimumEndGameOptionCapital,
  };
}

function decisionVector(
  decision: EndGamePackageDecision,
): readonly number[] {
  return [
    decision
      .anchorWeaknessesImproved,
    decision.totalBaseDps,
    decision
      .totalVerifiedNormalWaveDps,
    decision.aoeCopies,
    decision.compositeCopies,
    decision.maximumRange,
    -decision
      .unresolvedDuplicateInteractions,
    -decision
      .minimumEndGameOptionCapital,
  ];
}

export function compareEndGamePackages(
  a: EndGamePackageEvaluation,
  b: EndGamePackageEvaluation,
): number {
  const aVector =
    decisionVector(a.decision);
  const bVector =
    decisionVector(b.decision);

  for (
    let index = 0;
    index < aVector.length;
    index += 1
  ) {
    if (aVector[index] > bVector[index]) {
      return -1;
    }
    if (aVector[index] < bVector[index]) {
      return 1;
    }
  }

  return JSON.stringify(
    a.package.selections,
  ).localeCompare(
    JSON.stringify(
      b.package.selections,
    ),
  );
}

export function rankEndGamePackages(
  access: EndGameAccessResult,
  anchorElement: ElementName,
  normalEvidence: CorePackageEvidence,
): RankedEndGamePackages {
  const ranked =
    enumerateEndGamePackages(access)
      .map((specialPackage) =>
        evaluateEndGamePackage(
          specialPackage,
          anchorElement,
          normalEvidence,
        ),
      )
      .sort(compareEndGamePackages);

  return {
    best: ranked[0] ?? null,
    secondBest: ranked[1] ?? null,
    ranked,
  };
}
