import {
  getTower,
} from "@/lib/domain/towerCatalog";

import type {
  TowerId,
} from "@/lib/domain/tower";

import {
  comparePlannerDecisions,
  rankAnchorBuildPlansWithDiagnostics,
  type RankedBuildPlan,
} from "@/lib/engine/buildPlanner";

import {
  evaluateEndGameAccess,
  type EndGameAccessResult,
} from "@/lib/engine/endGameAccess";

import {
  compareEndGamePackages,
  rankEndGamePackages,
  type EndGamePackageEvaluation,
} from "@/lib/engine/endGamePackageEvaluation";

import type {
  NormalPackageSearchDiagnostics,
} from "@/lib/engine/normalPackageSearch";

export type CombinedBuildPlan = {
  anchorTowerId: TowerId;
  normalPlan: RankedBuildPlan;
  endGameAccess: EndGameAccessResult;
  bestEndGamePackage:
    EndGamePackageEvaluation | null;
  secondBestEndGamePackage:
    EndGamePackageEvaluation | null;
  minimumNormalPackageCapital: number;
  minimumEndGameOptionCapital:
    number | null;
  minimumCompletePlanCapital:
    number | null;
  normalWaveViability: {
    coreDeveloped: boolean;
    elementWeaknessesRemaining:
      number;
    tensionCount: number;
  };
  endGameValue: {
    anchorWeaknessesImproved:
      number;
    totalSustainedEngagementDps: number;
  } | null;
  explanations: readonly string[];
  diagnostics:
    NormalPackageSearchDiagnostics;
};

export type RankedCombinedBuildPlans = {
  plans: readonly CombinedBuildPlan[];
  diagnostics:
    NormalPackageSearchDiagnostics;
};

export function combineBuildPlan(
  normalPlan: RankedBuildPlan,
  diagnostics:
    NormalPackageSearchDiagnostics,
): CombinedBuildPlan {
  const access =
    evaluateEndGameAccess(
      normalPlan.baseline
        .routeState.allocation,
    );
  const anchorElement =
    getTower(
      normalPlan.anchorTowerId,
    ).damageElement;
  const endGame =
    rankEndGamePackages(
      access,
      anchorElement,
      normalPlan.evidence,
    );
  const best = endGame.best;
  const minimumEndGameOptionCapital =
    best?.minimumEndGameOptionCapital ??
    null;
  const minimumCompletePlanCapital =
    minimumEndGameOptionCapital ===
      null
      ? null
      : normalPlan
          .minimumNormalPackageCapital +
        minimumEndGameOptionCapital;

  return {
    anchorTowerId:
      normalPlan.anchorTowerId,
    normalPlan,
    endGameAccess: access,
    bestEndGamePackage: best,
    secondBestEndGamePackage:
      endGame.secondBest,
    minimumNormalPackageCapital:
      normalPlan
        .minimumNormalPackageCapital,
    minimumEndGameOptionCapital,
    minimumCompletePlanCapital,
    normalWaveViability: {
      coreDeveloped:
        normalPlan.decision
          .coreDeveloped,
      elementWeaknessesRemaining:
        normalPlan.decision
          .elementWeaknessesRemaining,
      tensionCount:
        normalPlan.decision
          .tensionCount,
    },
    endGameValue: best
      ? {
          anchorWeaknessesImproved:
            best.decision
              .anchorWeaknessesImproved,
          totalSustainedEngagementDps:
            best.decision
              .totalSustainedEngagementDps,
        }
      : null,
    explanations: [
      `Normal package fields one copy of ${normalPlan.selectedTowerIds.length} selected tower types for at least ${normalPlan.minimumNormalPackageCapital} gold.`,
      best
        ? `The complete two-use endgame package adds ${best.minimumEndGameOptionCapital} verified gold of minimum capital.`
        : "This allocation has no legal complete two-use endgame package.",
      "Normal-wave viability and endgame value remain separate evidence; the selected normal Anchor does not change.",
    ],
    diagnostics,
  };
}

function compareCombinedPlans(
  a: CombinedBuildPlan,
  b: CombinedBuildPlan,
): number {
  if (
    a.normalWaveViability
      .coreDeveloped !==
    b.normalWaveViability
      .coreDeveloped
  ) {
    return a.normalWaveViability
      .coreDeveloped
      ? -1
      : 1;
  }

  const aDefining =
    a.normalPlan.decision
      .anchorDefiningSynergyCount;
  const bDefining =
    b.normalPlan.decision
      .anchorDefiningSynergyCount;

  if (aDefining !== bDefining) {
    return bDefining - aDefining;
  }

  const aEndCoverage =
    a.endGameValue
      ?.anchorWeaknessesImproved ?? -1;
  const bEndCoverage =
    b.endGameValue
      ?.anchorWeaknessesImproved ?? -1;

  if (aEndCoverage !== bEndCoverage) {
    return bEndCoverage - aEndCoverage;
  }

  const normalComparison =
    comparePlannerDecisions(
      a.normalPlan.decision,
      b.normalPlan.decision,
    );

  if (normalComparison !== 0) {
    return normalComparison;
  }

  if (
    a.bestEndGamePackage &&
    b.bestEndGamePackage
  ) {
    return compareEndGamePackages(
      a.bestEndGamePackage,
      b.bestEndGamePackage,
    );
  }

  return a.normalPlan
    .selectedTowerIds.join("|")
    .localeCompare(
      b.normalPlan
        .selectedTowerIds.join("|"),
    );
}

export function rankCombinedBuildPlans(
  anchorTowerId: TowerId,
  limit = 3,
): RankedCombinedBuildPlans {
  const normalSearch =
    rankAnchorBuildPlansWithDiagnostics(
      anchorTowerId,
      Math.max(limit * 10, 30),
    );
  const plans = normalSearch.plans
    .map((normalPlan) =>
      combineBuildPlan(
        normalPlan,
        normalSearch.diagnostics,
      ),
    )
    .sort(compareCombinedPlans)
    .slice(0, limit);

  return {
    plans,
    diagnostics:
      normalSearch.diagnostics,
  };
}

export function getBestCombinedBuildPlan(
  anchorTowerId: TowerId,
): CombinedBuildPlan | null {
  return rankCombinedBuildPlans(
    anchorTowerId,
    1,
  ).plans[0] ?? null;
}
