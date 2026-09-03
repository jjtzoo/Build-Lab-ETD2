import { describe, expect, it } from "vitest";

import { createBuildState } from "@/lib/engine/build-state";
import { deriveElementalComposition } from "@/lib/engine/element-analysis";

describe("element analysis foundation", () => {
  it("keeps allocation separate from recipe footprint and offensive presence", () => {
    const state = createBuildState({
      selectedTowers: [
        { towerName: "Poison", level: 1 },
        { towerName: "Solar", level: 1 },
      ],
      elementAllocation: {
        Light: 3,
        Darkness: 1,
        Water: 1,
        Fire: 1,
        Nature: 1,
        Earth: 0,
      },
      maxTowerSlots: 10,
    });

    const composition = deriveElementalComposition(state);

    expect(state.elementAllocation.Light).toBe(3);
    expect(composition.recipeFootprint).toEqual({
      Light: 0,
      Darkness: 1,
      Water: 1,
      Fire: 1,
      Nature: 1,
      Earth: 0,
    });
    expect(composition.offensivePresence).toEqual({
      Light: 0,
      Darkness: 1,
      Water: 0,
      Fire: 1,
      Nature: 0,
      Earth: 0,
    });
    expect(composition.direction.map((item) => item.element)).toEqual([
      "Darkness",
      "Water",
      "Fire",
      "Nature",
    ]);
  });
});
