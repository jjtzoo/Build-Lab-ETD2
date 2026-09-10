import basicData from "@/data/basicTowers.v1.json";
import monoData from "@/data/monoTowers.v1.json";

import type { ElementName } from "./elements";

/**
 * Towers outside the Dual/Trio/Quad recommendation model that the Live
 * Tracker still needs to let a player log: the non-elemental starters
 * (Arrow, Cannon) and the six single-element "mono" towers.
 *
 * The recommendation engine does not touch these — they live here so the
 * tracker can price and gate them without disturbing `towers.v2.json`.
 */

export type BasicTowerId = "arrow" | "cannon";

export type BasicTower = {
  id: BasicTowerId;
  name: string;
  damageType: string;
  cost: number;
  shape: "single-target" | "aoe";
};

export type MonoTowerId =
  | "mono-light"
  | "mono-darkness"
  | "mono-water"
  | "mono-fire"
  | "mono-nature"
  | "mono-earth";

export type MonoTower = {
  id: MonoTowerId;
  name: string;
  element: ElementName;
};

const basicCatalog = basicData as {
  towers: readonly BasicTower[];
};
const monoCatalog = monoData as {
  costsByLevel: readonly number[];
  maxLevel: number;
  towers: readonly MonoTower[];
};

export const BASIC_TOWERS: readonly BasicTower[] = basicCatalog.towers;
export const MONO_TOWERS: readonly MonoTower[] = monoCatalog.towers;
export const MONO_MAX_LEVEL = monoCatalog.maxLevel;
export const MONO_COSTS_BY_LEVEL = monoCatalog.costsByLevel;

const BASIC_BY_ID = new Map(
  BASIC_TOWERS.map((tower) => [tower.id, tower]),
);
const MONO_BY_ID = new Map(
  MONO_TOWERS.map((tower) => [tower.id, tower]),
);
const MONO_BY_ELEMENT = new Map<ElementName, MonoTower>(
  MONO_TOWERS.map((tower) => [tower.element, tower]),
);

export function isBasicTowerId(id: string): id is BasicTowerId {
  return BASIC_BY_ID.has(id as BasicTowerId);
}

export function isMonoTowerId(id: string): id is MonoTowerId {
  return MONO_BY_ID.has(id as MonoTowerId);
}

export function getBasicTower(id: BasicTowerId): BasicTower {
  const tower = BASIC_BY_ID.get(id);
  if (!tower) throw new Error(`Unknown basic tower: ${id}`);
  return tower;
}

export function getMonoTower(id: MonoTowerId): MonoTower {
  const tower = MONO_BY_ID.get(id);
  if (!tower) throw new Error(`Unknown mono tower: ${id}`);
  return tower;
}

export function getMonoTowerForElement(
  element: ElementName,
): MonoTower {
  const tower = MONO_BY_ELEMENT.get(element);
  if (!tower) throw new Error(`No mono tower for element: ${element}`);
  return tower;
}

/** Cumulative gold to field one copy of a mono tower at `level` (1-3). */
export function monoTowerCost(level: number): number {
  const index = Math.max(
    1,
    Math.min(MONO_MAX_LEVEL, Math.round(level)),
  ) - 1;
  return MONO_COSTS_BY_LEVEL[index] ?? 0;
}
