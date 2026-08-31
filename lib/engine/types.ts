import type { Allocation, ElementName, MechanicsRecord, Tower } from "@/lib/types";

export type EvaluationConfidence = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export type EvidenceStatus = "CONFIRMED" | "PARTIAL" | "UNKNOWN";

export type EvaluatorName =
  | "dps"
  | "control"
  | "coverage"
  | "amplification"
  | "range"
  | "scaling"
  | "package"
  | "synergy"
  | "opportunity"
  | "redundancy"
  | "anti-synergy"
  | "endgame";

export type RoleLevel = "Primary" | "Secondary" | "None";

export interface TowerState {
  tower: Tower;
  mechanics: MechanicsRecord | null;
  tier: number;
  allocation: Allocation;

  unlocked: boolean;
  maxTier: number;

  roles: {
    mainDPS: RoleLevel;
    subDPS: RoleLevel;
    control: RoleLevel;
    coverage: RoleLevel;
    amplification: RoleLevel;
    range: RoleLevel;
    scaling: RoleLevel;
    support: RoleLevel;
  };

  behavior: {
    burst: EvidenceStatus;
    sustained: EvidenceStatus;
    ramp: EvidenceStatus;
    stacking: EvidenceStatus;
    dot: EvidenceStatus;
    execute: EvidenceStatus;
    killScaling: EvidenceStatus;
    attackScaling: EvidenceStatus;
    frontLoaded: EvidenceStatus;
    backLoaded: EvidenceStatus;
    focused: EvidenceStatus;
    distributed: EvidenceStatus;
    chainReaction: EvidenceStatus;
  };
}

export interface EvaluatorEvidence {
  evaluator: EvaluatorName;
  score: number | null;
  status: EvidenceStatus;
  confidence: EvaluationConfidence;

  reasons: string[];
  signals: string[];

  provenance: string[];
}

export interface TowerEvaluationBundle {
  state: TowerState;

  role: EvaluatorEvidence;
  dps: EvaluatorEvidence;
  control: EvaluatorEvidence;
  coverage: EvaluatorEvidence;
  amplification: EvaluatorEvidence;
  range: EvaluatorEvidence;
  scaling: EvaluatorEvidence;
}

export interface SynergyEdge {
  from: string;
  to: string;

  value: number;
  realizedValue: number;
  antiSynergyValue: number;

  reason: string;
  confidence: EvaluationConfidence;
}

export interface SynergyGraph {
  nodes: string[];
  edges: SynergyEdge[];
}

export interface SynergyEvaluation {
  score: number;
  realized: number;
  anti: number;

  edges: SynergyEdge[];
  reasons: string[];

  confidence: EvaluationConfidence;
  provenance: string[];
}

export interface OpportunityCostEvaluation {
  score: number;
  opportunityLoss: number;

  lostDepth: number;
  lostDps: number;
  replacementGain: number;
  breadthCost: number;

  selectedPrimary: TowerState | null;
  bestAvailableReplacement: TowerState | null;

  protection: "PROTECTED" | "PARTIAL" | "OFF" | "DEFERRED";

  provenance: string[];
}

export interface RedundancyEvaluation {
  score: number;
  raw: number;

  duplicateRoles: Record<string, number>;

  provenance: string[];
}

export interface AntiSynergyEvaluation {
  score: number;
  raw: number;

  reasons: string[];

  provenance: string[];
}

export interface EndgameSelection {
  kind: "Pure" | "Periodic";
  element?: ElementName;
  value: number;
  essenceCost: number;

  reason: string;
}

export interface EndgameEvaluation {
  score: number;

  totalEssence: number;
  spent: number;

  selected: EndgameSelection[];

  availablePure: ElementName[];
  periodicAvailable: boolean;

  periodicState:
    | "AVAILABLE"
    | "UNAVAILABLE"
    | "DEFERRED"
    | "UNKNOWN";

  reasons: string[];

  provenance: string[];
}

export interface PackageEvaluation {
  score: number;

  viability: boolean;

  primaryDps: number;
  secondaryDps: number;
  primaryDepth: number;

  completeness: number;
  duplicatePenalty: number;

  counts: {
    main: number;
    sub: number;
    control: number;
    cover: number;
    amp: number;
    range: number;
    scaling: number;
    support: number;
    manual: number;
  };

  missing: string[];

  primaryState: TowerState | null;
  secondPrimary: TowerState | null;

  provenance: string[];
}

import type {
  AllocationProfile,
} from "./allocation-profile";

import type {
  AnchorProfile,
} from "./anchor-profile";

export interface CandidateEvaluation {
  allocation: Allocation;
  availableTowers?: TowerState[];
  core: ElementName[];
  anchor: string | null;

  allocationProfile: AllocationProfile;

  anchorProfile: AnchorProfile;

  towers: TowerState[];

  legality: DecisionGate;

  evaluators: Record<
  | "dps"
  | "control"
  | "coverage"
  | "amplification"
  | "range"
  | "scaling",
  EvaluatorEvidence>;

  package: PackageEvaluation;
  synergy: SynergyEvaluation;
  opportunity: OpportunityCostEvaluation;
  redundancy: RedundancyEvaluation;
  antiSynergy: AntiSynergyEvaluation;
  endgame: EndgameEvaluation;

  fineScore: number;
}

export interface DecisionGate {
  name:
    | "legality"
    | "viability"
    | "primaryFunction"
    | "investmentQuality"
    | "packageComplete";

  passed: boolean;
  reason: string;
}

export interface DecisionTuple {
  legality: boolean;
  viability: boolean;
  primaryFunction: boolean;
  investmentQuality: boolean;
  packageComplete: boolean;

  primaryDps: number;
  investmentDepth: number;

  opportunityLoss: number;
  realizedSynergy: number;
  redundancy: number;
  antiSynergy: number;
  endgame: number;
  fineScore: number;
}

export interface DecisionResult {
  winner: CandidateEvaluation | null;

  gates: DecisionGate[];

  tuple: DecisionTuple | null;

  finalists: CandidateEvaluation[];

  rationale: string[];

  engineVersion: string;
}