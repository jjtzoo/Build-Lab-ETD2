import { describe, expect, it } from "vitest";
import { unlockedTowers } from "@/lib/engine/allocation";
import { evaluateCandidate } from "@/lib/engine/evaluator-run";

const allocation: [
  number,
  number,
  number,
  number,
  number,
  number,
] = [3, 3, 2, 1, 1, 1];

const core = [
  "Light",
  "Darkness",
  "Water",
] as const;

describe("candidate evaluator", () => {
  it("assembles the complete V8 evaluation pipeline", () => {
    const towers = unlockedTowers(allocation).slice(0, 3);

    expect(towers.length).toBe(3);

    const result = evaluateCandidate(
      allocation,
      [...core],
      towers,
    );

    expect(result.legality).toBeDefined();
    expect(result.towers).toHaveLength(3);
    expect(result.evaluators).toBeDefined();
    expect(result.package).toBeDefined();
    expect(result.synergy).toBeDefined();
    expect(result.opportunity).toBeDefined();
    expect(result.redundancy).toBeDefined();
    expect(result.antiSynergy).toBeDefined();
    expect(result.endgame).toBeDefined();
  });

  it("preserves the allocation and core on the evaluated candidate", () => {
    const towers = unlockedTowers(allocation).slice(0, 3);

    expect(towers.length).toBe(3);

    const result = evaluateCandidate(
      allocation,
      [...core],
      towers,
    );

    expect(result.allocation).toEqual(allocation);
    expect(result.core).toEqual([...core]);
  });
});