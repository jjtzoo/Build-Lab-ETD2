import type {
  MechanicEffectFact,
} from "@/lib/domain/towerMechanicFacts";

export type MechanicAvailabilityClass =
  | "effectively-continuous"
  | "periodic"
  | "triggered"
  | "burst-window"
  | "ramping"
  | "unknown";

export type MechanicAvailabilityEvidence = {
  classification:
    MechanicAvailabilityClass;
  dutyCycle: number | null;
  rampSeconds: number | null;
  lowUptime: boolean | null;
  activationRequirement:
    MechanicEffectFact["activationRequirement"] |
    "unknown";
  targetCoverage: string | null;
  resourceBurden:
    MechanicEffectFact["resourceBurden"] |
    null;
  unresolvedFacts:
    readonly string[];
};

/**
 * Derives qualitative availability without modifying mechanic potency.
 * The only numeric derivation is the explicit active-window ratio:
 * duration / cooldown.
 */
export function evaluateMechanicAvailability(
  fact: MechanicEffectFact | null,
  reachableLevel: number,
): MechanicAvailabilityEvidence {
  if (!fact) {
    return {
      classification: "unknown",
      dutyCycle: null,
      rampSeconds: null,
      lowUptime: null,
      activationRequirement:
        "unknown",
      targetCoverage: null,
      resourceBurden: null,
      unresolvedFacts: [
        "duration",
        "cooldown-or-trigger-interval",
        "activation-requirement",
        "target-coverage",
      ],
    };
  }

  const duration =
    fact.durationSeconds
      ?.byLevel[
        reachableLevel - 1
      ] ?? null;

  const dutyCycle =
    duration !== null &&
    fact.cooldownSeconds !==
      undefined
      ? duration /
        fact.cooldownSeconds
      : null;

  const targetCycleSeconds =
    fact.triggerIntervalSeconds !==
      undefined &&
    fact.maxTargets !== undefined
      ? fact.triggerIntervalSeconds *
        fact.maxTargets
      : null;

  let classification:
    MechanicAvailabilityClass;

  if (
    dutyCycle !== null &&
    dutyCycle < 1
  ) {
    classification =
      "burst-window";
  } else if (
    duration !== null &&
    targetCycleSeconds !== null &&
    duration >= targetCycleSeconds
  ) {
    classification =
      "effectively-continuous";
  } else if (
    fact.triggerIntervalSeconds !==
    undefined
  ) {
    classification =
      "periodic";
  } else if (
    fact.activationRequirement ===
    "on-hit"
  ) {
    classification =
      fact.conditionalRequirement
        ? "triggered"
        : "effectively-continuous";
  } else {
    classification =
      "unknown";
  }

  const unresolvedFacts:
    string[] = [];

  if (duration === null) {
    unresolvedFacts.push(
      "duration",
    );
  }

  if (
    fact.cooldownSeconds ===
      undefined &&
    fact.triggerIntervalSeconds ===
      undefined &&
    fact.activationRequirement !==
      "on-hit"
  ) {
    unresolvedFacts.push(
      "cooldown-or-trigger-interval",
    );
  }

  if (!fact.targetCoverage) {
    unresolvedFacts.push(
      "target-coverage",
    );
  }

  return {
    classification,
    dutyCycle,
    rampSeconds:
      classification ===
        "effectively-continuous" &&
      fact.triggerIntervalSeconds !==
        undefined &&
      fact.maxTargets !== undefined
        ? fact.triggerIntervalSeconds *
          Math.max(
            0,
            fact.maxTargets - 1,
          )
        : null,
    lowUptime:
      dutyCycle === null
        ? null
        : dutyCycle <= 0.25,
    activationRequirement:
      fact.activationRequirement,
    targetCoverage:
      fact.targetCoverage ?? null,
    resourceBurden:
      fact.resourceBurden ?? null,
    unresolvedFacts,
  };
}
