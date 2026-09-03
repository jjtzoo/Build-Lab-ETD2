import { describe, expect, it } from "vitest";

import { createBuildState } from "@/lib/engine/build-state";
import { aggregateBuildCapabilities } from "@/lib/engine/capabilities";
import type { ElementAllocation } from "@/lib/types";

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

describe("capability aggregation", () => {
  it("aggregates known canonical capabilities from mechanics tags", () => {
    const state = createBuildState({
      selectedTowers: [
        { towerName: "Poison", level: 1 },
        { towerName: "Well", level: 1 },
      ],
      elementAllocation: allocation(),
      maxTowerSlots: 10,
    });

    const profile = aggregateBuildCapabilities(state);

    expect(profile.capabilities.dot.status).toBe("known");
    expect(profile.capabilities.dot.supportingTowers).toEqual(["Poison"]);
    expect(profile.capabilities.attackSpeedAmp.status).toBe("known");
    expect(profile.capabilities.attackSpeedAmp.supportingTowers).toEqual(["Well"]);
  });

  it("preserves unsupported mechanics as UNKNOWN rather than treating them as absent", () => {
    const state = createBuildState({
      selectedTowers: [{ towerName: "Poison", level: 1 }],
      elementAllocation: allocation({ Fire: 0, Nature: 0 }),
      maxTowerSlots: 10,
    });

    const burst = aggregateBuildCapabilities(state).capabilities.burst;

    expect(burst.status).toBe("unknown");
    expect(burst.supportingTowers).toEqual([]);
    expect(burst.evidence[0]).toMatchObject({
      source: "mechanics-omission",
      status: "unknown",
    });
  });

  it("normalizes mechanics tag spelling variants into canonical capability keys", () => {
    const state = createBuildState({
      selectedTowers: [{ towerName: "Life Altar", level: 1 }],
      elementAllocation: allocation({
        Light: 1,
        Darkness: 0,
        Water: 1,
        Fire: 0,
        Nature: 1,
        Earth: 1,
      }),
      maxTowerSlots: 10,
    });

    const profile = aggregateBuildCapabilities(state);

    expect(profile.capabilities.damageAmp.status).toBe("known");
    expect(profile.capabilities.attackSpeedAmp.status).toBe("known");
  });

  it("keeps known AoE evidence in the canonical AoE DPS capability", () => {
    const state = createBuildState({
      selectedTowers: [{ towerName: "Flamethrower", level: 1 }],
      elementAllocation: allocation({
        Darkness: 1,
        Water: 0,
        Fire: 1,
        Nature: 0,
        Earth: 1,
      }),
      maxTowerSlots: 10,
    });

    const aoe = aggregateBuildCapabilities(state).capabilities.aoeDps;

    expect(aoe.status).toBe("known");
    expect(aoe.supportingTowers).toEqual(["Flamethrower"]);
  });
});
