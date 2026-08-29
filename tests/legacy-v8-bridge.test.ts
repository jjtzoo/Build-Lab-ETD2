import { describe, expect, it } from "vitest";
import {
  evaluateAllocation,
  optimize,
} from "@/lib/engine/allocation";
import {
  evaluateCandidate,
} from "@/lib/engine/evaluator-run";
import { TOWERS } from "@/lib/data";

describe("legacy to V8 bridge", () => {
  it("keeps the legacy optimizer operational", () => {
    const results = optimize([
      "Light",
      "Darkness",
      "Water",
    ]);

    expect(results.length).toBeGreaterThan(0);

    expect(
      results[0].allocation,
    ).toHaveLength(6);
  });

  it("evaluates a legacy allocation through the new V8 pipeline", () => {
    const legacy = evaluateAllocation([
      3,
      3,
      2,
      1,
      1,
      1,
    ]);

    expect(legacy.unlocked.length).toBeGreaterThan(0);

    const selected = legacy.selected.filter(
      (tower) =>
        TOWERS.some(
          (candidate) =>
            candidate.name === tower.name,
        ),
    );

    const result = evaluateCandidate(
      legacy.allocation,
      ["Light", "Darkness", "Water"],
      selected,
    );

    expect(result.allocation).toEqual(
      legacy.allocation,
    );

    expect(result.towers).toHaveLength(
      selected.length,
    );

    expect(result.package).toBeDefined();
    expect(result.synergy).toBeDefined();
    expect(result.opportunity).toBeDefined();
    expect(result.endgame).toBeDefined();
  });
});