import { TOWERS } from "@/lib/data";
import {
  getTowerLevelCeiling,
  isTowerLevelLegal,
  isTowerRecipeSatisfied,
} from "@/lib/engine/build-state";
import type {
  BuildState,
  LegalNextCandidate,
  NoLegalCandidateReason,
} from "@/lib/types";

export function getLegalNextCandidates(
  state: BuildState,
): readonly LegalNextCandidate[] {
  if (state.remainingTowerSlots === 0) {
    return Object.freeze([]);
  }

  const selectedTowerNames = new Set(
    state.selectedTowers.map((selection) => selection.towerName),
  );

  const candidates = TOWERS
    .filter((tower) => !selectedTowerNames.has(tower.name))
    .filter((tower) => isTowerRecipeSatisfied(tower, state.elementAllocation))
    .filter((tower) => isTowerLevelLegal(tower.name, 1))
    .map((tower) => Object.freeze({
      towerName: tower.name,
      type: tower.type,
      recipe: Object.freeze([...tower.recipe]),
      initialLevel: 1 as const,
      maxLevel: getTowerLevelCeiling(tower.name),
    }));

  return Object.freeze(candidates);
}

/** Explains an empty candidate set without planning future element purchases. */
export function explainNoLegalNextCandidate(
  state: BuildState,
): NoLegalCandidateReason | null {
  if (state.remainingTowerSlots === 0) {
    return Object.freeze({
      code: "no-remaining-tower-slots",
      message: "All tower slots are in use, so no additional tower can be recommended.",
    });
  }

  if (getLegalNextCandidates(state).length > 0) {
    return null;
  }

  const unlockedCatalogTowers = TOWERS.filter((tower) => (
    isTowerRecipeSatisfied(tower, state.elementAllocation)
    && isTowerLevelLegal(tower.name, 1)
  ));

  if (unlockedCatalogTowers.length === 0) {
    return Object.freeze({
      code: "no-unlocked-catalog-towers",
      message: "Your current element allocation does not unlock another catalog tower. Additional element investment is required before another tower can be recommended.",
    });
  }

  return Object.freeze({
    code: "all-unlocked-towers-selected",
    message: "Every catalog tower unlocked by the current element allocation is already selected. Additional element investment is required to unlock a different next tower.",
  });
}
