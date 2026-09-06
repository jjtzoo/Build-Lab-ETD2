import {
  ELEMENTS,
  type ElementAllocation,
} from "@/lib/domain/elements";

import type { Tower } from "@/lib/domain/tower";

import {
  TOWERS,
} from "@/lib/domain/towerCatalog";

export const MAX_ELEMENT_LEVEL = 3;
export const MAX_KEYSTONES = 11;

export type AvailableTower = {
  tower: Tower;
  maxLevel: number;
};

/**
 * Returns the maximum normal level of a tower supported
 * by the supplied element allocation.
 *
 * The shallowest recipe element determines the reachable
 * tower level, capped by the tower's canonical maxLevel.
 *
 * Examples:
 *
 * Dual:
 * 1-1 -> L1
 * 2-2 -> L2
 * 3-3 -> L3
 *
 * Trio:
 * 1-1-1 -> L1
 * 2-2-2 -> L2
 *
 * Quad:
 * 1-1-1-1 -> L1
 *
 * Pure Essence and Periodic access are intentionally
 * outside this normal combination-class calculation.
 */
export function maxReachableTowerLevel(
  tower: Tower,
  allocation: ElementAllocation,
): number {
  const recipeDepth = Math.min(
    ...tower.recipe.map(
      (element) => allocation[element],
    ),
  );

  return Math.max(
    0,
    Math.min(
      recipeDepth,
      tower.maxLevel,
    ),
  );
}

/**
 * True when the tower can legally exist at at least Level 1.
 *
 * Availability is not selection.
 */
export function isTowerAvailable(
  tower: Tower,
  allocation: ElementAllocation,
): boolean {
  return (
    maxReachableTowerLevel(
      tower,
      allocation,
    ) >= 1
  );
}

/**
 * Returns all currently available towers together
 * with their maximum reachable level.
 */
export function availableTowers(
  allocation: ElementAllocation,
): AvailableTower[] {
  return TOWERS.flatMap((tower) => {
    const maxLevel =
      maxReachableTowerLevel(
        tower,
        allocation,
      );

    if (maxLevel === 0) {
      return [];
    }

    return [
      {
        tower,
        maxLevel,
      },
    ];
  });
}

/**
 * Counts normal element keystones.
 *
 * Essence / Pure Essence are not represented here.
 */
export function totalKeystones(
  allocation: ElementAllocation,
): number {
  return ELEMENTS.reduce(
    (sum, element) =>
      sum + allocation[element],
    0,
  );
}

/**
 * Returns every allocation reachable by spending
 * exactly one normal element keystone.
 *
 * Rules:
 * - exactly one element increases by 1
 * - no element exceeds Level 3
 * - no more than 11 normal keystones are spent
 *
 * Pure / Periodic access remains separate.
 */
export function legalNextAllocations(
  allocation: ElementAllocation,
): ElementAllocation[] {
  if (
    totalKeystones(allocation) >=
    MAX_KEYSTONES
  ) {
    return [];
  }

  const next: ElementAllocation[] = [];

  for (const element of ELEMENTS) {
    if (
      allocation[element] >=
      MAX_ELEMENT_LEVEL
    ) {
      continue;
    }

    next.push({
      ...allocation,
      [element]:
        allocation[element] + 1,
    });
  }

  return next;
}

/**
 * Stable identity for an allocation state.
 */
function allocationKey(
  allocation: ElementAllocation,
): string {
  return ELEMENTS
    .map(
      (element) =>
        allocation[element],
    )
    .join("-");
}

/**
 * Returns every future allocation reachable from
 * the supplied state using normal element keystones.
 *
 * The starting allocation itself is not returned.
 *
 * Different keystone orders can reach the same state,
 * so duplicate allocations are removed.
 */
export function reachableAllocations(
  start: ElementAllocation,
): ElementAllocation[] {
  const visited = new Set<string>();
  const reachable: ElementAllocation[] = [];

  const queue: ElementAllocation[] = [
    ...legalNextAllocations(start),
  ];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    const key =
      allocationKey(current);

    if (visited.has(key)) {
      continue;
    }

    visited.add(key);
    reachable.push(current);

    for (
      const next
      of legalNextAllocations(current)
    ) {
      const nextKey =
        allocationKey(next);

      if (!visited.has(nextKey)) {
        queue.push(next);
      }
    }
  }

  return reachable;
}