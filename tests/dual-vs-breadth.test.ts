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

function gate(): DecisionGate {
  return {
    name: "legality",
    passed: true,
    reason: "PASS",
  };
}

function tower(
  name: string,
  type: "Dual" | "Trio" | "Quad",
  tier: number,
): TowerState {
  return {
    tower: {
      name,
      type,
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
    tier,
    allocation: [3, 3, 2, 1, 1, 1],
    unlocked: true,
    maxTier: type === "Dual" ? 3 : type === "Trio" ? 2 : 1,
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
  state: TowerState,
  primaryDepth: number,
  primaryDps: number,
  completeness: number,
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
    towers: [state],
    legality: gate(),
    evaluators: {} as CandidateEvaluation["evaluators"],
    package: {
      score: completeness * 100,
      viability: true,
      primaryDps,
      secondaryDps: 0,
      primaryDepth,
      completeness,
      duplicatePenalty: 0,
      counts: {
        main: 1,
        sub: 0,
        control: completeness >= 0.55 ? 1 : 0,
        cover: completeness >= 0.55 ? 1 : 0,
        amp: 0,
        range: 0,
        scaling: 0,
        support: 0,
        manual: 0,
      },
      missing: [],
      primaryState: state,
      secondPrimary: null,
      provenance: [],
    },
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

describe("Dual versus Tri/Quad breadth", () => {
  it("prefers a deeply invested Dual over a shallow Tri with equal gates", () => {
    const dual = candidate(
      tower("Deep Dual", "Dual", 3),
      1,
      80,
      0.8,
    );

    const tri = candidate(
      tower("Shallow Tri", "Trio", 1),
      0.5,
      120,
      0.8,
    );

    expect(
      compareCandidates(tri, dual),
    ).toBeLessThan(0);
  });

  it("prefers a deeply invested Dual over a shallow Quad with equal gates", () => {
    const dual = candidate(
      tower("Deep Dual", "Dual", 3),
      1,
      80,
      0.8,
    );

    const quad = candidate(
      tower("Shallow Quad", "Quad", 1),
      0.33,
      120,
      0.8,
    );

    expect(
      compareCandidates(quad, dual),
    ).toBeLessThan(0);
  });

  it("allows breadth to win when the earlier decision criteria are genuinely equal", () => {
    const dual = candidate(
      tower("Deep Dual", "Dual", 3),
      1,
      100,
      0.8,
    );

    const tri = candidate(
      tower("Useful Tri", "Trio", 2),
      1,
      100,
      0.8,
    );

    expect(
      compareCandidates(tri, dual),
    ).toBe(0);
  });
});