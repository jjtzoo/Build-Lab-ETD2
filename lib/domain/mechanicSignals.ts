export const MECHANIC_SIGNALS = [
  // Enemy state
  "enemy-slow",
  "enemy-stun",
  "enemy-stasis",
  "damage-taken-amp",
  "current-hp-removal",

  // Tower enhancement
  "attack-damage-buff",
  "attack-speed-buff",
  "tower-replication",

  // Combat events / damage interaction
  "kill-generation",
  "nearby-enemy-death",
  "damage-echo",

  // Position / geometry
  "target-isolation",
  "enemy-grouping",
  "enemy-displacement",
  "path-distance",
] as const;

export type MechanicSignal =
  (typeof MECHANIC_SIGNALS)[number];

/**
 * How important or powerful a mechanic is
 * for a specific tower.
 *
 * 1 = Minor
 * 2 = Meaningful
 * 3 = Strong
 * 4 = Defining
 */
export type MechanicStrength = 1 | 2 | 3 | 4;

/**
 * Describes how a tower benefits from additional
 * sources of the same mechanic.
 */
export type SaturationMode =
  | "single"
  | "diminishing"
  | "repeatable";

/**
 * A mechanic or condition that a tower creates.
 */
export type MechanicSupply = {
  signal: MechanicSignal;
  strength: MechanicStrength;
};

/**
 * A mechanic or condition that improves another tower.
 */
export type MechanicDemand = {
  signal: MechanicSignal;
  strength: MechanicStrength;
  saturation: SaturationMode;
};

/**
 * Mechanical interaction profile of a tower.
 *
 * provides = what this tower creates
 * consumes = what this tower benefits from
 */
export type TowerMechanics = {
  provides: readonly MechanicSupply[];
  consumes: readonly MechanicDemand[];
};

/**
 * Describes how one mechanic can produce
 * or contribute to another mechanic.
 */
export type MechanicRelationshipType =
  | "direct"
  | "derived"
  | "conditional";

export type MechanicRelationshipCondition =
  | "deaths-within-consumer-trigger-area"
  | "replication-applicable";

/**
 * Whether a required condition holds in the evaluated context.
 * Missing information must remain unknown.
 */
export type MechanicConditionState =
  | "met"
  | "unmet"
  | "unknown";

/**
 * Conditions are evaluated for a specific provider and consumer.
 * One provider may satisfy a condition for one consumer
 * while failing it for another.
 */
export type MechanicConditionEvaluation = {
  providerTowerId: string;
  consumerTowerId: string;
  condition: MechanicRelationshipCondition;
  state: MechanicConditionState;
};

export type MechanicRelationship = {
  from: MechanicSignal;
  to: MechanicSignal;
  type: MechanicRelationshipType;

  /**
   * Every listed condition must hold for the relationship
   * to apply. An empty array means no additional conditions.
   *
   * Declaring a condition does not establish that it is met.
   */
  conditions: readonly MechanicRelationshipCondition[];
};