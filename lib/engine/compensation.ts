import type {
  BuildCapabilityProfile,
  CapabilityGap,
  CapabilityKey,
  Compensation,
  StrategicProfile,
  StrategicProfileKey,
  Vulnerability,
} from "@/lib/types";

type CompensationRule = Readonly<{
  gapCapability: CapabilityKey;
  profiles: readonly StrategicProfileKey[];
  compensators: readonly CapabilityKey[];
  rationale: string;
}>;

const COMPENSATION_RULES: readonly CompensationRule[] = [
  {
    gapCapability: "range",
    profiles: ["dot", "sustainedDps"],
    compensators: ["slow", "disable", "geometryControl"],
    rationale: "Validated control can extend practical application time when reach is limited.",
  },
  {
    gapCapability: "uptime",
    profiles: ["dot", "sustainedDps", "bossSingleTarget"],
    compensators: ["range", "slow", "disable", "geometryControl"],
    rationale: "Validated reach or control can reduce practical uptime pressure.",
  },
  {
    gapCapability: "aoeDps",
    profiles: ["aoeWaveClear"],
    compensators: ["areaAmp", "slow", "chainReaction", "densityScaling", "waveClear"],
    rationale: "Validated area, control, reaction, density, or wave-clear evidence can cover a limited direct AoE contribution.",
  },
];

function isValidatedCompensator(
  capabilities: BuildCapabilityProfile,
  capability: CapabilityKey,
): boolean {
  const aggregate = capabilities.capabilities[capability];
  return aggregate.status === "known" && (
    aggregate.strongestTier === "gold" || aggregate.strongestTier === "silver"
  );
}

export function deriveCompensations(
  capabilities: BuildCapabilityProfile,
  profiles: readonly StrategicProfile[],
  gaps: readonly CapabilityGap[],
): readonly Compensation[] {
  const activeProfiles = new Set(profiles.map((profile) => profile.key));
  const compensations = gaps.flatMap((gap) => {
    if (gap.status !== "deficient") return [];
    const rules = COMPENSATION_RULES.filter((rule) => (
      rule.gapCapability === gap.capability && rule.profiles.some((profile) => activeProfiles.has(profile))
    ));
    const compensators = [...new Set(rules.flatMap((rule) => rule.compensators))]
      .filter((capability) => isValidatedCompensator(capabilities, capability));
    if (compensators.length === 0) return [];

    return [Object.freeze({
      gapCapability: gap.capability,
      compensatingCapabilities: Object.freeze(compensators),
      confidence: "known" as const,
      rationale: rules.map((rule) => rule.rationale).join(" "),
    })];
  });

  return Object.freeze(compensations);
}

export function deriveVulnerabilities(
  gaps: readonly CapabilityGap[],
  compensations: readonly Compensation[],
): readonly Vulnerability[] {
  const compensatedCapabilities = new Set(compensations.map((compensation) => compensation.gapCapability));
  const vulnerabilities = gaps.flatMap((gap) => {
    if (
      gap.status !== "deficient" ||
      !gap.requirement ||
      gap.requirement.confidence !== "known" ||
      compensatedCapabilities.has(gap.capability)
    ) {
      return [];
    }
    return [Object.freeze({
      capability: gap.capability,
      sourceProfiles: gap.requirement.sourceProfiles,
      confidence: "known" as const,
      rationale: "A strategically relevant capability has only validated limited evidence and no validated compensator.",
    })];
  });

  return Object.freeze(vulnerabilities);
}
