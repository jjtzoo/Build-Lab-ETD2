import type { EvaluatorEvidence, TowerState } from "./types";

function normalizedTags(state: TowerState): string[] {
  return [
    ...state.mechanics?.strategic_roles ?? [],
    ...state.mechanics?.damage_profile.tags ?? [],
  ].map((tag) => tag.toLowerCase());
}

function hasTag(tags: string[], ...values: string[]): boolean {
  return values.some((value) => tags.includes(value.toLowerCase()));
}

export function evaluateAmplification(
  state: TowerState,
): EvaluatorEvidence {
  const { mechanics, tier, roles } = state;

  if (!mechanics) {
    return {
      evaluator: "amplification",
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
      evaluator: "amplification",
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
  const tags = normalizedTags(state);

  let score = 0;

  /*
   * Primary amplification role is the strongest direct evidence.
   */
  if (roles.amplification !== "None") {
    score += 42;
    reasons.push(`Amplification role: ${roles.amplification}.`);
    signals.push("amplificationRole");
  }

  /*
   * Explicit amplification mechanics.
   */
  if (
    hasTag(
      tags,
      "damage amplification",
      "damage amp",
      "amp",
    )
  ) {
    score += 16;
    reasons.push("Explicit damage-amplification behavior is documented.");
    signals.push("damageAmplification");
  }

  if (
    hasTag(
      tags,
      "resistance reduction",
      "resistance shred",
    )
  ) {
    score += 14;
    reasons.push("Explicit resistance-reduction behavior is documented.");
    signals.push("resistanceReduction");
  }

  if (hasTag(tags, "debuff")) {
    score += 7;
    reasons.push("Explicit debuff behavior is documented.");
    signals.push("debuff");
  }

  if (hasTag(tags, "attack speed")) {
    score += 10;
    reasons.push("Explicit attack-speed support behavior is documented.");
    signals.push("attackSpeed");
  }

  /*
   * UNKNOWN remains UNKNOWN.
   * A tower having no amplification evidence is not automatically
   * evidence that amplification is absent.
   */
  if (signals.length === 0) {
    return {
      evaluator: "amplification",
      score: null,
      status: "UNKNOWN",
      confidence: "UNKNOWN",
      reasons: [
        "No explicit amplification evidence is currently established.",
      ],
      signals: [],
      provenance: mechanics.sources,
    };
  }

  return {
    evaluator: "amplification",
    score,
    status: "CONFIRMED",
    confidence: "HIGH",
    reasons,
    signals,
    provenance: mechanics.sources,
  };
}