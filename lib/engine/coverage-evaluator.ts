import type { EvaluatorEvidence, TowerState } from "./types";

function isKnown(value: string | undefined): boolean {
  return value !== undefined && value !== "UNKNOWN";
}

function hasTag(state: TowerState, tag: string): boolean {
  return (
    state.mechanics?.damage_profile.tags.some(
      (value) => value.toLowerCase() === tag.toLowerCase(),
    ) ?? false
  );
}

export function evaluateCoverage(
  state: TowerState,
): EvaluatorEvidence {
  const { mechanics, tier, roles } = state;

  if (!mechanics) {
    return {
      evaluator: "coverage",
      score: null,
      status: "UNKNOWN",
      confidence: "UNKNOWN",
      reasons: ["No mechanics record is available."],
      signals: [],
      provenance: [],
    };
  }

  if (tier <= 0) {
    return {
      evaluator: "coverage",
      score: 0,
      status: "UNKNOWN",
      confidence: "HIGH",
      reasons: ["Tower has no invested recipe depth."],
      signals: [],
      provenance: mechanics.sources,
    };
  }

  const reasons: string[] = [];
  const signals: string[] = [];
  let score = 0;

  if (roles.coverage !== "None") {
    score += 32;
    reasons.push(`Coverage role: ${roles.coverage}.`);
    signals.push("coverageRole");
  }

  if (hasTag(state, "AoE")) {
    score += 14;
    reasons.push("Explicit AoE behavior is documented.");
    signals.push("aoe");
  }

  if (
    isKnown(mechanics.damage_profile.single_target_or_multi) &&
    mechanics.damage_profile.single_target_or_multi
      .toLowerCase()
      .includes("multi")
  ) {
    score += 8;
    reasons.push("Explicit multi-target behavior is documented.");
    signals.push("multiTarget");
  }

  const range = mechanics.stats.range;

  if (typeof range === "number" && Number.isFinite(range)) {
    const rangeContribution = Math.min(12, range / 120);
    score += rangeContribution;
    reasons.push(`Known attack range: ${range}.`);
    signals.push("range");
  }

  const densityScaling = mechanics.coverage.density_scaling;

  if (densityScaling.toLowerCase().includes("strong")) {
    score += 12;
    reasons.push(`Density scaling: ${densityScaling}.`);
    signals.push("densityScalingStrong");
  } else if (isKnown(densityScaling)) {
    reasons.push(`Density scaling: ${densityScaling}.`);
    signals.push("densityScaling");
  }

  if (
    mechanics.damage_profile.tags.some(
      (tag) => tag.toLowerCase() === "global",
    )
  ) {
    score += 12;
    reasons.push("Explicit global coverage behavior is documented.");
    signals.push("global");
  }

  if (signals.length === 0) {
    return {
      evaluator: "coverage",
      score: null,
      status: "UNKNOWN",
      confidence: "UNKNOWN",
      reasons: [
        "No explicit coverage evidence is currently established.",
      ],
      signals: [],
      provenance: mechanics.sources,
    };
  }

  return {
    evaluator: "coverage",
    score,
    status: "CONFIRMED",
    confidence: "HIGH",
    reasons,
    signals,
    provenance: mechanics.sources,
  };
}