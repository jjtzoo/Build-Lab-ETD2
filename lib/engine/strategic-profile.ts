import { CAPABILITY_KEYS } from "@/lib/engine/capabilities";
import type {
  AttributeTier,
  BuildCapabilityProfile,
  CapabilityEvidence,
  CapabilityEvidenceStatus,
  CapabilityKey,
  StrategicProfile,
  StrategicProfileKey,
} from "@/lib/types";

type StrategicProfileDefinition = Readonly<{
  key: StrategicProfileKey;
  capabilities: readonly CapabilityKey[];
  rationale: string;
}>;

const PROFILE_DEFINITIONS: readonly StrategicProfileDefinition[] = [
  { key: "dot", capabilities: ["dot"], rationale: "Damage-over-time evidence indicates a persistent-damage direction." },
  { key: "burst", capabilities: ["burst"], rationale: "Burst evidence indicates immediate-damage windows are part of the build." },
  { key: "sustainedDps", capabilities: ["dot", "uptime", "attackSpeedScaling"], rationale: "Persistent damage, uptime, or attack-speed scaling evidence supports sustained damage." },
  { key: "aoeWaveClear", capabilities: ["aoeDps", "waveClear", "chainReaction", "densityScaling"], rationale: "Area, wave-clear, reaction, or density evidence supports multi-target pressure." },
  { key: "bossSingleTarget", capabilities: ["singleTarget", "bossSpecialist"], rationale: "Focused or boss-specialist evidence supports priority-target pressure." },
  { key: "control", capabilities: ["slow", "disable", "geometryControl"], rationale: "Slow, disable, or geometry-control evidence indicates a control package." },
  { key: "support", capabilities: ["damageAmp", "attackSpeedAmp", "areaAmp"], rationale: "Amplification evidence indicates a support/enabler package." },
  { key: "scaling", capabilities: ["attackSpeedScaling", "killScaling", "slowScaling", "densityScaling"], rationale: "Scaling evidence indicates performance that improves with a strategic condition." },
  { key: "economy", capabilities: ["economy"], rationale: "Economy evidence indicates an economy-linked build direction." },
  { key: "replicationNetwork", capabilities: ["replication", "network"], rationale: "Replication or network evidence indicates an architecture-dependent package." },
  { key: "isolation", capabilities: ["isolation"], rationale: "Isolation evidence indicates target-spacing or isolation-sensitive value." },
  { key: "executionFinisher", capabilities: ["execute", "globalFinisher", "abilityCharge"], rationale: "Execution, finisher, or charge evidence indicates a finishing package." },
];

function strongestTier(tiers: readonly (AttributeTier | null)[]): AttributeTier | null {
  if (tiers.includes("gold")) return "gold";
  if (tiers.includes("silver")) return "silver";
  if (tiers.includes("bronze")) return "bronze";
  return null;
}

function profileConfidence(
  evidence: readonly CapabilityEvidence[],
): CapabilityEvidenceStatus {
  if (evidence.some((item) => item.status === "known")) return "known";
  if (evidence.some((item) => item.status === "partial")) return "partial";
  return "unknown";
}

export function deriveStrategicProfiles(
  capabilities: BuildCapabilityProfile,
): readonly StrategicProfile[] {
  const profiles = PROFILE_DEFINITIONS.flatMap((definition) => {
    const supported = definition.capabilities.filter((key) => (
      capabilities.capabilities[key].status !== "unknown"
    ));
    if (supported.length === 0) return [];

    const evidence = supported.flatMap((key) => capabilities.capabilities[key].evidence)
      .filter((item) => item.source !== "mechanics-omission");
    const profile: StrategicProfile = Object.freeze({
      key: definition.key,
      strongestTier: strongestTier(supported.map((key) => capabilities.capabilities[key].strongestTier)),
      confidence: profileConfidence(evidence),
      supportingCapabilities: Object.freeze(supported),
      evidence: Object.freeze(evidence),
      rationale: definition.rationale,
    });
    return [profile];
  });

  return Object.freeze(profiles);
}

export function allCapabilityKeys(): readonly CapabilityKey[] {
  return CAPABILITY_KEYS;
}
