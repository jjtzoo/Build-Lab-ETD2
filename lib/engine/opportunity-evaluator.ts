import type {
  OpportunityCostEvaluation,
  TowerEvaluationBundle,
  TowerState,
} from "./types";

function dpsScore(bundle: TowerEvaluationBundle): number {
  return bundle.dps.score ?? 0;
}

function primaryDpsBundles(
  bundles: TowerEvaluationBundle[],
): TowerEvaluationBundle[] {
  return bundles
    .filter(
      (bundle) =>
        bundle.state.roles.mainDPS === "Primary" &&
        bundle.dps.status !== "UNKNOWN" &&
        bundle.dps.score !== null,
    )
    .sort((a, b) => dpsScore(b) - dpsScore(a));
}

function getBestReplacement(
  selected: TowerEvaluationBundle[],
  available: TowerEvaluationBundle[],
): TowerEvaluationBundle | null {
  const selectedNames = new Set(
    selected.map(
      (bundle) => bundle.state.tower.name,
    ),
  );

  return (
    primaryDpsBundles(available).find(
      (bundle) =>
        !selectedNames.has(
          bundle.state.tower.name,
        ),
    ) ?? null
  );
}

function calculateBreadthCost(
  state: TowerState | null,
): number {
  if (!state) {
    return 0;
  }

  const activeElements =
    state.allocation.filter(
      (value) => value > 0,
    ).length;

  const quadCount = state.allocation
    ? 0
    : 0;

  /*
   * Breadth cost is kept deliberately structural here.
   * Deeper recipe opportunity is handled through the selected
   * tower's remaining tier depth.
   */
  return Math.max(0, activeElements - 4) * 2 +
    quadCount;
}

export function evaluateOpportunityCost(
  selected: TowerEvaluationBundle[],
  available: TowerEvaluationBundle[],
): OpportunityCostEvaluation {
  const primaries = primaryDpsBundles(selected);
  const selectedPrimary =
    primaries[0] ?? null;

  const replacement =
    getBestReplacement(
      selected,
      available,
    );

  if (!selectedPrimary) {
    return {
      score: 0,
      opportunityLoss: 0,
      lostDepth: 0,
      lostDps: 0,
      replacementGain: replacement
        ? dpsScore(replacement)
        : 0,
      breadthCost: 0,
      selectedPrimary: null,
      bestAvailableReplacement:
        replacement?.state ?? null,
      protection: "DEFERRED",
      provenance: [
        "No selected primary DPS available for opportunity-cost comparison.",
      ],
    };
  }

  const selectedState =
    selectedPrimary.state;

  const maxTier =
    Math.max(
      selectedState.maxTier,
      selectedState.tier,
    );

  const remainingDepth = Math.max(
    0,
    maxTier - selectedState.tier,
  );

  /*
   * We do not fabricate a future DPS value for an unconstructed
   * tier. Remaining depth is therefore reported directly rather
   * than converted into invented DPS.
   */
  const lostDepth = remainingDepth;

  const replacementGain = replacement
    ? Math.max(
        0,
        dpsScore(replacement) -
          dpsScore(selectedPrimary),
      )
    : 0;

  const breadthCost =
    calculateBreadthCost(selectedState);

  const opportunityLoss =
    lostDepth +
    breadthCost +
    replacementGain;

  const protection =
    selectedState.tier >= maxTier
      ? "PROTECTED"
      : "PARTIAL";

  return {
    score: -opportunityLoss,
    opportunityLoss,
    lostDepth,
    lostDps: 0,
    replacementGain,
    breadthCost,

    selectedPrimary: selectedState,
    bestAvailableReplacement:
      replacement?.state ?? null,

    protection,

    provenance: [
      "selected-vs-replacement tower-state comparison",
      "remaining primary tier depth",
      "allocation breadth structure",
    ],
  };
}