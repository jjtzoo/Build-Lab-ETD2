import { describe, expect, it } from "vitest";
import { makeDecision } from "@/lib/engine/decision-engine";
import type {
  CandidateEvaluation,
  DecisionGate,
  EndgameEvaluation,
  OpportunityCostEvaluation,
  PackageEvaluation,
  RedundancyEvaluation,
  AntiSynergyEvaluation,
  SynergyEvaluation,
  TowerState,
} from "@/lib/engine/types";

function gate(passed: boolean): DecisionGate {
  return {
    name: "legality",
    passed,
    reason: passed ? "PASS" : "FAIL",
  };
}

function packageEvaluation(
  viability: boolean,
  primaryDps: number,
  primaryDepth: number,
  completeness: number,
): PackageEvaluation {
  return {
    score: 0,
    viability,
    primaryDps,
    secondaryDps: 0,
    primaryDepth,
    completeness,
    duplicatePenalty: 0,
    counts: {
      main: 1,
      sub: 0,
      control: 1,
      cover: 1,
      amp: 0,
      range: 0,
      scaling: 0,
      support: 0,
      manual: 0,
    },
    missing: [],
    primaryState: null,
    secondPrimary: null,
    provenance: [],
  };
}

function emptyTower(): TowerState {
  return {
    tower: {
      name: "Test",
      type: "Dual",
      recipe: ["Light", "Darkness"],
      role: "DPS",
      utility: "",
      damage: "Light",
      damageId: null,
      req: {
        Light: 1,
        Darkness: 1,
        Water: 0,
        Fire: 0,
        Nature: 0,
        Earth: 0,
      },
    },
    mechanics: null,
    tier: 1,
    allocation: [3, 3, 2, 1, 1, 1],
    unlocked: true,
    maxTier: 3,
    roles: {
      mainDPS: "Primary",
      subDPS: "None",
      control: "None",
      coverage: "None",
      amplification: "None",
      range: "None",
      scaling: "None",
      support: "None",
    },
    behavior: {
      burst: "UNKNOWN",
      sustained: "UNKNOWN",
      ramp: "UNKNOWN",
      stacking: "UNKNOWN",
      dot: "UNKNOWN",
      execute: "UNKNOWN",
      killScaling: "UNKNOWN",
      attackScaling: "UNKNOWN",
      frontLoaded: "UNKNOWN",
      backLoaded: "UNKNOWN",
      focused: "UNKNOWN",
      distributed: "UNKNOWN",
      chainReaction: "UNKNOWN",
    },
  };
}

function candidate(
  legalityPassed: boolean,
  viability: boolean,
  primaryDps: number,
): CandidateEvaluation {
  const synergy: SynergyEvaluation = {
    score: 0,
    realized: 0,
    anti: 0,
    edges: [],
    reasons: [],
    confidence: "UNKNOWN",
    provenance: [],
  };

  const opportunity: OpportunityCostEvaluation = {
    score: 0,
    opportunityLoss: 0,
    lostDepth: 0,
    lostDps: 0,
    replacementGain: 0,
    breadthCost: 0,
    selectedPrimary: null,
    bestAvailableReplacement: null,
    protection: "OFF",
    provenance: [],
  };

  const redundancy: RedundancyEvaluation = {
    score: 0,
    raw: 0,
    duplicateRoles: {},
    provenance: [],
  };

  const antiSynergy: AntiSynergyEvaluation = {
    score: 0,
    raw: 0,
    reasons: [],
    provenance: [],
  };

  const endgame: EndgameEvaluation = {
    score: 0,
    totalEssence: 2,
    spent: 0,
    selected: [],
    availablePure: [],
    periodicAvailable: false,
    periodicState: "UNKNOWN",
    reasons: [],
    provenance: [],
  };

  return {
    allocation: [3, 3, 2, 1, 1, 1],
    core: ["Light", "Darkness", "Water"],
    anchor: null,
    towers: [emptyTower()],
    legality: gate(legalityPassed),
    evaluators: {} as CandidateEvaluation["evaluators"],
    package: packageEvaluation(
      viability,
      primaryDps,
      1,
      1,
    ),
    synergy,
    opportunity,
    redundancy,
    antiSynergy,
    endgame,
    fineScore: 0,
  };
}

describe("decision engine", () => {
  it("prefers a candidate that passes legality", () => {
    const legal = candidate(true, false, 0);
    const illegal = candidate(false, true, 100);

    const result = makeDecision([
      illegal,
      legal,
    ]);

    expect(result.winner).toBe(legal);
    expect(result.gates[0].passed).toBe(true);
  });

  it("prefers viability before primary DPS magnitude", () => {
    const viable = candidate(true, true, 10);
    const nonViable = candidate(true, false, 100);

    const result = makeDecision([
      nonViable,
      viable,
    ]);

    expect(result.winner).toBe(viable);
  });

  it("uses primary DPS after the hierarchical gates tie", () => {
    const lower = candidate(true, true, 20);
    const higher = candidate(true, true, 40);

    const result = makeDecision([
      lower,
      higher,
    ]);

    expect(result.winner).toBe(higher);
  });
});