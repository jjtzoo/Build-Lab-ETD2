import { describe, expect, it } from "vitest";
import { buildAnchorProfile } from "@/lib/engine/anchor-profile";

describe("buildAnchorProfile", () => {
  it("returns an unbiased profile for Auto", () => {
    const profile = buildAnchorProfile("Auto");

    expect(profile.kind).toBe("AUTO");
    expect(profile.tower).toBeNull();
    expect(profile.blueprint).toBeNull();
    expect(profile.recipe).toEqual([]);
    expect(profile.maxTier).toBe(0);
    expect(profile.requiresAnchorRealization).toBe(false);
  });

  it("builds a Dual anchor blueprint from the tower recipe", () => {
    const profile = buildAnchorProfile("Howitzer");

    expect(profile.kind).toBe("DUAL");
    expect(profile.tower?.name).toBe("Howitzer");

    expect(profile.recipe).toEqual([
      "Darkness",
      "Earth",
    ]);

    expect(profile.blueprint?.elements).toEqual([
      "Darkness",
      "Earth",
    ]);

    expect(
      profile.blueprint?.targetLevels.Darkness,
    ).toBe(3);

    expect(
      profile.blueprint?.targetLevels.Earth,
    ).toBe(3);

    expect(profile.maxTier).toBe(3);
    expect(profile.requiresAnchorRealization).toBe(true);
  });

  it("builds the Trio blueprint at Lv2", () => {
    const profile = buildAnchorProfile("Haste");

    expect(profile.kind).toBe("TRIO");
    expect(profile.tower?.name).toBe("Haste");

    expect(profile.recipe).toEqual([
      "Water",
      "Fire",
      "Earth",
    ]);

    expect(profile.blueprint?.elements).toEqual([
      "Water",
      "Fire",
      "Earth",
    ]);

    expect(
      profile.blueprint?.targetLevels.Water,
    ).toBe(2);

    expect(
      profile.blueprint?.targetLevels.Fire,
    ).toBe(2);

    expect(
      profile.blueprint?.targetLevels.Earth,
    ).toBe(2);

    expect(profile.maxTier).toBe(2);
    expect(profile.requiresAnchorRealization).toBe(true);
  });

  it("builds a Quad unlock blueprint at Lv1", () => {
    const profile = buildAnchorProfile("Doom");

    expect(profile.kind).toBe("QUAD");
    expect(profile.tower?.name).toBe("Doom");

    expect(profile.recipe).toEqual([
      "Light",
      "Darkness",
      "Fire",
      "Nature",
    ]);

    expect(profile.blueprint?.elements).toEqual([
      "Light",
      "Darkness",
      "Fire",
      "Nature",
    ]);

    for (const element of profile.recipe) {
      expect(
        profile.blueprint?.targetLevels[element],
      ).toBe(1);
    }

    expect(profile.maxTier).toBe(1);
    expect(profile.requiresAnchorRealization).toBe(true);
  });

  it("provides strategy priorities for each anchor type", () => {
    const dual = buildAnchorProfile("Howitzer");
    const trio = buildAnchorProfile("Haste");
    const quad = buildAnchorProfile("Doom");

    expect(dual.priorities.length).toBeGreaterThan(0);
    expect(trio.priorities.length).toBeGreaterThan(0);
    expect(quad.priorities.length).toBeGreaterThan(0);
  });

  it("provides explanatory notes for each anchor type", () => {
    const dual = buildAnchorProfile("Howitzer");
    const trio = buildAnchorProfile("Haste");
    const quad = buildAnchorProfile("Doom");

    expect(dual.notes.length).toBeGreaterThan(0);
    expect(trio.notes.length).toBeGreaterThan(0);
    expect(quad.notes.length).toBeGreaterThan(0);
  });

  it("rejects an unknown anchor", () => {
    expect(() =>
      buildAnchorProfile("Definitely Not A Tower"),
    ).toThrow(/Unknown anchor tower/);
  });
});