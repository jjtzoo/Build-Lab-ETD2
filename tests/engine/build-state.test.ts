import { describe, expect, it } from "vitest";

import {
  BuildStateValidationError,
  createBuildState,
  getTowerLevelCeiling,
} from "@/lib/engine/build-state";
import type { BuildStateInput, ElementAllocation } from "@/lib/types";

function allocation(overrides: Partial<ElementAllocation> = {}): ElementAllocation {
  return {
    Light: 0,
    Darkness: 1,
    Water: 1,
    Fire: 0,
    Nature: 0,
    Earth: 0,
    ...overrides,
  };
}

function input(overrides: Partial<BuildStateInput> = {}): BuildStateInput {
  return {
    selectedTowers: [{ towerName: "Poison", level: 1 }],
    elementAllocation: allocation(),
    maxTowerSlots: 10,
    ...overrides,
  };
}

describe("BuildState", () => {
  it("creates an immutable, valid state with derived remaining slots", () => {
    const state = createBuildState(input());

    expect(state.remainingTowerSlots).toBe(9);
    expect(state.selectedTowers[0]).toEqual({ towerName: "Poison", level: 1 });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.selectedTowers)).toBe(true);
    expect(Object.isFrozen(state.elementAllocation)).toBe(true);
  });

  it("rejects an unknown tower", () => {
    expect(() => createBuildState(input({
      selectedTowers: [{ towerName: "Not A Tower", level: 1 }],
    }))).toThrow(BuildStateValidationError);
  });

  it("rejects levels beyond the mechanics-data ceiling", () => {
    expect(getTowerLevelCeiling("Poison")).toBe(3);
    expect(getTowerLevelCeiling("Runic")).toBe(2);
    expect(getTowerLevelCeiling("Tsunami")).toBe(1);
    expect(() => createBuildState(input({
      selectedTowers: [{ towerName: "Poison", level: 4 }],
    }))).toThrow(/ceiling is 3/);

    expect(() => createBuildState(input({
      selectedTowers: [{ towerName: "Runic", level: 3 }],
      elementAllocation: allocation({ Light: 1, Fire: 1 }),
    }))).toThrow(/ceiling is 2/);

    expect(() => createBuildState(input({
      selectedTowers: [{ towerName: "Tsunami", level: 2 }],
      elementAllocation: allocation({ Fire: 1, Nature: 1, Earth: 1 }),
    }))).toThrow(/ceiling is 1/);
  });

  it("rejects invalid element allocations", () => {
    expect(() => createBuildState(input({
      elementAllocation: allocation({ Water: -1 }),
    }))).toThrow(/non-negative integer/);

    const incomplete = { Light: 0, Darkness: 1, Water: 1, Fire: 0, Nature: 0 };
    expect(() => createBuildState(input({
      elementAllocation: incomplete as ElementAllocation,
    }))).toThrow(/Earth/);
  });

  it("rejects selected towers beyond the slot limit", () => {
    expect(() => createBuildState(input({ maxTowerSlots: 0 }))).toThrow(
      /slot limit/,
    );
  });

  it("rejects duplicate towers", () => {
    expect(() => createBuildState(input({
      selectedTowers: [
        { towerName: "Poison", level: 1 },
        { towerName: "Poison", level: 1 },
      ],
    }))).toThrow(/more than once/);
  });

  it("rejects selected towers whose recipes are not met", () => {
    expect(() => createBuildState(input({
      elementAllocation: allocation({ Darkness: 0 }),
    }))).toThrow(/recipe elements/);
  });
});
