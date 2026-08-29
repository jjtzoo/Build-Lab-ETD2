import type {
  PackageEvaluation,
  TowerEvaluationBundle,
  TowerState,
} from "./types";

function scoreOf(
  bundle: TowerEvaluationBundle,
): number {
  return bundle.dps.score ?? 0;
}

export function evaluatePackage(
  bundles: TowerEvaluationBundle[],
): PackageEvaluation {
  const primaryDps = bundles
    .filter(
      (bundle) =>
        bundle.state.roles.mainDPS === "Primary" &&
        bundle.dps.status !== "UNKNOWN",
    )
    .sort((a, b) => scoreOf(b) - scoreOf(a));

  const secondaryDps = bundles
    .filter(
      (bundle) =>
        bundle.state.roles.mainDPS === "Secondary" &&
        bundle.dps.status !== "UNKNOWN",
    )
    .sort((a, b) => scoreOf(b) - scoreOf(a));

  const states: TowerState[] = bundles.map(
    (bundle) => bundle.state,
  );

  const mainCount = primaryDps.length;
  const subCount = secondaryDps.length;

  const controlCount = bundles.filter(
    (bundle) =>
      bundle.state.roles.control !== "None",
  ).length;

  const coverageCount = bundles.filter(
    (bundle) =>
      bundle.state.roles.coverage !== "None",
  ).length;

  const amplificationCount = bundles.filter(
    (bundle) =>
      bundle.state.roles.amplification !== "None",
  ).length;

  const rangeCount = bundles.filter(
    (bundle) =>
      bundle.state.roles.range !== "None",
  ).length;

  const scalingCount = bundles.filter(
    (bundle) =>
      bundle.state.roles.scaling !== "None",
  ).length;

  const supportCount = bundles.filter(
    (bundle) =>
      bundle.state.roles.support !== "None",
  ).length;

  const manualCount = 0;

  const primaryState =
    primaryDps[0]?.state ?? null;

  const secondPrimary =
    primaryDps[1]?.state ?? null;

  const primaryDpsScore =
    primaryDps[0]?.dps.score ?? 0;

  const secondaryDpsScore =
    secondaryDps[0]?.dps.score ?? 0;

  const primaryDepth = primaryState
    ? primaryState.tier /
      Math.max(primaryState.maxTier, 1)
    : 0;

  const missing: string[] = [];

  if (!primaryState) {
    missing.push("Main DPS");
  }

  if (controlCount === 0) {
    missing.push("Control");
  }

  if (coverageCount === 0) {
    missing.push("Coverage");
  }

  const viability =
    primaryState !== null &&
    primaryDpsScore > 0;

  let completeness = 0;

  if (viability) {
    completeness += 0.55;
  }

  const functionalRoles = [
    controlCount > 0,
    coverageCount > 0,
    amplificationCount > 0,
    rangeCount > 0,
    subCount > 0,
  ].filter(Boolean).length;

  completeness += functionalRoles * 0.07;
  completeness = Math.min(1, completeness);

  /*
   * Package only reports obvious structural overlap.
   * Deep redundancy analysis belongs to the later
   * Redundancy evaluator.
   */
  const duplicatePenalty =
    Math.max(0, coverageCount - 1) * 4 +
    Math.max(0, amplificationCount - 1) * 4 +
    Math.max(0, controlCount - 2) * 3;

  const provenance = [
    ...new Set(
      bundles.flatMap((bundle) => [
        ...bundle.role.provenance,
        ...bundle.dps.provenance,
        ...bundle.control.provenance,
        ...bundle.coverage.provenance,
        ...bundle.amplification.provenance,
        ...bundle.range.provenance,
        ...bundle.scaling.provenance,
      ]),
    ),
  ];

  return {
    score:
      completeness * 100 -
      duplicatePenalty,

    viability,

    primaryDps:
      primaryDpsScore,

    secondaryDps:
      secondaryDpsScore,

    primaryDepth,

    completeness,
    duplicatePenalty,

    counts: {
      main: mainCount,
      sub: subCount,
      control: controlCount,
      cover: coverageCount,
      amp: amplificationCount,
      range: rangeCount,
      scaling: scalingCount,
      support: supportCount,
      manual: manualCount,
    },

    missing,

    primaryState,
    secondPrimary,

    provenance,
  };
}