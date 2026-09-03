export type ElementName = "Light" | "Darkness" | "Water" | "Fire" | "Nature" | "Earth";
export type Allocation = [number, number, number, number, number, number];
export type ElementAllocation = Record<ElementName, number>;

export type Tower = {
  name: string;
  type: "Dual" | "Trio" | "Quad";
  recipe: ElementName[];
  role: string;
  utility: string;
  damage: string;
  damageId: number | null;
  req: Record<ElementName, number>;
};

export type MechanicsRecord = {
  tower: string;
  recipe: ElementName[];
  type: string;
  max_level: number;
  source_catalog_role: string;
  source_catalog_utility: string;
  stats: Record<string, unknown>;
  damage_profile?: { tags?: string[]; [key: string]: unknown };
  control?: Record<string, unknown>;
  coverage?: Record<string, unknown>;
  support_amplification?: Record<string, unknown>;
  economy?: Record<string, unknown>;
  progression?: Record<string, unknown>;
  core_mechanic: string;
  strategic_roles: string[];
  build_position: string;
  synergies: string[];
  anti_synergies: string[];
  dependencies: Record<string, unknown>;
  confidence: string;
};

export type SelectedTowerInput = {
  towerName: string;
  level: number;
};

export type SelectedTower = Readonly<SelectedTowerInput>;

export type BuildStateInput = {
  selectedTowers: readonly SelectedTowerInput[];
  elementAllocation: ElementAllocation;
  maxTowerSlots: number;
};

export type BuildState = Readonly<{
  selectedTowers: readonly SelectedTower[];
  elementAllocation: Readonly<ElementAllocation>;
  maxTowerSlots: number;
  remainingTowerSlots: number;
}>;

export type CapabilityKey =
  | "mainDps"
  | "subDps"
  | "singleTarget"
  | "aoeDps"
  | "burst"
  | "dot"
  | "execute"
  | "chain"
  | "slow"
  | "disable"
  | "geometryControl"
  | "damageAmp"
  | "attackSpeedAmp"
  | "areaAmp"
  | "range"
  | "uptime"
  | "attackSpeedScaling"
  | "killScaling"
  | "slowScaling"
  | "densityScaling"
  | "replication"
  | "economy"
  | "isolation"
  | "hpManipulation"
  | "chainReaction"
  | "speedManipulation"
  | "network"
  | "waveClear"
  | "bossSpecialist"
  | "globalFinisher"
  | "abilityCharge";

export type AttributeTier = "gold" | "silver" | "bronze";

export type TowerAttributeEvidence = Readonly<{
  tiers: Readonly<Partial<Record<CapabilityKey, AttributeTier>>>;
  sourceUrl: string;
  confidence: "medium";
  mechanicBasis?: string;
}>;

export type CapabilityEvidenceStatus = "known" | "partial" | "unknown";

export type CapabilityEvidenceSource =
  | "mechanics-tag"
  | "attribute-dataset"
  | "rule-layer"
  | "mechanics-omission";

export type CapabilityEvidence = Readonly<{
  capability: CapabilityKey;
  status: CapabilityEvidenceStatus;
  source: CapabilityEvidenceSource;
  sourceUrl?: string;
  sourceConfidence?: TowerAttributeEvidence["confidence"];
  towerName?: string;
  rawValue?: string;
  tier?: AttributeTier;
}>;

export type CapabilityAggregate = Readonly<{
  key: CapabilityKey;
  status: CapabilityEvidenceStatus;
  strongestTier: AttributeTier | null;
  supportingTowers: readonly string[];
  evidence: readonly CapabilityEvidence[];
}>;

export type BuildCapabilityProfile = Readonly<{
  capabilities: Readonly<Record<CapabilityKey, CapabilityAggregate>>;
}>;

export type ElementDirection = Readonly<{
  element: ElementName;
  footprintCount: number;
}>;

export type ElementalComposition = Readonly<{
  recipeFootprint: Readonly<ElementAllocation>;
  offensivePresence: Readonly<ElementAllocation>;
  direction: readonly ElementDirection[];
}>;

export type LegalNextCandidate = Readonly<{
  towerName: string;
  type: Tower["type"];
  recipe: readonly ElementName[];
  initialLevel: 1;
  maxLevel: number;
}>;

export type StrategicProfileKey =
  | "dot"
  | "burst"
  | "sustainedDps"
  | "aoeWaveClear"
  | "bossSingleTarget"
  | "control"
  | "support"
  | "scaling"
  | "economy"
  | "replicationNetwork"
  | "isolation"
  | "executionFinisher";

export type StrategicProfile = Readonly<{
  key: StrategicProfileKey;
  strongestTier: AttributeTier | null;
  confidence: CapabilityEvidenceStatus;
  supportingCapabilities: readonly CapabilityKey[];
  evidence: readonly CapabilityEvidence[];
  rationale: string;
}>;

export type RequirementRelevance = "primary" | "supporting";

export type CapabilityRequirement = Readonly<{
  capability: CapabilityKey;
  relevance: RequirementRelevance;
  sourceProfiles: readonly StrategicProfileKey[];
  confidence: CapabilityEvidenceStatus;
  rationale: string;
}>;

export type CapabilityGapStatus =
  | "strong"
  | "adequate"
  | "deficient"
  | "low-relevance"
  | "unknown";

export type CapabilityGap = Readonly<{
  capability: CapabilityKey;
  requirement: CapabilityRequirement | null;
  status: CapabilityGapStatus;
  rationale: string;
}>;

export type Compensation = Readonly<{
  gapCapability: CapabilityKey;
  compensatingCapabilities: readonly CapabilityKey[];
  confidence: CapabilityEvidenceStatus;
  rationale: string;
}>;

export type Vulnerability = Readonly<{
  capability: CapabilityKey;
  sourceProfiles: readonly StrategicProfileKey[];
  confidence: CapabilityEvidenceStatus;
  rationale: string;
}>;

export type BuildInterpretation = Readonly<{
  capabilities: BuildCapabilityProfile;
  elementalComposition: ElementalComposition;
  strategicProfiles: readonly StrategicProfile[];
  requirements: readonly CapabilityRequirement[];
  gaps: readonly CapabilityGap[];
  compensations: readonly Compensation[];
  vulnerabilities: readonly Vulnerability[];
}>;

export type MarginalSignalCategory =
  | "capability"
  | "strategic-profile"
  | "requirement"
  | "gap"
  | "compensation"
  | "vulnerability"
  | "element";

export type MarginalSignalDirection =
  | "positive"
  | "negative"
  | "neutral"
  | "mixed"
  | "unknown";

export type MarginalSignal = Readonly<{
  category: MarginalSignalCategory;
  direction: MarginalSignalDirection;
  key: string;
  before: unknown;
  after: unknown;
  confidence: CapabilityEvidenceStatus;
  reason: string;
}>;

export type ElementCompositionChangeKind = "introduced" | "reinforced";

export type ElementCompositionChange = Readonly<{
  element: ElementName;
  before: number;
  after: number;
  change: ElementCompositionChangeKind;
}>;

export type ElementDirectionChange = Readonly<{
  element: ElementName;
  beforePosition: number | null;
  afterPosition: number | null;
  beforeFootprintCount: number;
  afterFootprintCount: number;
  change: ElementCompositionChangeKind | "reordered";
}>;

export type ElementalCompositionDelta = Readonly<{
  recipeFootprintAdded: readonly ElementCompositionChange[];
  offensivePresenceAdded: readonly ElementCompositionChange[];
  directionChanges: readonly ElementDirectionChange[];
}>;

export type RedundancyEvidence = Readonly<{
  capability: CapabilityKey;
  candidateTower: string;
  existingStrongestTier: AttributeTier;
  candidateTier: AttributeTier | null;
  confidence: CapabilityEvidenceStatus;
  rationale: string;
}>;

export type OpportunityCostEvidence = Readonly<{
  slotsConsumed: number;
  remainingSlotsBefore: number;
  remainingSlotsAfter: number;
}>;

export type CandidateRelationshipKind = "synergy" | "anti-synergy";

export type CandidateRelationshipEvidence = Readonly<{
  kind: CandidateRelationshipKind;
  candidateTower: string;
  selectedTower: string;
  rawReference: string;
  source: "mechanics-record";
  confidence: string;
}>;

export type InterpretationDelta = Readonly<{
  capabilitySignals: readonly MarginalSignal[];
  strategicProfileSignals: readonly MarginalSignal[];
  requirementSignals: readonly MarginalSignal[];
  gapSignals: readonly MarginalSignal[];
  compensationSignals: readonly MarginalSignal[];
  vulnerabilitySignals: readonly MarginalSignal[];
  elementSignals: readonly MarginalSignal[];
  signals: readonly MarginalSignal[];
  elementalComposition: ElementalCompositionDelta;
  redundancy: readonly RedundancyEvidence[];
  opportunityCost: OpportunityCostEvidence;
  relationships: readonly CandidateRelationshipEvidence[];
}>;

export type CandidateChangeEvaluation = Readonly<{
  candidate: LegalNextCandidate;
  before: BuildInterpretation;
  simulatedState: BuildState;
  after: BuildInterpretation;
  delta: InterpretationDelta;
}>;

export type IntentAlignmentStatus =
  | "aligned"
  | "partially-aligned"
  | "diverges"
  | "neutral";

export type IntentConflict = Readonly<{
  key: string;
  detail: string;
}>;

export type ResolvedIntentFocusSummary = Readonly<{
  towerName: string;
  priority: "explore" | "balanced" | "maximum-depth";
  selected: boolean;
}>;

export type IntentSummary = Readonly<{
  focusedTowers: readonly ResolvedIntentFocusSummary[];
  preferredProfiles: readonly StrategicProfileKey[];
  preferredCapabilities: readonly CapabilityKey[];
  mode: "normal" | "explore";
  alignment: IntentAlignmentStatus;
  conflicts: readonly IntentConflict[];
  notes: readonly string[];
}>;

export type CandidateIntentAlignment = Readonly<{
  status: IntentAlignmentStatus;
  matchedProfiles: readonly StrategicProfileKey[];
  matchedCapabilities: readonly CapabilityKey[];
  supportedFocalTowers: readonly string[];
  conflicts: readonly IntentConflict[];
}>;

export type RankingComponent =
  | "vulnerability-relief"
  | "primary-gap-relief"
  | "supporting-gap-relief"
  | "strategic-fit"
  | "capability-improvement"
  | "synergy"
  | "element-direction"
  | "strategic-option"
  | "redundancy"
  | "anti-synergy"
  | "new-requirement"
  | "opportunity-cost"
  | "intent-profile-alignment"
  | "intent-capability-alignment"
  | "focal-tower-support"
  | "intent-conflict"
  | "intent-exploration";

export type RecommendationConfidence = "high" | "medium" | "partial" | "unknown";

export type RecommendationCategory =
  | "high-priority"
  | "strong-fit"
  | "useful"
  | "situational"
  | "low-impact";

export type RecommendationReason = Readonly<{
  component: RankingComponent;
  direction: MarginalSignalDirection;
  key: string;
  confidence: RecommendationConfidence;
  detail: string;
}>;

export type RankingComponentResult = Readonly<{
  component: RankingComponent;
  key: string;
  contribution: number;
  direction: MarginalSignalDirection;
  confidence: RecommendationConfidence;
  reason: RecommendationReason;
}>;

export type RankedCandidate = Readonly<{
  rank: number;
  candidate: LegalNextCandidate;
  contextualValue: number;
  confidence: RecommendationConfidence;
  category: RecommendationCategory;
  components: readonly RankingComponentResult[];
  strengths: readonly RecommendationReason[];
  tradeoffs: readonly RecommendationReason[];
  warnings: readonly RecommendationReason[];
  change: CandidateChangeEvaluation;
  intentAlignment?: CandidateIntentAlignment;
}>;

export type CandidateRanking = Readonly<{
  rankedCandidates: readonly RankedCandidate[];
  topRecommendation: RankedCandidate | null;
  intent?: IntentSummary;
}>;

export type FuturePathStep = "first" | "second";

export type FuturePathReason = Readonly<{
  step: FuturePathStep;
  reason: RecommendationReason;
}>;

export type FuturePathExplanation = Readonly<{
  immediate: string;
  continuation: string;
  policy: string;
}>;

export type FuturePath = Readonly<{
  rank: number;
  first: RankedCandidate;
  stateAfterFirst: BuildState;
  second: RankedCandidate | null;
  stateAfterSecond: BuildState | null;
  continuationStatus: "available" | "unavailable";
  immediateValue: number;
  continuationValue: number | null;
  pathValue: number;
  confidence: RecommendationConfidence;
  strengths: readonly FuturePathReason[];
  tradeoffs: readonly FuturePathReason[];
  warnings: readonly FuturePathReason[];
  explanation: FuturePathExplanation;
}>;

export type FuturePathComparison = Readonly<{
  immediateTopCandidate: string | null;
  bestPathFirstCandidate: string | null;
  differs: boolean;
  detail: string;
}>;

export type FuturePathRanking = Readonly<{
  firstStepLimit: number;
  futureDiscount: number;
  immediateTopRecommendation: RankedCandidate | null;
  paths: readonly FuturePath[];
  bestPath: FuturePath | null;
  comparison: FuturePathComparison;
}>;

export type SequentialInterpretationSummary = Readonly<{
  strategicProfiles: readonly StrategicProfile[];
  vulnerabilities: readonly Vulnerability[];
  relevantGaps: readonly CapabilityGap[];
  compensations: readonly Compensation[];
}>;

export type SerializedRankedCandidate = Readonly<{
  rank: number;
  candidate: LegalNextCandidate;
  contextualValue: number;
  confidence: RecommendationConfidence;
  category: RecommendationCategory;
  strengths: readonly RecommendationReason[];
  tradeoffs: readonly RecommendationReason[];
  warnings: readonly RecommendationReason[];
  components: readonly RankingComponentResult[];
  intentAlignment?: CandidateIntentAlignment;
}>;

export type SerializedFuturePath = Readonly<{
  rank: number;
  first: SerializedRankedCandidate;
  stateAfterFirst: BuildState;
  second: SerializedRankedCandidate | null;
  stateAfterSecond: BuildState | null;
  continuationStatus: "available" | "unavailable";
  immediateValue: number;
  continuationValue: number | null;
  pathValue: number;
  confidence: RecommendationConfidence;
  strengths: readonly FuturePathReason[];
  tradeoffs: readonly FuturePathReason[];
  warnings: readonly FuturePathReason[];
  explanation: FuturePathExplanation;
}>;

export type SerializedFuturePathRanking = Readonly<{
  firstStepLimit: number;
  futureDiscount: number;
  immediateTopRecommendation: SerializedRankedCandidate | null;
  paths: readonly SerializedFuturePath[];
  bestPath: SerializedFuturePath | null;
  comparison: FuturePathComparison;
}>;

export type SequentialRecommendationResponse = Readonly<{
  engineVersion: string;
  state: BuildState;
  interpretation: SequentialInterpretationSummary;
  topRecommendation: SerializedRankedCandidate | null;
  candidates: readonly SerializedRankedCandidate[];
  warnings: readonly string[];
  intent?: IntentSummary;
  lookahead?: SerializedFuturePathRanking;
}>;

export type Candidate = {
  allocation: Allocation;
  score: number;
  activeElements: number;
  unlocked: Tower[];
  selected: Tower[];
};
