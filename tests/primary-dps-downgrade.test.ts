import { describe, expect, it } from "vitest";
import { compareCandidates } from "@/lib/engine/decision-engine";
import type {
  CandidateEvaluation,
  DecisionGate,
  EndgameEvaluation,
  OpportunityCostEvaluation,
  RedundancyEvaluation,
  SynergyEvaluation,
  TowerState,
} from "@/lib/engine/types";

function makeTower(): TowerState {
  return {
    tower: {
      name: "Primary Tower",
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
  opportunityLoss: number,
): CandidateEvaluation {
  const tower = makeTower();

  const packageEvaluation = {
    score: 100,
    viability: true,
    primaryDps: 100,
    secondaryDps: 0,
    primaryDepth: 1,
    completeness: 1,
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
    primaryState: tower,
    secondPrimary: null,
    provenance: [],
  };

  const opportunity: OpportunityCostEvaluation = {
    score: -opportunityLoss,
    opportunityLoss,
    lostDepth: 0,
    lostDps: 0,
    replacementGain: 0,
    breadthCost: opportunityLoss,
    selectedPrimary: tower,
    bestAvailableReplacement: null,
    protection: "PARTIAL",
    provenance: [],
  };

  const synergy: SynergyEvaluation = {
    score: 0,
    realized: 0,
    anti: 0,
    edges: [],
    reasons: [],
    confidence: "UNKNOWN",
    provenance: [],
  };

  const redundancy: RedundancyEvaluation = {
    score: 0,
    raw: 0,
    duplicateRoles: {},
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

  const legality: DecisionGate = {
    name: "legality",
    passed: true,
    reason: "PASS",
  };

  return {
    allocation: [3, 3, 2, 1, 1, 1],
    core: ["Light", "Darkness", "Water"],
    anchor: null,
    towers: [tower],
    legality,
    evaluators: {} as CandidateEvaluation["evaluators"],
    package: packageEvaluation,
    synergy,
    opportunity,
    redundancy,
    antiSynergy: {
      score: 0,
      raw: 0,
      reasons: [],
      provenance: [],
    },
    endgame,
    fineScore: 0,
  };
}

describe("primary DPS downgrade protection", () => {
  it("prefers the candidate with lower opportunity cost when earlier criteria tie", () => {
    const protectedCandidate = makeCandidate(1);
    const downgradedCandidate = makeCandidate(5);

    expect(
      compareCandidates(
        downgradedCandidate,
        protectedCandidate,
      ),
    ).toBeLessThan(0);

    expect(
      protectedCandidate.opportunity.opportunityLoss,
    ).toBeLessThan(
      downgradedCandidate.opportunity.opportunityLoss,
    );
  });
});