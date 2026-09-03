import { describe, expect, it } from "vitest";

import { resolveBuildIntent } from "@/lib/engine/build-intent-resolver";
import type { BuildIntent } from "@/lib/engine/build-intent";

describe("resolveBuildIntent", () => {
  it("resolves a focused tower from canonical tower data", () => {
    const intent: BuildIntent = {
      focusedTowers: [
        {
          tower: "Howitzer",
          priority: "balanced",
        },
      ],
      mode: "normal",
    };

    const resolved = resolveBuildIntent(intent);

    expect(resolved.focusedTowers).toHaveLength(1);
    expect(resolved.focusedTowers[0].tower.name).toBe("Howitzer");
    expect(resolved.focusedTowers[0].tower.type).toBe("Dual");
    expect(resolved.focusedTowers[0].tower.recipe).toEqual([
      "Darkness",
      "Earth",
    ]);
    expect(resolved.focusedTowers[0].priority).toBe("balanced");
  });

  it("resolves two focused towers independently", () => {
    const intent: BuildIntent = {
      focusedTowers: [
        {
          tower: "Howitzer",
          priority: "maximum-depth",
        },
        {
          tower: "Haste",
          priority: "explore",
        },
      ],
      mode: "normal",
    };

    const resolved = resolveBuildIntent(intent);

    expect(resolved.focusedTowers).toHaveLength(2);

    expect(resolved.focusedTowers[0].tower.name).toBe("Howitzer");
    expect(resolved.focusedTowers[0].priority).toBe("maximum-depth");

    expect(resolved.focusedTowers[1].tower.name).toBe("Haste");
    expect(resolved.focusedTowers[1].priority).toBe("explore");
  });

  it("preserves build mode", () => {
    const intent: BuildIntent = {
      focusedTowers: [],
      mode: "explore",
    };

    const resolved = resolveBuildIntent(intent);

    expect(resolved.mode).toBe("explore");
    expect(resolved.focusedTowers).toHaveLength(0);
  });

  it("resolves UI profile aliases and canonical capability keys", () => {
    const resolved = resolveBuildIntent({
      focusedTowers: [],
      preferredProfiles: ["aoe-wave-clear", "sustainedDps"],
      preferredCapabilities: ["dot", "damageAmp", "slow"],
      mode: "normal",
    });

    expect(resolved.preferredProfiles).toEqual(["aoeWaveClear", "sustainedDps"]);
    expect(resolved.preferredCapabilities).toEqual(["dot", "damageAmp", "slow"]);
  });

  it("rejects unsupported profile and capability values explicitly", () => {
    expect(() => resolveBuildIntent({
      focusedTowers: [],
      preferredProfiles: ["unbounded-score"],
      mode: "normal",
    } as unknown as BuildIntent)).toThrow("Unsupported preferred profile");
    expect(() => resolveBuildIntent({
      focusedTowers: [],
      preferredCapabilities: ["inventedCapability"],
      mode: "normal",
    } as unknown as BuildIntent)).toThrow("Unsupported preferred capability");
  });

  it("rejects an unknown tower", () => {
    const intent: BuildIntent = {
      focusedTowers: [
        {
          tower: "Not A Real Tower",
          priority: "balanced",
        },
      ],
      mode: "normal",
    };

    expect(() => resolveBuildIntent(intent)).toThrow(
      "Unknown tower: Not A Real Tower",
    );
  });
});
