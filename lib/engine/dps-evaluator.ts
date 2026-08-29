import type { EvaluatorEvidence, TowerState } from "./types";

function confidenceMultiplier(
  value: string | undefined,
): number {
  switch (value?.toUpperCase()) {
    case "HIGH":
      return 1;
    case "MEDIUM":
      return 0.82;
    case "LOW":
      return 0.6;
    default:
      return 0.45;
  }
}

function numericDamage(
  damage: unknown,
  tier: number,
): number | null {
  if (Array.isArray(damage)) {
    const value = damage[tier - 1];

    return typeof value === "number" &&
      Number.isFinite(value)
      ? value
      : null;
  }

  return typeof damage === "number" &&
    Number.isFinite(damage)
    ? damage
    : null;
}

export function evaluateDps(
  state: TowerState,
): EvaluatorEvidence {
  const {
    mechanics,
    tier,
    behavior,
    roles,
  } = state;

  if (!mechanics) {
    return {
      evaluator: "dps",
      score: null,
      status: "UNKNOWN",
      confidence: "UNKNOWN",
      reasons: [
        "No mechanics record is available.",
      ],
      signals: [],
      provenance: [],
    };
  }

  if (tier <= 0) {
    return {
      evaluator: "dps",
      score: 0,
      status: "UNKNOWN",
      confidence: "HIGH",
      reasons: [
        "Tower has no invested recipe depth.",
      ],
      signals: [],
      provenance: mechanics.sources,
    };
  }

  const reasons: string[] = [];
  const signals: string[] = [];

  const damage = numericDamage(
    mechanics.stats.damage,
    tier,
  );

  const attackSpeed =
    typeof mechanics.stats.attack_speed === "number" &&
    Number.isFinite(mechanics.stats.attack_speed)
      ? mechanics.stats.attack_speed
      : null;

  const range =
    typeof mechanics.stats.range === "number" &&
    Number.isFinite(mechanics.stats.range)
      ? mechanics.stats.range
      : null;

  const tags =
    mechanics.damage_profile.tags.map(
      (tag) => tag.toLowerCase(),
    );

  let rawScore = 0;

  /*
   * Numeric damage is the strongest direct DPS signal.
   * The logarithm keeps extremely large raw damage values
   * from overwhelming the rest of the evaluator.
   */
  if (damage !== null) {
    rawScore +=
      Math.log10(
        Math.max(1, damage),
      ) * 30;

    reasons.push(
      `Known damage at tier ${tier}: ${damage}.`,
    );

    signals.push("damage");
  }

  /*
   * Lower attack-time values imply more attacks per unit time.
   * This follows the existing V8 heuristic.
   */
  if (attackSpeed !== null) {
    rawScore +=
      Math.min(
        8,
        1 / Math.max(0.05, attackSpeed),
      ) * 5;

    reasons.push(
      `Known attack speed: ${attackSpeed}.`,
    );

    signals.push("attackSpeed");
  }

  /*
   * Range is a DPS-enabling factor, not direct damage.
   */
  if (range !== null) {
    rawScore +=
      Math.min(12, range / 150) * 2;

    reasons.push(
      `Known attack range: ${range}.`,
    );

    signals.push("range");
  }

  if (roles.mainDPS !== "None") {
    rawScore += 14;

    reasons.push(
      `Identified as ${roles.mainDPS} Main DPS.`,
    );

    signals.push("mainDPS");
  }

  if (roles.subDPS !== "None") {
    reasons.push(
      `Identified as ${roles.subDPS} Sub-DPS.`,
    );

    signals.push("subDPS");
  }

  if (tags.includes("burst")) {
    rawScore += 6;
    reasons.push(
      "Burst damage is explicitly documented.",
    );
    signals.push("burstTag");
  }

  if (tags.includes("dot")) {
    rawScore += 4;
    reasons.push(
      "DoT damage is explicitly documented.",
    );
    signals.push("dotTag");
  }

  if (
    tags.includes("ramp") ||
    tags.includes("momentum") ||
    tags.includes("attack scaling")
  ) {
    rawScore += 6;
    reasons.push(
      "Scaling damage behavior is explicitly documented.",
    );
    signals.push("damageScaling");
  }

  if (
    tags.includes("aoe") ||
    tags.includes("coverage")
  ) {
    rawScore += 4;
    reasons.push(
      "Multi-target or coverage damage is documented.",
    );
    signals.push("coverageDamage");
  }

  if (behavior.ramp === "CONFIRMED") {
    reasons.push(
      "Ramp behavior is explicitly documented.",
    );
    signals.push("ramp");
  }

  if (behavior.stacking === "CONFIRMED") {
    reasons.push(
      "Stacking behavior is explicitly documented.",
    );
    signals.push("stacking");
  }

  if (behavior.killScaling === "CONFIRMED") {
    reasons.push(
      "Kill-scaling behavior is explicitly documented.",
    );
    signals.push("killScaling");
  }

  if (behavior.attackScaling === "CONFIRMED") {
    reasons.push(
      "Attack-scaling behavior is explicitly documented.",
    );
    signals.push("attackScaling");
  }

  if (behavior.dot === "CONFIRMED") {
    signals.push("dot");
  }

  if (behavior.execute === "CONFIRMED") {
    reasons.push(
      "Execute behavior is explicitly documented.",
    );
    signals.push("execute");
  }

  if (behavior.burst === "CONFIRMED") {
    signals.push("burst");
  }

  if (behavior.focused === "CONFIRMED") {
    signals.push("focused");
  }

  if (behavior.distributed === "CONFIRMED") {
    signals.push("distributed");
  }

  const hasNumericEvidence =
    damage !== null ||
    attackSpeed !== null ||
    range !== null;

  const hasEvidence =
    hasNumericEvidence ||
    signals.length > 0;

  if (!hasEvidence) {
    return {
      evaluator: "dps",
      score: null,
      status: "UNKNOWN",
      confidence: "UNKNOWN",
      reasons: [
        "No explicit numeric or behavioral DPS evidence is currently established.",
      ],
      signals: [],
      provenance: mechanics.sources,
    };
  }

  const confidence =
    mechanics.confidence?.toUpperCase();

  const score =
    rawScore *
    confidenceMultiplier(confidence);

  return {
    evaluator: "dps",
    score,
    status: "CONFIRMED",
    confidence:
      confidence === "HIGH" ||
      confidence === "MEDIUM" ||
      confidence === "LOW"
        ? confidence
        : "UNKNOWN",
    reasons,
    signals,
    provenance: [
      ...mechanics.sources,
      mechanics.core_mechanic,
    ].filter(Boolean),
  };
}