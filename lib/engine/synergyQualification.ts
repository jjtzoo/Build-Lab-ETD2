import type { MechanicAvailabilityClass } from "@/lib/engine/mechanicAvailability";

/**
 * How strong a confirmed mechanic relationship actually is for the build
 * it appears in. This is a *derived* reading, not a manufactured score:
 * every tier is produced from evidence the engine already computes —
 * the mechanic's interaction class, its verified magnitude, its uptime
 * classification, whether saturation left it a full or shared
 * contribution, and whether the consumer is the anchor the whole build
 * is planned around.
 *
 * Governing doctrine (Engine Logic Spec §5, §6, §9): synergy is derived
 * from mechanics and saturation, not static pair scores; a mechanical
 * interaction is not automatically valuable; "Tower A raises Tower B's
 * attack damage" proves an interaction, not an efficient synergy; a
 * defining anchor interaction can outweigh repairing a minor weakness.
 */
export type SynergyQualificationTier =
  | "exceptional"
  | "strong"
  | "efficient"
  | "fair"
  | "situational";

export type SynergyQualification = {
  tier: SynergyQualificationTier;
  /** Short human phrases explaining how the tier was reached. */
  factors: readonly string[];
};

export type SynergyQualificationInput = {
  signal: string;
  effectiveStrength: number;
  contribution: "full" | "diminished";
  availabilityClass: MechanicAvailabilityClass;
  consumerIsAnchor: boolean;
};

const LADDER: readonly SynergyQualificationTier[] = [
  "situational",
  "fair",
  "efficient",
  "strong",
  "exceptional",
];

type InteractionClass =
  | "amplification"
  | "positioning"
  | "control"
  | "kill-economy"
  | "stat-buff"
  | "range";

/**
 * The mechanic's interaction class. An amplifier multiplies the
 * consumer's own output; a positioning effect creates the condition its
 * damage needs; a stat buff only moves a number. These have genuinely
 * different ceilings, and only the first two can climb on magnitude
 * alone — a bigger stat buff is still just a stat buff.
 */
function interactionClass(signal: string): InteractionClass {
  switch (signal) {
    case "damage-taken-amp":
    case "current-hp-removal":
    case "damage-echo":
    case "tower-replication":
      return "amplification";
    case "target-isolation":
    case "enemy-grouping":
    case "enemy-displacement":
      return "positioning";
    case "enemy-slow":
    case "enemy-stun":
    case "enemy-stasis":
      return "control";
    case "kill-generation":
    case "nearby-enemy-death":
      return "kill-economy";
    case "path-distance":
      return "range";
    default:
      // attack-damage-buff, attack-speed-buff, anything else stat-shaped
      return "stat-buff";
  }
}

const BASE_TIER: Record<InteractionClass, SynergyQualificationTier> = {
  amplification: "strong",
  positioning: "efficient",
  control: "fair",
  "kill-economy": "fair",
  "stat-buff": "fair",
  range: "fair",
};

/** Classes that may climb the ladder on verified magnitude + uptime. */
const CLIMBS_ON_MAGNITUDE: ReadonlySet<InteractionClass> = new Set([
  "amplification",
  "positioning",
]);

function step(
  tier: SynergyQualificationTier,
  delta: number,
): SynergyQualificationTier {
  const index = LADDER.indexOf(tier);
  const next = Math.max(0, Math.min(LADDER.length - 1, index + delta));
  return LADDER[next];
}

function atMost(
  tier: SynergyQualificationTier,
  ceiling: SynergyQualificationTier,
): SynergyQualificationTier {
  return LADDER.indexOf(tier) > LADDER.indexOf(ceiling) ? ceiling : tier;
}

const PERSISTENT: ReadonlySet<MechanicAvailabilityClass> = new Set([
  "effectively-continuous",
  "ramping",
]);

const INTERMITTENT: ReadonlySet<MechanicAvailabilityClass> = new Set([
  "periodic",
  "triggered",
  "burst-window",
]);

const CLASS_FACTOR: Record<InteractionClass, string> = {
  amplification: "Multiplies the recipient's own output",
  positioning: "Creates the condition the recipient's damage needs",
  control: "Holds enemies in the recipient's effective window",
  "kill-economy": "Feeds a kill-driven mechanic",
  "stat-buff": "Raises a stat — an interaction, not an amplifier",
  range: "Utility support",
};

export function qualifySynergyRelation(
  input: SynergyQualificationInput,
): SynergyQualification {
  const klass = interactionClass(input.signal);
  const factors: string[] = [CLASS_FACTOR[klass]];

  let tier = BASE_TIER[klass];

  const persistent = PERSISTENT.has(input.availabilityClass);
  const intermittent = INTERMITTENT.has(input.availabilityClass);
  const unknownUptime = input.availabilityClass === "unknown";
  const strong = input.effectiveStrength >= 4;
  const weak = input.effectiveStrength <= 2;

  // Magnitude only lifts amplification / positioning. It can still drag
  // anything down.
  if (strong && CLIMBS_ON_MAGNITUDE.has(klass)) {
    tier = step(tier, 1);
    factors.push("Verified at full magnitude");
  } else if (weak) {
    tier = step(tier, -1);
    factors.push("Low verified magnitude");
  }

  // Uptime. Persistence never lifts on its own; intermittency drags down.
  if (persistent) {
    factors.push(
      input.availabilityClass === "ramping"
        ? "Ramps up while it stays active"
        : "Effectively always active",
    );
  } else if (intermittent) {
    tier = step(tier, -1);
    factors.push(
      input.availabilityClass === "burst-window"
        ? "Only during a short burst window"
        : "Not always active",
    );
  } else if (unknownUptime) {
    tier = step(tier, -1);
    factors.push("Uptime not verified");
  }

  // Anchor relevance: the whole build is planned around this consumer.
  if (input.consumerIsAnchor) {
    tier = step(tier, 1);
    factors.push("Directly serves the anchor");
  }

  // A stat buff climbs above Efficient only when it is a maxed, permanent
  // buff landing on the anchor itself — then it is a large standing DPS
  // multiplier on the tower that matters most.
  if (
    klass === "stat-buff" &&
    input.consumerIsAnchor &&
    strong &&
    persistent
  ) {
    tier = step(tier, 1);
    factors.push("A full, permanent buff on the anchor");
  }

  // Saturation.
  if (input.contribution === "diminished") {
    tier = step(tier, -1);
    tier = atMost(tier, "fair");
    factors.push("Another provider already covers most of this");
  }

  // Ceilings no favourable modifier can beat.
  if (klass === "stat-buff") {
    const canReachStrong =
      input.consumerIsAnchor && strong && persistent;
    tier = atMost(tier, canReachStrong ? "strong" : "efficient");
  }
  if (klass === "control" || klass === "kill-economy") {
    tier = atMost(tier, "strong");
  }
  if (klass === "range") {
    tier = atMost(tier, "fair");
  }
  if (unknownUptime) {
    tier = atMost(tier, "efficient");
  }

  // Exceptional is reserved for a defining anchor interaction: an
  // always-on, output-shaping effect the anchor is built to exploit.
  if (tier === "exceptional") {
    const defining =
      (klass === "amplification" || klass === "positioning") &&
      input.consumerIsAnchor &&
      input.contribution === "full" &&
      persistent &&
      strong;
    if (defining) {
      factors.push("Defining interaction for this anchor");
    } else {
      tier = "strong";
    }
  }

  return { tier, factors };
}

/** Tiers shown in the primary synergy network. Situational is demoted. */
export const PRIMARY_NETWORK_TIERS: ReadonlySet<SynergyQualificationTier> =
  new Set(["exceptional", "strong", "efficient", "fair"]);

export function isPrimaryNetworkTier(
  tier: SynergyQualificationTier,
): boolean {
  return PRIMARY_NETWORK_TIERS.has(tier);
}

const TIER_RANK: Record<SynergyQualificationTier, number> = {
  exceptional: 0,
  strong: 1,
  efficient: 2,
  fair: 3,
  situational: 4,
};

/** Sort helper: strongest first. */
export function compareTier(
  a: SynergyQualificationTier,
  b: SynergyQualificationTier,
): number {
  return TIER_RANK[a] - TIER_RANK[b];
}
