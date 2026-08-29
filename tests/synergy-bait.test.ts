import { describe, expect, it } from "vitest";
import {
  compareCandidates,
} from "@/lib/engine/decision-engine";
import type {
  CandidateEvaluation,
  DecisionGate,
  EndgameEvaluation,
  OpportunityCostEvaluation,
  RedundancyEvaluation,
  SynergyEvaluation,
  TowerState,
} from "@/lib/engine/types";

function makeGate(
  passed: boolean,
): DecisionGate {
  return {
    name: "legality",
    passed,
    reason: passed ? "PASS" : "FAIL",
  };
}

function makeTower(): TowerState {
  return {
    tower: {
      name: "Test Tower",
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
    tier: 3,
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

function makeCandidate(
  completeness: number,
  synergy: number,
): CandidateEvaluation {
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

  const antiSynergy = {
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

  const synergyEvaluation: SynergyEvaluation = {
    score: synergy,
    realized: synergy,
    anti: 0,
    edges: [],
    reasons: [],
    confidence: "HIGH",
    provenance: [],
  };

  return {
    allocation: [3, 3, 2, 1, 1, 1],
    core: ["Light", "Darkness", "Water"],
    anchor: null,
    towers: [makeTower()],
    legality: makeGate(true),
    evaluators: {} as CandidateEvaluation["evaluators"],
    package: {
      score: completeness * 100,
      viability: true,
      primaryDps: 50,
      secondaryDps: 0,
      primaryDepth: 1,
      completeness,
      duplicatePenalty: 0,
      counts: {
        main: 1,
        sub: 0,
        control: 1,
        cover: completeness >= 0.55 ? 1 : 0,
        amp: 0,
        range: 0,
        scaling: 0,
        support: 0,
        manual: 0,
      },
      missing:
        completeness >= 0.55
          ? []
          : ["Coverage"],
      primaryState: makeTower(),
      secondPrimary: null,
      provenance: [],
    },
    synergy: synergyEvaluation,
    opportunity,
    redundancy,
    antiSynergy,
    endgame,
    fineScore: synergy * 100,
  };
}

describe("synergy bait protection", () => {
  it("does not let high synergy rescue an incomplete package", () => {
    const complete = makeCandidate(
      0.8,
      10,
    );

    const bait = makeCandidate(
      0.4,
      100,
    );

    expect(
      compareCandidates(bait, complete),
    ).toBeLessThan(0);

    expect(
      complete.package.completeness,
    ).toBeGreaterThanOrEqual(0.55);

    expect(
      bait.package.completeness,
    ).toBeLessThan(0.55);
  });
});