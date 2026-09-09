import type {
  DamageDelivery,
  DamageProfile,
  DamageShape,
  ScalingTriggerMechanic,
} from "./attributes";

/**
 * Human-readable labels for the canonical offensive attribute enums.
 * Display-only — the engine reasons about the raw values.
 */

export const DAMAGE_SHAPE_LABEL: Record<DamageShape, string> = {
  "single-target": "Single target",
  aoe: "Area damage",
  hybrid: "Hybrid",
};

export const DAMAGE_PROFILE_LABEL: Record<DamageProfile, string> = {
  burst: "Burst",
  sustained: "Sustained",
  dot: "Damage over time",
  ramp: "Ramping",
  execute: "Execute",
};

export const DAMAGE_DELIVERY_LABEL: Record<DamageDelivery, string> = {
  "basic-attack": "Basic attack",
  "fixed-cooldown": "Fixed cooldown",
  "attack-count": "Attack count",
  triggered: "Triggered",
  periodic: "Periodic",
};

export const SCALING_TRIGGER_LABEL: Record<ScalingTriggerMechanic, string> = {
  "slow-scaling": "Scales with slow",
  "kill-scaling": "Scales with kills",
  "distance-scaling": "Scales with distance",
  "attack-scaling": "Scales with attack count",
  "hp-scaling": "Scales with enemy HP",
  "density-scaling": "Scales with wave density",
  "gold-scaling": "Scales with gold",
  "duration-scaling": "Scales with duration",
  "network-scaling": "Scales with the network",
};
