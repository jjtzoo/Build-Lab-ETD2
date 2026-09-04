import type { OffensiveAttributes } from "./attributes";
import type { TowerMechanics } from "./mechanicSignals";
import type { CoreRole } from "./roles";
import type { TowerId } from "./tower";

/**
 * Strategic description of a tower.
 *
 * Tower facts such as recipe, stats, element, and max level
 * remain in Tower.
 *
 * This profile describes how the planner understands the tower.
 */
export type TowerProfile = {
  towerId: TowerId;

  /**
   * Core build roles this tower can satisfy.
   *
   * Empty means the tower does not satisfy one of the
   * mandatory core roles.
   */
  coreRoles: readonly CoreRole[];

  /**
   * Offensive characteristics used for coverage analysis.
   *
   * Optional because some pure support towers may not have
   * strategically meaningful damage.
   */
  offense?: OffensiveAttributes;

  /**
   * What the tower provides and what it benefits from.
   * Used later by the synergy engine.
   */
  mechanics: TowerMechanics;
};