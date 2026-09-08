import type {
  DamageShape,
} from "@/lib/domain/attributes";

import type {
  ElementName,
} from "@/lib/domain/elements";

import type {
  TowerId,
} from "@/lib/domain/tower";

import type {
  ResolvedTowerContribution,
} from "@/lib/engine/resolvedTowerContribution";

export type PracticalOffensiveContribution = {
  towerId: TowerId;
  offensiveElement: ElementName;
  damageShape: DamageShape;
  range: number;
  baseDps: number;
  reachableLevel: number;
  maxNormalLevel: number;
  developedToClassMaximum: boolean;
  meetsOrExceedsAnchorBaseDps: boolean;
  meaningful: boolean;
  justification:
    | "class-maximum"
    | "factual-base-dps"
    | "insufficient-development-and-base-dps";
};

/**
 * Conservative qualitative significance test.
 *
 * No cross-class level ratio or fabricated DPS weighting is used.
 * A supporting attacker is meaningful when it is fully developed for
 * its own normal class (including Quad L1), or when its factual basic-
 * attack DPS already meets/exceeds the anchor despite lower development.
 */
export function resolvePracticalOffense(
  anchor: ResolvedTowerContribution,
  contribution:
    ResolvedTowerContribution,
): PracticalOffensiveContribution | null {
  if (!contribution.offense) {
    return null;
  }

  const developedToClassMaximum =
    contribution.reachableLevel ===
    contribution.maxNormalLevel;

  const meetsOrExceedsAnchorBaseDps =
    contribution
      .factualStatsAtLevel
      .baseDps >=
    anchor
      .factualStatsAtLevel
      .baseDps;

  const meaningful =
    developedToClassMaximum ||
    meetsOrExceedsAnchorBaseDps;

  return {
    towerId:
      contribution.towerId,
    offensiveElement:
      contribution.damageElement,
    damageShape:
      contribution.offense
        .damageShape,
    range:
      contribution
        .factualStatsAtLevel
        .range,
    baseDps:
      contribution
        .factualStatsAtLevel
        .baseDps,
    reachableLevel:
      contribution.reachableLevel,
    maxNormalLevel:
      contribution.maxNormalLevel,
    developedToClassMaximum,
    meetsOrExceedsAnchorBaseDps,
    meaningful,
    justification:
      developedToClassMaximum
        ? "class-maximum"
        : meetsOrExceedsAnchorBaseDps
          ? "factual-base-dps"
          : "insufficient-development-and-base-dps",
  };
}
