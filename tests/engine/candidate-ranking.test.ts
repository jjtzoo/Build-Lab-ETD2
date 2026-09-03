import { describe, expect, it } from "vitest";

import { TOWERS } from "@/lib/data";
import {
  rankCandidateChanges,
  rankLegalCandidates,
} from "@/lib/engine/candidate-ranking";
import { evaluateLegalCandidateChanges } from "@/lib/engine/candidate-change";
import { createBuildState } from "@/lib/engine/build-state";
import { getLegalNextCandidates } from "@/lib/engine/legal-candidates";
import type {
  BuildState,
  CandidateRanking,
  ElementAllocation,
  RankedCandidate,
  SelectedTowerInput,
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

function stateFor(
  selectedTowers: readonly SelectedTowerInput[],
  elementAllocation: ElementAllocation,
  maxTowerSlots = 6,
): BuildState {
  return createBuildState({ selectedTowers, elementAllocation, maxTowerSlots });
}

function poisonState(
  elementAllocation: ElementAllocation,
  maxTowerSlots = 6,
): BuildState {
  return stateFor([{ towerName: "Poison", level: 1 }], elementAllocation, maxTowerSlots);
}

function candidate(
  ranking: CandidateRanking,
  towerName: string,
): RankedCandidate {
  const result = ranking.rankedCandidates.find((item) => item.candidate.towerName === towerName);
  if (!result) throw new Error(`${towerName} was not ranked for this fixture.`);
  return result;
}

function componentFor(
  ranked: RankedCandidate,
  key: string,
): RankedCandidate["components"][number] | undefined {
  return ranked.components.find((item) => item.key === key);
}

describe("contextual candidate ranking", () => {
  it("assigns every legal candidate a deterministic rank", () => {
    const state = poisonState(allocation({ Darkness: 1, Water: 1, Fire: 1, Nature: 1, Earth: 1 }));
    const legalNames = getLegalNextCandidates(state).map((item) => item.towerName);
    const ranking = rankLegalCandidates(state);

    expect(ranking.rankedCandidates.map((item) => item.rank)).toEqual(
      legalNames.map((_, index) => index + 1),
    );
    expect(ranking.rankedCandidates.map((item) => item.candidate.towerName).sort()).toEqual(
      [...legalNames].sort(),
    );
    expect(rankLegalCandidates(state)).toEqual(ranking);
  });

  it("does not include illegal candidates", () => {
    const state = poisonState(allocation({ Darkness: 1, Water: 1, Fire: 1, Nature: 1 }));
    const ranking = rankLegalCandidates(state);
    const legalNames = new Set(getLegalNextCandidates(state).map((item) => item.towerName));

    expect(ranking.rankedCandidates.every((item) => legalNames.has(item.candidate.towerName))).toBe(true);
    expect(ranking.rankedCandidates.map((item) => item.candidate.towerName)).not.toContain("Poison");
  });

  it("allows the same candidate order to change with the current build context", () => {
    const rageState = stateFor(
      [{ towerName: "Rage", level: 1 }],
      allocation({ Light: 1, Darkness: 1, Fire: 1, Earth: 1 }),
    );
    const windstormState = stateFor(
      [{ towerName: "Windstorm", level: 1 }],
      allocation({ Light: 1, Darkness: 1, Water: 1, Fire: 1, Earth: 1 }),
    );
    const rageRanking = rankLegalCandidates(rageState);
    const windstormRanking = rankLegalCandidates(windstormState);

    expect(candidate(rageRanking, "Lightning").rank).toBeLessThan(candidate(rageRanking, "Flamethrower").rank);
    expect(candidate(windstormRanking, "Lightning").rank).toBeGreaterThan(candidate(windstormRanking, "Flamethrower").rank);
  });

  it("materially rewards resolving a current vulnerability", () => {
    const state = poisonState(allocation({ Darkness: 1, Water: 1, Fire: 1, Nature: 1, Earth: 1 }));
    const ranking = rankLegalCandidates(state);
    const root = candidate(ranking, "Root");
    const solar = candidate(ranking, "Solar");

    expect(componentFor(root, "range")).toMatchObject({ component: "vulnerability-relief", contribution: 6 });
    expect(root.contextualValue).toBeGreaterThan(solar.contextualValue);
  });

  it("prioritizes primary deficient-gap relief over an irrelevant capability addition", () => {
    const state = poisonState(allocation({ Darkness: 1, Water: 1, Fire: 1, Nature: 1, Earth: 1 }));
    const root = candidate(rankLegalCandidates(state), "Root");
    const blacksmith = candidate(rankLegalCandidates(state), "Blacksmith");

    expect(root.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: "primary-gap-relief", key: "range", contribution: 5 }),
    ]));
    expect(blacksmith.components.some((item) => item.component === "primary-gap-relief")).toBe(false);
  });

  it("recognizes supporting-gap relief without treating it like primary relief", () => {
    const state = stateFor(
      [{ towerName: "Haste", level: 1 }],
      allocation({ Darkness: 1, Water: 1, Fire: 1, Earth: 1 }),
    );
    const howitzer = candidate(rankLegalCandidates(state), "Howitzer");
    const relief = componentFor(howitzer, "range");

    expect(relief).toMatchObject({ component: "supporting-gap-relief", contribution: 2 });
    expect(relief?.contribution).toBeLessThan(6);
  });

  it("does not automatically penalize redundancy when the candidate addresses a meaningful need", () => {
    const state = poisonState(allocation({ Darkness: 1, Water: 1, Fire: 1, Nature: 1, Earth: 1 }));
    const root = candidate(rankLegalCandidates(state), "Root");
    const redundancy = componentFor(root, "dot");

    expect(redundancy).toMatchObject({ component: "redundancy", direction: "neutral", contribution: 0 });
  });

  it("marks low-marginal redundancy when important current needs remain unaddressed", () => {
    const state = poisonState(allocation({ Darkness: 1, Water: 1, Fire: 1, Nature: 1, Earth: 1 }));
    const solar = candidate(rankLegalCandidates(state), "Solar");
    const redundancy = componentFor(solar, "dot");

    expect(redundancy).toMatchObject({ component: "redundancy", direction: "negative", contribution: -2 });
  });

  it("turns explicit stored synergy into a positive component", () => {
    const state = stateFor(
      [{ towerName: "Rage", level: 1 }],
      allocation({ Light: 1, Darkness: 1, Fire: 1, Earth: 1 }),
    );
    const laser = candidate(rankLegalCandidates(state), "Laser");

    expect(componentFor(laser, "Laser:Rage")).toMatchObject({ component: "synergy", contribution: 2 });
  });

  it("turns explicit stored anti-synergy into a negative component", () => {
    const state = stateFor(
      [{ towerName: "Windstorm", level: 1 }],
      allocation({ Light: 1, Darkness: 1, Water: 1, Fire: 1, Earth: 1 }),
    );
    const laser = candidate(rankLegalCandidates(state), "Laser");

    expect(componentFor(laser, "Laser:Windstorm")).toMatchObject({ component: "anti-synergy", contribution: -3 });
  });

  it("does not turn UNKNOWN evidence into a ranking contribution", () => {
    const state = poisonState(allocation({ Darkness: 1, Water: 1, Fire: 1, Nature: 1 }));
    const solar = candidate(rankLegalCandidates(state), "Solar");
    const unknownSignal = solar.change.delta.capabilitySignals.find((item) => item.key === "abilityCharge");

    expect(unknownSignal).toMatchObject({ direction: "neutral", confidence: "unknown" });
    expect(componentFor(solar, "abilityCharge")).toBeUndefined();
  });

  it("keeps medium-confidence attribute evidence distinguishable", () => {
    const state = poisonState(allocation({ Darkness: 1, Water: 1, Fire: 1, Earth: 1 }));
    const blacksmith = candidate(rankLegalCandidates(state), "Blacksmith");

    expect(componentFor(blacksmith, "damageAmp")).toMatchObject({
      component: "capability-improvement",
      confidence: "medium",
    });
    expect(blacksmith.confidence).toBe("medium");
  });

  it("keeps elemental-direction fit as a separate component", () => {
    const state = stateFor(
      [{ towerName: "Rage", level: 1 }],
      allocation({ Light: 1, Darkness: 1, Fire: 1, Earth: 1 }),
    );
    const laser = candidate(rankLegalCandidates(state), "Laser");

    expect(laser.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: "element-direction", key: "Light" }),
      expect.objectContaining({ component: "capability-improvement", key: "mainDps" }),
    ]));
  });

  it("reports newly introduced unmet requirements as tradeoffs", () => {
    const state = stateFor(
      [{ towerName: "Trickery", level: 1 }],
      allocation({ Light: 1, Darkness: 1, Water: 1, Fire: 1, Nature: 1, Earth: 1 }),
    );
    const gravityCannon = candidate(rankLegalCandidates(state), "Gravity Cannon");
    const unmetIsolationRequirement = gravityCannon.components.find((item) => (
      item.component === "new-requirement" && item.key === "isolation"
    ));

    expect(unmetIsolationRequirement).toMatchObject({
      component: "new-requirement",
      direction: "negative",
    });
    expect(gravityCannon.tradeoffs).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: "new-requirement", key: "isolation" }),
    ]));
  });

  it("makes opportunity cost more consequential at the slot ceiling", () => {
    const elements = allocation({ Darkness: 1, Water: 1, Fire: 1, Nature: 1 });
    const spacious = candidate(rankLegalCandidates(poisonState(elements, 6)), "Solar");
    const constrained = candidate(rankLegalCandidates(poisonState(elements, 2)), "Solar");

    expect(componentFor(spacious, "tower-slots")).toMatchObject({ contribution: 0 });
    expect(componentFor(constrained, "tower-slots")).toMatchObject({ contribution: -2 });
  });

  it("allows positive and negative ranking components for the same candidate", () => {
    const state = stateFor(
      [{ towerName: "Windstorm", level: 1 }],
      allocation({ Light: 1, Darkness: 1, Water: 1, Fire: 1, Earth: 1 }),
    );
    const laser = candidate(rankLegalCandidates(state), "Laser");

    expect(laser.components.some((item) => item.contribution > 0)).toBe(true);
    expect(laser.components.some((item) => item.contribution < 0)).toBe(true);
  });

  it("derives the highest recommendation explanation from structured components", () => {
    const state = poisonState(allocation({ Darkness: 1, Water: 1, Fire: 1, Nature: 1, Earth: 1 }));
    const top = rankLegalCandidates(state).topRecommendation;
    if (!top) throw new Error("Expected at least one legal candidate.");

    expect(top.strengths.length).toBeGreaterThan(0);
    expect(top.strengths.every((reason) => (
      top.components.some((item) => item.reason === reason && item.contribution > 0)
    ))).toBe(true);
    expect(top.strengths.every((reason) => reason.detail.length > 0)).toBe(true);
  });

  it("uses stable catalog order as the final tie-breaker", () => {
    const state = poisonState(allocation({ Darkness: 1, Water: 1, Fire: 1, Nature: 1, Earth: 1 }));
    const changes = evaluateLegalCandidateChanges(state);
    const ranking = rankCandidateChanges(changes);
    const tied = ranking.rankedCandidates.reduce<readonly RankedCandidate[] | null>(
      (current, item, index, all) => {
        if (current) return current;
        const next = all[index + 1];
        return next
          && item.contextualValue === next.contextualValue
          && item.confidence === next.confidence
          ? all.filter((candidate) => (
            candidate.contextualValue === item.contextualValue
            && candidate.confidence === item.confidence
          ))
          : null;
      },
      null,
    );
    if (!tied || tied.length < 2) throw new Error("Expected real catalog candidates to share a stable tie.");
    const tiedNames = new Set(tied.map((item) => item.candidate.towerName));
    const expectedCatalogOrder = TOWERS
      .filter((tower) => tiedNames.has(tower.name))
      .map((tower) => tower.name);

    expect(tied.map((item) => item.candidate.towerName)).toEqual(expectedCatalogOrder);
  });

  it("returns equivalent ordering for equivalent BuildStates", () => {
    const elements = allocation({ Darkness: 1, Water: 1, Fire: 1, Nature: 1, Earth: 1 });
    const first = poisonState(elements);
    const second = poisonState({ ...elements });

    expect(rankLegalCandidates(first)).toEqual(rankLegalCandidates(second));
  });

  it("contains inclusion recommendations only, with no level-investment recommendation", () => {
    const state = poisonState(allocation({ Darkness: 1, Water: 1, Fire: 1, Nature: 1 }));
    const ranking = rankLegalCandidates(state);

    expect(ranking.rankedCandidates.every((item) => item.candidate.initialLevel === 1)).toBe(true);
    expect(JSON.stringify(ranking)).not.toMatch(/level[- ]?up|investment recommendation/i);
  });
});
