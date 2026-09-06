import type {
  MechanicConditionEvaluation,
  MechanicConditionState,
  MechanicRelationshipCondition,
} from "@/lib/domain/mechanicSignals";
import type { DerivedMechanicSynergyMatch } from "@/lib/engine/derivedMechanicSynergy";

export type EvaluatedDerivedSynergy = {
  match: DerivedMechanicSynergyMatch;

  conditionState: MechanicConditionState;

  conditions: readonly {
    condition: MechanicRelationshipCondition;
    state: MechanicConditionState;
  }[];
};

function getConditionKey(
  providerTowerId: string,
  consumerTowerId: string,
  condition: MechanicRelationshipCondition,
): string {
  return JSON.stringify([providerTowerId, consumerTowerId, condition]);
}

export function evaluateMechanicConditions<
  T extends {
    providerTowerId: string;
    consumerTowerId: string;
    conditions: readonly MechanicRelationshipCondition[];
  },
>(
  matches: readonly T[],
  evaluations: readonly MechanicConditionEvaluation[] = [],
) {
  const states = new Map<string, MechanicConditionState>();

  for (const evaluation of evaluations) {
    const key = getConditionKey(
      evaluation.providerTowerId,
      evaluation.consumerTowerId,
      evaluation.condition,
    );

    const existing = states.get(key);

    if (existing !== undefined && existing !== evaluation.state) {
      throw new Error(`Conflicting condition states for ${key}`);
    }

    states.set(key, evaluation.state);
  }

  return matches.map((match) => {
    const conditions = match.conditions.map((condition) => {
      const key = getConditionKey(
        match.providerTowerId,
        match.consumerTowerId,
        condition,
      );

      return {
        condition,
        state: states.get(key) ?? "unknown",
      };
    });

    let conditionState: MechanicConditionState;

    if (conditions.some((entry) => entry.state === "unmet")) {
      conditionState = "unmet";
    } else if (conditions.some((entry) => entry.state === "unknown")) {
      conditionState = "unknown";
    } else {
      conditionState = "met";
    }

    return {
      match,
      conditionState,
      conditions,
    };
  });
}

export function evaluateDerivedSynergyConditions(
  matches: readonly DerivedMechanicSynergyMatch[],
  evaluations: readonly MechanicConditionEvaluation[] = [],
): readonly EvaluatedDerivedSynergy[] {
  return evaluateMechanicConditions(matches, evaluations);
}
