import type {
  OpportunityCostEvaluation,
  TowerEvaluationBundle,
  TowerState,
} from "./types";

import {
  buildAllocationProfile,
} from "./allocation-profile";

function dpsScore(
  bundle: TowerEvaluationBundle,
): number {
  return bundle.dps.score ?? 0;
}

function primaryDpsBundles(
  bundles: TowerEvaluationBundle[],
): TowerEvaluationBundle[] {
  return bundles
    .filter(
      (bundle) =>
        bundle.state.roles
          .mainDPS === "Primary" &&
        bundle.dps.status !==
          "UNKNOWN" &&
        bundle.dps.score !== null,
    )
    .sort(
      (a, b) =>
        dpsScore(b) -
        dpsScore(a),
    );
}

function getBestReplacement(
  selected: TowerEvaluationBundle[],
  available: TowerEvaluationBundle[],
): TowerEvaluationBundle | null {
  const selectedNames =
    new Set(
      selected.map(
        (bundle) =>
          bundle.state
            .tower.name,
      ),
    );

  return (
    primaryDpsBundles(
      available,
    ).find(
      (bundle) =>
        !selectedNames.has(
          bundle.state
            .tower.name,
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

  const profile =
    buildAllocationProfile(
      state.allocation,
    );

  /*
   * Breadth cost reflects structural commitment
   * in the allocation rather than inventing DPS
   * for hypothetical future towers.
   *
   * More than four active elements represents
   * increasing elemental breadth.
   *
   * Quad access is also reported as a structural
   * ecosystem commitment. It is deliberately not
   * converted into an arbitrary per-Quad value.
   */
  const activeElementCost =
    Math.max(
      0,
      profile.activeElements -
        4,
    ) * 2;

  const quadEcosystemCost =
    profile.quadAccess > 0
      ? 1
      : 0;

  return (
    activeElementCost +
    quadEcosystemCost
  );
}

export function evaluateOpportunityCost(
  selected: TowerEvaluationBundle[],
  available: TowerEvaluationBundle[],
): OpportunityCostEvaluation {
  const primaries =
    primaryDpsBundles(
      selected,
    );

  const selectedPrimary =
    primaries[0] ??
    null;

  const replacement =
    getBestReplacement(
      selected,
      available,
    );

  if (
    !selectedPrimary
  ) {
    return {
      score: 0,

      opportunityLoss: 0,

      lostDepth: 0,

      lostDps: 0,

      replacementGain:
        replacement
          ? dpsScore(
              replacement,
            )
          : 0,

      breadthCost: 0,

      selectedPrimary: null,

      bestAvailableReplacement:
        replacement?.state ??
        null,

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

  const remainingDepth =
    Math.max(
      0,
      maxTier -
        selectedState.tier,
    );

  /*
   * We do not fabricate future DPS for
   * unconstructed tiers.
   */
  const lostDepth =
    remainingDepth;

  const replacementGain =
    replacement
      ? Math.max(
          0,
          dpsScore(
            replacement,
          ) -
            dpsScore(
              selectedPrimary,
            ),
        )
      : 0;

  const breadthCost =
    calculateBreadthCost(
      selectedState,
    );

  const opportunityLoss =
    lostDepth +
    breadthCost +
    replacementGain;

  const protection =
    selectedState.tier >=
    maxTier
      ? "PROTECTED"
      : "PARTIAL";

  const allocationProfile =
    buildAllocationProfile(
      selectedState
        .allocation,
    );

  const provenance = [
    "selected-vs-replacement tower-state comparison",
    "remaining primary tier depth",
    "allocation profile",
    "allocation breadth structure",
  ];

  if (
    allocationProfile
      .quadAccess > 0
  ) {
    provenance.push(
      "Quad ecosystem access",
    );
  }

  if (
    allocationProfile
      .triAccess > 0
  ) {
    provenance.push(
      "Tri ecosystem access",
    );
  }

  return {
    score:
      -opportunityLoss,

    opportunityLoss,

    lostDepth,

    lostDps: 0,

    replacementGain,

    breadthCost,

    selectedPrimary:
      selectedState,

    bestAvailableReplacement:
      replacement?.state ??
      null,

    protection,

    provenance,
  };
}