import type { EvaluatorEvidence, TowerState } from "./types";

export function evaluateControl(
  state: TowerState,
): EvaluatorEvidence {
  const { mechanics, roles, tier } = state;

  if (!mechanics) {
    return {
      evaluator: "control",
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
      evaluator: "control",
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

  if (roles.control !== "None") {
    reasons.push(`Control role: ${roles.control}.`);
    signals.push("control");
  }

  const control = mechanics.control;

  if (control.slow !== "UNKNOWN") {
    reasons.push(`Slow status: ${control.slow}.`);
    signals.push("slow");
  }

  if (control.hard_cc !== "UNKNOWN") {
    reasons.push(`Hard CC status: ${control.hard_cc}.`);
    signals.push("hardCC");
  }

  if (control.debuff !== "UNKNOWN") {
    reasons.push(`Debuff status: ${control.debuff}.`);
    signals.push("debuff");
  }

  if (control.hp_manipulation !== "UNKNOWN") {
    reasons.push(`HP manipulation status: ${control.hp_manipulation}.`);
    signals.push("hpManipulation");
  }

  if (control.execute_threshold !== "UNKNOWN") {
    reasons.push(`Execute threshold: ${control.execute_threshold}.`);
    signals.push("executeThreshold");
  }

  if (control.duration !== "UNKNOWN") {
    reasons.push(`Control duration: ${control.duration}.`);
    signals.push("duration");
  }

  if (control.coverage !== "UNKNOWN") {
    reasons.push(`Control coverage: ${control.coverage}.`);
    signals.push("coverage");
  }

  const hasEvidence = signals.length > 0;

  return {
    evaluator: "control",
    score: null,
    status: hasEvidence ? "CONFIRMED" : "UNKNOWN",
    confidence: "HIGH",
    reasons,
    signals,
    provenance: mechanics.sources,
  };
}