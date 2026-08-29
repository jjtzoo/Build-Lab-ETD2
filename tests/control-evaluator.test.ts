import { describe, expect, it } from "vitest";
import { TOWERS } from "@/lib/data";
import { evaluateControl } from "@/lib/engine/control-evaluator";
import { buildTowerState } from "@/lib/engine/tower-state";

describe("control evaluator", () => {
  it("keeps an uninvested tower UNKNOWN", () => {
    const tower = TOWERS.find(
      (value) => value.name === "Ice",
    );

    expect(tower).toBeDefined();

    const state = buildTowerState(
      tower!,
      [3, 3, 3, 1, 0, 1],
    );

    const result = evaluateControl({
      ...state,
      tier: 0,
    });

    expect(result.score).toBe(0);
    expect(result.status).toBe("UNKNOWN");
  });

  it("detects explicit control evidence", () => {
    const tower = TOWERS.find(
      (value) => value.name === "Ice",
    );

    expect(tower).toBeDefined();

    const state = buildTowerState(
      tower!,
      [3, 3, 3, 1, 0, 1],
    );

    const result = evaluateControl(state);

    expect(result.status).toBe("CONFIRMED");
    expect(result.signals.length).toBeGreaterThan(0);
  });
});