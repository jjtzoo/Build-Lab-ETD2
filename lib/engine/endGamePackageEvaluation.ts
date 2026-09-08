import {
  ELEMENTS,
  type ElementName,
} from "@/lib/domain/elements";

import {
  END_GAME_ENGAGEMENT_MODEL,
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

/**
 * Damage one endgame tower deals over one sustained endgame engagement.
 *
 * `sustainedEngagementSeconds` is the single documented assumption from
 * the fact catalog. Every ability contribution below is integrated from
 * the tower's own verified facts over `[0, T]` — nothing is invented.
 * Where an ability's value cannot be derived without an unverified
 * number (Overkill's on-kill spread) it contributes 0 damage and is
 * surfaced as an unresolved factor rather than guessed.
 */
export type SustainedEngagementDps = {
  seconds: number;
  baseDps: number;
  abilityDps: number;
  sustainedDps: number;
  unresolvedFactors: readonly string[];
};

export function sustainedEngagementDps(
  fact: EndGameTowerFact,
  seconds:
    number = END_GAME_ENGAGEMENT_MODEL
      .sustainedEngagementSeconds,
): SustainedEngagementDps {
  const baseDps =
    fact.damage * fact.attackSpeed;
  const unresolvedFactors: string[] = [];
  let abilityDps = 0;

  switch (fact.ability.name) {
    case "Blaze": {
      // Flat damage that grows by `perAttackMagnitude` each second of
      // attacking, capped at `maximumMagnitude`, holding for
      // `durationSeconds`. Average the per-hit bonus over the window:
      // it ramps linearly from 0 to its value at t = seconds, then
      // sits at the cap for any remaining time.
      const perSecond =
        fact.ability.perAttackMagnitude ?? 0;
      const cap =
        fact.ability.maximumMagnitude ??
        Number.POSITIVE_INFINITY;
      const rampSeconds = Math.min(
        seconds,
        fact.ability.durationSeconds ??
          seconds,
        cap / perSecond,
      );
      const cappedBonus = Math.min(
        perSecond * rampSeconds,
        cap,
      );
      const rampArea =
        (cappedBonus / 2) * rampSeconds;
      const heldArea =
        cappedBonus *
        Math.max(0, seconds - rampSeconds);
      const averageBonusPerHit =
        (rampArea + heldArea) / seconds;
      abilityDps =
        averageBonusPerHit *
        fact.attackSpeed;
      break;
    }
    case "Intensify": {
      // +`perAttackMagnitude` per consecutive attack on the same
      // target, no cap, resets on a target switch. In a sustained
      // single-target fight the n-th attack (0-indexed) adds
      // `perAttackMagnitude * n`.
      const perAttack =
        fact.ability.perAttackMagnitude ?? 0;
      const attacks = Math.floor(
        seconds * fact.attackSpeed,
      );
      const totalBonus =
        perAttack *
        ((attacks * (attacks - 1)) / 2);
      abilityDps = totalBonus / seconds;
      unresolvedFactors.push(
        "intensify-assumes-uninterrupted-fire-on-one-target",
      );
      break;
    }
    case "Burst": {
      // +`perAttackMagnitude` (a multiplier, e.g. 2.5 = +250%) for the
      // first `durationSeconds` of attacking, then needs an idle
      // window to reset. During a sustained engagement it fires once.
      const multiplier =
        fact.ability.perAttackMagnitude ?? 0;
      const boosted = Math.min(
        fact.ability.durationSeconds ?? 1,
        seconds,
      );
      const effectiveMultiplier =
        (boosted * (1 + multiplier) +
          (seconds - boosted)) /
        seconds;
      abilityDps =
        baseDps *
        (effectiveMultiplier - 1);
      break;
    }
    case "Condensation": {
      // A secondary strike for `perAttackMagnitude` of damage when a
      // second creep is within range. Assumed present against a wave;
      // it does nothing against a lone boss (see bossBehavior).
      abilityDps =
        baseDps *
        (fact.ability.perAttackMagnitude ??
          0);
      unresolvedFactors.push(
        "condensation-assumes-a-second-creep-within-125",
      );
      break;
    }
    case "Aftershock": {
      // A shockwave dealing `perAttackMagnitude` per attack.
      abilityDps =
        (fact.ability.perAttackMagnitude ??
          0) * fact.attackSpeed;
      break;
    }
    case "Overkill": {
      // Excess damage plus a fraction of the victim's max HP spreads
      // on kill. The value depends on unverified creep HP, so it adds
      // no modelled damage and is surfaced instead.
      unresolvedFactors.push(
        "overkill-spread-value-depends-on-creep-max-hp",
      );
      break;
    }
    default:
      // Periodic and any tower without a damage ability.
      break;
  }

  return {
    seconds,
    baseDps,
    abilityDps,
    sustainedDps: baseDps + abilityDps,
    unresolvedFactors,
  };
}

export type EndGameTowerContribution = {
  towerId: EndGameTowerId;
  quantity: number;
  fact: EndGameTowerFact;
  engagement: SustainedEngagementDps;
  baseDpsPerCopy: number;
  sustainedDpsPerCopy: number;
  totalBaseDps: number;
  totalSustainedDps: number;
  duplicateInteraction: string;
  unresolvedFacts: readonly string[];
};

export type EndGamePackageDecision = {
  anchorWeaknessesImproved: number;
  compositeCopies: number;
  totalBaseDps: number;
  totalSustainedEngagementDps: number;
  aoeCopies: number;
  maximumRange: number;
  unresolvedFactorCount: number;
  minimumEndGameOptionCapital: number;
};

export type EndGamePackageEvaluation = {
  package: EndGamePackage;
  engagementSeconds: number;
  contributions:
    readonly EndGameTowerContribution[];
  normalPackageBuffSignals:
    readonly string[];
  decision: EndGamePackageDecision;
  minimumEndGameOptionCapital: number;
};

export type RankedEndGamePackages = {
  best: EndGamePackageEvaluation | null;
  secondBest:
    EndGamePackageEvaluation | null;
  ranked:
    readonly EndGamePackageEvaluation[];
};

function weaknessImprovementCount(
  anchorElement: ElementName,
  contributions:
    readonly EndGameTowerContribution[],
): number {
  return ELEMENTS.filter((defender) => {
    if (
      ELEMENT_MATCHUPS[anchorElement][
        defender
      ] !== 0.5
    ) {
      return false;
    }

    return contributions.some(
      (contribution) =>
        contribution.fact.element ===
          "Composite" ||
        ELEMENT_MATCHUPS[
          contribution.fact
            .element as ElementName
        ][defender] > 0.5,
    );
  }).length;
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
        .filter(
          (provider) =>
            provider.signal ===
              "attack-damage-buff" ||
            provider.signal ===
              "attack-speed-buff",
        )
        .map(
          (provider) =>
            `${provider.signal}:${provider.strength}`,
        ),
    ),
  ].sort();
}

export function evaluateEndGamePackage(
  specialPackage: EndGamePackage,
  anchorElement: ElementName,
  normalEvidence: CorePackageEvidence,
  engagementSeconds:
    number = END_GAME_ENGAGEMENT_MODEL
      .sustainedEngagementSeconds,
): EndGamePackageEvaluation {
  const contributions =
    specialPackage.selections.map(
      (selection) => {
        const fact = getEndGameTowerFact(
          selection.towerId,
        );
        const engagement =
          sustainedEngagementDps(
            fact,
            engagementSeconds,
          );

        const duplicateUnknown =
          selection.quantity > 1 &&
          fact.ability
            .duplicateBehavior ===
            "unknown";

        return {
          towerId: selection.towerId,
          quantity: selection.quantity,
          fact,
          engagement,
          baseDpsPerCopy:
            engagement.baseDps,
          sustainedDpsPerCopy:
            engagement.sustainedDps,
          totalBaseDps:
            engagement.baseDps *
            selection.quantity,
          // Copies are credited independently. Where the fact does not
          // confirm independence for multiple copies this is flagged
          // rather than penalised or bonused.
          totalSustainedDps:
            engagement.sustainedDps *
            selection.quantity,
          duplicateInteraction:
            selection.quantity > 1
              ? fact.ability
                  .duplicateBehavior
              : "not-applicable",
          unresolvedFacts: [
            ...engagement
              .unresolvedFactors,
            ...(duplicateUnknown
              ? [
                  "duplicate-copy-interaction-unverified",
                ]
              : []),
          ],
        } satisfies EndGameTowerContribution;
      },
    );

  const minimumEndGameOptionCapital =
    contributions.reduce(
      (total, contribution) =>
        total +
        contribution.fact
          .minimumFieldCost *
          contribution.quantity,
      0,
    );

  const decision: EndGamePackageDecision =
    {
      anchorWeaknessesImproved:
        weaknessImprovementCount(
          anchorElement,
          contributions,
        ),
      compositeCopies: contributions
        .filter(
          (contribution) =>
            contribution.fact.element ===
            "Composite",
        )
        .reduce(
          (total, contribution) =>
            total + contribution.quantity,
          0,
        ),
      totalBaseDps: contributions.reduce(
        (total, contribution) =>
          total + contribution.totalBaseDps,
        0,
      ),
      totalSustainedEngagementDps:
        contributions.reduce(
          (total, contribution) =>
            total +
            contribution.totalSustainedDps,
          0,
        ),
      aoeCopies: contributions
        .filter(
          (contribution) =>
            contribution.fact.aoe > 0,
        )
        .reduce(
          (total, contribution) =>
            total + contribution.quantity,
          0,
        ),
      maximumRange: Math.max(
        ...contributions.map(
          (contribution) =>
            contribution.fact.range,
        ),
      ),
      unresolvedFactorCount:
        contributions.reduce(
          (total, contribution) =>
            total +
            contribution.unresolvedFacts
              .length,
          0,
        ),
      minimumEndGameOptionCapital,
    };

  return {
    package: specialPackage,
    engagementSeconds,
    contributions,
    normalPackageBuffSignals:
      normalPackageBuffSignals(
        normalEvidence,
      ),
    decision,
    minimumEndGameOptionCapital,
  };
}

/**
 * Documented lexicographic order, matching the rest of the engine.
 *
 * 1. covers more of the Anchor's own element weaknesses
 * 2. higher sustained-engagement damage (verified integration)
 * 3. more AoE copies (wave clear breadth)
 * 4. more Composite copies (flat rate against every armour type)
 * 5. longer reach
 * 6. fewer unresolved factors (prefer verified value over guessed)
 * 7. lower minimum capital (every endgame tower is 13750, so this only
 *    breaks a genuine tie)
 *
 * There is no duplicate penalty and no diversity bonus.
 */
function decisionVector(
  decision: EndGamePackageDecision,
): readonly number[] {
  return [
    decision.anchorWeaknessesImproved,
    decision.totalSustainedEngagementDps,
    decision.aoeCopies,
    decision.compositeCopies,
    decision.maximumRange,
    -decision.unresolvedFactorCount,
    -decision.minimumEndGameOptionCapital,
  ];
}

export function compareEndGamePackages(
  a: EndGamePackageEvaluation,
  b: EndGamePackageEvaluation,
): number {
  const aVector = decisionVector(
    a.decision,
  );
  const bVector = decisionVector(
    b.decision,
  );

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
    JSON.stringify(b.package.selections),
  );
}

export function rankEndGamePackages(
  access: EndGameAccessResult,
  anchorElement: ElementName,
  normalEvidence: CorePackageEvidence,
  engagementSeconds:
    number = END_GAME_ENGAGEMENT_MODEL
      .sustainedEngagementSeconds,
): RankedEndGamePackages {
  const ranked = enumerateEndGamePackages(
    access,
  )
    .map((specialPackage) =>
      evaluateEndGamePackage(
        specialPackage,
        anchorElement,
        normalEvidence,
        engagementSeconds,
      ),
    )
    .sort(compareEndGamePackages);

  return {
    best: ranked[0] ?? null,
    secondBest: ranked[1] ?? null,
    ranked,
  };
}
