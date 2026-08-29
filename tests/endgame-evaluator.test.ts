import { describe, expect, it } from "vitest";
import { evaluateEndgame } from "@/lib/engine/endgame-evaluator";

describe("endgame evaluator", () => {
  it("allows Pure Element conversion when an element reaches Lv3", () => {
    const result = evaluateEndgame(
      [3, 2, 2, 2, 1, 1],
      [],
    );

    expect(result.totalEssence).toBe(2);
    expect(result.availablePure).toContain("Light");
  });

  it("does not allow Pure conversion when no element reaches Lv3", () => {
    const result = evaluateEndgame(
      [2, 2, 2, 2, 2, 1],
      [],
    );

    expect(result.availablePure).toHaveLength(0);
  });

  it("makes Periodic available only with all six elements at Lv1+", () => {
    const available = evaluateEndgame(
      [2, 2, 2, 2, 2, 1],
      [],
    );

    expect(available.periodicAvailable).toBe(true);

    const unavailable = evaluateEndgame(
      [3, 2, 2, 2, 2, 0],
      [],
    );

    expect(unavailable.periodicAvailable).toBe(false);
  });

  it("never spends more Essence than the two-Essence budget", () => {
    const result = evaluateEndgame(
      [3, 3, 2, 1, 1, 1],
      [],
    );

    expect(result.spent).toBeLessThanOrEqual(
      result.totalEssence,
    );
  });
});