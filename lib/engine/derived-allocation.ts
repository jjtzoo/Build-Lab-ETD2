import { ELEMENTS, TOWERS } from "@/lib/data";
import type {
  ElementAllocation,
  ElementName,
  SelectedTower,
} from "@/lib/types";

export function emptyElementAllocation(): ElementAllocation {
  return Object.fromEntries(
    ELEMENTS.map((element) => [element, 0]),
  ) as ElementAllocation;
}

export function deriveMinimumElementAllocation(
  selectedTowers: readonly SelectedTower[],
): ElementAllocation {
  const allocation = emptyElementAllocation();

  for (const selected of selectedTowers) {
    const tower = TOWERS.find(
      (candidate) => candidate.name === selected.towerName,
    );

    if (!tower) {
      continue;
    }

    for (const element of tower.recipe) {
      /*
       * Element depth must at least support the selected tower level.
       *
       * Dual L1 -> both elements >= 1
       * Dual L2 -> both elements >= 2
       * Dual L3 -> both elements >= 3
       *
       * Trio follows the same relationship up to L2.
       * Quad is only L1.
       */
      allocation[element as ElementName] = Math.max(
        allocation[element as ElementName],
        selected.level,
      );
    }
  }

  return allocation;
}

/**
 * Combines the allocation required by selected towers with optional player
 * investment. A manual value can add to the build, but can never make the
 * effective state invalid for an already selected tower.
 */
export function deriveEffectiveElementAllocation(
  required: Readonly<ElementAllocation>,
  manual: Readonly<ElementAllocation>,
): ElementAllocation {
  return Object.fromEntries(
    ELEMENTS.map((element) => [element, Math.max(required[element], manual[element])]),
  ) as ElementAllocation;
}
