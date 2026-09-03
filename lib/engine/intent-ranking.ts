import {
  INTENT_PRIORITY_MULTIPLIERS,
  INTENT_RANKING_WEIGHTS,
} from "@/lib/engine/candidate-ranking-config";
import type { ResolvedBuildIntent, ResolvedTowerFocus } from "@/lib/engine/build-intent-resolver";
import { capabilitiesForStrategicProfile } from "@/lib/engine/strategic-profile";
import type {
  BuildInterpretation,
  CandidateChangeEvaluation,
  CandidateIntentAlignment,
  CapabilityKey,
  IntentAlignmentStatus,
  IntentConflict,
  IntentSummary,
  MarginalSignal,
  RankingComponent,
  RecommendationConfidence,
  StrategicProfile,
  StrategicProfileKey,
} from "@/lib/types";

export type IntentComponentInput = Readonly<{
  component: Extract<RankingComponent,
    | "intent-profile-alignment"
    | "intent-capability-alignment"
    | "focal-tower-support"
    | "intent-conflict"
    | "intent-exploration">;
  key: string;
  direction: "positive" | "negative";
  baseContribution: number;
  confidence: RecommendationConfidence;
  detail: string;
}>;

export type IntentCandidateEvaluation = Readonly<{
  components: readonly IntentComponentInput[];
  alignment: CandidateIntentAlignment;
}>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function confidenceFor(signal: MarginalSignal): RecommendationConfidence {
  for (const value of [signal.before, signal.after]) {
    const record = asRecord(value);
    if (!record || !Array.isArray(record.evidence)) continue;
    if (record.evidence.some((evidence) => asRecord(evidence)?.sourceConfidence === "medium")) {
      return "medium";
    }
  }
  if (signal.confidence === "partial") return "partial";
  return signal.confidence === "known" ? "high" : "unknown";
}

function confidenceForRelationship(confidence: string): RecommendationConfidence {
  const normalized = confidence.toLowerCase();
  if (normalized.includes("high")) return "high";
  if (normalized.includes("medium")) return "medium";
  return "unknown";
}

function highestPriority(intent: ResolvedBuildIntent): keyof typeof INTENT_PRIORITY_MULTIPLIERS {
  if (intent.focusedTowers.some((focus) => focus.priority === "maximum-depth")) {
    return "maximum-depth";
  }
  if (intent.focusedTowers.some((focus) => focus.priority === "balanced")) {
    return "balanced";
  }
  return intent.focusedTowers.length > 0 ? "explore" : "balanced";
}

function contribution(
  base: number,
  priority: keyof typeof INTENT_PRIORITY_MULTIPLIERS,
): number {
  return Math.sign(base) * Math.round(
    Math.abs(base) * INTENT_PRIORITY_MULTIPLIERS[priority],
  );
}

function component(
  input: Omit<IntentComponentInput, "baseContribution"> & { base: number },
  priority: keyof typeof INTENT_PRIORITY_MULTIPLIERS,
): IntentComponentInput {
  return Object.freeze({
    component: input.component,
    key: input.key,
    direction: input.direction,
    baseContribution: contribution(input.base, priority),
    confidence: input.confidence,
    detail: input.detail,
  });
}

function activeProfileKeys(interpretation: BuildInterpretation): Set<StrategicProfileKey> {
  return new Set(interpretation.strategicProfiles.map((profile) => profile.key));
}

function activeCapabilityKeys(interpretation: BuildInterpretation): Set<CapabilityKey> {
  return new Set(Object.values(interpretation.capabilities.capabilities)
    .filter((capability) => capability.status !== "unknown")
    .map((capability) => capability.key));
}

function profileSupportedByFocus(profile: StrategicProfile, focus: ResolvedTowerFocus): boolean {
  return profile.evidence.some((evidence) => evidence.towerName === focus.tower.name);
}

function initialAlignment(
  before: BuildInterpretation,
  intent: ResolvedBuildIntent,
  selectedTowerNames?: readonly string[],
): IntentAlignmentStatus {
  const activeProfiles = activeProfileKeys(before);
  const activeCapabilities = activeCapabilityKeys(before);
  const matchedProfiles = intent.preferredProfiles.filter((profile) => activeProfiles.has(profile));
  const matchedCapabilities = intent.preferredCapabilities.filter((capability) => (
    activeCapabilities.has(capability)
  ));
  const focusedSelected = intent.focusedTowers.some((focus) => (
    selectedTowerNames?.includes(focus.tower.name)
    || Object.values(before.capabilities.capabilities).some((capability) => (
      capability.supportingTowers.includes(focus.tower.name)
    ))
    || before.strategicProfiles.some((profile) => profileSupportedByFocus(profile, focus))
  ));
  const expectedMatches = intent.preferredProfiles.length + intent.preferredCapabilities.length;
  const matches = matchedProfiles.length + matchedCapabilities.length;

  if (expectedMatches === 0) return focusedSelected ? "aligned" : "neutral";
  if (matches === expectedMatches) return "aligned";
  if (matches > 0) return "partially-aligned";
  return before.strategicProfiles.length > 0 ? "diverges" : "neutral";
}

export function summarizeResolvedIntent(
  before: BuildInterpretation,
  intent: ResolvedBuildIntent,
  selectedTowerNames?: readonly string[],
): IntentSummary {
  const alignment = initialAlignment(before, intent, selectedTowerNames);
  const activeProfiles = activeProfileKeys(before);
  const conflictingProfiles = intent.preferredProfiles.filter((profile) => !activeProfiles.has(profile));
  const conflicts: IntentConflict[] = alignment === "diverges" && conflictingProfiles.length > 0
    ? [Object.freeze({
        key: conflictingProfiles.join(","),
        detail: `Current inferred profiles (${before.strategicProfiles.map((profile) => profile.key).join(", ")}) do not yet match the preferred ${conflictingProfiles.join(", ")} direction.`,
      })]
    : [];
  const notes = intent.focusedTowers.flatMap((focus) => (
    selectedTowerNames?.includes(focus.tower.name)
    || Object.values(before.capabilities.capabilities).some((capability) => (
      capability.supportingTowers.includes(focus.tower.name)
    ))
      || before.strategicProfiles.some((profile) => profileSupportedByFocus(profile, focus))
      ? []
      : [`${focus.tower.name} is a focal direction but is not currently selected; no future-path simulation is applied.`]
  ));

  return Object.freeze({
    focusedTowers: Object.freeze(intent.focusedTowers.map((focus) => Object.freeze({
      towerName: focus.tower.name,
      priority: focus.priority,
      selected: !notes.some((note) => note.startsWith(`${focus.tower.name} `)),
    }))),
    preferredProfiles: Object.freeze([...intent.preferredProfiles]),
    preferredCapabilities: Object.freeze([...intent.preferredCapabilities]),
    mode: intent.mode,
    alignment,
    conflicts: Object.freeze(conflicts),
    notes: Object.freeze(notes),
  });
}

function focusedProfiles(
  before: BuildInterpretation,
  focus: ResolvedTowerFocus,
): readonly StrategicProfile[] {
  return before.strategicProfiles.filter((profile) => profileSupportedByFocus(profile, focus));
}

function focusIsSelected(change: CandidateChangeEvaluation, focus: ResolvedTowerFocus): boolean {
  return change.candidate.towerName !== focus.tower.name
    && change.simulatedState.selectedTowers.some((selected) => (
      selected.towerName === focus.tower.name
    ));
}

export function evaluateIntentForCandidate(
  change: CandidateChangeEvaluation,
  intent: ResolvedBuildIntent,
  summary: IntentSummary,
): IntentCandidateEvaluation {
  const priority = highestPriority(intent);
  const components: IntentComponentInput[] = [];
  const matchedProfiles = new Set<StrategicProfileKey>();
  const matchedCapabilities = new Set<CapabilityKey>();
  const supportedFocalTowers = new Set<string>();
  const conflicts = [...summary.conflicts];
  const positiveProfileSignals = change.delta.strategicProfileSignals.filter((signal) => (
    signal.direction === "positive"
  ));
  const positiveCapabilitySignals = change.delta.capabilitySignals.filter((signal) => (
    signal.direction === "positive"
  ));

  for (const profile of intent.preferredProfiles) {
    const matchingProfileSignal = positiveProfileSignals.find((signal) => signal.key === profile);
    if (matchingProfileSignal) {
      matchedProfiles.add(profile);
      components.push(component({
        component: "intent-profile-alignment",
        key: profile,
        direction: "positive",
        base: INTENT_RANKING_WEIGHTS.profileAlignment,
        confidence: confidenceFor(matchingProfileSignal),
        detail: `${profile} is created or strengthened by supported marginal evidence, aligning with the player's preferred profile.`,
      }, priority));
      continue;
    }

    const matchingCapabilitySignal = positiveCapabilitySignals.find((signal) => (
      capabilitiesForStrategicProfile(profile).includes(signal.key as CapabilityKey)
    ));
    if (matchingCapabilitySignal) {
      matchedProfiles.add(profile);
      components.push(component({
        component: "intent-profile-alignment",
        key: `${profile}:${matchingCapabilitySignal.key}`,
        direction: "positive",
        base: INTENT_RANKING_WEIGHTS.profileAlignment,
        confidence: confidenceFor(matchingCapabilitySignal),
        detail: `${matchingCapabilitySignal.key} gains supported marginal evidence for the preferred ${profile} profile.`,
      }, priority));
    }
  }

  for (const capability of intent.preferredCapabilities) {
    const matchingSignal = positiveCapabilitySignals.find((signal) => signal.key === capability);
    if (!matchingSignal) continue;
    matchedCapabilities.add(capability);
    components.push(component({
      component: "intent-capability-alignment",
      key: capability,
      direction: "positive",
      base: INTENT_RANKING_WEIGHTS.capabilityAlignment,
      confidence: confidenceFor(matchingSignal),
      detail: `${capability} gains supported marginal evidence, aligning with the player's preferred capability.`,
    }, priority));
  }

  for (const focus of intent.focusedTowers) {
    if (!focusIsSelected(change, focus)) continue;
    const focusProfiles = focusedProfiles(change.before, focus);
    const profileKeys = new Set(focusProfiles.map((profile) => profile.key));

    for (const relationship of change.delta.relationships.filter((item) => (
      item.selectedTower === focus.tower.name
    ))) {
      if (relationship.kind === "synergy") {
        supportedFocalTowers.add(focus.tower.name);
        components.push(component({
          component: "focal-tower-support",
          key: `${change.candidate.towerName}:${focus.tower.name}:synergy`,
          direction: "positive",
          base: INTENT_RANKING_WEIGHTS.focalTowerSupport,
          confidence: confidenceForRelationship(relationship.confidence),
          detail: `Explicit mechanics synergy supports the selected focal tower ${focus.tower.name}.`,
        }, focus.priority));
      } else {
        conflicts.push(Object.freeze({
          key: `${change.candidate.towerName}:${focus.tower.name}`,
          detail: `Explicit mechanics anti-synergy conflicts with the selected focal tower ${focus.tower.name}.`,
        }));
        components.push(component({
          component: "intent-conflict",
          key: `${change.candidate.towerName}:${focus.tower.name}`,
          direction: "negative",
          base: INTENT_RANKING_WEIGHTS.focalTowerConflict,
          confidence: confidenceForRelationship(relationship.confidence),
          detail: `Explicit mechanics anti-synergy conflicts with the selected focal tower ${focus.tower.name}.`,
        }, focus.priority));
      }
    }

    for (const signal of positiveProfileSignals.filter((item) => profileKeys.has(item.key as StrategicProfileKey))) {
      supportedFocalTowers.add(focus.tower.name);
      components.push(component({
        component: "focal-tower-support",
        key: `${focus.tower.name}:${signal.key}:profile`,
        direction: "positive",
        base: INTENT_RANKING_WEIGHTS.focalTowerArchitectureSupport,
        confidence: confidenceFor(signal),
        detail: `${signal.key} is strengthened through a strategic profile already evidenced by focal tower ${focus.tower.name}.`,
      }, focus.priority));
    }

    for (const signal of change.delta.vulnerabilitySignals.filter((item) => item.direction === "positive")) {
      const vulnerability = change.before.vulnerabilities.find((item) => item.capability === signal.key);
      if (!vulnerability?.sourceProfiles.some((profile) => profileKeys.has(profile))) continue;
      supportedFocalTowers.add(focus.tower.name);
      components.push(component({
        component: "focal-tower-support",
        key: `${focus.tower.name}:${signal.key}:vulnerability`,
        direction: "positive",
        base: INTENT_RANKING_WEIGHTS.focalTowerArchitectureSupport,
        confidence: confidenceFor(signal),
        detail: `${signal.key} vulnerability relief supports the current architecture evidenced by focal tower ${focus.tower.name}.`,
      }, focus.priority));
    }
  }

  if (intent.mode === "explore") {
    for (const signal of positiveProfileSignals.filter((item) => item.before === null)) {
      components.push(component({
        component: "intent-exploration",
        key: signal.key,
        direction: "positive",
        base: INTENT_RANKING_WEIGHTS.explorationOption,
        confidence: confidenceFor(signal),
        detail: `${signal.key} is a supported new strategic option, given modest value by explore mode.`,
      }, "balanced"));
    }
  }

  const hasPositiveAlignment = matchedProfiles.size > 0
    || matchedCapabilities.size > 0
    || supportedFocalTowers.size > 0;
  const status: IntentAlignmentStatus = conflicts.length > summary.conflicts.length
    ? hasPositiveAlignment ? "partially-aligned" : "diverges"
    : hasPositiveAlignment
      ? summary.alignment === "diverges" ? "partially-aligned" : "aligned"
      : summary.alignment;

  return Object.freeze({
    components: Object.freeze(components),
    alignment: Object.freeze({
      status,
      matchedProfiles: Object.freeze([...matchedProfiles]),
      matchedCapabilities: Object.freeze([...matchedCapabilities]),
      supportedFocalTowers: Object.freeze([...supportedFocalTowers]),
      conflicts: Object.freeze(conflicts),
    }),
  });
}
