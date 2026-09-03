import {
  CONTEXTUAL_RANKING_WEIGHTS,
  RANKING_CONFIDENCE_MULTIPLIERS,
  recommendationCategoryFor,
} from "@/lib/engine/candidate-ranking-config";
import { evaluateLegalCandidateChanges } from "@/lib/engine/candidate-change";
import type { BuildIntent } from "@/lib/engine/build-intent";
import {
  resolveBuildIntent,
  type ResolvedBuildIntent,
} from "@/lib/engine/build-intent-resolver";
import {
  evaluateIntentForCandidate,
  summarizeResolvedIntent,
  type IntentComponentInput,
} from "@/lib/engine/intent-ranking";
import { interpretBuild } from "@/lib/engine/build-interpreter";
import type {
  BuildState,
  CandidateChangeEvaluation,
  CandidateRanking,
  CapabilityAggregate,
  CapabilityGap,
  CapabilityKey,
  MarginalSignal,
  RankedCandidate,
  RankingComponent,
  RankingComponentResult,
  RecommendationConfidence,
  RecommendationReason,
  StrategicProfile,
  IntentSummary,
} from "@/lib/types";

const RECOMMENDATION_CONFIDENCE_RANK: Readonly<Record<RecommendationConfidence, number>> = {
  unknown: 0,
  partial: 1,
  medium: 2,
  high: 3,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function aggregateFrom(value: unknown): CapabilityAggregate | null {
  const record = asRecord(value);
  return record && Array.isArray(record.evidence) && typeof record.key === "string"
    ? value as CapabilityAggregate
    : null;
}

function strategicProfileFrom(value: unknown): StrategicProfile | null {
  const record = asRecord(value);
  return record && Array.isArray(record.supportingCapabilities) && typeof record.key === "string"
    ? value as StrategicProfile
    : null;
}

function signalHasMediumAttributeEvidence(signal: MarginalSignal): boolean {
  for (const value of [signal.before, signal.after]) {
    const record = asRecord(value);
    if (!record || !Array.isArray(record.evidence)) continue;
    if (record.evidence.some((evidence) => (
      asRecord(evidence)?.sourceConfidence === "medium"
    ))) {
      return true;
    }
  }
  return false;
}

function confidenceForSignals(
  signals: readonly (MarginalSignal | undefined)[],
): RecommendationConfidence {
  const present = signals.filter((signal): signal is MarginalSignal => Boolean(signal));
  if (present.length === 0 || present.every((signal) => signal.confidence === "unknown")) {
    return "unknown";
  }
  if (present.some((signal) => signal.confidence === "partial")) return "partial";
  if (present.some(signalHasMediumAttributeEvidence)) return "medium";
  return "high";
}

function confidenceForRelationship(confidence: string): RecommendationConfidence {
  const normalized = confidence.toLowerCase();
  if (normalized.includes("high")) return "high";
  if (normalized.includes("medium")) return "medium";
  return "unknown";
}

function component(
  kind: RankingComponent,
  key: string,
  direction: RankingComponentResult["direction"],
  baseContribution: number,
  confidence: RecommendationConfidence,
  detail: string,
): RankingComponentResult | null {
  if (confidence === "unknown" && baseContribution !== 0) return null;
  const contribution = baseContribution === 0
    ? 0
    : Math.sign(baseContribution) * Math.round(
      Math.abs(baseContribution) * RANKING_CONFIDENCE_MULTIPLIERS[confidence],
    );
  const reason: RecommendationReason = Object.freeze({
    component: kind,
    direction,
    key,
    confidence,
    detail,
  });
  return Object.freeze({
    component: kind,
    key,
    contribution,
    direction,
    confidence,
    reason,
  });
}

function capabilitySignalFor(
  change: CandidateChangeEvaluation,
  capability: string,
): MarginalSignal | undefined {
  return change.delta.capabilitySignals.find((signal) => signal.key === capability);
}

function gapFor(
  change: CandidateChangeEvaluation,
  capability: string,
  phase: "before" | "after",
): CapabilityGap | undefined {
  return change[phase].gaps.find((gap) => gap.capability === capability);
}

function hasMeaningfulUnresolvedNeed(
  change: CandidateChangeEvaluation,
  phase: "before" | "after",
): boolean {
  return change[phase].vulnerabilities.length > 0 || change[phase].gaps.some((gap) => (
    gap.status === "deficient" && gap.requirement !== null
  ));
}

function addressesMeaningfulNeed(change: CandidateChangeEvaluation): boolean {
  return change.delta.vulnerabilitySignals.some((signal) => signal.direction === "positive")
    || change.delta.gapSignals.some((signal) => {
      const priorGap = gapFor(change, signal.key, "before");
      return signal.direction === "positive" && priorGap?.status === "deficient";
    });
}

function vulnerabilityComponents(
  change: CandidateChangeEvaluation,
): readonly RankingComponentResult[] {
  return change.delta.vulnerabilitySignals.flatMap((signal) => {
    if (signal.direction !== "positive" && signal.direction !== "negative") return [];
    const confidence = confidenceForSignals([
      signal,
      capabilitySignalFor(change, signal.key),
    ]);
    const resolved = signal.direction === "positive";
    const result = component(
      "vulnerability-relief",
      signal.key,
      signal.direction,
      resolved
        ? CONTEXTUAL_RANKING_WEIGHTS.vulnerabilityResolved
        : CONTEXTUAL_RANKING_WEIGHTS.vulnerabilityIntroduced,
      confidence,
      resolved
        ? `${signal.key} is a current vulnerability resolved by this candidate.`
        : `${signal.key} becomes a vulnerability after this candidate is added.`,
    );
    return result ? [result] : [];
  });
}

function gapReliefComponents(
  change: CandidateChangeEvaluation,
): readonly RankingComponentResult[] {
  return change.delta.gapSignals.flatMap((signal) => {
    const resultingGap = gapFor(change, signal.key, "after");
    const priorGap = gapFor(change, signal.key, "before");
    const supportingAdequateToStrong = priorGap?.requirement?.relevance === "supporting"
      && priorGap.status === "adequate"
      && resultingGap?.status === "strong";
    if (
      !priorGap?.requirement
      || (signal.direction !== "positive" && !supportingAdequateToStrong)
      || (priorGap.status !== "deficient" && !supportingAdequateToStrong)
    ) return [];

    const confidence = confidenceForSignals([
      signal,
      capabilitySignalFor(change, signal.key),
    ]);
    const primary = priorGap.requirement.relevance === "primary";
    const result = component(
      primary ? "primary-gap-relief" : "supporting-gap-relief",
      signal.key,
      "positive",
      primary
        ? CONTEXTUAL_RANKING_WEIGHTS.primaryGapRelief
        : CONTEXTUAL_RANKING_WEIGHTS.supportingGapRelief,
      confidence,
      `${signal.key} relieves a deficient ${priorGap.requirement.relevance} requirement.`,
    );
    return result ? [result] : [];
  });
}

function strategicProfileComponents(
  change: CandidateChangeEvaluation,
): readonly RankingComponentResult[] {
  return change.delta.strategicProfileSignals.flatMap((signal) => {
    if (signal.direction !== "positive") return [];
    const prior = strategicProfileFrom(signal.before);
    const next = strategicProfileFrom(signal.after);
    if (!next) return [];
    const relatedCapabilitySignals = next.supportingCapabilities.map((capability) => (
      capabilitySignalFor(change, capability)
    ));
    const confidence = confidenceForSignals([signal, ...relatedCapabilitySignals]);

    if (prior) {
      const result = component(
        "strategic-fit",
        next.key,
        "positive",
        CONTEXTUAL_RANKING_WEIGHTS.strategicFit,
        confidence,
        `${next.key} is an established strategic profile strengthened by the candidate.`,
      );
      return result ? [result] : [];
    }

    const reinforcesCurrentRequirement = next.supportingCapabilities.some((capability) => (
      change.before.requirements.some((requirement) => requirement.capability === capability)
    ));
    const result = component(
      reinforcesCurrentRequirement ? "strategic-fit" : "strategic-option",
      next.key,
      "positive",
      reinforcesCurrentRequirement
        ? CONTEXTUAL_RANKING_WEIGHTS.strategicFit
        : CONTEXTUAL_RANKING_WEIGHTS.strategicOption,
      confidence,
      reinforcesCurrentRequirement
        ? `${next.key} expands the build through a capability it already requires.`
        : `${next.key} is a new strategic option, kept intentionally low-value until its fit is established.`,
    );
    return result ? [result] : [];
  });
}

function capabilityComponents(
  change: CandidateChangeEvaluation,
): readonly RankingComponentResult[] {
  return change.delta.capabilitySignals.flatMap((signal) => {
    if (signal.direction !== "positive") return [];
    const confidence = confidenceForSignals([signal]);
    const establishedProfileDependsOnCapability = change.before.strategicProfiles.some((profile) => (
      profile.supportingCapabilities.includes(signal.key as CapabilityKey)
    ));
    const result = component(
      establishedProfileDependsOnCapability ? "strategic-fit" : "capability-improvement",
      signal.key,
      "positive",
      establishedProfileDependsOnCapability
        ? CONTEXTUAL_RANKING_WEIGHTS.strategicFit
        : CONTEXTUAL_RANKING_WEIGHTS.capabilityImprovement,
      confidence,
      establishedProfileDependsOnCapability
        ? `${signal.key} improves capability evidence central to the current strategy.`
        : `${signal.key} gains supported capability evidence without assuming universal tower value.`,
    );
    return result ? [result] : [];
  });
}

function relationshipComponents(
  change: CandidateChangeEvaluation,
): readonly RankingComponentResult[] {
  return change.delta.relationships.flatMap((relationship) => {
    const confidence = confidenceForRelationship(relationship.confidence);
    const synergy = relationship.kind === "synergy";
    const result = component(
      synergy ? "synergy" : "anti-synergy",
      `${relationship.candidateTower}:${relationship.selectedTower}`,
      synergy ? "positive" : "negative",
      synergy
        ? CONTEXTUAL_RANKING_WEIGHTS.explicitSynergy
        : CONTEXTUAL_RANKING_WEIGHTS.explicitAntiSynergy,
      confidence,
      synergy
        ? `Explicit mechanics synergy links ${relationship.candidateTower} with selected ${relationship.selectedTower}.`
        : `Explicit mechanics anti-synergy links ${relationship.candidateTower} with selected ${relationship.selectedTower}.`,
    );
    return result ? [result] : [];
  });
}

function elementDirectionComponents(
  change: CandidateChangeEvaluation,
): readonly RankingComponentResult[] {
  return change.delta.elementalComposition.recipeFootprintAdded.flatMap((elementChange) => {
    if (elementChange.change !== "reinforced") return [];
    const result = component(
      "element-direction",
      elementChange.element,
      "positive",
      CONTEXTUAL_RANKING_WEIGHTS.elementalDirectionFit,
      "high",
      `${elementChange.element} reinforces an existing recipe footprint; this is kept separate from capability fit.`,
    );
    return result ? [result] : [];
  });
}

function redundancyComponents(
  change: CandidateChangeEvaluation,
): readonly RankingComponentResult[] {
  const importantNeedsRemain = hasMeaningfulUnresolvedNeed(change, "before");
  const addressesNeed = addressesMeaningfulNeed(change);

  return change.delta.redundancy.map((evidence) => {
    const relatedSignal = capabilitySignalFor(change, evidence.capability);
    const confidence = confidenceForSignals([relatedSignal]);
    const lowMarginal = importantNeedsRemain && !addressesNeed;
    return component(
      "redundancy",
      evidence.capability,
      lowMarginal ? "negative" : "neutral",
      lowMarginal ? CONTEXTUAL_RANKING_WEIGHTS.lowMarginalRedundancy : 0,
      confidence,
      lowMarginal
        ? `${evidence.capability} is already gold-tier while a more meaningful current need remains unresolved.`
        : `${evidence.capability} is redundant evidence, retained as factual reinforcement rather than an automatic penalty.`,
    );
  }).filter((item): item is RankingComponentResult => item !== null);
}

function newRequirementComponents(
  change: CandidateChangeEvaluation,
): readonly RankingComponentResult[] {
  return change.delta.requirementSignals.flatMap((signal) => {
    if (signal.direction !== "mixed" || signal.before !== null) return [];
    const resultingGap = gapFor(change, signal.key, "after");
    const remainsUnsupported = resultingGap?.status === "deficient"
      && !change.after.compensations.some((compensation) => (
        compensation.gapCapability === signal.key
      ));
    if (!remainsUnsupported) return [];

    const result = component(
      "new-requirement",
      signal.key,
      "negative",
      CONTEXTUAL_RANKING_WEIGHTS.unmetNewRequirement,
      confidenceForSignals([signal, capabilitySignalFor(change, signal.key)]),
      `${signal.key} is a new requirement that remains deficient and uncompensated after addition.`,
    );
    return result ? [result] : [];
  });
}

function opportunityCostComponents(
  change: CandidateChangeEvaluation,
): readonly RankingComponentResult[] {
  const { remainingSlotsBefore } = change.delta.opportunityCost;
  const unresolvedAfter = hasMeaningfulUnresolvedNeed(change, "after");
  const constrainedAndIncomplete = remainingSlotsBefore === 1 && unresolvedAfter;
  const result = component(
    "opportunity-cost",
    "tower-slots",
    constrainedAndIncomplete ? "negative" : "neutral",
    constrainedAndIncomplete ? CONTEXTUAL_RANKING_WEIGHTS.constrainedSlotPressure : 0,
    "high",
    constrainedAndIncomplete
      ? "This is the final open tower slot and meaningful needs remain unresolved after the addition."
      : `This candidate consumes one slot; ${remainingSlotsBefore} slot(s) were available before addition.`,
  );
  return result ? Object.freeze([result]) : Object.freeze([]);
}

function intentComponents(
  inputs: readonly IntentComponentInput[],
): readonly RankingComponentResult[] {
  return inputs.flatMap((input) => {
    const result = component(
      input.component,
      input.key,
      input.direction,
      input.baseContribution,
      input.confidence,
      input.detail,
    );
    return result ? [result] : [];
  });
}

function rankSingleCandidate(
  change: CandidateChangeEvaluation,
  catalogOrder: number,
  intent?: ResolvedBuildIntent,
  intentSummary?: IntentSummary,
): Readonly<{ ranked: Omit<RankedCandidate, "rank">; catalogOrder: number }> {
  const intentEvaluation = intent && intentSummary
    ? evaluateIntentForCandidate(change, intent, intentSummary)
    : undefined;
  const components = Object.freeze([
    ...vulnerabilityComponents(change),
    ...gapReliefComponents(change),
    ...strategicProfileComponents(change),
    ...capabilityComponents(change),
    ...relationshipComponents(change),
    ...elementDirectionComponents(change),
    ...redundancyComponents(change),
    ...newRequirementComponents(change),
    ...opportunityCostComponents(change),
    ...(intentEvaluation ? intentComponents(intentEvaluation.components) : []),
  ]);
  const contextualValue = components.reduce((total, item) => total + item.contribution, 0);
  const decisiveComponents = components.filter((item) => item.contribution !== 0);
  const confidence: RecommendationConfidence = decisiveComponents.length === 0
    ? "unknown"
    : decisiveComponents.some((item) => item.confidence === "partial")
      ? "partial"
      : decisiveComponents.some((item) => item.confidence === "medium")
        ? "medium"
        : "high";
  const strengths = Object.freeze(components
    .filter((item) => item.contribution > 0)
    .map((item) => item.reason));
  const tradeoffs = Object.freeze(components
    .filter((item) => item.contribution < 0 || item.direction === "mixed")
    .map((item) => item.reason));
  const warnings = Object.freeze(components
    .filter((item) => item.confidence === "partial" || item.direction === "unknown")
    .map((item) => item.reason));

  return Object.freeze({
    ranked: Object.freeze({
      candidate: change.candidate,
      contextualValue,
      confidence,
      category: recommendationCategoryFor(contextualValue),
      components,
      strengths,
      tradeoffs,
      warnings,
      change,
      ...(intentEvaluation ? { intentAlignment: intentEvaluation.alignment } : {}),
    }),
    catalogOrder,
  });
}

export function rankCandidateChanges(
  changes: readonly CandidateChangeEvaluation[],
  intent?: ResolvedBuildIntent,
  existingIntentSummary?: IntentSummary,
): CandidateRanking {
  const intentSummary = intent
    ? existingIntentSummary ?? (changes[0]
      ? summarizeResolvedIntent(changes[0].before, intent)
      : undefined)
    : undefined;
  const candidates = changes
    .map((change, catalogOrder) => rankSingleCandidate(
      change,
      catalogOrder,
      intent,
      intentSummary,
    ))
    .sort((left, right) => (
      right.ranked.contextualValue - left.ranked.contextualValue
      || RECOMMENDATION_CONFIDENCE_RANK[right.ranked.confidence]
        - RECOMMENDATION_CONFIDENCE_RANK[left.ranked.confidence]
      || left.catalogOrder - right.catalogOrder
    ))
    .map(({ ranked }, index) => Object.freeze({ ...ranked, rank: index + 1 }));

  return Object.freeze({
    rankedCandidates: Object.freeze(candidates),
    topRecommendation: candidates[0] ?? null,
    ...(intentSummary ? { intent: intentSummary } : {}),
  });
}

export function rankLegalCandidatesWithResolvedIntent(
  state: BuildState,
  intent?: ResolvedBuildIntent,
): CandidateRanking {
  const intentSummary = intent ? summarizeResolvedIntent(
    interpretBuild(state),
    intent,
    state.selectedTowers.map((selected) => selected.towerName),
  ) : undefined;
  return rankCandidateChanges(evaluateLegalCandidateChanges(state), intent, intentSummary);
}

export function rankLegalCandidates(
  state: BuildState,
  rawIntent?: BuildIntent,
): CandidateRanking {
  return rankLegalCandidatesWithResolvedIntent(
    state,
    rawIntent ? resolveBuildIntent(rawIntent) : undefined,
  );
}
