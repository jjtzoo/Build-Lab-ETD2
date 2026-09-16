import {
  ELEMENTS,
  type ElementAllocation,
  type ElementName,
} from "@/lib/domain/elements";

import type {
  EndGamePackage,
  EndGameTowerAccess,
  EndGameTowerId,
  PureTowerId,
} from "@/lib/domain/endGameTower";

export const TRADITIONAL_NORMAL_ALLOCATION_BUDGET =
  11 as const;
export const TRADITIONAL_END_GAME_ESSENCE_USES =
  2 as const;

/**
 * The wave each essence use actually unlocks, confirmed by the owner:
 * wave 50 grants the first Pure/Periodic essence, wave 55 the second. Index
 * matches the pick order (0 = first pick, 1 = second) — not the boss
 * stage's own start (wave 56), which was only a stated, unmeasured floor
 * the engine assumed before this was confirmed.
 */
export const ESSENCE_LEGAL_WAVE: readonly [number, number] = [50, 55];

const PURE_TOWER_IDS:
  Readonly<Record<
    ElementName,
    PureTowerId
  >> = {
  Light: "pure-light",
  Darkness: "pure-darkness",
  Water: "pure-water",
  Fire: "pure-fire",
  Nature: "pure-nature",
  Earth: "pure-earth",
};

export type EndGameAccessResult = {
  normalAllocationBudget: 11;
  essenceUsesAvailable: 2;
  pureCandidates:
    readonly EndGameTowerAccess[];
  periodicCandidate:
    EndGameTowerAccess | null;
  candidates:
    readonly EndGameTowerAccess[];
};

/**
 * Resolves the special-tower layer from normal element allocation only.
 * Quad availability and selected normal tower IDs are intentionally not
 * inputs and therefore cannot affect Pure or Periodic access.
 */
export function evaluateEndGameAccess(
  allocation: ElementAllocation,
): EndGameAccessResult {
  const pureCandidates =
    ELEMENTS
      .filter((element) =>
        allocation[element] >= 3,
      )
      .map((element) => ({
        towerId:
          PURE_TOWER_IDS[element],
        kind: "Pure" as const,
        element,
        requiredEssenceUses: 1 as const,
      }));

  const periodicCandidate =
    ELEMENTS.every((element) =>
      allocation[element] >= 1,
    )
      ? {
          towerId:
            "periodic" as const,
          kind: "Periodic" as const,
          element:
            "Composite" as const,
          requiredEssenceUses:
            1 as const,
        }
      : null;

  return {
    normalAllocationBudget:
      TRADITIONAL_NORMAL_ALLOCATION_BUDGET,
    essenceUsesAvailable:
      TRADITIONAL_END_GAME_ESSENCE_USES,
    pureCandidates,
    periodicCandidate,
    candidates: [
      ...pureCandidates,
      ...(periodicCandidate
        ? [periodicCandidate]
        : []),
    ],
  };
}

function packageFromIds(
  towerIds:
    readonly EndGameTowerId[],
): EndGamePackage {
  const quantities =
    new Map<EndGameTowerId, number>();

  for (const towerId of towerIds) {
    quantities.set(
      towerId,
      (quantities.get(towerId) ?? 0) + 1,
    );
  }

  return {
    selections:
      [...quantities]
        .sort(([a], [b]) =>
          a.localeCompare(b),
        )
        .map(
          ([towerId, quantity]) => ({
            towerId,
            quantity,
          }),
        ),
    totalEssenceUses:
      towerIds.length,
  };
}

/**
 * Enumerates complete legal two-use multisets. Repeated Pure or Periodic
 * selections are represented with quantity rather than duplicate normal
 * tower IDs.
 */
export function enumerateEndGamePackages(
  access: EndGameAccessResult,
): readonly EndGamePackage[] {
  const ids = access.candidates
    .map((candidate) =>
      candidate.towerId,
    )
    .sort();
  const packages: EndGamePackage[] = [];

  for (
    let left = 0;
    left < ids.length;
    left += 1
  ) {
    for (
      let right = left;
      right < ids.length;
      right += 1
    ) {
      packages.push(
        packageFromIds([
          ids[left],
          ids[right],
        ]),
      );
    }
  }

  return packages;
}
