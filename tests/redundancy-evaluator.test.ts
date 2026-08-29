import { describe, expect, it } from "vitest";
import { evaluateRedundancy } from "@/lib/engine/redundancy-evaluator";
import type {
  TowerEvaluationBundle,
  TowerState,
} from "@/lib/engine/types";

function makeBundle(
  mainDPS: "Primary" | "Secondary" | "None",
): TowerEvaluationBundle {
  const state: TowerState = {
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
      mainDPS,
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

  const evidence = {
    score: null,
    status: "UNKNOWN" as const,
    confidence: "UNKNOWN" as const,
    reasons: [],
    signals: [],
    provenance: [],
  };

  return {
    state,
    role: {
      ...evidence,
      evaluator: "package",
    },
    dps: {
      ...evidence,
      evaluator: "dps",
    },
    control: {
      ...evidence,
      evaluator: "control",
    },
    coverage: {
      ...evidence,
      evaluator: "coverage",
    },
    amplification: {
      ...evidence,
      evaluator: "amplification",
    },
    range: {
      ...evidence,
      evaluator: "range",
    },
    scaling: {
      ...evidence,
      evaluator: "scaling",
    },
  };
}

describe("redundancy evaluator", () => {
  it("has no redundancy when only one tower provides a role", () => {
    const result = evaluateRedundancy([
      makeBundle("Primary"),
    ]);

    expect(result.raw).toBe(0);
    expect(result.duplicateRoles).toEqual({});
  });

  it("penalizes duplicated main DPS roles", () => {
    const result = evaluateRedundancy([
      makeBundle("Primary"),
      makeBundle("Primary"),
    ]);

    expect(result.raw).toBeGreaterThan(0);
    expect(result.duplicateRoles.main).toBe(1);
    expect(result.score).toBeLessThan(0);
  });
});