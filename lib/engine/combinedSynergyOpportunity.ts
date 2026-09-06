import type {
  MechanicConditionEvaluation,
  MechanicConditionState,
  MechanicRelationship,
  MechanicRelationshipCondition,
  MechanicStrength,
} from "@/lib/domain/mechanicSignals";
import { MECHANIC_RELATIONSHIPS } from "@/lib/domain/mechanicRelationships";
import type { TowerProfile } from "@/lib/domain/towerProfile";
import {
  findDerivedMechanicSynergies,
  type DerivedMechanicSynergyMatch,
} from "@/lib/engine/derivedMechanicSynergy";
import {
  evaluateDerivedSynergyConditions,
  evaluateMechanicConditions,
  type EvaluatedDerivedSynergy,
} from "@/lib/engine/derivedSynergyConditions";
import {
  applyMechanicSaturation,
  findDirectMechanicSynergies,
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
  // Retained for existing callers; conditions contains the complete list.
  condition: MechanicRelationshipCondition | null;
  conditions: EvaluatedDerivedSynergy["conditions"];
  conditionState: MechanicConditionState;
};

export type SynergyOpportunityEvidence = {
  providerSignal: string;
  relationshipType: MechanicSynergyMatch["relationshipType"];
  providerStrength: MechanicStrength;
  consumerStrength: MechanicStrength;
  saturation: MechanicSynergyMatch["saturation"];
  conditionState: MechanicConditionState;
  conditions: EvaluatedDerivedSynergy["conditions"];
};

export type SynergyPlanningOpportunity = {
  providerTowerId: string;
  consumerTowerId: string;
  signal: string;
  status:
    | "new-opportunity"
    | "changed-opportunity"
    | "unchanged-opportunity"
    | "removed-opportunity";
  before: readonly SynergyOpportunityEvidence[];
  after: readonly SynergyOpportunityEvidence[];
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

  // Planning evidence includes unmet and unknown requirements. These are
  // opportunities to consider, not extra confirmed damage or contributions.
  opportunities: readonly SynergyPlanningOpportunity[];

  tensions: {
    before: readonly ConditionalMechanicTension[];
    after: readonly ConditionalMechanicTension[];
  };
};

function evaluateDirectConditions(
  matches: readonly SaturatedMechanicSynergyMatch[],
  evaluations: readonly MechanicConditionEvaluation[],
  relationships: readonly MechanicRelationship[],
): readonly EvaluatedDirectSynergy[] {
  const conditioned = matches.map(({ contribution, ...match }) => {
    void contribution;
    return {
      ...match,
      conditions: [
        ...new Set(
          relationships
            .filter(
              (rule) => rule.from === match.signal && rule.to === match.signal,
            )
            .flatMap((rule) => rule.conditions),
        ),
      ],
    };
  });

  return evaluateMechanicConditions(conditioned, evaluations).map((entry) => {
    const { conditions, ...match } = entry.match;
    return {
      match,
      condition: conditions[0] ?? null,
      conditions: entry.conditions,
      conditionState: entry.conditionState,
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
      relationshipType: match.relationshipType,
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

    if (!existing || match.effectiveStrength > existing.effectiveStrength) {
      uniqueSupply.set(key, match);
    }
  }

  return applyMechanicSaturation([...uniqueSupply.values()]);
}

function summarizePlanningOpportunities(
  directBefore: readonly EvaluatedDirectSynergy[],
  directAfter: readonly EvaluatedDirectSynergy[],
  derivedBefore: readonly EvaluatedDerivedSynergy[],
  derivedAfter: readonly EvaluatedDerivedSynergy[],
): readonly SynergyPlanningOpportunity[] {
  const groups = new Map<
    string,
    {
      providerTowerId: string;
      consumerTowerId: string;
      signal: string;
      before: SynergyOpportunityEvidence[];
      after: SynergyOpportunityEvidence[];
    }
  >();

  for (const phase of ["before", "after"] as const) {
    const entries =
      phase === "before"
        ? [...directBefore, ...derivedBefore]
        : [...directAfter, ...derivedAfter];

    for (const entry of entries) {
      const match = entry.match;
      const signal = "signal" in match ? match.signal : match.consumerSignal;
      const key = JSON.stringify([
        match.providerTowerId,
        match.consumerTowerId,
        signal,
      ]);
      let group = groups.get(key);
      if (!group) {
        group = {
          providerTowerId: match.providerTowerId,
          consumerTowerId: match.consumerTowerId,
          signal,
          before: [],
          after: [],
        };
        groups.set(key, group);
      }
      group[phase].push({
        providerSignal: "signal" in match ? match.signal : match.providerSignal,
        relationshipType: match.relationshipType,
        providerStrength: match.providerStrength,
        consumerStrength: match.consumerStrength,
        saturation: match.saturation,
        conditionState: entry.conditionState,
        conditions: entry.conditions,
      });
    }
  }

  return [...groups.values()].map((group) => ({
    ...group,
    status:
      group.before.length === 0
        ? "new-opportunity"
        : group.after.length === 0
          ? "removed-opportunity"
          : JSON.stringify(group.before) === JSON.stringify(group.after)
            ? "unchanged-opportunity"
            : "changed-opportunity",
  }));
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
  relationships: readonly MechanicRelationship[] = MECHANIC_RELATIONSHIPS,
): CombinedSynergyOpportunityComparison {
  const direct = evaluateDirectSynergyOpportunity(selectedProfiles, candidate);

  const afterProfiles = [...selectedProfiles, candidate];
  const beforeContext = context.before ?? [];
  const afterContext = context.after ?? [];

  const derivedBefore = findDerivedMechanicSynergies(
    selectedProfiles,
    relationships,
  );
  const derivedAfter = findDerivedMechanicSynergies(
    afterProfiles,
    relationships,
  );

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
    relationships,
  );
  const directAfter = evaluateDirectConditions(
    direct.after,
    afterContext,
    relationships,
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
    opportunities: summarizePlanningOpportunities(
      directBefore,
      directAfter,
      evaluatedBefore,
      evaluatedAfter,
    ),
    tensions: {
      before: findConditionalMechanicTensions(selectedProfiles),
      after: findConditionalMechanicTensions(afterProfiles),
    },
  };
}

export type CombinedSynergyPackageEvidence = {
  /**
   * Direct mechanic relationships after
   * condition evaluation.
   */
  evaluatedDirect:
    readonly EvaluatedDirectSynergy[];

  /**
   * Raw derived mechanic paths discovered
   * inside the selected package.
   */
  derived:
    readonly DerivedMechanicSynergyMatch[];

  /**
   * Derived relationships after their
   * required conditions are evaluated.
   */
  evaluatedDerived:
    readonly EvaluatedDerivedSynergy[];

  /**
   * Confirmed mechanic contributions after
   * condition evaluation and saturation.
   *
   * Unknown or unmet conditional relationships
   * do not become confirmed contributions.
   */
  applicable:
    readonly SaturatedMechanicSynergyMatch[];

  /**
   * Potential mechanic conflicts inside
   * the selected package.
   */
  tensions:
    readonly ConditionalMechanicTension[];
};

/**
 * Evaluates the synergy state of an already-selected
 * package.
 *
 * Unlike evaluateCombinedSynergyOpportunity(), this
 * does not compare one candidate against a "before"
 * state. It describes the complete selected package.
 */
export function evaluateCombinedSynergyPackage(
  profiles: readonly TowerProfile[],
  context:
    readonly MechanicConditionEvaluation[] = [],
  relationships:
    readonly MechanicRelationship[] =
      MECHANIC_RELATIONSHIPS,
): CombinedSynergyPackageEvidence {
  const direct =
    applyMechanicSaturation(
      findDirectMechanicSynergies(
        profiles,
      ),
    );

  const evaluatedDirect =
    evaluateDirectConditions(
      direct,
      context,
      relationships,
    );

  const derived =
    findDerivedMechanicSynergies(
      profiles,
      relationships,
    );

  const evaluatedDerived =
    evaluateDerivedSynergyConditions(
      derived,
      context,
    );

  const applicable =
    combineApplicableContributions(
      evaluatedDirect,
      evaluatedDerived,
    );

  return {
    evaluatedDirect,
    derived,
    evaluatedDerived,
    applicable,
    tensions:
      findConditionalMechanicTensions(
        profiles,
      ),
  };
}