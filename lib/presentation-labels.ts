import type {
  CapabilityKey,
  RankingComponent,
  StrategicProfileKey,
} from "@/lib/types";

export const STRATEGIC_PROFILE_LABELS: Readonly<Record<StrategicProfileKey, string>> = {
  dot: "Damage over Time",
  burst: "Burst Damage",
  sustainedDps: "Sustained Damage",
  aoeWaveClear: "AoE / Wave Clear",
  bossSingleTarget: "Boss / Single Target",
  control: "Control",
  support: "Support",
  scaling: "Scaling",
  economy: "Economy",
  replicationNetwork: "Replication / Network",
  isolation: "Isolation",
  executionFinisher: "Execution / Finisher",
};

export const CAPABILITY_LABELS: Readonly<Record<CapabilityKey, string>> = {
  mainDps: "Main Damage",
  subDps: "Secondary Damage",
  singleTarget: "Single Target",
  aoeDps: "AoE Damage",
  burst: "Burst Damage",
  dot: "Damage over Time",
  execute: "Execution",
  chain: "Chain",
  slow: "Slow",
  disable: "Disable",
  geometryControl: "Geometry Control",
  damageAmp: "Damage Amplification",
  attackSpeedAmp: "Attack-Speed Amplification",
  areaAmp: "Area Amplification",
  range: "Range",
  uptime: "Uptime",
  attackSpeedScaling: "Attack-Speed Scaling",
  killScaling: "Kill Scaling",
  slowScaling: "Slow Scaling",
  densityScaling: "Density Scaling",
  replication: "Replication",
  economy: "Economy",
  isolation: "Isolation",
  hpManipulation: "HP Manipulation",
  chainReaction: "Chain Reaction",
  speedManipulation: "Speed Manipulation",
  network: "Network",
  waveClear: "Wave Clear",
  bossSpecialist: "Boss Specialist",
  globalFinisher: "Global Finisher",
  abilityCharge: "Ability / Charge",
};

const RANKING_COMPONENT_LABELS: Readonly<Record<RankingComponent, string>> = {
  "vulnerability-relief": "Vulnerability relief",
  "primary-gap-relief": "Primary gap relief",
  "supporting-gap-relief": "Supporting gap relief",
  "strategic-fit": "Strategic fit",
  "capability-improvement": "Capability improvement",
  synergy: "Synergy",
  "element-direction": "Element direction",
  "strategic-option": "Strategic option",
  redundancy: "Redundancy",
  "anti-synergy": "Anti-synergy",
  "new-requirement": "New requirement",
  "opportunity-cost": "Opportunity cost",
  "intent-profile-alignment": "Intent profile alignment",
  "intent-capability-alignment": "Intent capability alignment",
  "focal-tower-support": "Focal tower support",
  "intent-conflict": "Intent conflict",
  "intent-exploration": "Intent exploration",
};

function titleCaseIdentifier(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function labelStrategicProfile(key: StrategicProfileKey): string {
  return STRATEGIC_PROFILE_LABELS[key];
}

export function labelCapability(key: CapabilityKey): string {
  return CAPABILITY_LABELS[key];
}

export function labelRankingComponent(key: RankingComponent): string {
  return RANKING_COMPONENT_LABELS[key];
}

export function labelEngineKey(key: string): string {
  if (key in STRATEGIC_PROFILE_LABELS) {
    return labelStrategicProfile(key as StrategicProfileKey);
  }
  if (key in CAPABILITY_LABELS) {
    return labelCapability(key as CapabilityKey);
  }
  return titleCaseIdentifier(key);
}

/** Replaces canonical identifiers only at the presentation boundary. */
export function humanizeEngineText(text: string): string {
  const labels = Object.fromEntries([
    ...Object.entries(STRATEGIC_PROFILE_LABELS),
    ...Object.entries(CAPABILITY_LABELS),
  ]);
  // Replace complete identifiers in one pass; ordinary prose such as
  // "supported" and "networked" must not be changed by substring matches.
  const identifiers = new RegExp(`\\b(${Object.keys(labels).join("|")})\\b`, "g");
  return text.replace(identifiers, (key) => labels[key]);
}
