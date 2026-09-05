import type {
  MechanicConditionEvaluation,
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

export type CombinedSynergyOpportunityComparison = {
  candidateTowerId: TowerProfile["towerId"];

  // Direct-only evidence, retained for inspection.
  direct: DirectSynergyOpportunityComparison;

  // Raw potential chains, retained for explanations.
  derived: {
    before: readonly DerivedMechanicSynergyMatch[];
    after: readonly DerivedMechanicSynergyMatch[];
  };

  evaluatedDerived: {
    before: readonly EvaluatedDerivedSynergy[];
    after: readonly EvaluatedDerivedSynergy[];
  };

  // Direct and condition-met derived supply saturated together.
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

function combineApplicableContributions(
  direct: readonly SaturatedMechanicSynergyMatch[],
  derived: readonly EvaluatedDerivedSynergy[],
): readonly SaturatedMechanicSynergyMatch[] {
  // Remove direct-only saturation before evaluating the whole package.
  const matches: MechanicSynergyMatch[] = direct.map(
    ({ contribution, ...match }) => {
      void contribution;
      return match;
    },
  );

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

  // One provider's supply to the same consumer/signal counts once.
  // Alternate paths remain available in the raw evidence above.
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
 * Evaluates one candidate without selecting it.
 *
 * Condition context is supplied separately for before and after:
 * adding a tower may change placement or targeting.
 * Missing information stays unknown.
 *
 * Role completion, keystone ranking, and damage estimates
 * remain outside this evaluator.
 */
export function evaluateCombinedSynergyOpportunity(
  selectedProfiles: readonly TowerProfile[],
  candidate: TowerProfile,
  context: SynergyComparisonContext = {},
): CombinedSynergyOpportunityComparison {
  // Also validates selected IDs and candidate uniqueness.
  const direct = evaluateDirectSynergyOpportunity(
    selectedProfiles,
    candidate,
  );

  const afterProfiles = [...selectedProfiles, candidate];

  const derivedBefore =
    findDerivedMechanicSynergies(selectedProfiles);
  const derivedAfter =
    findDerivedMechanicSynergies(afterProfiles);

  const evaluatedBefore = evaluateDerivedSynergyConditions(
    derivedBefore,
    context.before ?? [],
  );

  const evaluatedAfter = evaluateDerivedSynergyConditions(
    derivedAfter,
    context.after ?? [],
  );

  const applicableBefore = combineApplicableContributions(
    direct.before,
    evaluatedBefore,
  );

  const applicableAfter = combineApplicableContributions(
    direct.after,
    evaluatedAfter,
  );

  // This existing helper compares contribution snapshots;
  // its algorithm also works for the combined applicable supply.
  const summaries = summarizeDirectSynergyOpportunity({
    candidateTowerId: candidate.towerId,
    before: applicableBefore,
    after: applicableAfter,
  });

  return {
    candidateTowerId: candidate.towerId,
    direct,
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