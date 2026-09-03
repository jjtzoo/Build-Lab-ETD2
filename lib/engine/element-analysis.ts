import { ELEMENTS } from "@/lib/data";
import { getCatalogTower } from "@/lib/engine/build-state";
import type {
  BuildState,
  ElementAllocation,
  ElementName,
  ElementalComposition,
} from "@/lib/types";

function emptyElementAllocation(): ElementAllocation {
  return Object.fromEntries(ELEMENTS.map((element) => [element, 0])) as ElementAllocation;
}

function isElementName(value: string): value is ElementName {
  return (ELEMENTS as readonly string[]).includes(value);
}

export function deriveElementalComposition(
  state: BuildState,
): ElementalComposition {
  const recipeFootprint = emptyElementAllocation();
  const offensivePresence = emptyElementAllocation();

  for (const selectedTower of state.selectedTowers) {
    const tower = getCatalogTower(selectedTower.towerName);
    for (const element of tower.recipe) {
      recipeFootprint[element] += 1;
    }
    if (isElementName(tower.damage)) {
      offensivePresence[tower.damage] += 1;
    }
  }

  const direction = ELEMENTS
    .map((element, index) => ({ element, footprintCount: recipeFootprint[element], index }))
    .filter((item) => item.footprintCount > 0)
    .sort((left, right) => right.footprintCount - left.footprintCount || left.index - right.index)
    .map(({ element, footprintCount }) => Object.freeze({ element, footprintCount }));

  return Object.freeze({
    recipeFootprint: Object.freeze(recipeFootprint),
    offensivePresence: Object.freeze(offensivePresence),
    direction: Object.freeze(direction),
  });
}
