import type { EvaluatorEvidence, TowerState } from "./types";

export function evaluateRange(
  state: TowerState,
): EvaluatorEvidence {
  const { mechanics, tier, roles } = state;

  if (!mechanics) {
    return {
      evaluator: "range",
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
      evaluator: "range",
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

  /*
   * Explicit strategic role is the strongest evidence that range
   * is a meaningful part of the tower's function.
   */
  if (roles.range !== "None") {
    score += 34;
    reasons.push(`Range role: ${roles.range}.`);
    signals.push("rangeRole");
  }

  /*
   * Numeric range is direct mechanical evidence.
   * It contributes value without being treated as a "Range Specialist"
   * classification by itself.
   */
  const range = mechanics.stats.range;

  if (typeof range === "number" && Number.isFinite(range)) {
    const rangeContribution = Math.min(24, range / 8);
    score += rangeContribution;

    reasons.push(`Known attack range: ${range}.`);
    signals.push("range");
  }

  /*
   * Build-position evidence is explicit contextual evidence.
   */
  if (
    mechanics.build_position
      .toLowerCase()
      .includes("range")
  ) {
    score += 10;
    reasons.push(
      `Build position indicates range specialization: ${mechanics.build_position}.`,
    );
    signals.push("rangeBuildPosition");
  }

  /*
   * No evidence means UNKNOWN, not zero.
   */
  if (signals.length === 0) {
    return {
      evaluator: "range",
      score: null,
      status: "UNKNOWN",
      confidence: "UNKNOWN",
      reasons: ["No explicit range evidence is currently established."],
      signals: [],
      provenance: mechanics.sources,
    };
  }

  return {
    evaluator: "range",
    score,
    status: "CONFIRMED",
    confidence: "HIGH",
    reasons,
    signals,
    provenance: mechanics.sources,
  };
}