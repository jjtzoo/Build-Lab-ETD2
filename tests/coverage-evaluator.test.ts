import { describe, expect, it } from "vitest";
import { TOWERS } from "@/lib/data";
import { evaluateCoverage } from "@/lib/engine/coverage-evaluator";
import { buildTowerState } from "@/lib/engine/tower-state";

describe("coverage evaluator", () => {
  it("keeps an uninvested tower UNKNOWN", () => {
    const tower = TOWERS.find(
      (value) => value.name === "Ice",
    );

    expect(tower).toBeDefined();

    const state = buildTowerState(
      tower!,
      [3, 3, 3, 1, 0, 1],
    );

    const result = evaluateCoverage({
      ...state,
      tier: 0,
    });

    expect(result.score).toBe(0);
    expect(result.status).toBe("UNKNOWN");
  });

  it("recognizes explicit coverage evidence", () => {
    const tower = TOWERS.find(
      (value) => value.name === "Ice",
    );

    expect(tower).toBeDefined();

    const state = buildTowerState(
      tower!,
      [3, 3, 3, 1, 0, 1],
    );

    const result = evaluateCoverage(state);

    expect(result.status).toBe("CONFIRMED");
    expect(result.signals.length).toBeGreaterThan(0);
  });
});