import type { TowerProfile } from "@/lib/domain/towerProfile";
import {
  findDerivedMechanicSynergies,
  type DerivedMechanicSynergyMatch,
} from "@/lib/engine/derivedMechanicSynergy";
import {
  evaluateDirectSynergyOpportunity,
  type DirectSynergyOpportunityComparison,
} from "@/lib/engine/synergyOpportunity";

export type CombinedSynergyOpportunityComparison = {
  candidateTowerId: TowerProfile["towerId"];

  direct: DirectSynergyOpportunityComparison;

  derived: {
    before: readonly DerivedMechanicSynergyMatch[];
    after: readonly DerivedMechanicSynergyMatch[];
  };
};

/**
 * Compares direct contributions and potential derived
 * interactions for the same selected package and candidate.
 *
 * Derived findings retain their required conditions.
 * They are not treated as confirmed extra contributions.
 */
export function evaluateCombinedSynergyOpportunity(
  selectedProfiles: readonly TowerProfile[],
  candidate: TowerProfile,
): CombinedSynergyOpportunityComparison {
  // Also validates unique selected IDs and an unselected candidate.
  const direct = evaluateDirectSynergyOpportunity(
    selectedProfiles,
    candidate,
  );

  const derivedBefore =
    findDerivedMechanicSynergies(selectedProfiles);

  const derivedAfter = findDerivedMechanicSynergies([
    ...selectedProfiles,
    candidate,
  ]);

  return {
    candidateTowerId: candidate.towerId,
    direct,
    derived: {
      before: derivedBefore,
      after: derivedAfter,
    },
  };
}