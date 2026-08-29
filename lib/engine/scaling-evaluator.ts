import type { EvaluatorEvidence, TowerState } from "./types";

function hasTag(state: TowerState, value: string): boolean {
  return (
    state.mechanics?.damage_profile.tags.some(
      (tag) => tag.toLowerCase() === value.toLowerCase(),
    ) ?? false
  );
}

function hasScalingLanguage(value: string): boolean {
  return /\b(scal|scaling|growth|momentum)\b/i.test(value);
}

export function evaluateScaling(
  state: TowerState,
): EvaluatorEvidence {
  const { mechanics, tier, roles, behavior } = state;

  if (!mechanics) {
    return {
      evaluator: "scaling",
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
      evaluator: "scaling",
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

  if (roles.scaling !== "None") {
    score += 28;
    reasons.push(`Scaling role: ${roles.scaling}.`);
    signals.push("scalingRole");
  }

  if (behavior.ramp === "CONFIRMED") {
    score += 12;
    reasons.push("Ramp behavior is explicitly documented.");
    signals.push("ramp");
  }

  if (behavior.attackScaling === "CONFIRMED") {
    score += 14;
    reasons.push("Attack-scaling behavior is explicitly documented.");
    signals.push("attackScaling");
  }

  if (behavior.killScaling === "CONFIRMED") {
    score += 14;
    reasons.push("Kill-scaling behavior is explicitly documented.");
    signals.push("killScaling");
  }

  if (hasTag(state, "sustain")) {
    score += 8;
    reasons.push("Sustained behavior is explicitly tagged.");
    signals.push("sustain");
  }

  if (hasTag(state, "ramp")) {
    score += 12;
    reasons.push("Ramp is explicitly tagged.");
    signals.push("rampTag");
  }

  if (hasTag(state, "kill scaling")) {
    score += 14;
    reasons.push("Kill scaling is explicitly tagged.");
    signals.push("killScalingTag");
  }

  if (hasScalingLanguage(mechanics.build_position)) {
    score += 5;
    reasons.push(
      `Build position contains explicit scaling language: ${mechanics.build_position}.`,
    );
    signals.push("scalingBuildPosition");
  }

  if (signals.length === 0) {
    return {
      evaluator: "scaling",
      score: null,
      status: "UNKNOWN",
      confidence: "UNKNOWN",
      reasons: [
        "No explicit scaling evidence is currently established.",
      ],
      signals: [],
      provenance: mechanics.sources,
    };
  }

  return {
    evaluator: "scaling",
    score,
    status: "CONFIRMED",
    confidence: "HIGH",
    reasons,
    signals,
    provenance: mechanics.sources,
  };
}