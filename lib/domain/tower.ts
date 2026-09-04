import type { ElementName } from "./elements";

export type TowerId = string;

export type CombinationClass = "Dual" | "Trio" | "Quad";

export type TowerStats = {
  /**
   * Base attack damage at each tower level.
   *
   * Dual  -> 3 values
   * Trio  -> 2 values
   * Quad  -> 1 value
   */
  damage: readonly number[];

  /**
   * Attacks per second.
   */
  attackSpeed: number;

  /**
   * Tower attack range.
   */
  range: number;

  /**
   * AoE radius.
   * 0 means the basic attack has no AoE.
   */
  aoe: number;
};

type TowerBase = {
  id: TowerId;
  name: string;

  /**
   * Offensive damage element used for elemental matchup calculations.
   */
  damageElement: ElementName;

  stats: TowerStats;
};

export type DualTower = TowerBase & {
  combination: "Dual";
  recipe: readonly [ElementName, ElementName];
  maxLevel: 3;
};

export type TrioTower = TowerBase & {
  combination: "Trio";
  recipe: readonly [ElementName, ElementName, ElementName];
  maxLevel: 2;
};

export type QuadTower = TowerBase & {
  combination: "Quad";
  recipe: readonly [
    ElementName,
    ElementName,
    ElementName,
    ElementName,
  ];
  maxLevel: 1;
};

export type Tower =
  | DualTower
  | TrioTower
  | QuadTower;