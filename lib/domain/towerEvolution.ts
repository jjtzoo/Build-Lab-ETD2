import type { ElementName } from "./elements";
import type { TowerId } from "./tower";
import { TOWERS, getTower } from "./towerCatalog";
import {
  BASIC_TOWERS,
  MONO_MAX_LEVEL,
  MONO_TOWERS,
  getBasicTower,
  getMonoTower,
  isBasicTowerId,
  isMonoTowerId,
  monoTowerCost,
} from "./auxiliaryTowers";
import { resolveNormalTowerCost } from "./towerEconomics";

/**
 * Tower evolution — upgrading a tower you already own into a bigger one
 * that contains it, rather than paying to field the bigger one outright.
 *
 * The whole tree falls out of the recipes: a tower evolves into anything
 * whose recipe is a superset of its own. Nothing here is hand-recorded,
 * which is why it can't drift out of step with the catalog. Verified
 * against the in-game Tower Table: Vapor (Water+Fire) offers exactly the
 * four Trios and six Quads containing both elements, and Haste
 * (Water+Fire+Earth) exactly the three Quads containing all three.
 *
 * Evolving carries the level across, and is only legal when that level
 * fits inside the target's own ceiling — a Dual III can't become a Trio
 * (max II), a Trio II can't become a Quad (max I), and a mono at Pure
 * Essence has outgrown every Dual. Each of those is the same rule, not a
 * special case.
 */

export type EvolutionStep = {
  towerId: TowerId;
  /** Level the evolved tower arrives at — the same one it came in with. */
  level: number;
};

/**
 * Arrow and Cannon are the root of the tree, and the one case the recipe
 * rule can't express: having no elements at all, they'd read as a subset
 * of every tower. In the game they seed a Level 1 element tower and then
 * follow that tower's path, so they're handled explicitly.
 */
function basicTowerTargets(level: number): EvolutionStep[] {
  if (level !== 1) return [];
  return MONO_TOWERS.map((mono) => ({
    towerId: mono.id as TowerId,
    level: 1,
  }));
}

/** The elements a tower is made of: its recipe, or a mono's single element. */
export function towerElements(
  towerId: TowerId,
): readonly ElementName[] {
  if (isMonoTowerId(towerId)) {
    return [getMonoTower(towerId).element];
  }
  return getTower(towerId).recipe;
}

function maxLevelOf(towerId: TowerId): number {
  return isMonoTowerId(towerId)
    ? MONO_MAX_LEVEL
    : getTower(towerId).maxLevel;
}

function isSupersetOf(
  inner: readonly ElementName[],
  outer: readonly ElementName[],
): boolean {
  return inner.every((element) => outer.includes(element));
}

/**
 * What `towerId` at `level` can be upgraded into.
 *
 * Only one step out — a Dual lists Trios and Quads it feeds, but the
 * route through an intermediate is the caller's to walk.
 */
export function evolutionTargets(
  towerId: TowerId,
  level: number,
): EvolutionStep[] {
  if (isBasicTowerId(towerId)) return basicTowerTargets(level);

  const from = towerElements(towerId);

  return TOWERS.filter(
    (candidate) =>
      candidate.recipe.length > from.length &&
      isSupersetOf(from, candidate.recipe) &&
      level <= candidate.maxLevel,
  ).map((candidate) => ({ towerId: candidate.id, level }));
}

/**
 * The reverse: everything that could be grown into `towerId` at `level`,
 * including monos. This is the capital-efficient route into an expensive
 * tower — field something cheap that earns while you save, then evolve
 * it rather than paying the full price outright.
 */
export function evolutionSources(
  towerId: TowerId,
  level: number,
): EvolutionStep[] {
  if (isBasicTowerId(towerId)) return [];
  if (level > maxLevelOf(towerId)) return [];

  // A mono at Level 1 is what a starter tower grows into.
  if (isMonoTowerId(towerId)) {
    return level === 1
      ? BASIC_TOWERS.map((basic) => ({
          towerId: basic.id as TowerId,
          level: 1,
        }))
      : [];
  }

  const target = towerElements(towerId);

  const monos = MONO_TOWERS.filter(
    (mono) =>
      target.includes(mono.element) &&
      target.length > 1 &&
      level <= MONO_MAX_LEVEL,
  ).map((mono) => ({ towerId: mono.id as TowerId, level }));

  const normals = TOWERS.filter(
    (candidate) =>
      candidate.recipe.length < target.length &&
      isSupersetOf(candidate.recipe, target) &&
      level <= candidate.maxLevel,
  ).map((candidate) => ({ towerId: candidate.id, level }));

  return [...monos, ...normals];
}

/** Whether one tower can be upgraded straight into another at `level`. */
export function canEvolveInto(
  fromTowerId: TowerId,
  toTowerId: TowerId,
  level: number,
): boolean {
  return evolutionTargets(fromTowerId, level).some(
    (step) => step.towerId === toTowerId,
  );
}

/** Gold already sunk into a tower standing at `level`. */
export function fieldedCost(
  towerId: TowerId,
  level: number,
): number {
  if (isBasicTowerId(towerId)) return getBasicTower(towerId).cost;
  if (isMonoTowerId(towerId)) return monoTowerCost(level);
  return resolveNormalTowerCost(towerId, level).minimumFieldCost;
}

/**
 * Gold to turn a tower you already own into another one.
 *
 * Evolving deducts what was already spent, so the running total to reach
 * any tower is the same whichever route got there. That makes growing
 * into an expensive anchor never more costly than saving for it outright
 * — and better in practice, since the cheap precursor is defending and
 * earning the whole time instead of leaving the field empty. A Trio II
 * costs 5,000 either way, but the mono route puts a tower up for 175.
 */
export function evolutionCost(
  from: EvolutionStep,
  to: EvolutionStep,
): number {
  return Math.max(
    0,
    fieldedCost(to.towerId, to.level) -
      fieldedCost(from.towerId, from.level),
  );
}
