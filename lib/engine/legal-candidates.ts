import { TOWERS } from "@/lib/data";
import {
  getTowerLevelCeiling,
  isTowerLevelLegal,
  isTowerRecipeSatisfied,
} from "@/lib/engine/build-state";
import type { BuildState, LegalNextCandidate } from "@/lib/types";

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
