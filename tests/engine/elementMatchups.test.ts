import { describe, expect, it } from "vitest";

import type { ElementMatchupTable } from "@/lib/domain/elementMatchups";
import { getElementMultiplier } from "@/lib/engine/elementMatchups";

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

describe("getElementMultiplier", () => {
  it("returns a strong matchup multiplier", () => {
    expect(
      getElementMultiplier(matchups, "Fire", "Nature"),
    ).toBe(2);
  });

  it("returns a weak matchup multiplier", () => {
    expect(
      getElementMultiplier(matchups, "Fire", "Water"),
    ).toBe(0.5);
  });

  it("returns a neutral matchup multiplier", () => {
    expect(
      getElementMultiplier(matchups, "Fire", "Light"),
    ).toBe(1);
  });
});