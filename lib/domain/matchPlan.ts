import type { ElementAllocation, ElementName } from "./elements";
import type { GridPoint, WaveMode } from "./mapConfig";
import type { LiveMatchLength } from "@/lib/engine/liveEconomy";
import type { MatchPlanDifficulty } from "@/lib/engine/waveBenchmarks";

export const MATCH_PLAN_SCHEMA = "etd2-match-plan/1" as const;
export const MATCH_PLAN_STORAGE_KEY = "etd2:match-plan:v1";

export type MatchPlanPhaseId =
  | "1-5"
  | "6-10"
  | "11-15"
  | "16-20"
  | "21-25"
  | "26-30"
  | "31-35"
  | "36-40"
  | "41-45"
  | "46-50"
  | "51-55"
  | "56-60"
  | "61-70";

export type PlannedTowerState = {
  copyId: string;
  towerId: string;
  towerName: string;
  level: number;
  quantity: number;
  purpose: string;
  roles: readonly string[];
  status: "temporary" | "permanent";
  effect: "damage" | "global-buff" | "debuff" | "hybrid";
  globalBuff: boolean;
  directHitDebuff: boolean;
  cell: GridPoint | null;
  cellLabel: string | null;
  campId: string | null;
  finalForm?: { towerId: string; level: number };
};

export type MatchPlanActionType =
  | "allocate-element"
  | "build"
  | "upgrade"
  | "evolve"
  | "reserve-cell"
  | "release-cell"
  | "remove-temporary"
  | "sell";

export type MatchPlanAction = {
  id: string;
  phaseId: MatchPlanPhaseId;
  order: number;
  type: MatchPlanActionType;
  summary: string;
  reason: string;
  element?: ElementName;
  elementLevel?: number;
  towerId?: string;
  towerName?: string;
  /** For an "evolve" action: the tower this copy was upgraded from. */
  fromTowerId?: string;
  fromTowerName?: string;
  copyId?: string;
  fromLevel?: number;
  toLevel?: number;
  cost: number;
  /** Gold returned by a sell action, at the verified refund rate. */
  refund?: number;
  legal: boolean;
  affordable: boolean;
  waitForGold?: number;
  targetWave?: number;
  cell?: GridPoint;
  cellLabel?: string;
  campId?: string;
  temporary?: boolean;
};

export type ElementCoverageRow = {
  defender: ElementName;
  bestMultiplier: number | null;
  weightedMultiplier: number | null;
  status: "strong" | "covered" | "weak" | "critical" | "unknown";
  contributors: readonly {
    towerId: string;
    towerName: string;
    quantity: number;
    baseDps: number | null;
    multiplier: number;
  }[];
  repair: string | null;
};

export type MatchPlanCamp = {
  id: string;
  name: string;
  cells: readonly GridPoint[];
  capacity: number;
  viable: boolean;
  coveragePercent: number;
  firstContactSeconds: number | null;
  lastContactSeconds: number | null;
  routeRemainingSeconds: number;
  laneCoverage: readonly { pathId: string; coveragePercent: number }[];
};

export type MatchPlanEconomy = {
  /** Net gold committed so far: purchases minus sell refunds. */
  cumulativeCost: number;
  phaseCost: number;
  /** Gold recovered by selling temporary copies in this window. */
  phaseRefund: number;
  phaseStartGold: number;
  incomeThisPhase: number;
  phaseEndGold: number;
  /**
   * The window's gold wave by wave: what each wave pays, what is bought (or
   * sold) for it, and the bank left once it clears. Actions land on the wave
   * they are due before, clamped into this window, so the last entry's
   * bankAfter equals phaseEndGold.
   */
  waveLedger: readonly MatchPlanWaveLedgerEntry[];
  goldLowerBound: number;
  goldUpperBound: number;
  emergencyReserve: number;
  spendableLowerBound: number;
  affordable: boolean;
  assumptions: readonly string[];
};

export type MatchPlanWaveLedgerEntry = {
  wave: number;
  income: number;
  spend: number;
  refund: number;
  bankAfter: number;
  /** Actions due before this wave (the last wave also takes later ones). */
  actionIds: readonly string[];
};

export type MatchPlanWaveSurvival = {
  wave: number;
  element: ElementName | "Composite" | "Boss";
  ability: string | null;
  /** Creeps in the wave; null on a boss wave until a capture measures it. */
  count: number | null;
  hpPerCreep: number;
  effectiveWaveHp: number;
  modeledDamage: number | null;
  margin: number | null;
  estimatedLeaks: number | null;
  status: "survives" | "borderline" | "fails" | "unverified";
  limitingFactor: string | null;
};

export type MatchPlanSurvival = {
  status: "survives" | "borderline" | "fails" | "unverified";
  worstWave: number | null;
  margin: number | null;
  waves: readonly MatchPlanWaveSurvival[];
  assumptions: readonly string[];
};

export type MatchPlanPhase = {
  id: MatchPlanPhaseId;
  index: number;
  label: string;
  startWave: number;
  endWave: number | null;
  startAllocation: ElementAllocation;
  endAllocation: ElementAllocation;
  startTowers: readonly PlannedTowerState[];
  endTowers: readonly PlannedTowerState[];
  actions: readonly MatchPlanAction[];
  economy: MatchPlanEconomy;
  survival: MatchPlanSurvival;
  coverage: readonly ElementCoverageRow[];
  reservedCells: readonly { copyId: string; cell: GridPoint; label: string }[];
  risks: readonly string[];
  recoveries: readonly string[];
  confidence: "high" | "medium" | "low";
};

export type MatchPlanOverride =
  | { id: string; kind: "reserve"; value: number }
  | { id: string; kind: "allocation-order"; elements: readonly ElementName[] }
  | {
      id: string;
      kind: "phase-action";
      actionId: string;
      phaseId: MatchPlanPhaseId;
    }
  | {
      id: string;
      kind: "cell";
      copyId: string;
      cell: GridPoint;
      campId?: string;
    }
  | { id: string; kind: "retain-temporary"; copyId: string; retain: boolean };

export type MatchPlan = {
  schema: typeof MATCH_PLAN_SCHEMA;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sourceBuildSchema: string;
  sourceBuild: unknown;
  settings: {
    mapId: string;
    mode: WaveMode;
    matchLength: LiveMatchLength;
    difficulty: MatchPlanDifficulty;
    reserveGold: number;
  };
  camps: readonly MatchPlanCamp[];
  phases: readonly MatchPlanPhase[];
  overrides: readonly MatchPlanOverride[];
  violations: readonly string[];
};

export type CopilotAction = {
  schema: "etd2-copilot-action/1";
  planId: string;
  actionId: string;
  phaseId: MatchPlanPhaseId;
  waveWindow: { start: number; end: number | null };
  sequence: number;
  command: MatchPlanActionType;
  tower?: {
    id: string;
    name: string;
    copyId?: string;
    fromLevel?: number;
    toLevel?: number;
    /** "evolve" only: the tower this same copy was upgraded from. */
    fromTowerId?: string;
    fromTowerName?: string;
  };
  element?: { name: ElementName; level: number };
  placement?: {
    mapId: string;
    mode: WaveMode;
    campId?: string;
    cell?: GridPoint;
    label?: string;
  };
  economy: {
    cost: number;
    refund?: number;
    legal: boolean;
    affordableAtLowerBound: boolean;
    waitForGold?: number;
  };
  temporary: boolean;
  reason: string;
};

export function isMatchPlan(value: unknown): value is MatchPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<MatchPlan>;
  return (
    plan.schema === MATCH_PLAN_SCHEMA &&
    typeof plan.id === "string" &&
    !!plan.settings &&
    Array.isArray(plan.phases) &&
    // 12 windows before the boss stage was split in two (2026-09-15), 13
    // after. A stored plan is regenerated from its source build on load,
    // so an older shape only has to be recognised, not read.
    (plan.phases.length === 12 || plan.phases.length === 13) &&
    Array.isArray(plan.camps) &&
    Array.isArray(plan.overrides)
  );
}

export function parseMatchPlan(raw: string | null): MatchPlan | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isMatchPlan(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
