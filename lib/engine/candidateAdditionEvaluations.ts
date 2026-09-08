import type {
  ElementMatchupTable,
} from "@/lib/domain/elementMatchups";

import {
  ELEMENT_MATCHUPS,
} from "@/lib/domain/elementMatchupCatalog";

import type {
  TowerId,
} from "@/lib/domain/tower";

import {
  getTowerProfile,
} from "@/lib/domain/towerProfileCatalog";

import {
  evaluateAnchorPackages,
  type AnchorPackageEvaluation,
} from "@/lib/engine/anchorPackageEvaluations";

import {
  evaluateCombinedSynergyOpportunity,
  type CombinedSynergyOpportunityComparison,
} from "@/lib/engine/combinedSynergyOpportunity";

import {
  evaluateSelectedPackageEvidence,
  type CorePackageEvidence,
} from "@/lib/engine/corePackageEvidence";

export type CandidateAdditionEvaluation = {
  /**
   * Route state and minimum core package being
   * extended.
   */
  baseline:
    AnchorPackageEvaluation;

  /**
   * Available but currently unselected tower.
   */
  candidateTowerId:
    TowerId;

  /**
   * Maximum tower level reachable at this
   * exact allocation.
   */
  candidateReachableLevel:
    number;

  /**
   * Evidence before selecting the optional tower.
   */
  beforeEvidence:
    CorePackageEvidence;

  /**
   * Evidence after selecting the optional tower.
   */
  afterEvidence:
    CorePackageEvidence;

  /**
   * Step 8 before/after mechanic comparison.
   */
  synergy:
    CombinedSynergyOpportunityComparison;
};

/**
 * Evaluates every currently available but unselected
 * tower against one selected core package.
 *
 * This measures selection value at a fixed allocation.
 * It does NOT yet measure the marginal value of the
 * keystone allocation itself.
 */
export function evaluatePackageAdditions(
  baseline: AnchorPackageEvaluation,
  matchups:
    ElementMatchupTable =
      ELEMENT_MATCHUPS,
): readonly CandidateAdditionEvaluation[] {
  const selectedIds =
    new Set(
      baseline.package
        .selectedTowerIds,
    );

  const selectedProfiles =
    baseline.package
      .selectedTowerIds
      .map(
        (towerId) =>
          getTowerProfile(
            towerId,
          ),
      );

  const reachableLevels =
    new Map(
      baseline.routeState
        .availableTowers
        .map((entry) => [
          entry.tower.id,
          entry.maxLevel,
        ] as const),
    );

  return baseline.routeState
    .availableTowers
    .filter(
      (entry) =>
        !selectedIds.has(
          entry.tower.id,
        ),
    )
    .map(
      (entry) => {
        const candidateProfile =
          getTowerProfile(
            entry.tower.id,
          );

        const afterSelectedTowerIds = [
          ...baseline.package
            .selectedTowerIds,
          entry.tower.id,
        ];

        return {
          baseline,

          candidateTowerId:
            entry.tower.id,

          candidateReachableLevel:
            entry.maxLevel,

          beforeEvidence:
            baseline.evidence,

          afterEvidence:
            evaluateSelectedPackageEvidence(
              baseline.package
                .anchorTowerId,
              afterSelectedTowerIds,
              matchups,
              reachableLevels,
            ),

          synergy:
            evaluateCombinedSynergyOpportunity(
              selectedProfiles,
              candidateProfile,
            ),
        };
      },
    );
}

/**
 * Evaluates optional tower additions for every
 * selectable core package across the anchor's
 * complete legal route space.
 *
 * No ranking occurs here.
 */
export function evaluateAnchorPackageAdditions(
  anchorTowerId: TowerId,
  matchups:
    ElementMatchupTable =
      ELEMENT_MATCHUPS,
): readonly CandidateAdditionEvaluation[] {
  return evaluateAnchorPackages(
    anchorTowerId,
    matchups,
  ).flatMap(
    (baseline) =>
      evaluatePackageAdditions(
        baseline,
        matchups,
      ),
  );
}
