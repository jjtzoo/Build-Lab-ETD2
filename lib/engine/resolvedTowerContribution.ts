import type {
  DamageDelivery,
  DamageProfile,
  DamageShape,
} from "@/lib/domain/attributes";

import type {
  MechanicDemand,
  MechanicSupply,
} from "@/lib/domain/mechanicSignals";

import type {
  CombinationClass,
  TowerId,
} from "@/lib/domain/tower";

import {
  getTower,
} from "@/lib/domain/towerCatalog";

import {
  resolveNormalTowerCost,
  type ResolvedNormalTowerCost,
} from "@/lib/domain/towerEconomics";

import {
  getTowerProfile,
} from "@/lib/domain/towerProfileCatalog";

import {
  getTowerMechanicFacts,
  type MechanicEffectFact,
  type MechanicMagnitudeUnit,
} from "@/lib/domain/towerMechanicFacts";

import {
  evaluateMechanicAvailability,
  type MechanicAvailabilityEvidence,
} from "@/lib/engine/mechanicAvailability";

export type ResolvedTowerStats = {
  damage: number;
  attackSpeed: number;
  baseDps: number;
  range: number;
  aoe: number;
};

export type ResolvedTowerOffense = {
  damageShape: DamageShape;
  damageProfile: DamageProfile;
  damageDelivery: DamageDelivery;
};

export type ResolvedMechanicEffectFact = {
  signal: MechanicEffectFact["signal"];
  magnitude: {
    unit: MechanicMagnitudeUnit;
    value: number;
  } | null;
  durationSeconds: number | null;
  rawFact: MechanicEffectFact;
  availability:
    MechanicAvailabilityEvidence;
};

/**
 * Canonical tower facts and mechanic interpretation resolved at one
 * actually reachable normal level.
 *
 * `baseDps` is deliberately narrow: damage per attack multiplied by
 * attacks per second. Ability damage, target count, ramp, uptime and
 * elemental multipliers are not silently folded into it.
 */
export type ResolvedTowerContribution = {
  towerId: TowerId;
  reachableLevel: number;
  maxNormalLevel: number;
  combination: CombinationClass;
  damageElement: ReturnType<typeof getTower>["damageElement"];
  factualStatsAtLevel: ResolvedTowerStats;
  offense: ResolvedTowerOffense | null;
  mechanicsAvailableAtLevel: {
    provides: readonly MechanicSupply[];
    consumes: readonly MechanicDemand[];
  };
  supportedAbilityFacts:
    readonly ResolvedMechanicEffectFact[];
  economics: ResolvedNormalTowerCost;
};

export function resolveTowerContribution(
  towerId: TowerId,
  reachableLevel: number,
): ResolvedTowerContribution {
  const tower = getTower(towerId);
  const profile =
    getTowerProfile(towerId);

  if (
    !Number.isInteger(reachableLevel) ||
    reachableLevel < 1 ||
    reachableLevel > tower.maxLevel
  ) {
    throw new Error(
      `Invalid reachable level ${reachableLevel} for ${towerId}; expected 1-${tower.maxLevel}.`,
    );
  }

  const damage =
    tower.stats.damage[
      reachableLevel - 1
    ];

  if (damage === undefined) {
    throw new Error(
      `Missing level ${reachableLevel} damage for ${towerId}.`,
    );
  }

  const supportedAbilityFacts =
    getTowerMechanicFacts(
      towerId,
    ).map((fact) => ({
      signal: fact.signal,
      magnitude: fact.magnitude
        ? {
            unit:
              fact.magnitude.unit,
            value:
              fact.magnitude
                .byLevel[
                  reachableLevel - 1
                ],
          }
        : null,
      durationSeconds:
        fact.durationSeconds
          ?.byLevel[
            reachableLevel - 1
          ] ?? null,
      rawFact: fact,
      availability:
        evaluateMechanicAvailability(
          fact,
          reachableLevel,
        ),
    }));

  return {
    towerId,
    reachableLevel,
    maxNormalLevel:
      tower.maxLevel,
    combination:
      tower.combination,
    damageElement:
      tower.damageElement,
    factualStatsAtLevel: {
      damage,
      attackSpeed:
        tower.stats.attackSpeed,
      baseDps:
        damage *
        tower.stats.attackSpeed,
      range:
        tower.stats.range,
      aoe:
        tower.stats.aoe,
    },
    offense: profile.offense
      ? {
          damageShape:
            profile.offense
              .damageShape,
          damageProfile:
            profile.offense
              .damageProfile,
          damageDelivery:
            profile.offense
              .damageDelivery,
        }
      : null,
    mechanicsAvailableAtLevel: {
      provides:
        profile.mechanics
          .provides,
      consumes:
        profile.mechanics
          .consumes,
    },
    supportedAbilityFacts,
    economics:
      resolveNormalTowerCost(
        towerId,
        reachableLevel,
      ),
  };
}
