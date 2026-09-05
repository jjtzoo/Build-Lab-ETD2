import { describe, expect, it } from "vitest";

import type { ElementMatchupTable } from "@/lib/domain/elementMatchups";
import { evaluateElementCoverage } from "@/lib/engine/elementCoverage";

const matchups: ElementMatchupTable = {
  Light: {
    Light: 1,
    Darkness: 2,
    Water: 1,
    Fire: 1,
    Nature: 1,
    Earth: 0.5,
  },
  Darkness: {
    Light: 0.5,
    Darkness: 1,
    Water: 2,
    Fire: 1,
    Nature: 1,
    Earth: 1,
  },
  Water: {
    Light: 1,
    Darkness: 0.5,
    Water: 1,
    Fire: 2,
    Nature: 1,
    Earth: 1,
  },
  Fire: {
    Light: 1,
    Darkness: 1,
    Water: 0.5,
    Fire: 1,
    Nature: 2,
    Earth: 1,
  },
  Nature: {
    Light: 1,
    Darkness: 1,
    Water: 1,
    Fire: 0.5,
    Nature: 1,
    Earth: 2,
  },
  Earth: {
    Light: 2,
    Darkness: 1,
    Water: 1,
    Fire: 1,
    Nature: 0.5,
    Earth: 1,
  },
};

describe("evaluateElementCoverage", () => {
  it("shows Fire anchor at 50 percent against Water", () => {
    const coverage = evaluateElementCoverage(
      matchups,
      "Fire",
    );

    const water = coverage.find(
      (entry) => entry.defender === "Water",
    );

    expect(water).toEqual({
      defender: "Water",
      anchorMultiplier: 0.5,
      packageAverageMultiplier: 0.5,
      hasDirectCounter: false,
    });
  });

  it("shows one neutral contributor partially mitigating Fire weakness", () => {
    const coverage = evaluateElementCoverage(
      matchups,
      "Fire",
      ["Light"],
    );

    const water = coverage.find(
      (entry) => entry.defender === "Water",
    );

    expect(water).toEqual({
      defender: "Water",
      anchorMultiplier: 0.5,
      packageAverageMultiplier: 0.75,
      hasDirectCounter: false,
    });
  });

  it("shows two neutral contributors raising Fire package coverage to about 83.33 percent", () => {
    const coverage = evaluateElementCoverage(
      matchups,
      "Fire",
      ["Light", "Nature"],
    );

    const water = coverage.find(
      (entry) => entry.defender === "Water",
    );

    expect(water?.anchorMultiplier).toBe(0.5);
    expect(
      water?.packageAverageMultiplier,
    ).toBeCloseTo(0.833333, 5);
    expect(water?.hasDirectCounter).toBe(false);
  });

  it("recognizes Darkness as a direct counter to Fire's Water weakness", () => {
    const coverage = evaluateElementCoverage(
      matchups,
      "Fire",
      ["Darkness"],
    );

    const water = coverage.find(
      (entry) => entry.defender === "Water",
    );

    expect(water).toEqual({
      defender: "Water",
      anchorMultiplier: 0.5,
      packageAverageMultiplier: 1.25,
      hasDirectCounter: true,
    });
  });
});