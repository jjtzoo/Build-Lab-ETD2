import { ELEMENTS, MECHANICS_BY_TOWER } from "@/lib/data";
import { CAPABILITY_KEYS } from "@/lib/engine/capabilities";
import { interpretBuild } from "@/lib/engine/build-interpreter";
import {
  getValidatedLegalCandidate,
  simulateCandidate,
} from "@/lib/engine/candidate-simulation";
import { getLegalNextCandidates } from "@/lib/engine/legal-candidates";
import type {
  AttributeTier,
  BuildInterpretation,
  BuildState,
  CapabilityAggregate,
  CapabilityEvidenceStatus,
  CapabilityGap,
  CapabilityGapStatus,
  CapabilityKey,
  CapabilityRequirement,
  CandidateChangeEvaluation,
  CandidateRelationshipEvidence,
  CandidateRelationshipKind,
  Compensation,
  ElementAllocation,
  ElementCompositionChange,
  ElementDirection,
  ElementDirectionChange,
  ElementalCompositionDelta,
  InterpretationDelta,
  LegalNextCandidate,
  MarginalSignal,
  MarginalSignalDirection,
  RedundancyEvidence,
  StrategicProfile,
  Vulnerability,
} from "@/lib/types";

const TIER_RANK: Readonly<Record<AttributeTier, number>> = {
  bronze: 1,
  silver: 2,
  gold: 3,
};

const CONFIDENCE_RANK: Readonly<Record<CapabilityEvidenceStatus, number>> = {
  unknown: 0,
  partial: 1,
  known: 2,
};

function tierRank(tier: AttributeTier | null): number {
  return tier ? TIER_RANK[tier] : 0;
}

function strongestConfidence(
  ...confidences: readonly (CapabilityEvidenceStatus | undefined)[]
): CapabilityEvidenceStatus {
  if (confidences.includes("known")) return "known";
  if (confidences.includes("partial")) return "partial";
  return "unknown";
}

function freezeSignal(
  category: MarginalSignal["category"],
  direction: MarginalSignalDirection,
  key: string,
  before: unknown,
  after: unknown,
  confidence: CapabilityEvidenceStatus,
  reason: string,
): MarginalSignal {
  return Object.freeze({ category, direction, key, before, after, confidence, reason });
}

function capabilitySignals(
  before: BuildInterpretation,
  after: BuildInterpretation,
): readonly MarginalSignal[] {
  return Object.freeze(CAPABILITY_KEYS.map((key) => {
    const prior = before.capabilities.capabilities[key];
    const next = after.capabilities.capabilities[key];
    const confidence = strongestConfidence(prior.status, next.status);

    if (prior.status === "unknown" && next.status !== "unknown") {
      return freezeSignal(
        "capability",
        "positive",
        key,
        prior,
        next,
        confidence,
        `Evidence for ${key} changed from UNKNOWN to ${next.status}.`,
      );
    }
    if (tierRank(next.strongestTier) > tierRank(prior.strongestTier)) {
      return freezeSignal(
        "capability",
        "positive",
        key,
        prior,
        next,
        confidence,
        `${key} improved from ${prior.strongestTier ?? "no qualitative tier"} to ${next.strongestTier}.`,
      );
    }
    if (CONFIDENCE_RANK[next.status] > CONFIDENCE_RANK[prior.status]) {
      return freezeSignal(
        "capability",
        "positive",
        key,
        prior,
        next,
        confidence,
        `${key} confidence improved from ${prior.status} to ${next.status}.`,
      );
    }
    if (
      tierRank(next.strongestTier) < tierRank(prior.strongestTier)
      || CONFIDENCE_RANK[next.status] < CONFIDENCE_RANK[prior.status]
    ) {
      return freezeSignal(
        "capability",
        "unknown",
        key,
        prior,
        next,
        confidence,
        `${key} changed non-monotonically; this model does not infer a capability weakening from tower addition.`,
      );
    }
    return freezeSignal(
      "capability",
      "neutral",
      key,
      prior,
      next,
      confidence,
      next.status === "unknown"
        ? `${key} remains UNKNOWN because no known or partial evidence was introduced.`
        : `${key} remains at its existing qualitative evidence level.`,
    );
  }));
}

function profilesByKey(
  profiles: readonly StrategicProfile[],
): ReadonlyMap<string, StrategicProfile> {
  return new Map(profiles.map((profile) => [profile.key, profile]));
}

function strategicProfileSignals(
  before: BuildInterpretation,
  after: BuildInterpretation,
): readonly MarginalSignal[] {
  const priorProfiles = profilesByKey(before.strategicProfiles);
  const nextProfiles = profilesByKey(after.strategicProfiles);
  const keys = [...new Set([...priorProfiles.keys(), ...nextProfiles.keys()])];

  return Object.freeze(keys.map((key) => {
    const prior = priorProfiles.get(key) ?? null;
    const next = nextProfiles.get(key) ?? null;
    const confidence = strongestConfidence(prior?.confidence, next?.confidence);

    if (!prior && next) {
      return freezeSignal(
        "strategic-profile",
        "positive",
        key,
        prior,
        next,
        confidence,
        `${key} is newly activated by known candidate evidence.`,
      );
    }
    if (prior && next && (
      tierRank(next.strongestTier) > tierRank(prior.strongestTier)
      || CONFIDENCE_RANK[next.confidence] > CONFIDENCE_RANK[prior.confidence]
    )) {
      return freezeSignal(
        "strategic-profile",
        "positive",
        key,
        prior,
        next,
        confidence,
        `${key} has stronger or more confident supporting evidence.`,
      );
    }
    if (prior && !next) {
      return freezeSignal(
        "strategic-profile",
        "unknown",
        key,
        prior,
        next,
        confidence,
        `${key} is absent after simulation; no profile weakening conclusion is inferred.`,
      );
    }
    return freezeSignal(
      "strategic-profile",
      "neutral",
      key,
      prior,
      next,
      confidence,
      `${key} remains supported at the same qualitative level.`,
    );
  }));
}

function requirementsByCapability(
  requirements: readonly CapabilityRequirement[],
): ReadonlyMap<CapabilityKey, CapabilityRequirement> {
  return new Map(requirements.map((requirement) => [requirement.capability, requirement]));
}

function requirementSignals(
  before: BuildInterpretation,
  after: BuildInterpretation,
): readonly MarginalSignal[] {
  const priorRequirements = requirementsByCapability(before.requirements);
  const nextRequirements = requirementsByCapability(after.requirements);
  const keys = [...new Set([...priorRequirements.keys(), ...nextRequirements.keys()])];

  return Object.freeze(keys.map((key) => {
    const prior = priorRequirements.get(key) ?? null;
    const next = nextRequirements.get(key) ?? null;
    const confidence = strongestConfidence(prior?.confidence, next?.confidence);

    if (!prior && next) {
      return freezeSignal(
        "requirement",
        "mixed",
        key,
        prior,
        next,
        confidence,
        `${key} is newly relevant because the candidate activates a strategic dependency.`,
      );
    }
    if (prior && next && prior.relevance === "supporting" && next.relevance === "primary") {
      return freezeSignal(
        "requirement",
        "mixed",
        key,
        prior,
        next,
        confidence,
        `${key} relevance strengthened from supporting to primary.`,
      );
    }
    if (prior && !next) {
      return freezeSignal(
        "requirement",
        "unknown",
        key,
        prior,
        next,
        confidence,
        `${key} is no longer listed as a requirement; no strategic conclusion is inferred from removal.`,
      );
    }
    return freezeSignal(
      "requirement",
      "neutral",
      key,
      prior,
      next,
      confidence,
      `${key} remains at the same requirement relevance.`,
    );
  }));
}

function gapsByCapability(gaps: readonly CapabilityGap[]): ReadonlyMap<CapabilityKey, CapabilityGap> {
  return new Map(gaps.map((gap) => [gap.capability, gap]));
}

function gapDirection(
  beforeStatus: CapabilityGapStatus,
  afterStatus: CapabilityGapStatus,
): MarginalSignalDirection {
  if (beforeStatus === afterStatus) return "neutral";
  if (beforeStatus === "deficient" && ["adequate", "strong"].includes(afterStatus)) return "positive";
  if (beforeStatus === "unknown" && ["adequate", "strong"].includes(afterStatus)) return "positive";
  if (beforeStatus === "low-relevance") return "mixed";
  if (["adequate", "strong"].includes(beforeStatus) && afterStatus === "deficient") return "negative";
  return "unknown";
}

function gapSignals(
  before: BuildInterpretation,
  after: BuildInterpretation,
): readonly MarginalSignal[] {
  const priorGaps = gapsByCapability(before.gaps);
  const nextGaps = gapsByCapability(after.gaps);

  return Object.freeze(CAPABILITY_KEYS.map((key) => {
    const prior = priorGaps.get(key);
    const next = nextGaps.get(key);
    if (!prior || !next) {
      return freezeSignal(
        "gap",
        "unknown",
        key,
        prior ?? null,
        next ?? null,
        strongestConfidence(prior?.requirement?.confidence, next?.requirement?.confidence),
        `${key} does not have a complete before/after gap record.`,
      );
    }

    const direction = gapDirection(prior.status, next.status);
    const confidence = strongestConfidence(prior.requirement?.confidence, next.requirement?.confidence);
    const reason = direction === "neutral"
      ? `${key} remains ${next.status}.`
      : `${key} gap changed from ${prior.status} to ${next.status}.`;
    return freezeSignal("gap", direction, key, prior, next, confidence, reason);
  }));
}

function compensationsByGap(
  compensations: readonly Compensation[],
): ReadonlyMap<CapabilityKey, Compensation> {
  return new Map(compensations.map((compensation) => [compensation.gapCapability, compensation]));
}

function sameCapabilities(
  left: readonly CapabilityKey[],
  right: readonly CapabilityKey[],
): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function compensationSignals(
  before: BuildInterpretation,
  after: BuildInterpretation,
): readonly MarginalSignal[] {
  const priorCompensations = compensationsByGap(before.compensations);
  const nextCompensations = compensationsByGap(after.compensations);
  const priorGaps = gapsByCapability(before.gaps);
  const nextGaps = gapsByCapability(after.gaps);
  const keys = [...new Set([...priorCompensations.keys(), ...nextCompensations.keys()])];

  return Object.freeze(keys.map((key) => {
    const prior = priorCompensations.get(key) ?? null;
    const next = nextCompensations.get(key) ?? null;
    const confidence = strongestConfidence(prior?.confidence, next?.confidence);

    if (!prior && next) {
      return freezeSignal(
        "compensation",
        "positive",
        key,
        prior,
        next,
        confidence,
        `${key} gained a validated compensation under the existing rule layer.`,
      );
    }
    if (prior && !next) {
      const resultingGap = nextGaps.get(key);
      const directGapSolved = resultingGap?.status === "adequate" || resultingGap?.status === "strong";
      return freezeSignal(
        "compensation",
        directGapSolved ? "positive" : "unknown",
        key,
        prior,
        next,
        confidence,
        directGapSolved
          ? `${key} compensation is no longer necessary because the direct gap is ${resultingGap?.status}.`
          : `${key} compensation is no longer present; the existing rule layer cannot explain this transition as a direct resolution.`,
      );
    }
    if (prior && next && !sameCapabilities(prior.compensatingCapabilities, next.compensatingCapabilities)) {
      return freezeSignal(
        "compensation",
        "mixed",
        key,
        prior,
        next,
        confidence,
        `${key} remains compensated, but its validated compensating capabilities changed.`,
      );
    }
    return freezeSignal(
      "compensation",
      "neutral",
      key,
      prior,
      next,
      confidence,
      `${key} retains the same validated compensation.`,
    );
  }));
}

function vulnerabilitiesByCapability(
  vulnerabilities: readonly Vulnerability[],
): ReadonlyMap<CapabilityKey, Vulnerability> {
  return new Map(vulnerabilities.map((vulnerability) => [vulnerability.capability, vulnerability]));
}

function vulnerabilitySignals(
  before: BuildInterpretation,
  after: BuildInterpretation,
): readonly MarginalSignal[] {
  const priorVulnerabilities = vulnerabilitiesByCapability(before.vulnerabilities);
  const nextVulnerabilities = vulnerabilitiesByCapability(after.vulnerabilities);
  const keys = [...new Set([...priorVulnerabilities.keys(), ...nextVulnerabilities.keys()])];

  return Object.freeze(keys.map((key) => {
    const prior = priorVulnerabilities.get(key) ?? null;
    const next = nextVulnerabilities.get(key) ?? null;
    const confidence = strongestConfidence(prior?.confidence, next?.confidence);

    if (prior && !next) {
      return freezeSignal(
        "vulnerability",
        "positive",
        key,
        prior,
        next,
        confidence,
        `${key} vulnerability is resolved by the resulting interpreted state.`,
      );
    }
    if (!prior && next) {
      return freezeSignal(
        "vulnerability",
        "negative",
        key,
        prior,
        next,
        confidence,
        `${key} is a newly exposed vulnerability in the resulting interpreted state.`,
      );
    }
    return freezeSignal(
      "vulnerability",
      "neutral",
      key,
      prior,
      next,
      confidence,
      `${key} vulnerability remains unchanged.`,
    );
  }));
}

function allocationChanges(
  before: Readonly<ElementAllocation>,
  after: Readonly<ElementAllocation>,
): readonly ElementCompositionChange[] {
  return Object.freeze(ELEMENTS.flatMap((element) => {
    if (after[element] <= before[element]) return [];
    return [Object.freeze({
      element,
      before: before[element],
      after: after[element],
      change: before[element] === 0 ? "introduced" : "reinforced",
    })];
  }));
}

function positionsByElement(
  direction: readonly ElementDirection[],
): ReadonlyMap<string, number> {
  return new Map(direction.map((item, index) => [item.element, index + 1]));
}

function directionChanges(
  before: BuildInterpretation,
  after: BuildInterpretation,
): readonly ElementDirectionChange[] {
  const beforePositions = positionsByElement(before.elementalComposition.direction);
  const afterPositions = positionsByElement(after.elementalComposition.direction);

  return Object.freeze(ELEMENTS.flatMap((element) => {
    const beforeCount = before.elementalComposition.recipeFootprint[element];
    const afterCount = after.elementalComposition.recipeFootprint[element];
    const beforePosition = beforePositions.get(element) ?? null;
    const afterPosition = afterPositions.get(element) ?? null;
    if (beforeCount === afterCount && beforePosition === afterPosition) return [];

    return [Object.freeze({
      element,
      beforePosition,
      afterPosition,
      beforeFootprintCount: beforeCount,
      afterFootprintCount: afterCount,
      change: afterCount > beforeCount
        ? beforeCount === 0 ? "introduced" : "reinforced"
        : "reordered",
    })];
  }));
}

function elementalCompositionDelta(
  before: BuildInterpretation,
  after: BuildInterpretation,
): ElementalCompositionDelta {
  return Object.freeze({
    recipeFootprintAdded: allocationChanges(
      before.elementalComposition.recipeFootprint,
      after.elementalComposition.recipeFootprint,
    ),
    offensivePresenceAdded: allocationChanges(
      before.elementalComposition.offensivePresence,
      after.elementalComposition.offensivePresence,
    ),
    directionChanges: directionChanges(before, after),
  });
}

function elementSignals(delta: ElementalCompositionDelta): readonly MarginalSignal[] {
  const recipeSignals = delta.recipeFootprintAdded.map((change) => freezeSignal(
    "element",
    "positive",
    `recipe-footprint:${change.element}`,
    change.before,
    change.after,
    "known",
    `${change.element} recipe footprint is ${change.change}.`,
  ));
  const offensiveSignals = delta.offensivePresenceAdded.map((change) => freezeSignal(
    "element",
    "positive",
    `offensive-presence:${change.element}`,
    change.before,
    change.after,
    "known",
    `${change.element} offensive presence is ${change.change}.`,
  ));
  const directionSignals = delta.directionChanges.map((change) => freezeSignal(
    "element",
    change.change === "reordered" ? "neutral" : "positive",
    `element-direction:${change.element}`,
    {
      position: change.beforePosition,
      footprintCount: change.beforeFootprintCount,
    },
    {
      position: change.afterPosition,
      footprintCount: change.afterFootprintCount,
    },
    "known",
    `${change.element} elemental direction is ${change.change}.`,
  ));
  return Object.freeze([...recipeSignals, ...offensiveSignals, ...directionSignals]);
}

function candidateEvidenceFor(
  aggregate: CapabilityAggregate,
  candidateTower: string,
) {
  return aggregate.evidence.filter((evidence) => evidence.towerName === candidateTower);
}

function candidateStrongestTier(
  aggregate: CapabilityAggregate,
  candidateTower: string,
): AttributeTier | null {
  const tiers = candidateEvidenceFor(aggregate, candidateTower)
    .flatMap((evidence) => evidence.tier ? [evidence.tier] : []);
  if (tiers.includes("gold")) return "gold";
  if (tiers.includes("silver")) return "silver";
  if (tiers.includes("bronze")) return "bronze";
  return null;
}

function redundancyEvidence(
  before: BuildInterpretation,
  after: BuildInterpretation,
  candidate: LegalNextCandidate,
): readonly RedundancyEvidence[] {
  return Object.freeze(CAPABILITY_KEYS.flatMap((capability) => {
    const prior = before.capabilities.capabilities[capability];
    const next = after.capabilities.capabilities[capability];
    const candidateEvidence = candidateEvidenceFor(next, candidate.towerName);
    if (prior.strongestTier !== "gold" || candidateEvidence.length === 0) return [];

    return [Object.freeze({
      capability,
      candidateTower: candidate.towerName,
      existingStrongestTier: prior.strongestTier,
      candidateTier: candidateStrongestTier(next, candidate.towerName),
      confidence: strongestConfidence(...candidateEvidence.map((evidence) => evidence.status)),
      rationale: `${candidate.towerName} adds evidenced ${capability} while the current build already has gold-tier evidence.`,
    })];
  }));
}

function normalizeReference(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function explicitlyNamesTower(reference: string, towerName: string): boolean {
  const normalizedReference = normalizeReference(reference);
  const normalizedTower = normalizeReference(towerName);
  return normalizedReference.includes(` ${normalizedTower} `)
    || normalizedReference.startsWith(`${normalizedTower} `)
    || normalizedReference.endsWith(` ${normalizedTower}`)
    || normalizedReference === normalizedTower;
}

function relationshipEvidence(
  state: BuildState,
  candidate: LegalNextCandidate,
): readonly CandidateRelationshipEvidence[] {
  const mechanics = MECHANICS_BY_TOWER.get(candidate.towerName);
  if (!mechanics) return Object.freeze([]);

  const selectedTowers = state.selectedTowers.map((selection) => selection.towerName);
  const relationships: CandidateRelationshipEvidence[] = [];
  const sources: readonly Readonly<{
    kind: CandidateRelationshipKind;
    references: readonly string[];
  }>[] = [
    { kind: "synergy", references: mechanics.synergies },
    { kind: "anti-synergy", references: mechanics.anti_synergies },
  ];

  for (const source of sources) {
    for (const rawReference of source.references) {
      for (const selectedTower of selectedTowers) {
        if (!explicitlyNamesTower(rawReference, selectedTower)) continue;
        relationships.push(Object.freeze({
          kind: source.kind,
          candidateTower: candidate.towerName,
          selectedTower,
          rawReference,
          source: "mechanics-record",
          confidence: mechanics.confidence,
        }));
      }
    }
  }

  return Object.freeze(relationships);
}

export function compareInterpretations(
  before: BuildInterpretation,
  after: BuildInterpretation,
  context: Readonly<{
    state: BuildState;
    simulatedState: BuildState;
    candidate: LegalNextCandidate;
  }>,
): InterpretationDelta {
  const nextCapabilitySignals = capabilitySignals(before, after);
  const nextStrategicProfileSignals = strategicProfileSignals(before, after);
  const nextRequirementSignals = requirementSignals(before, after);
  const nextGapSignals = gapSignals(before, after);
  const nextCompensationSignals = compensationSignals(before, after);
  const nextVulnerabilitySignals = vulnerabilitySignals(before, after);
  const nextElementalComposition = elementalCompositionDelta(before, after);
  const nextElementSignals = elementSignals(nextElementalComposition);

  return Object.freeze({
    capabilitySignals: nextCapabilitySignals,
    strategicProfileSignals: nextStrategicProfileSignals,
    requirementSignals: nextRequirementSignals,
    gapSignals: nextGapSignals,
    compensationSignals: nextCompensationSignals,
    vulnerabilitySignals: nextVulnerabilitySignals,
    elementSignals: nextElementSignals,
    signals: Object.freeze([
      ...nextCapabilitySignals,
      ...nextStrategicProfileSignals,
      ...nextRequirementSignals,
      ...nextGapSignals,
      ...nextCompensationSignals,
      ...nextVulnerabilitySignals,
      ...nextElementSignals,
    ]),
    elementalComposition: nextElementalComposition,
    redundancy: redundancyEvidence(before, after, context.candidate),
    opportunityCost: Object.freeze({
      slotsConsumed: context.state.remainingTowerSlots - context.simulatedState.remainingTowerSlots,
      remainingSlotsBefore: context.state.remainingTowerSlots,
      remainingSlotsAfter: context.simulatedState.remainingTowerSlots,
    }),
    relationships: relationshipEvidence(context.state, context.candidate),
  });
}

export function evaluateCandidateChange(
  state: BuildState,
  candidate: LegalNextCandidate,
): CandidateChangeEvaluation {
  const legalCandidate = getValidatedLegalCandidate(state, candidate);
  const before = interpretBuild(state);
  const simulatedState = simulateCandidate(state, legalCandidate);
  const after = interpretBuild(simulatedState);
  const delta = compareInterpretations(before, after, {
    state,
    simulatedState,
    candidate: legalCandidate,
  });

  return Object.freeze({
    candidate: legalCandidate,
    before,
    simulatedState,
    after,
    delta,
  });
}

export function evaluateLegalCandidateChanges(
  state: BuildState,
): readonly CandidateChangeEvaluation[] {
  return Object.freeze(getLegalNextCandidates(state).map((candidate) => (
    evaluateCandidateChange(state, candidate)
  )));
}
