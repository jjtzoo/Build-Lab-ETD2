import { allCapabilityKeys } from "@/lib/engine/strategic-profile";
import type {
  BuildCapabilityProfile,
  CapabilityGap,
  CapabilityGapStatus,
  CapabilityKey,
  CapabilityRequirement,
  CapabilityEvidenceStatus,
  RequirementRelevance,
  StrategicProfile,
  StrategicProfileKey,
} from "@/lib/types";

type RequirementDefinition = Readonly<{
  capability: CapabilityKey;
  relevance: RequirementRelevance;
  rationale: string;
}>;

const REQUIREMENTS_BY_PROFILE: Readonly<
  Record<StrategicProfileKey, readonly RequirementDefinition[]>
> = {
  dot: [
    { capability: "uptime", relevance: "primary", rationale: "Persistent damage depends on reliable application time." },
    { capability: "range", relevance: "primary", rationale: "Persistent damage benefits from safe target access." },
    { capability: "slow", relevance: "supporting", rationale: "Slow can extend application time." },
    { capability: "disable", relevance: "supporting", rationale: "Control can extend application time." },
    { capability: "aoeDps", relevance: "supporting", rationale: "Area coverage helps persistent damage reach more targets." },
  ],
  burst: [
    { capability: "burst", relevance: "primary", rationale: "Burst-oriented builds depend on immediate damage windows." },
    { capability: "singleTarget", relevance: "supporting", rationale: "Focused pressure can improve burst target priority." },
  ],
  sustainedDps: [
    { capability: "uptime", relevance: "primary", rationale: "Sustained damage depends on maintaining application time." },
    { capability: "range", relevance: "supporting", rationale: "Range can preserve sustained damage access." },
  ],
  aoeWaveClear: [
    { capability: "aoeDps", relevance: "primary", rationale: "Wave-oriented builds depend on multi-target damage." },
    { capability: "waveClear", relevance: "primary", rationale: "Wave-clear packages value reliable broad removal." },
    { capability: "densityScaling", relevance: "supporting", rationale: "Dense waves can improve area package value." },
    { capability: "chainReaction", relevance: "supporting", rationale: "Reaction mechanics can extend wave coverage." },
  ],
  bossSingleTarget: [
    { capability: "singleTarget", relevance: "primary", rationale: "Boss-oriented packages need focused target pressure." },
    { capability: "damageAmp", relevance: "supporting", rationale: "Amplification can improve priority-target pressure." },
    { capability: "uptime", relevance: "supporting", rationale: "Focused pressure benefits from reliable uptime." },
  ],
  control: [
    { capability: "slow", relevance: "primary", rationale: "Control packages value slow when it is the evidenced control form." },
    { capability: "disable", relevance: "supporting", rationale: "Disable can complement a control package." },
    { capability: "geometryControl", relevance: "supporting", rationale: "Geometry effects can complement a control package." },
  ],
  support: [
    { capability: "damageAmp", relevance: "primary", rationale: "Support packages depend on their validated amplification." },
    { capability: "attackSpeedAmp", relevance: "primary", rationale: "Support packages depend on their validated amplification." },
    { capability: "areaAmp", relevance: "supporting", rationale: "Area amplification can complement a support package." },
  ],
  scaling: [
    { capability: "attackSpeedScaling", relevance: "primary", rationale: "Scaling packages value their supported scaling condition." },
    { capability: "killScaling", relevance: "primary", rationale: "Scaling packages value their supported scaling condition." },
    { capability: "slowScaling", relevance: "primary", rationale: "Scaling packages value their supported scaling condition." },
    { capability: "densityScaling", relevance: "primary", rationale: "Scaling packages value their supported scaling condition." },
  ],
  economy: [
    { capability: "economy", relevance: "primary", rationale: "Economy-oriented builds depend on their economy mechanic." },
  ],
  replicationNetwork: [
    { capability: "replication", relevance: "primary", rationale: "Replication packages depend on replication evidence." },
    { capability: "network", relevance: "primary", rationale: "Network packages depend on network evidence." },
  ],
  isolation: [
    { capability: "isolation", relevance: "primary", rationale: "Isolation-sensitive builds depend on target-spacing conditions." },
  ],
  executionFinisher: [
    { capability: "execute", relevance: "primary", rationale: "Finisher packages value execution evidence." },
    { capability: "globalFinisher", relevance: "primary", rationale: "Finisher packages value global-finisher evidence." },
    { capability: "abilityCharge", relevance: "supporting", rationale: "Charge mechanics can support a finishing package." },
  ],
};

function highestConfidence(
  confidences: readonly CapabilityEvidenceStatus[],
): CapabilityEvidenceStatus {
  if (confidences.includes("known")) return "known";
  if (confidences.includes("partial")) return "partial";
  return "unknown";
}

export function deriveRequirements(
  profiles: readonly StrategicProfile[],
): readonly CapabilityRequirement[] {
  const requirements = new Map<CapabilityKey, {
    relevance: RequirementRelevance;
    sourceProfiles: StrategicProfile[];
    rationales: string[];
  }>();

  for (const profile of profiles) {
    for (const definition of REQUIREMENTS_BY_PROFILE[profile.key]) {
      const existing = requirements.get(definition.capability);
      if (existing) {
        existing.relevance = existing.relevance === "primary" || definition.relevance === "primary"
          ? "primary"
          : "supporting";
        existing.sourceProfiles.push(profile);
        existing.rationales.push(definition.rationale);
      } else {
        requirements.set(definition.capability, {
          relevance: definition.relevance,
          sourceProfiles: [profile],
          rationales: [definition.rationale],
        });
      }
    }
  }

  return Object.freeze([...requirements.entries()].map(([capability, requirement]) => Object.freeze({
    capability,
    relevance: requirement.relevance,
    sourceProfiles: Object.freeze([...new Set(requirement.sourceProfiles.map((profile) => profile.key))]),
    confidence: highestConfidence(requirement.sourceProfiles.map((profile) => profile.confidence)),
    rationale: [...new Set(requirement.rationales)].join(" "),
  })));
}

function gapStatusForRequirement(
  requirement: CapabilityRequirement,
  capabilities: BuildCapabilityProfile,
): CapabilityGapStatus {
  const capability = capabilities.capabilities[requirement.capability];
  if (requirement.confidence === "unknown" || capability.status === "unknown" || !capability.strongestTier) {
    return "unknown";
  }
  if (capability.strongestTier === "gold") return "strong";
  if (capability.strongestTier === "silver") return "adequate";
  return requirement.relevance === "primary" ? "deficient" : "adequate";
}

export function deriveCapabilityGaps(
  capabilities: BuildCapabilityProfile,
  requirements: readonly CapabilityRequirement[],
): readonly CapabilityGap[] {
  const requirementsByCapability = new Map(
    requirements.map((requirement) => [requirement.capability, requirement]),
  );

  return Object.freeze(allCapabilityKeys().map((capability) => {
    const requirement = requirementsByCapability.get(capability) ?? null;
    if (!requirement) {
      return Object.freeze({
        capability,
        requirement: null,
        status: "low-relevance" as const,
        rationale: "No current strategic profile makes this capability a requirement.",
      });
    }

    const status = gapStatusForRequirement(requirement, capabilities);
    return Object.freeze({
      capability,
      requirement,
      status,
      rationale: status === "unknown"
        ? "Available evidence cannot establish whether this relevant capability is sufficient."
        : `This capability is ${status} for its current ${requirement.relevance} requirement.`,
    });
  }));
}
