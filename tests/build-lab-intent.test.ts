import { describe, expect, it } from "vitest";

import {
  createBuildLabIntent,
  DEFAULT_TWO_STEP_PLANNING,
} from "@/lib/build-lab-intent";

const defaults = {
  direction: "engine" as const,
  focalTower: "",
  priority: "balanced" as const,
  preferredProfile: "" as const,
  mode: "normal" as const,
};

describe("Build Lab intent adapter", () => {
  it("enables bounded two-step planning in the normal Build Lab flow", () => {
    expect(DEFAULT_TWO_STEP_PLANNING).toBe(true);
  });

  it("sends no explicit intent when the player lets the engine decide", () => {
    expect(createBuildLabIntent(defaults)).toBeUndefined();
  });

  it("serializes a build-around-tower direction as a balanced focal intent", () => {
    expect(createBuildLabIntent({
      ...defaults,
      direction: "tower",
      focalTower: "Bloom",
    })).toEqual({
      focusedTowers: [{ tower: "Bloom", priority: "balanced" }],
      mode: "normal",
    });
  });

  it("preserves advanced profile, priority, and mode choices", () => {
    expect(createBuildLabIntent({
      ...defaults,
      direction: "tower",
      focalTower: "Bloom",
      priority: "maximum-depth",
      preferredProfile: "scaling",
      mode: "explore",
    })).toEqual({
      focusedTowers: [{ tower: "Bloom", priority: "maximum-depth" }],
      preferredProfiles: ["scaling"],
      mode: "explore",
    });
  });

  it("maps friendly wave-clear direction to its existing canonical profile", () => {
    expect(createBuildLabIntent({ ...defaults, direction: "wave-clear" })).toEqual({
      focusedTowers: [],
      preferredProfiles: ["aoeWaveClear"],
      mode: "normal",
    });
  });
});
