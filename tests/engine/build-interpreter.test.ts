import { describe, expect, it } from "vitest";

import { createBuildState } from "@/lib/engine/build-state";
import { interpretBuild } from "@/lib/engine/build-interpreter";
import type { BuildStateInput, ElementAllocation } from "@/lib/types";

function allocation(overrides: Partial<ElementAllocation> = {}): ElementAllocation {
  return {
    Light: 1,
    Darkness: 1,
    Water: 1,
    Fire: 1,
    Nature: 1,
    Earth: 1,
    ...overrides,
  };
}

function stateFor(
  selectedTowers: BuildStateInput["selectedTowers"],
  elementAllocation = allocation(),
) {
  return createBuildState({
    selectedTowers,
    elementAllocation,
    maxTowerSlots: 10,
  });
}

function profileKeys(interpreted: ReturnType<typeof interpretBuild>) {
  return interpreted.strategicProfiles.map((profile) => profile.key);
}

function gapFor(
  interpreted: ReturnType<typeof interpretBuild>,
  capability: string,
) {
  const gap = interpreted.gaps.find((candidate) => candidate.capability === capability);
  if (!gap) throw new Error(`No gap found for ${capability}.`);
  return gap;
}

describe("build interpretation", () => {
  it("derives a DoT strategic signal from a real DoT tower", () => {
    const interpreted = interpretBuild(stateFor([{ towerName: "Poison", level: 1 }]));

    expect(profileKeys(interpreted)).toContain("dot");
    expect(interpreted.capabilities.capabilities.dot.strongestTier).toBe("gold");
  });

  it("derives multiple AoE and wave-clear signals where the attribute evidence supports them", () => {
    const interpreted = interpretBuild(stateFor([{ towerName: "Plague", level: 1 }]));

    expect(profileKeys(interpreted)).toEqual(expect.arrayContaining([
      "dot",
      "aoeWaveClear",
      "sustainedDps",
    ]));
    expect(interpreted.capabilities.capabilities.waveClear.strongestTier).toBe("gold");
  });

  it("derives a boss/single-target profile from a real boss-specialist package", () => {
    const interpreted = interpretBuild(stateFor([{ towerName: "Tsunami", level: 1 }]));

    expect(profileKeys(interpreted)).toContain("bossSingleTarget");
    expect(interpreted.capabilities.capabilities.bossSpecialist.strongestTier).toBe("gold");
  });

  it("does not treat a low-relevance or UNKNOWN capability as a deficiency", () => {
    const interpreted = interpretBuild(stateFor([{ towerName: "Poison", level: 1 }]));

    expect(gapFor(interpreted, "abilityCharge").status).toBe("low-relevance");
    expect(gapFor(interpreted, "uptime").status).toBe("unknown");
    expect(interpreted.vulnerabilities.map((item) => item.capability)).not.toContain("uptime");
  });

  it("creates a gap only when the current strategy makes a capability relevant", () => {
    const interpreted = interpretBuild(stateFor([{ towerName: "Poison", level: 1 }]));

    expect(gapFor(interpreted, "range").status).toBe("deficient");
    expect(gapFor(interpreted, "singleTarget").status).toBe("low-relevance");
  });

  it("distinguishes a compensated direct gap from a vulnerability", () => {
    const interpreted = interpretBuild(stateFor([{ towerName: "Nova", level: 1 }]));

    expect(gapFor(interpreted, "aoeDps").status).toBe("deficient");
    expect(interpreted.compensations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        gapCapability: "aoeDps",
        compensatingCapabilities: expect.arrayContaining(["areaAmp", "slow"]),
      }),
    ]));
    expect(interpreted.vulnerabilities.map((item) => item.capability)).not.toContain("aoeDps");
  });

  it("does not automatically create a Burst vulnerability for a supported DoT/control package", () => {
    const interpreted = interpretBuild(stateFor([
      { towerName: "Doom", level: 1 },
      { towerName: "Root", level: 1 },
    ]));

    expect(profileKeys(interpreted)).toContain("dot");
    expect(interpreted.capabilities.capabilities.uptime.strongestTier).toBe("gold");
    expect(interpreted.capabilities.capabilities.slow.strongestTier).toBe("gold");
    expect(interpreted.vulnerabilities.map((item) => item.capability)).not.toContain("burst");
  });

  it("can identify a supported DoT exposure vulnerability without turning UNKNOWN into zero", () => {
    const interpreted = interpretBuild(stateFor([{ towerName: "Poison", level: 1 }]));

    expect(gapFor(interpreted, "range").status).toBe("deficient");
    expect(interpreted.vulnerabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: "range", confidence: "known" }),
    ]));
    expect(interpreted.capabilities.capabilities.slow.status).toBe("unknown");
  });

  it("keeps element composition independent from strategic capability interpretation", () => {
    const darkWaterFireNature = stateFor(
      [{ towerName: "Poison", level: 1 }, { towerName: "Solar", level: 1 }],
      allocation({ Light: 0, Earth: 0 }),
    );
    const extraLight = stateFor(
      [{ towerName: "Poison", level: 1 }, { towerName: "Solar", level: 1 }],
      allocation({ Light: 3, Earth: 0 }),
    );

    const first = interpretBuild(darkWaterFireNature);
    const second = interpretBuild(extraLight);

    expect(first.elementalComposition.recipeFootprint.Light).toBe(0);
    expect(second.elementalComposition.recipeFootprint.Light).toBe(0);
    expect(profileKeys(first)).toEqual(profileKeys(second));
  });

  it("is deterministic and does not mutate BuildState or its source input", () => {
    const rawInput: BuildStateInput = {
      selectedTowers: [{ towerName: "Poison", level: 1 }],
      elementAllocation: allocation({ Light: 0, Fire: 0, Nature: 0, Earth: 0 }),
      maxTowerSlots: 10,
    };
    const inputBefore = structuredClone(rawInput);
    const state = createBuildState(rawInput);
    const stateBefore = structuredClone(state);

    const first = interpretBuild(state);
    const second = interpretBuild(state);

    expect(first).toEqual(second);
    expect(rawInput).toEqual(inputBefore);
    expect(state).toEqual(stateBefore);
  });
});
