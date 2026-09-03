import { describe, expect, it } from "vitest";

import { createBuildState } from "@/lib/engine/build-state";
import { aggregateBuildCapabilities } from "@/lib/engine/capabilities";
import { deriveElementalComposition } from "@/lib/engine/element-analysis";
import { getLegalNextCandidates } from "@/lib/engine/legal-candidates";
import type { BuildStateInput, ElementAllocation } from "@/lib/types";

function allocation(overrides: Partial<ElementAllocation> = {}): ElementAllocation {
  return {
    Light: 0,
    Darkness: 1,
    Water: 1,
    Fire: 1,
    Nature: 1,
    Earth: 0,
    ...overrides,
  };
}

function input(overrides: Partial<BuildStateInput> = {}): BuildStateInput {
  return {
    selectedTowers: [{ towerName: "Poison", level: 1 }],
    elementAllocation: allocation(),
    maxTowerSlots: 2,
    ...overrides,
  };
}

describe("legal next candidates", () => {
  it("excludes selected towers and candidates whose recipes are not met", () => {
    const candidates = getLegalNextCandidates(createBuildState(input()));
    const candidateNames = candidates.map((candidate) => candidate.towerName);

    expect(candidateNames).not.toContain("Poison");
    expect(candidateNames).toContain("Solar");
    expect(candidateNames).not.toContain("Lightning");
  });

  it("returns only candidates with a legal initial level", () => {
    const candidates = getLegalNextCandidates(createBuildState(input()));

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((candidate) => (
      candidate.initialLevel === 1 && candidate.initialLevel <= candidate.maxLevel
    ))).toBe(true);
  });

  it("returns no candidates when all slots are used", () => {
    const state = createBuildState(input({ maxTowerSlots: 1 }));

    expect(state.remainingTowerSlots).toBe(0);
    expect(getLegalNextCandidates(state)).toEqual([]);
  });

  it("does not mutate the input state while analyzing capabilities, elements, or candidates", () => {
    const rawInput = input();
    const before = structuredClone(rawInput);
    const state = createBuildState(rawInput);

    aggregateBuildCapabilities(state);
    deriveElementalComposition(state);
    getLegalNextCandidates(state);

    expect(rawInput).toEqual(before);
    expect(state.selectedTowers).toEqual(before.selectedTowers);
    expect(state.elementAllocation).toEqual(before.elementAllocation);
  });
});
