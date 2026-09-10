import {
  ELEMENTS,
  type ElementAllocation,
  type ElementName,
} from "@/lib/domain/elements";

import type { Tower, TowerId } from "@/lib/domain/tower";

import { getTower } from "@/lib/domain/towerCatalog";

import {
  MAX_ELEMENT_LEVEL,
  MAX_KEYSTONES,
  totalKeystones,
} from "@/lib/engine/allocation";

/**
 * A tower the player has placed in a hand-built ("theory craft") build,
 * together with the level they want it at.
 *
 * Element keystones in Element TD 2 are a threshold the player holds, not
 * a per-tower cost: fielding a Water/Fire tower at Level 3 means holding
 * Water 3 and Fire 3, and any number of other towers that need Water <= 3
 * / Fire <= 3 come free. So a build's allocation is the element-wise
 * maximum level demanded by its towers, and the keystone total is the sum
 * of those maxima — capped at {@link MAX_KEYSTONES}.
 */
export type PlacedTower = {
  towerId: TowerId;
  level: number;
};

export function emptyAllocation(): ElementAllocation {
  return {
    Light: 0,
    Darkness: 0,
    Water: 0,
    Fire: 0,
    Nature: 0,
    Earth: 0,
  };
}

/**
 * Raises every recipe element of `tower` to at least `level`, returning a
 * new allocation. Elements already held at or above `level` are untouched
 * (reuse is free).
 */
export function mergeAllocation(
  base: ElementAllocation,
  recipe: readonly ElementName[],
  level: number,
): ElementAllocation {
  const next = { ...base };
  for (const element of recipe) {
    next[element] = Math.max(next[element], level);
  }
  return next;
}

/**
 * The element allocation implied by a set of placed towers: for each
 * element, the deepest level any placed tower needs it at.
 */
export function deriveAllocation(
  placed: readonly PlacedTower[],
): ElementAllocation {
  let allocation = emptyAllocation();
  for (const entry of placed) {
    const tower = getTower(entry.towerId);
    allocation = mergeAllocation(
      allocation,
      tower.recipe,
      entry.level,
    );
  }
  return allocation;
}

/**
 * True when an allocation is legally holdable: no element past Level 3 and
 * no more than 11 normal keystones spent in total.
 */
export function fitsBudget(
  allocation: ElementAllocation,
): boolean {
  if (
    ELEMENTS.some(
      (element) =>
        allocation[element] > MAX_ELEMENT_LEVEL,
    )
  ) {
    return false;
  }
  return totalKeystones(allocation) <= MAX_KEYSTONES;
}

/**
 * The highest level `tower` can be placed at on top of `base` without
 * breaking the keystone budget, or 0 if it cannot be added at all.
 *
 * `base` is the allocation of every OTHER placed tower — exclude the slot
 * being filled so re-picking a tower does not test against its own
 * previous contribution.
 */
export function maxFittingLevel(
  tower: Tower,
  base: ElementAllocation,
): number {
  for (
    let level = tower.maxLevel;
    level >= 1;
    level -= 1
  ) {
    if (
      fitsBudget(
        mergeAllocation(base, tower.recipe, level),
      )
    ) {
      return level;
    }
  }
  return 0;
}

/**
 * Extra keystones spent by adding `tower` at `level` on top of `base`
 * (0 when every recipe element is already held that deep).
 */
export function keystoneCost(
  tower: Tower,
  base: ElementAllocation,
  level: number,
): number {
  return (
    totalKeystones(
      mergeAllocation(base, tower.recipe, level),
    ) - totalKeystones(base)
  );
}

export { MAX_KEYSTONES, MAX_ELEMENT_LEVEL, totalKeystones };
