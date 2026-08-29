import { describe, expect, it } from "vitest";
import { optimize } from "@/lib/engine/allocation";
import { optimizeV8 } from "@/lib/engine/v8-optimizer";

describe("legacy vs V8 benchmark", () => {
  it("compares both optimizers on the same core", () => {
    const core = [
      "Light",
      "Darkness",
      "Water",
    ] as const;

    const legacy = optimize([...core]);
    const v8 = optimizeV8([...core]);

    expect(legacy.length).toBeGreaterThan(0);
    expect(v8.evaluations.length).toBeGreaterThan(0);
    expect(v8.winner).not.toBeNull();

    console.log("LEGACY TOP:", {
      allocation: legacy[0]?.allocation,
      score: legacy[0]?.score,
      selected: legacy[0]?.selected.map(
        (tower) => tower.name,
      ),
    });

    /*console.log("V8 WINNER:", {
      allocation: v8.winner?.allocation,
      fineScore: v8.winner?.fineScore,
      selected: v8.winner?.towers.map(
        (tower) => tower.tower.name,
      ),
      primaryDps: v8.winner?.package.primaryDps,
      completeness: v8.winner?.package.completeness,
      synergy: v8.winner?.synergy.realized,
      opportunityLoss:
        v8.winner?.opportunity.opportunityLoss,
    });*/
  });
});