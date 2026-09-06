import type {
  MechanicConditionEvaluation,
  MechanicConditionState,
  MechanicStrength,
} from "@/lib/domain/mechanicSignals";
import type { TowerProfile } from "@/lib/domain/towerProfile";
import {
  findDerivedMechanicSynergies,
  type DerivedMechanicSynergyMatch,
} from "@/lib/engine/derivedMechanicSynergy";
import {
  evaluateDerivedSynergyConditions,
  type EvaluatedDerivedSynergy,
} from "@/lib/engine/derivedSynergyConditions";
import {
  applyMechanicSaturation,
  type MechanicSynergyMatch,
  type SaturatedMechanicSynergyMatch,
} from "@/lib/engine/mechanicSynergy";
import {
  findConditionalMechanicTensions,
  type ConditionalMechanicTension,
} from "@/lib/engine/mechanicTension";
import {
  evaluateDirectSynergyOpportunity,
  type DirectSynergyOpportunityComparison,
} from "@/lib/engine/synergyOpportunity";
import {
  summarizeDirectSynergyOpportunity,
  type DirectSynergyOpportunitySummary,
} from "@/lib/engine/synergyOpportunitySummary";

export type SynergyComparisonContext = {
  before?: readonly MechanicConditionEvaluation[];
  after?: readonly MechanicConditionEvaluation[];
};

export type EvaluatedDirectSynergy = {
  match: MechanicSynergyMatch;
  condition: "replication-applicable" | null;
  conditionState: MechanicConditionState;
};

export type CombinedSynergyOpportunityComparison = {
  candidateTowerId: TowerProfile["towerId"];

  // Direct-only matching evidence, not the final applicable totals.
  direct: DirectSynergyOpportunityComparison;

  evaluatedDirect: {
    before: readonly EvaluatedDirectSynergy[];
    after: readonly EvaluatedDirectSynergy[];
  };

  derived: {
    before: readonly DerivedMechanicSynergyMatch[];
    after: readonly DerivedMechanicSynergyMatch[];
  };

  evaluatedDerived: {
    before: readonly EvaluatedDerivedSynergy[];
    after: readonly EvaluatedDerivedSynergy[];
  };

  applicable: {
    before: readonly SaturatedMechanicSynergyMatch[];
    after: readonly SaturatedMechanicSynergyMatch[];
  };

  summaries: readonly DirectSynergyOpportunitySummary[];

  tensions: {
    before: readonly ConditionalMechanicTension[];
    after: readonly ConditionalMechanicTension[];
  };
};

function evaluateDirectConditions(
  matches: readonly SaturatedMechanicSynergyMatch[],
  evaluations: readonly MechanicConditionEvaluation[],
): readonly EvaluatedDirectSynergy[] {
  return matches.map(({ contribution, ...match }) => {
    void contribution;

    if (match.signal !== "tower-replication") {
      return {
        match,
        condition: null,
        conditionState: "met",
      };
    }

    const matchingStates = new Set(
      evaluations
        .filter(
          (entry) =>
            entry.providerTowerId === match.providerTowerId &&
            entry.consumerTowerId === match.consumerTowerId &&
            entry.condition === "replication-applicable",
        )
        .map((entry) => entry.state),
    );

    if (matchingStates.size > 1) {
      throw new Error(
        "Conflicting condition states for replication applicability",
      );
    }

    const conditionState = [...matchingStates][0] ?? "unknown";

    return {
      match,
      condition: "replication-applicable",
      conditionState,
    };
  });
}

function combineApplicableContributions(
  direct: readonly EvaluatedDirectSynergy[],
  derived: readonly EvaluatedDerivedSynergy[],
): readonly SaturatedMechanicSynergyMatch[] {
  const matches: MechanicSynergyMatch[] = direct
    .filter((entry) => entry.conditionState === "met")
    .map((entry) => entry.match);

  for (const entry of derived) {
    if (entry.conditionState !== "met") {
      continue;
    }

    const match = entry.match;

    matches.push({
      providerTowerId: match.providerTowerId,
      consumerTowerId: match.consumerTowerId,
      signal: match.consumerSignal,
      providerStrength: match.providerStrength,
      consumerStrength: match.consumerStrength,
      effectiveStrength: Math.min(
        match.providerStrength,
        match.consumerStrength,
      ) as MechanicStrength,
      saturation: match.saturation,
      relationshipType: "derived",
    });
  }

  // Alternate paths from the same provider count once per
  // consumer and signal. Raw evidence preserves those paths.
  const uniqueSupply = new Map<string, MechanicSynergyMatch>();

  for (const match of matches) {
    const key = JSON.stringify([
      match.providerTowerId,
      match.consumerTowerId,
      match.signal,
    ]);

    const existing = uniqueSupply.get(key);

    if (
      !existing ||
      match.effectiveStrength > existing.effectiveStrength
    ) {
      uniqueSupply.set(key, match);
    }
  }

  return applyMechanicSaturation([...uniqueSupply.values()]);
}

/**
 * Compares one candidate without selecting it.
 * Before and after context are explicit and independent.
 * Missing required condition information stays unknown.
 */
export function evaluateCombinedSynergyOpportunity(
  selectedProfiles: readonly TowerProfile[],
  candidate: TowerProfile,
  context: SynergyComparisonContext = {},
): CombinedSynergyOpportunityComparison {
  const direct = evaluateDirectSynergyOpportunity(
    selectedProfiles,
    candidate,
  );

  const afterProfiles = [...selectedProfiles, candidate];
  const beforeContext = context.before ?? [];
  const afterContext = context.after ?? [];

  const derivedBefore =
    findDerivedMechanicSynergies(selectedProfiles);
  const derivedAfter =
    findDerivedMechanicSynergies(afterProfiles);

  const evaluatedBefore = evaluateDerivedSynergyConditions(
    derivedBefore,
    beforeContext,
  );
  const evaluatedAfter = evaluateDerivedSynergyConditions(
    derivedAfter,
    afterContext,
  );

  const directBefore = evaluateDirectConditions(
    direct.before,
    beforeContext,
  );
  const directAfter = evaluateDirectConditions(
    direct.after,
    afterContext,
  );

  const applicableBefore = combineApplicableContributions(
    directBefore,
    evaluatedBefore,
  );
  const applicableAfter = combineApplicableContributions(
    directAfter,
    evaluatedAfter,
  );

  const summaries = summarizeDirectSynergyOpportunity({
    candidateTowerId: candidate.towerId,
    before: applicableBefore,
    after: applicableAfter,
  });

  return {
    candidateTowerId: candidate.towerId,
    direct,
    evaluatedDirect: {
      before: directBefore,
      after: directAfter,
    },
    derived: {
      before: derivedBefore,
      after: derivedAfter,
    },
    evaluatedDerived: {
      before: evaluatedBefore,
      after: evaluatedAfter,
    },
    applicable: {
      before: applicableBefore,
      after: applicableAfter,
    },
    summaries,
    tensions: {
      before: findConditionalMechanicTensions(selectedProfiles),
      after: findConditionalMechanicTensions(afterProfiles),
    },
  };
}