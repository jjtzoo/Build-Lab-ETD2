import { describe, expect, it } from "vitest";

import type { Tower } from "@/lib/types";
import type {
  BuildIntent,
  BuildMode,
  TowerFocus,
  TowerPriority,
} from "@/lib/engine/build-intent";

const howitzer: Tower = {
  name: "Howitzer",
  type: "Dual",
  recipe: ["Darkness", "Earth"],
  role: "Main DPS",
  utility: "",
  damage: "",
  damageId: null,
  req: {
    Light: 0,
    Darkness: 1,
    Water: 0,
    Fire: 0,
    Nature: 0,
    Earth: 1,
  },
};

describe("BuildIntent", () => {
  it("supports a single focused tower", () => {
    const focus: TowerFocus = {
      tower: howitzer.name,
      priority: "balanced",
    };

    const intent: BuildIntent = {
      focusedTowers: [focus],
      mode: "normal",
    };

    expect(intent.focusedTowers).toHaveLength(1);
    expect(intent.focusedTowers[0].tower).toBe("Howitzer");
  });

  it("supports two focused towers", () => {
    const secondFocus: TowerFocus = {
      tower: howitzer.name,
      priority: "explore",
    };

    const intent: BuildIntent = {
      focusedTowers: [
        {
          tower: howitzer.name,
          priority: "maximum-depth",
        },
        secondFocus,
      ],
      mode: "normal",
    };

    expect(intent.focusedTowers).toHaveLength(2);
  });

  it("supports all tower priority modes", () => {
    const priorities: TowerPriority[] = [
      "explore",
      "balanced",
      "maximum-depth",
    ];

    expect(priorities).toEqual([
      "explore",
      "balanced",
      "maximum-depth",
    ]);
  });

  it("supports normal and explore build modes", () => {
    const modes: BuildMode[] = ["normal", "explore"];

    expect(modes).toEqual(["normal", "explore"]);
  });

  it("allows an empty focus for unbiased exploration", () => {
    const intent: BuildIntent = {
      focusedTowers: [],
      mode: "normal",
    };

    expect(intent.focusedTowers).toHaveLength(0);
  });
});