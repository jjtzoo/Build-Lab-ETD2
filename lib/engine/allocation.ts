import { ELEMENTS, MECHANICS_BY_TOWER, TOWERS } from "@/lib/data";
import type {
  Allocation,
  Candidate,
  ElementName,
  Tower,
} from "@/lib/types";

/**
 * Maximum legal level for each normal tower combination class.
 *
 * This mirrors the current canonical domain rules:
 *
 * Dual -> Level 3
 * Trio -> Level 2
 * Quad -> Level 1
 *
 * Pure / Mono and Periodic towers are intentionally not handled here yet.
 * Their special Essence access belongs to the dedicated access layer.
 */
function towerLevelCap(tower: Tower): number {
  switch (tower.type) {
    case "Dual":
      return 3;

    case "Trio":
      return 2;

    case "Quad":
      return 1;

    default:
      return 0;
  }
}

/**
 * Returns the allocation depth for one element.
 */
function elementLevel(
  allocation: Allocation,
  element: ElementName,
): number {
  return allocation[ELEMENTS.indexOf(element)];
}

/**
 * Returns the maximum tower level supported by an allocation.
 *
 * The shallowest element in the tower recipe determines its reachable level.
 *
 * Examples:
 *
 * Dual Water + Nature
 *
 * Water 3 / Nature 1 -> Level 1
 * Water 3 / Nature 2 -> Level 2
 * Water 3 / Nature 3 -> Level 3
 *
 * Trio Water + Nature + Fire
 *
 * 2 / 2 / 1 -> Level 1
 * 2 / 2 / 2 -> Level 2
 *
 * Quad
 *
 * Any valid 1 / 1 / 1 / 1 recipe -> Level 1
 */
export function maxReachableTowerLevel(
  tower: Tower,
  allocation: Allocation,
): number {
  if (tower.recipe.length === 0) {
    return 0;
  }

  const recipeDepth = Math.min(
    ...tower.recipe.map((element) =>
      elementLevel(allocation, element),
    ),
  );

  return Math.max(
    0,
    Math.min(recipeDepth, towerLevelCap(tower)),
  );
}

/**
 * Availability and selection are separate.
 *
 * This only answers whether the tower can legally exist at
 * at least Level 1 under the supplied allocation.
 */
export function isTowerAvailable(
  tower: Tower,
  allocation: Allocation,
): boolean {
  return maxReachableTowerLevel(tower, allocation) >= 1;
}

/**
 * Level-aware representation of an available tower.
 *
 * Step 9 should eventually reason with this instead of treating every
 * unlocked tower as equivalent regardless of reachable level.
 */
export type AvailableTower = {
  tower: Tower;
  maxLevel: number;
};

/**
 * Returns every tower available under this allocation together with
 * the maximum level currently reachable for that tower.
 */
export function availableTowers(
  allocation: Allocation,
): AvailableTower[] {
  return TOWERS.flatMap((tower) => {
    const maxLevel = maxReachableTowerLevel(
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
 * Legacy compatibility function.
 *
 * Existing optimizer/API code expects Tower[] rather than level-aware
 * AvailableTower[].
 *
 * Keep this during the Step 9 migration, but new planner logic should
 * prefer availableTowers().
 */
export function unlockedTowers(
  allocation: Allocation,
): Tower[] {
  return availableTowers(allocation).map(
    ({ tower }) => tower,
  );
}

export const MAX_ELEMENT_LEVEL = 3;
export const MAX_KEYSTONES = 11;

export function totalKeystones(
  allocation: Allocation,
): number {
  return allocation.reduce(
    (sum, level) => sum + level,
    0,
  );
}

function allocationKey(
  allocation: Allocation,
): string {
  return allocation.join("-");
}

/**
 * Returns every future allocation reachable from the supplied
 * allocation using normal element keystones.
 *
 * The starting allocation itself is NOT included.
 *
 * Search continues until:
 * - 11 normal keystones are spent, or
 * - no legal +1 continuation exists.
 *
 * Duplicate states are removed because different keystone orders
 * can lead to the same final allocation.
 */
export function reachableAllocations(
  start: Allocation,
): Allocation[] {
  const visited = new Set<string>();
  const reachable: Allocation[] = [];
  const queue: Allocation[] = [
    ...legalNextAllocations(start),
  ];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    const key = allocationKey(current);

    if (visited.has(key)) {
      continue;
    }

    visited.add(key);
    reachable.push(current);

    for (
      const next
      of legalNextAllocations(current)
    ) {
      const nextKey = allocationKey(next);

      if (!visited.has(nextKey)) {
        queue.push(next);
      }
    }
  }

  return reachable;
}

/**
 * Returns every allocation reachable by spending exactly
 * one normal element keystone.
 *
 * Rules:
 * - exactly one element increases by 1
 * - no element may exceed Level 3
 * - total normal keystones may not exceed 11
 *
 * Pure Essence / Periodic Essence access is intentionally
 * outside this normal allocation transition.
 */
export function legalNextAllocations(
  allocation: Allocation,
): Allocation[] {
  if (totalKeystones(allocation) >= MAX_KEYSTONES) {
    return [];
  }

  const next: Allocation[] = [];

  for (let index = 0; index < allocation.length; index++) {
    if (allocation[index] >= MAX_ELEMENT_LEVEL) {
      continue;
    }

    const candidate = [...allocation] as Allocation;
    candidate[index] += 1;

    next.push(candidate);
  }

  return next;
}

/**
 * LEGACY allocation explorer.
 *
 * This currently generates complete 11-keystone allocations.
 *
 * Step 9 will replace this approach with:
 *
 * current allocation
 * -> legal +1 keystone moves
 * -> future reachable states
 *
 * Keep this temporarily because the running /api/optimize path
 * still depends on the legacy optimizer.
 */
export function legalAllocations(
  core: ElementName[],
): Allocation[] {
  const out: Allocation[] = [];

  for (let a = 0; a <= 3; a++) {
    for (let b = 0; b <= 3; b++) {
      for (let c = 0; c <= 3; c++) {
        for (let d = 0; d <= 3; d++) {
          for (let e = 0; e <= 3; e++) {
            for (let f = 0; f <= 3; f++) {
              const allocation: Allocation = [
                a,
                b,
                c,
                d,
                e,
                f,
              ];

              const total = allocation.reduce(
                (sum, value) => sum + value,
                0,
              );

              if (total !== 11) {
                continue;
              }

              const includesCore = core.every(
                (element) =>
                  elementLevel(allocation, element) >= 1,
              );

              if (!includesCore) {
                continue;
              }

              out.push(allocation);
            }
          }
        }
      }
    }
  }

  return out;
}

/**
 * LEGACY heuristic.
 *
 * This remains only so the existing optimizer/API keeps working
 * during the Step 9 migration.
 *
 * Step 9 ranking must eventually use:
 *
 * - legal future allocation paths
 * - tower levels
 * - core-role completion
 * - contextual coverage
 * - Step 8 synergy evidence
 *
 * rather than this heuristic score.
 */
function heuristicScore(
  tower: Tower,
  allocation: Allocation,
): number {
  const level = maxReachableTowerLevel(
    tower,
    allocation,
  );

  const record = MECHANICS_BY_TOWER.get(tower.name);
  const tags = record?.strategic_roles ?? [];

  let score =
    level *
    (tower.type === "Quad"
      ? 4
      : tower.type === "Trio"
        ? 3
        : 2);

  if (tags.includes("Main DPS")) {
    score += 12;
  }

  if (tags.includes("Control")) {
    score += 7;
  }

  if (tags.includes("Coverage")) {
    score += 5;
  }

  if (tags.includes("Support")) {
    score += 3;
  }

  if (tags.includes("Amplification")) {
    score += 8;
  }

  return score;
}

/**
 * LEGACY allocation evaluation.
 *
 * Preserved temporarily for /api/optimize compatibility.
 */
export function evaluateAllocation(
  allocation: Allocation,
): Candidate {
  const unlocked = unlockedTowers(allocation);

  const ranked = unlocked
    .slice()
    .sort(
      (left, right) =>
        heuristicScore(right, allocation) -
        heuristicScore(left, allocation),
    );

  const selected = ranked.slice(
    0,
    Math.min(5, ranked.length),
  );

  const score = selected.reduce(
    (sum, tower) =>
      sum + heuristicScore(tower, allocation),
    0,
  );

  return {
    allocation,
    score,
    activeElements: allocation.filter(Boolean).length,
    unlocked,
    selected,
  };
}

/**
 * LEGACY optimizer entry point.
 *
 * Keep until the Step 9 planner is ready to replace the old
 * allocation explorer.
 */
export function optimize(
  core: ElementName[],
): Candidate[] {
  return legalAllocations(core)
    .map(evaluateAllocation)
    .sort(
      (left, right) =>
        right.score - left.score,
    );
}