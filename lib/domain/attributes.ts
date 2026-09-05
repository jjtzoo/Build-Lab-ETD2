import type { ElementName } from "./elements";

export type DamageShape =
  | "single-target"
  | "aoe"
  | "hybrid";

export type DamageProfile =
  | "burst"
  | "sustained"
  | "dot"
  | "ramp"
  | "execute";

export type DamageDelivery =
  | "basic-attack"
  | "fixed-cooldown"
  | "attack-count"
  | "triggered"
  | "periodic";

export type OffensiveAttributes = {
  damageShape: DamageShape;
  damageProfile: DamageProfile;
  damageDelivery: DamageDelivery;
  offensiveElement: ElementName;

  scalingTriggers?: readonly ScalingTriggerMechanic[];
};

export type ScalingTriggerMechanic =
  | "slow-scaling"
  | "kill-scaling"
  | "distance-scaling"
  | "attack-scaling"
  | "hp-scaling"
  | "density-scaling"
  | "gold-scaling"  
  | "duration-scaling"  
  | "network-scaling";