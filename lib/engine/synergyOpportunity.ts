import type { TowerProfile } from "@/lib/domain/towerProfile";
import {
  applyMechanicSaturation,
  findDirectMechanicSynergies,
  type SaturatedMechanicSynergyMatch,
} from "@/lib/engine/mechanicSynergy";

export type DirectSynergyOpportunityComparison = {
  candidateTowerId: TowerProfile["towerId"];
  before: readonly SaturatedMechanicSynergyMatch[];
  after: readonly SaturatedMechanicSynergyMatch[];
};

/**
 * Compares direct mechanic interactions before and after
 * adding one unselected tower profile.
 *
 * This reports evidence, not a score or build-validity decision.
 * Provider replacement alone does not establish an improvement.
 */
export function evaluateDirectSynergyOpportunity(
  selectedProfiles: readonly TowerProfile[],
  candidate: TowerProfile,
): DirectSynergyOpportunityComparison {
  const selectedIds = new Set<TowerProfile["towerId"]>();

  for (const profile of selectedProfiles) {
    if (selectedIds.has(profile.towerId)) {
      throw new Error(
        `Duplicate selected tower profile: ${profile.towerId}`,
      );
    }

    selectedIds.add(profile.towerId);
  }

  if (selectedIds.has(candidate.towerId)) {
    throw new Error(
      `Candidate is already selected: ${candidate.towerId}`,
    );
  }

  const before = applyMechanicSaturation(
    findDirectMechanicSynergies(selectedProfiles),
  );

  const after = applyMechanicSaturation(
    findDirectMechanicSynergies([
      ...selectedProfiles,
      candidate,
    ]),
  );

  return {
    candidateTowerId: candidate.towerId,
    before,
    after,
  };
}