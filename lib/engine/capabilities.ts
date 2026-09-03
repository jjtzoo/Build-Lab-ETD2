import {
  MECHANICS_BY_TOWER,
  TOWER_ATTRIBUTE_EVIDENCE_BY_TOWER,
} from "@/lib/data";
import { getCatalogTower } from "@/lib/engine/build-state";
import type {
  BuildCapabilityProfile,
  BuildState,
  CapabilityAggregate,
  CapabilityEvidence,
  CapabilityEvidenceStatus,
  CapabilityKey,
} from "@/lib/types";

export const CAPABILITY_KEYS: readonly CapabilityKey[] = [
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
] as const;

type TagCapability = Readonly<{
  key: CapabilityKey;
  status: Exclude<CapabilityEvidenceStatus, "unknown">;
}>;

const TAG_CAPABILITIES: Readonly<Record<string, readonly TagCapability[]>> = {
  "main dps": [{ key: "mainDps", status: "known" }],
  "sub-dps": [{ key: "subDps", status: "known" }],
  "secondary damage": [{ key: "subDps", status: "partial" }],
  "distributed sub-dps": [{ key: "subDps", status: "partial" }],
  focused: [{ key: "singleTarget", status: "partial" }],
  aoe: [{ key: "aoeDps", status: "known" }],
  "burst/focused": [
    { key: "burst", status: "known" },
    { key: "singleTarget", status: "partial" },
  ],
  "burst/coverage": [{ key: "burst", status: "known" }],
  burst: [{ key: "burst", status: "known" }],
  dot: [{ key: "dot", status: "known" }],
  "dot-like": [{ key: "dot", status: "partial" }],
  execute: [{ key: "execute", status: "known" }],
  "execute-like": [{ key: "execute", status: "partial" }],
  chain: [{ key: "chain", status: "known" }],
  "chain reaction": [{ key: "chainReaction", status: "known" }],
  slow: [{ key: "slow", status: "known" }],
  control: [{ key: "disable", status: "partial" }],
  debuff: [{ key: "disable", status: "partial" }],
  "geometry control": [{ key: "geometryControl", status: "known" }],
  "damage amp": [{ key: "damageAmp", status: "known" }],
  "damage buff": [{ key: "damageAmp", status: "partial" }],
  "attack-speed amp": [{ key: "attackSpeedAmp", status: "known" }],
  "attack speed amp": [{ key: "attackSpeedAmp", status: "known" }],
  "range specialist": [{ key: "range", status: "known" }],
  "range-effective": [{ key: "range", status: "partial" }],
  "attack-speed scaling": [{ key: "attackSpeedScaling", status: "known" }],
  "kill scaling": [{ key: "killScaling", status: "known" }],
  "slow scaling": [{ key: "slowScaling", status: "known" }],
  "density scaling": [{ key: "densityScaling", status: "known" }],
  clone: [{ key: "replication", status: "partial" }],
  economy: [{ key: "economy", status: "known" }],
  "economy/survival": [{ key: "economy", status: "partial" }],
  "isolation specialist": [{ key: "isolation", status: "known" }],
  "hp shave": [{ key: "hpManipulation", status: "partial" }],
  "hp manipulation": [{ key: "hpManipulation", status: "known" }],
  "speed manipulation": [{ key: "speedManipulation", status: "known" }],
  "network/package": [{ key: "network", status: "partial" }],
  "wave clear": [{ key: "waveClear", status: "known" }],
  "boss specialist": [{ key: "bossSpecialist", status: "known" }],
  "global finisher": [{ key: "globalFinisher", status: "known" }],
};

function normalizeTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ");
}

function getKnownTags(towerName: string): readonly string[] {
  getCatalogTower(towerName);
  const record = MECHANICS_BY_TOWER.get(towerName);
  if (!record) {
    return [];
  }
  return [...new Set([
    ...record.strategic_roles,
    ...(record.damage_profile?.tags ?? []),
  ])];
}

function evidenceForTower(towerName: string): readonly CapabilityEvidence[] {
  const evidence: CapabilityEvidence[] = [];
  const attributeEvidence = TOWER_ATTRIBUTE_EVIDENCE_BY_TOWER[towerName];
  if (attributeEvidence) {
    for (const [capability, tier] of Object.entries(attributeEvidence.tiers)) {
      evidence.push(Object.freeze({
        capability: capability as CapabilityKey,
        status: "known",
        source: "attribute-dataset",
        sourceUrl: attributeEvidence.sourceUrl,
        sourceConfidence: attributeEvidence.confidence,
        towerName,
        tier,
      }));
    }
  }
  for (const rawValue of getKnownTags(towerName)) {
    for (const mapping of TAG_CAPABILITIES[normalizeTag(rawValue)] ?? []) {
      evidence.push(Object.freeze({
        capability: mapping.key,
        status: mapping.status,
        source: "mechanics-tag",
        towerName,
        rawValue,
      }));
    }
  }
  return evidence;
}

function aggregateStatus(
  evidence: readonly CapabilityEvidence[],
): CapabilityEvidenceStatus {
  if (evidence.some((item) => item.status === "known")) {
    return "known";
  }
  if (evidence.some((item) => item.status === "partial")) {
    return "partial";
  }
  return "unknown";
}

function strongestTier(
  evidence: readonly CapabilityEvidence[],
): "gold" | "silver" | "bronze" | null {
  const tiers = evidence.flatMap((item) => item.tier ? [item.tier] : []);
  if (tiers.includes("gold")) return "gold";
  if (tiers.includes("silver")) return "silver";
  if (tiers.includes("bronze")) return "bronze";
  return null;
}

export function aggregateBuildCapabilities(
  state: BuildState,
): BuildCapabilityProfile {
  const evidenceByCapability = new Map<CapabilityKey, CapabilityEvidence[]>();
  for (const key of CAPABILITY_KEYS) {
    evidenceByCapability.set(key, []);
  }

  for (const selectedTower of state.selectedTowers) {
    for (const evidence of evidenceForTower(selectedTower.towerName)) {
      evidenceByCapability.get(evidence.capability)?.push(evidence);
    }
  }

  const capabilities = {} as Record<CapabilityKey, CapabilityAggregate>;
  for (const key of CAPABILITY_KEYS) {
    const knownEvidence = evidenceByCapability.get(key) ?? [];
    const evidence = knownEvidence.length > 0
      ? knownEvidence
      : [Object.freeze({
          capability: key,
          status: "unknown" as const,
          source: "mechanics-omission" as const,
        })];
    const supportingTowers = [...new Set(
      knownEvidence.flatMap((item) => item.towerName ? [item.towerName] : []),
    )];

    capabilities[key] = Object.freeze({
      key,
      status: aggregateStatus(evidence),
      strongestTier: strongestTier(evidence),
      supportingTowers: Object.freeze(supportingTowers),
      evidence: Object.freeze(evidence),
    });
  }

  return Object.freeze({ capabilities: Object.freeze(capabilities) });
}
