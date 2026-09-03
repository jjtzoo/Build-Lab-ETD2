import { describe, expect, it } from "vitest";

import { createBuildState } from "@/lib/engine/build-state";
import { rankLegalCandidates } from "@/lib/engine/candidate-ranking";
import { interpretBuild } from "@/lib/engine/build-interpreter";
import type { BuildIntent } from "@/lib/engine/build-intent";
import type {
  BuildState,
  BuildStateInput,
  ElementAllocation,
  RankedCandidate,
} from "@/lib/types";

function allocation(overrides: Partial<ElementAllocation> = {}): ElementAllocation {
  return {
    Light: 0,
    Darkness: 0,
    Water: 0,
    Fire: 0,
    Nature: 0,
    Earth: 0,
    ...overrides,
  };
}

function state(
  selectedTowers: BuildStateInput["selectedTowers"],
  elements: Partial<ElementAllocation>,
  maxTowerSlots = 8,
): BuildState {
  return createBuildState({
    selectedTowers,
    elementAllocation: allocation(elements),
    maxTowerSlots,
  });
}

function candidate(ranking: ReturnType<typeof rankLegalCandidates>, name: string): RankedCandidate {
  const result = ranking.rankedCandidates.find((item) => item.candidate.towerName === name);
  if (!result) throw new Error(`${name} was not legal in this fixture.`);
  return result;
}

function focusedIntent(
  tower: string,
  priority: "explore" | "balanced" | "maximum-depth",
  mode: "normal" | "explore" = "normal",
): BuildIntent {
  return {
    focusedTowers: [{ tower, priority }],
    mode,
  };
}

describe("intent-aware contextual ranking", () => {
  const poisonState = () => state(
    [{ towerName: "Poison", level: 1 }],
    { Darkness: 1, Water: 1, Fire: 1, Nature: 1, Earth: 1 },
  );

  it("keeps no-intent ranking identical when undefined is passed explicitly", () => {
    const build = poisonState();
    expect(rankLegalCandidates(build)).toEqual(rankLegalCandidates(build, undefined));
  });

  it("scales focused-tower support from explore through balanced to maximum depth", () => {
    const build = state(
      [{ towerName: "Rage", level: 1 }],
      { Light: 1, Darkness: 1, Fire: 1, Earth: 1 },
    );
    const explore = candidate(rankLegalCandidates(build, focusedIntent("Rage", "explore")), "Laser");
    const balanced = candidate(rankLegalCandidates(build, focusedIntent("Rage", "balanced")), "Laser");
    const maximum = candidate(rankLegalCandidates(build, focusedIntent("Rage", "maximum-depth")), "Laser");
    const contributionFor = (item: RankedCandidate) => item.components.find((component) => (
      component.component === "focal-tower-support" && component.key === "Laser:Rage:synergy"
    ))?.contribution;

    expect(contributionFor(explore)).toBe(1);
    expect(contributionFor(balanced)).toBe(2);
    expect(contributionFor(maximum)).toBe(3);
  });

  it("can change order among strategically plausible candidates without overriding need relief", () => {
    const build = poisonState();
    const baseline = rankLegalCandidates(build);
    const intentAware = rankLegalCandidates(build, {
      focusedTowers: [{ tower: "Haste", priority: "maximum-depth" }],
      preferredProfiles: ["scaling"],
      mode: "normal",
    });

    expect(intentAware.rankedCandidates.map((item) => item.candidate.towerName)).not.toEqual(
      baseline.rankedCandidates.map((item) => item.candidate.towerName),
    );
    expect(candidate(intentAware, "Root").rank).toBeLessThan(candidate(intentAware, "Haste").rank);
  });

  it("does not create intent value from UNKNOWN evidence", () => {
    const build = state(
      [{ towerName: "Poison", level: 1 }],
      { Darkness: 1, Water: 1, Fire: 1, Nature: 1 },
    );
    const solar = candidate(rankLegalCandidates(build, {
      focusedTowers: [],
      preferredCapabilities: ["abilityCharge"],
      mode: "normal",
    }), "Solar");

    expect(solar.components.some((component) => (
      component.component === "intent-capability-alignment" && component.key === "abilityCharge"
    ))).toBe(false);
  });

  it("rewards a selected focal tower's explicit mechanics synergy", () => {
    const build = state(
      [{ towerName: "Rage", level: 1 }],
      { Light: 1, Darkness: 1, Fire: 1, Earth: 1 },
    );
    const laser = candidate(rankLegalCandidates(build, focusedIntent("Rage", "maximum-depth")), "Laser");

    expect(laser.intentAlignment?.supportedFocalTowers).toContain("Rage");
    expect(laser.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: "focal-tower-support", key: "Laser:Rage:synergy" }),
    ]));
  });

  it("does not automatically recommend a legal focal tower that is not selected", () => {
    const build = state(
      [{ towerName: "Trickery", level: 1 }],
      { Light: 1, Darkness: 1, Water: 1, Fire: 1, Nature: 1, Earth: 1 },
    );
    const ranking = rankLegalCandidates(build, focusedIntent("Plague", "maximum-depth"));

    expect(candidate(ranking, "Plague").intentAlignment?.supportedFocalTowers).toEqual([]);
    expect(ranking.topRecommendation?.candidate.towerName).not.toBe("Plague");
  });

  it("rewards actual marginal DoT profile evidence rather than tower-name text", () => {
    const build = state(
      [{ towerName: "Trickery", level: 1 }],
      { Light: 1, Darkness: 1, Water: 1, Fire: 1, Nature: 1, Earth: 1 },
    );
    const ranking = rankLegalCandidates(build, {
      focusedTowers: [],
      preferredProfiles: ["dot"],
      mode: "normal",
    });
    const poison = candidate(ranking, "Poison");
    const howitzer = candidate(ranking, "Howitzer");

    expect(poison.intentAlignment?.matchedProfiles).toContain("dot");
    expect(poison.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: "intent-profile-alignment", key: "dot" }),
    ]));
    expect(howitzer.components.some((component) => component.component === "intent-profile-alignment")).toBe(false);
  });

  it("does not mutate the inferred interpretation when intent conflicts with it", () => {
    const build = poisonState();
    const before = interpretBuild(build);
    const ranking = rankLegalCandidates(build, {
      focusedTowers: [],
      preferredProfiles: ["boss-single-target"],
      mode: "normal",
    });

    expect(interpretBuild(build)).toEqual(before);
    expect(ranking.intent).toMatchObject({ alignment: "diverges" });
    expect(ranking.intent?.conflicts).toHaveLength(1);
  });

  it("gives explore mode modest value for evidenced new strategic options", () => {
    const build = state(
      [{ towerName: "Trickery", level: 1 }],
      { Light: 1, Darkness: 1, Water: 1, Fire: 1, Nature: 1, Earth: 1 },
    );
    const ranking = rankLegalCandidates(build, {
      focusedTowers: [],
      mode: "explore",
    });

    expect(ranking.rankedCandidates.some((item) => item.components.some((component) => (
      component.component === "intent-exploration"
    )))).toBe(true);
  });

  it("retains anti-synergy as an explicit maximum-depth focal tradeoff", () => {
    const build = state(
      [{ towerName: "Windstorm", level: 1 }],
      { Light: 1, Darkness: 1, Water: 1, Fire: 1, Earth: 1 },
    );
    const laser = candidate(rankLegalCandidates(build, focusedIntent("Windstorm", "maximum-depth")), "Laser");

    expect(laser.tradeoffs).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: "anti-synergy" }),
      expect.objectContaining({ component: "intent-conflict" }),
    ]));
    expect(laser.intentAlignment?.status).toBe("diverges");
  });

  it("remains deterministic with the same explicit intent", () => {
    const build = poisonState();
    const intent: BuildIntent = {
      focusedTowers: [{ tower: "Haste", priority: "balanced" }],
      preferredProfiles: ["scaling"],
      preferredCapabilities: ["attackSpeedScaling"],
      mode: "normal",
    };

    expect(rankLegalCandidates(build, intent)).toEqual(rankLegalCandidates(build, intent));
  });
});
