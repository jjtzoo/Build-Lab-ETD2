import { describe, expect, it } from "vitest";
import { TOWERS } from "@/lib/data";
import { evaluateDps } from "@/lib/engine/dps-evaluator";
import { buildTowerState } from "@/lib/engine/tower-state";

describe("DPS evaluator", () => {
  it("keeps an uninvested tower at UNKNOWN", () => {
    const tower = TOWERS.find(
      (value) => value.name === "Ice",
    );

    expect(tower).toBeDefined();

    const state = buildTowerState(
      tower!,
      [3, 0, 0, 3, 3, 2],
    );

    const result = evaluateDps(state);

    expect(result.score).toBe(0);
    expect(result.status).toBe("UNKNOWN");
  });

  it("produces a numeric DPS score when mechanics data is available", () => {
    const tower = TOWERS.find(
      (value) => value.name === "Ice",
    );

    expect(tower).toBeDefined();

    const state = buildTowerState(
      tower!,
      [3, 3, 3, 1, 0, 1],
    );

    const result = evaluateDps(state);

    expect(result.status).toBe("CONFIRMED");
    expect(result.score).not.toBeNull();
    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThan(0);
  });
});