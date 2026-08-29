import { describe, expect, it } from "vitest";
import { evaluateLegality } from "@/lib/engine/legality";

describe("legality evaluator", () => {
  it("accepts a legal allocation", () => {
    const result = evaluateLegality(
      [3, 3, 2, 1, 1, 1],
      ["Light", "Darkness", "Water"],
    );

    expect(result.passed).toBe(true);
  });

  it("rejects an allocation above level 3", () => {
    const result = evaluateLegality(
      [4, 2, 2, 1, 1, 1],
      ["Light", "Darkness", "Water"],
    );

    expect(result.passed).toBe(false);
  });

  it("rejects an allocation that does not total 11", () => {
    const result = evaluateLegality(
      [3, 3, 2, 1, 1, 0],
      ["Light", "Darkness", "Water"],
    );

    expect(result.passed).toBe(false);
  });
});