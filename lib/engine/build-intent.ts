import type {
  CapabilityKey,
  StrategicProfileKey,
  Tower,
} from "@/lib/types";

export type TowerPriority =
  | "explore"
  | "balanced"
  | "maximum-depth";

export type BuildMode =
  | "normal"
  | "explore";

export type TowerFocus = {
  tower: Tower["name"];
  priority?: TowerPriority;
};

/** UI/API aliases resolve to the canonical StrategicProfileKey before ranking. */
export type IntentProfileInput = StrategicProfileKey
  | "sustained-dps"
  | "aoe-wave-clear"
  | "boss-single-target"
  | "replication-network"
  | "execution-finisher";

export const INTENT_PROFILE_INPUTS = [
  "dot",
  "burst",
  "sustainedDps",
  "sustained-dps",
  "aoeWaveClear",
  "aoe-wave-clear",
  "bossSingleTarget",
  "boss-single-target",
  "control",
  "support",
  "scaling",
  "economy",
  "replicationNetwork",
  "replication-network",
  "isolation",
  "executionFinisher",
  "execution-finisher",
] as const satisfies readonly IntentProfileInput[];

export const INTENT_PROFILE_ALIASES: Readonly<Record<IntentProfileInput, StrategicProfileKey>> = {
  dot: "dot",
  burst: "burst",
  sustainedDps: "sustainedDps",
  "sustained-dps": "sustainedDps",
  aoeWaveClear: "aoeWaveClear",
  "aoe-wave-clear": "aoeWaveClear",
  bossSingleTarget: "bossSingleTarget",
  "boss-single-target": "bossSingleTarget",
  control: "control",
  support: "support",
  scaling: "scaling",
  economy: "economy",
  replicationNetwork: "replicationNetwork",
  "replication-network": "replicationNetwork",
  isolation: "isolation",
  executionFinisher: "executionFinisher",
  "execution-finisher": "executionFinisher",
};

export const INTENT_CAPABILITY_INPUTS = [
  "mainDps",
  "subDps",
  "singleTarget",
  "aoeDps",
  "burst",
  "dot",
  "execute",
  "chain",
  "slow",
  "disable",
  "geometryControl",
  "damageAmp",
  "attackSpeedAmp",
  "areaAmp",
  "range",
  "uptime",
  "attackSpeedScaling",
  "killScaling",
  "slowScaling",
  "densityScaling",
  "replication",
  "economy",
  "isolation",
  "hpManipulation",
  "chainReaction",
  "speedManipulation",
  "network",
  "waveClear",
  "bossSpecialist",
  "globalFinisher",
  "abilityCharge",
] as const satisfies readonly CapabilityKey[];

export type BuildIntent = {
  focusedTowers: TowerFocus[];
  preferredProfiles?: IntentProfileInput[];
  preferredCapabilities?: CapabilityKey[];
  mode: BuildMode;
};
