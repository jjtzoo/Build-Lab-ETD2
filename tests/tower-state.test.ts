import { describe, expect, it } from "vitest";
import { TOWERS } from "@/lib/data";
import { buildTowerState } from "@/lib/engine/tower-state";

describe("tower state", () => {
  it("keeps a dual tower locked when its recipe is not funded", () => {
    const tower = TOWERS.find(
      (value) => value.name === "Ice",
    );

    expect(tower).toBeDefined();

    const state = buildTowerState(
      tower!,
      [3, 0, 0, 3, 3, 2],
    );

    expect(state.unlocked).toBe(false);
    expect(state.tier).toBe(0);
  });

  it("unlocks Ice and reaches its funded tier", () => {
    const tower = TOWERS.find(
      (value) => value.name === "Ice",
    );

    expect(tower).toBeDefined();

    const state = buildTowerState(
      tower!,
      [3, 3, 3, 1, 0, 1],
    );

    expect(state.unlocked).toBe(true);
    expect(state.tier).toBe(3);
  });

  it("uses the mechanics max level for the tower state", () => {
    const tower = TOWERS.find(
      (value) => value.name === "Ice",
    );

    expect(tower).toBeDefined();

    const state = buildTowerState(
      tower!,
      [3, 3, 3, 1, 0, 1],
    );

    expect(state.maxTier).toBe(3);
  });
});