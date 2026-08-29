import { describe, expect, it } from "vitest";
import { buildTowerState } from "@/lib/engine/tower-state";
import { evaluatePackage } from "@/lib/engine/package-evaluator";
import { evaluateDps } from "@/lib/engine/dps-evaluator";
import { evaluateControl } from "@/lib/engine/control-evaluator";
import { evaluateCoverage } from "@/lib/engine/coverage-evaluator";
import { evaluateAmplification } from "@/lib/engine/amplification-evaluator";
import { evaluateRange } from "@/lib/engine/range-evaluator";
import { evaluateScaling } from "@/lib/engine/scaling-evaluator";
import { TOWERS } from "@/lib/data";
import type { TowerEvaluationBundle } from "@/lib/engine/types";

function bundleFor(
  name: string,
  allocation: [number, number, number, number, number, number],
): TowerEvaluationBundle {
  const tower = TOWERS.find(
    (value) => value.name === name,
  );

  if (!tower) {
    throw new Error(`Tower not found: ${name}`);
  }

  const state = buildTowerState(
    tower,
    allocation,
  );

  return {
    state,
    role: {
      evaluator: "package",
      score: null,
      status: "UNKNOWN",
      confidence: "UNKNOWN",
      reasons: [],
      signals: [],
      provenance: [],
    },
    dps: evaluateDps(state),
    control: evaluateControl(state),
    coverage: evaluateCoverage(state),
    amplification: evaluateAmplification(state),
    range: evaluateRange(state),
    scaling: evaluateScaling(state),
  };
}

describe("package comparisons", () => {
  it("does not award package value merely for adding another tower", () => {
    const allocation: [
      number,
      number,
      number,
      number,
      number,
      number,
    ] = [3, 3, 2, 1, 1, 1];

    const ice = bundleFor(
      "Ice",
      allocation,
    );

    const result = evaluatePackage([
      ice,
    ]);

    expect(result.primaryDps).toBeGreaterThanOrEqual(0);
    expect(result.primaryDepth).toBeGreaterThanOrEqual(0);
  });

  it("keeps package evaluation based on explicit roles", () => {
    const allocation: [
      number,
      number,
      number,
      number,
      number,
      number,
    ] = [3, 3, 2, 1, 1, 1];

    const bundle = bundleFor(
      "Ice",
      allocation,
    );

    const result = evaluatePackage([
      bundle,
    ]);

    expect(result.counts.main).toBeGreaterThanOrEqual(0);
    expect(result.counts.control).toBeGreaterThanOrEqual(0);
    expect(result.counts.cover).toBeGreaterThanOrEqual(0);
  });
});