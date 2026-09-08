import {
  ELEMENTS,
  type ElementName,
} from "@/lib/domain/elements";

import type {
  TowerId,
} from "@/lib/domain/tower";

import {
  rankCombinedBuildPlans,
  type CombinedBuildPlan,
} from "@/lib/engine/combinedBuildPlan";

import {
  buildProgression,
  type BuildProgression,
} from "@/lib/engine/buildProgression";

export type ComparisonLabel =
  | "Lower Capital"
  | "Better Coverage"
  | "Stronger Synergy"
  | "Stronger Endgame"
  | "More Developed Package"
  | "Wider Utility"
  | "Smaller Package"
  | "Fewer Tensions";

export type AllocationDelta = {
  element: ElementName;
  from: number;
  to: number;
};

export type PlanComparison = {
  completeCapitalDelta: number;
  normalCapitalDelta: number;
  packageSizeDelta: number;
  allocationDelta:
    readonly AllocationDelta[];
  substitutions: {
    removed: readonly TowerId[];
    added: readonly TowerId[];
  };
  endGameChanged: boolean;
  improves: readonly string[];
  worsens: readonly string[];
  labels: readonly ComparisonLabel[];
};

export type RankedRecommendation = {
  id: string;
  rank: number;
  plan: CombinedBuildPlan;
  progression: BuildProgression;
  comparisonToRecommended:
    PlanComparison | null;
};

export type BuildRecommendationSet = {
  anchorTowerId: TowerId;
  engineRecommendedPlanId: string;
  plans:
    readonly RankedRecommendation[];
};

const MATERIAL_CAPITAL_DELTA = 3_000;

function allocationDelta(
  base: CombinedBuildPlan,
  other: CombinedBuildPlan,
): AllocationDelta[] {
  return ELEMENTS.flatMap((element) => {
    const from =
      base.normalPlan.baseline.routeState
        .allocation[element];
    const to =
      other.normalPlan.baseline.routeState
        .allocation[element];
    return from === to
      ? []
      : [{ element, from, to }];
  });
}

function materiallyDistinct(
  base: CombinedBuildPlan,
  candidate: CombinedBuildPlan,
): boolean {
  if (
    allocationDelta(base, candidate)
      .length > 0
  ) {
    return true;
  }

  const baseTowers = new Set(
    base.normalPlan.selectedTowerIds,
  );
  const candidateTowers = new Set(
    candidate.normalPlan.selectedTowerIds,
  );
  const symmetricDifference = [
    ...baseTowers,
  ].filter(
    (id) => !candidateTowers.has(id),
  ).length +
    [...candidateTowers].filter(
      (id) => !baseTowers.has(id),
    ).length;

  if (symmetricDifference >= 2) {
    return true;
  }

  if (
    JSON.stringify(
      base.bestEndGamePackage?.package
        .selections ?? null,
    ) !==
    JSON.stringify(
      candidate.bestEndGamePackage?.package
        .selections ?? null,
    )
  ) {
    return true;
  }

  return (
    Math.abs(
      (candidate.minimumCompletePlanCapital ??
        candidate.minimumNormalPackageCapital) -
        (base.minimumCompletePlanCapital ??
          base.minimumNormalPackageCapital),
    ) >= MATERIAL_CAPITAL_DELTA
  );
}

function comparePlans(
  recommended: CombinedBuildPlan,
  alternative: CombinedBuildPlan,
): PlanComparison {
  const a = recommended.normalPlan.decision;
  const b = alternative.normalPlan.decision;

  const recommendedTowers = new Set(
    recommended.normalPlan
      .selectedTowerIds,
  );
  const alternativeTowers = new Set(
    alternative.normalPlan
      .selectedTowerIds,
  );

  const completeCapitalDelta =
    (alternative.minimumCompletePlanCapital ??
      alternative.minimumNormalPackageCapital) -
    (recommended.minimumCompletePlanCapital ??
      recommended.minimumNormalPackageCapital);

  const normalCapitalDelta =
    alternative.minimumNormalPackageCapital -
    recommended.minimumNormalPackageCapital;

  const packageSizeDelta =
    b.selectedTowerCount -
    a.selectedTowerCount;

  const improves: string[] = [];
  const worsens: string[] = [];
  const labels = new Set<ComparisonLabel>();

  const record = (
    better: boolean,
    betterText: string,
    worseText: string,
    label?: ComparisonLabel,
  ) => {
    (better ? improves : worsens).push(
      better ? betterText : worseText,
    );
    if (better && label) {
      labels.add(label);
    }
  };

  if (
    b.elementWeaknessesCovered !==
    a.elementWeaknessesCovered
  ) {
    record(
      b.elementWeaknessesCovered >
        a.elementWeaknessesCovered,
      `covers ${b.elementWeaknessesCovered - a.elementWeaknessesCovered} more element weakness(es)`,
      `covers ${a.elementWeaknessesCovered - b.elementWeaknessesCovered} fewer element weakness(es)`,
      "Better Coverage",
    );
  }

  if (
    b.fullSynergyStrength !==
    a.fullSynergyStrength
  ) {
    record(
      b.fullSynergyStrength >
        a.fullSynergyStrength,
      "higher total full-strength synergy",
      "lower total full-strength synergy",
      "Stronger Synergy",
    );
  }

  if (b.tensionCount !== a.tensionCount) {
    record(
      b.tensionCount < a.tensionCount,
      `${a.tensionCount - b.tensionCount} fewer mechanic tension(s)`,
      `${b.tensionCount - a.tensionCount} more mechanic tension(s)`,
      "Fewer Tensions",
    );
  }

  if (
    completeCapitalDelta !== 0 &&
    Math.abs(completeCapitalDelta) >=
      MATERIAL_CAPITAL_DELTA
  ) {
    record(
      completeCapitalDelta < 0,
      `${Math.abs(completeCapitalDelta)} gold less minimum capital`,
      `${completeCapitalDelta} gold more minimum capital`,
      "Lower Capital",
    );
  }

  if (packageSizeDelta !== 0) {
    record(
      packageSizeDelta < 0,
      `${-packageSizeDelta} fewer tower type(s) to field`,
      `${packageSizeDelta} more tower type(s) to field`,
      "Smaller Package",
    );
  }

  if (
    b.selectedTowerReachableLevelTotal !==
      a.selectedTowerReachableLevelTotal &&
    packageSizeDelta <= 0
  ) {
    record(
      b.selectedTowerReachableLevelTotal >
        a.selectedTowerReachableLevelTotal,
      "more developed selected package",
      "less developed selected package",
      "More Developed Package",
    );
  }

  if (
    b.rangeExtensionFromAnchor !==
      a.rangeExtensionFromAnchor ||
    b.multiPurposeDimensionCount !==
      a.multiPurposeDimensionCount
  ) {
    const wider =
      b.rangeExtensionFromAnchor +
        b.multiPurposeDimensionCount >
      a.rangeExtensionFromAnchor +
        a.multiPurposeDimensionCount;
    record(
      wider,
      "wider practical utility (range / multi-purpose)",
      "narrower practical utility",
      "Wider Utility",
    );
  }

  const endValue = (
    plan: CombinedBuildPlan,
  ) =>
    (plan.endGameValue
      ?.anchorWeaknessesImproved ?? 0) *
      1_000_000 +
    (plan.endGameValue
      ?.totalSustainedEngagementDps ?? 0);

  const endGameChanged =
    JSON.stringify(
      recommended.bestEndGamePackage
        ?.package.selections ?? null,
    ) !==
    JSON.stringify(
      alternative.bestEndGamePackage
        ?.package.selections ?? null,
    );

  if (endGameChanged) {
    if (
      endValue(alternative) !==
      endValue(recommended)
    ) {
      record(
        endValue(alternative) >
          endValue(recommended),
        "stronger complete endgame package",
        "weaker complete endgame package",
        "Stronger Endgame",
      );
    } else {
      improves.push(
        "a different but equally strong Essence package",
      );
    }
  }

  // Guarantee the account is never empty for a genuinely distinct
  // alternative: fall back to naming the substitution or allocation
  // shift when nothing else separated the two plans directionally.
  if (
    improves.length + worsens.length ===
    0
  ) {
    const removed = [
      ...recommendedTowers,
    ].filter(
      (id) => !alternativeTowers.has(id),
    );
    const added = [
      ...alternativeTowers,
    ].filter(
      (id) => !recommendedTowers.has(id),
    );
    if (added.length || removed.length) {
      improves.push(
        `swaps ${removed.join(", ") || "nothing"} for ${added.join(", ") || "nothing"} at equivalent strategic evidence`,
      );
    } else {
      improves.push(
        `same package on a different keystone route (${allocationDelta(recommended, alternative)
          .map(
            (delta) =>
              `${delta.element} ${delta.from}->${delta.to}`,
          )
          .join(", ")})`,
      );
    }
  }

  return {
    completeCapitalDelta,
    normalCapitalDelta,
    packageSizeDelta,
    allocationDelta: allocationDelta(
      recommended,
      alternative,
    ),
    substitutions: {
      removed: [
        ...recommendedTowers,
      ].filter(
        (id) => !alternativeTowers.has(id),
      ),
      added: [
        ...alternativeTowers,
      ].filter(
        (id) => !recommendedTowers.has(id),
      ),
    },
    endGameChanged,
    improves,
    worsens,
    labels: [...labels],
  };
}

/**
 * The engine recommendation plus up to two materially distinct,
 * non-dominated alternatives from the same planner run. Alternatives
 * are never manufactured — they are lower-ranked combined plans that
 * differ from the recommendation by allocation, at least two tower
 * substitutions, a different endgame package, or a material capital
 * gap. If fewer than three distinct plans exist, fewer are returned.
 */
export function buildRecommendationSet(
  anchorTowerId: TowerId,
): BuildRecommendationSet {
  const ranked = rankCombinedBuildPlans(
    anchorTowerId,
    10,
  ).plans;

  const chosen: CombinedBuildPlan[] =
    ranked.length > 0 ? [ranked[0]] : [];

  for (const candidate of ranked.slice(1)) {
    if (chosen.length >= 3) {
      break;
    }
    if (
      chosen.every((picked) =>
        materiallyDistinct(
          picked,
          candidate,
        ),
      )
    ) {
      chosen.push(candidate);
    }
  }

  const plans = chosen.map(
    (plan, index) => ({
      id: `rank-${index + 1}`,
      rank: index + 1,
      plan,
      progression: buildProgression(plan),
      comparisonToRecommended:
        index === 0
          ? null
          : comparePlans(
              chosen[0],
              plan,
            ),
    }),
  );

  return {
    anchorTowerId,
    engineRecommendedPlanId: "rank-1",
    plans,
  };
}
