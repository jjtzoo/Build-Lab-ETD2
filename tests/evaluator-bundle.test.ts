import { describe, expect, it } from "vitest";
import { TOWERS } from "@/lib/data";
import { buildTowerState } from "@/lib/engine/tower-state";
import { evaluateTower } from "@/lib/engine/evaluator-bundle";

describe("tower evaluator bundle", () => {
  it("returns every independent evaluator for a tower state", () => {
    const tower = TOWERS.find(
      (value) => value.name === "Ice",
    );

    expect(tower).toBeDefined();

    const state = buildTowerState(
      tower!,
      [3, 3, 3, 1, 0, 1],
    );

    const result = evaluateTower(state);

    expect(result.state).toBe(state);
    expect(result.role).toBeDefined();
    expect(result.dps).toBeDefined();
    expect(result.control).toBeDefined();
    expect(result.coverage).toBeDefined();
    expect(result.amplification).toBeDefined();
    expect(result.range).toBeDefined();
    expect(result.scaling).toBeDefined();
  });

  it("preserves evaluator identity", () => {
    const tower = TOWERS.find(
      (value) => value.name === "Ice",
    );

    expect(tower).toBeDefined();

    const state = buildTowerState(
      tower!,
      [3, 3, 3, 1, 0, 1],
    );

    const result = evaluateTower(state);

    expect(result.dps.evaluator).toBe("dps");
    expect(result.control.evaluator).toBe("control");
    expect(result.coverage.evaluator).toBe("coverage");
    expect(result.amplification.evaluator).toBe(
      "amplification",
    );
    expect(result.range.evaluator).toBe("range");
    expect(result.scaling.evaluator).toBe("scaling");
  });
});