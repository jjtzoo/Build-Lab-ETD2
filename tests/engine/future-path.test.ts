import { describe, expect, it } from "vitest";

import { createBuildState } from "@/lib/engine/build-state";
import { rankLegalCandidates } from "@/lib/engine/candidate-ranking";
import {
  PATH_CONFIDENCE_RANK,
  LOOKAHEAD_POLICY,
} from "@/lib/engine/future-path-config";
import { rankFuturePaths } from "@/lib/engine/future-path";
import { getLegalNextCandidates } from "@/lib/engine/legal-candidates";
import type { BuildIntent } from "@/lib/engine/build-intent";
import type {
  BuildState,
  BuildStateInput,
  ElementAllocation,
  FuturePath,
  RankedCandidate,
  RecommendationConfidence,
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
  maxTowerSlots = 6,
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

function confidenceAtMost(
  left: RecommendationConfidence,
  right: RecommendationConfidence,
): RecommendationConfidence {
  return PATH_CONFIDENCE_RANK[left] <= PATH_CONFIDENCE_RANK[right] ? left : right;
}

describe("bounded two-step future paths", () => {
  const poisonState = () => state(
    [{ towerName: "Poison", level: 1 }],
    { Darkness: 1, Water: 1, Fire: 1, Nature: 1, Earth: 1 },
  );

  const windstormState = () => state(
    [{ towerName: "Windstorm", level: 1 }],
    { Light: 1, Darkness: 1, Water: 1, Fire: 1, Earth: 1 },
  );

  it("leaves the independently usable one-step ranking unchanged", () => {
    const build = poisonState();
    const before = rankLegalCandidates(build);

    rankFuturePaths(build);

    expect(rankLegalCandidates(build)).toEqual(before);
  });

  it("limits first steps to the existing top contextual candidates", () => {
    const build = poisonState();
    const oneStep = rankLegalCandidates(build);
    const lookahead = rankFuturePaths(build);

    expect(lookahead.paths.map((path) => path.first.candidate.towerName).sort()).toEqual(
      oneStep.rankedCandidates
        .slice(0, LOOKAHEAD_POLICY.firstStepLimit)
        .map((item) => item.candidate.towerName)
        .sort(),
    );
  });

  it("uses the simulated first state for legal second choices without duplicates", () => {
    const path = rankFuturePaths(poisonState()).bestPath;
    if (!path || !path.second) throw new Error("Expected a two-step fixture path.");
    const legalSecondNames = getLegalNextCandidates(path.stateAfterFirst)
      .map((item) => item.towerName);

    expect(path.stateAfterFirst.selectedTowers.map((tower) => tower.towerName)).toContain(
      path.first.candidate.towerName,
    );
    expect(path.second.candidate.towerName).not.toBe(path.first.candidate.towerName);
    expect(legalSecondNames).toContain(path.second.candidate.towerName);
  });

  it("passes the same intent through the second-step ranking", () => {
    const intent: BuildIntent = {
      focusedTowers: [{ tower: "Haste", priority: "maximum-depth" }],
      preferredProfiles: ["scaling"],
      preferredCapabilities: ["attackSpeedScaling"],
      mode: "normal",
    };
    const path = rankFuturePaths(poisonState(), intent).bestPath;
    if (!path?.second) throw new Error("Expected a continuation for the intent fixture.");
    const directSecond = rankLegalCandidates(path.stateAfterFirst, intent).topRecommendation;

    expect(path.second).toEqual(directSecond);
    expect(path.second.intentAlignment).toBeDefined();
  });

  it("returns valid one-step paths when one slot remains", () => {
    const build = state(
      [{ towerName: "Poison", level: 1 }],
      { Darkness: 1, Water: 1, Fire: 1, Nature: 1, Earth: 1 },
      2,
    );
    const paths = rankFuturePaths(build);

    expect(paths.paths.length).toBeGreaterThan(0);
    expect(paths.paths.every((path) => path.second === null)).toBe(true);
    expect(paths.paths.every((path) => path.continuationValue === null)).toBe(true);
    expect(paths.paths.every((path) => path.continuationStatus === "unavailable")).toBe(true);
  });

  it("returns no future path when zero slots remain", () => {
    const build = state(
      [{ towerName: "Poison", level: 1 }],
      { Darkness: 1, Water: 1 },
      1,
    );
    const paths = rankFuturePaths(build);

    expect(paths.paths).toEqual([]);
    expect(paths.bestPath).toBeNull();
    expect(paths.comparison.detail).toContain("No legal first-step candidate");
  });

  it("keeps immediate and continuation values separate and applies the central discount", () => {
    const path = rankFuturePaths(poisonState()).bestPath;
    if (!path || path.continuationValue === null) throw new Error("Expected a two-step fixture path.");

    expect(path.immediateValue).toBe(path.first.contextualValue);
    expect(path.continuationValue).toBe(path.second?.contextualValue);
    expect(path.pathValue).toBe(
      path.immediateValue * LOOKAHEAD_POLICY.immediateWeight
        + path.continuationValue * LOOKAHEAD_POLICY.futureDiscount,
    );
  });

  it("can reorder viable first choices when a stronger real continuation exists", () => {
    const build = windstormState();
    const intent: BuildIntent = {
      focusedTowers: [{ tower: "Windstorm", priority: "maximum-depth" }],
      mode: "normal",
    };
    const immediate = rankLegalCandidates(build, intent).topRecommendation;
    const lookahead = rankFuturePaths(build, intent);

    expect(immediate?.candidate.towerName).toBe("Runic");
    expect(lookahead.bestPath?.first.candidate.towerName).toBe("Flamethrower");
    expect(lookahead.comparison.differs).toBe(true);
    expect(lookahead.bestPath?.second?.candidate.towerName).toBe("Rage");
  });

  it("keeps the strongest immediate choice when its continuation also remains best", () => {
    const build = poisonState();
    const immediate = rankLegalCandidates(build).topRecommendation;
    const lookahead = rankFuturePaths(build);

    expect(immediate?.candidate.towerName).toBe("Tsunami");
    expect(lookahead.bestPath?.first.candidate.towerName).toBe("Tsunami");
    expect(lookahead.bestPath?.second?.candidate.towerName).toBe("Gravity Cannon");
    expect(lookahead.comparison.differs).toBe(false);
  });

  it("adds no path-only score for UNKNOWN evidence", () => {
    const path = rankFuturePaths(poisonState()).bestPath;
    if (!path) throw new Error("Expected a bounded path.");

    expect(path.pathValue).toBe(
      path.immediateValue * LOOKAHEAD_POLICY.immediateWeight
        + (path.continuationValue ?? 0) * LOOKAHEAD_POLICY.futureDiscount,
    );
    expect(path.strengths.every((item) => item.step === "first" || item.step === "second")).toBe(true);
  });

  it("uses the conservative minimum confidence across both ranked steps", () => {
    const path = rankFuturePaths(poisonState()).bestPath;
    if (!path?.second) throw new Error("Expected a two-step fixture path.");

    expect(path.confidence).toBe(confidenceAtMost(path.first.confidence, path.second.confidence));
  });

  it("retains explicit anti-synergy when ranking a true second-step state", () => {
    const first = candidate(rankLegalCandidates(windstormState()), "Runic");
    const laser = candidate(rankLegalCandidates(first.change.simulatedState), "Laser");

    expect(laser.tradeoffs).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: "anti-synergy", key: "Laser:Windstorm" }),
    ]));
  });

  it("derives path explanations from selected candidates and the declared policy", () => {
    const path = rankFuturePaths(poisonState()).bestPath as FuturePath;

    expect(path.explanation.immediate).toContain(path.first.candidate.towerName);
    expect(path.explanation.continuation).toContain(path.second?.candidate.towerName ?? "No legal second candidate");
    expect(path.explanation.policy).toContain(String(LOOKAHEAD_POLICY.futureDiscount));
    expect(path.explanation.continuation).not.toMatch(/opens up|unlocks|enables/i);
  });

  it("uses stable path ranks and deterministic ordering for equivalent inputs", () => {
    const build = windstormState();
    const first = rankFuturePaths(build);
    const second = rankFuturePaths(build);

    expect(first).toEqual(second);
    expect(first.paths.map((path) => path.rank)).toEqual(
      first.paths.map((_, index) => index + 1),
    );
  });

  it("breaks equal path values by immediate value, then remains stable", () => {
    const build = state(
      [{ towerName: "Ice", level: 1 }],
      { Light: 1, Darkness: 1, Water: 1, Fire: 1, Nature: 1, Earth: 1 },
    );
    const tiedPaths = rankFuturePaths(build).paths.filter((path) => path.pathValue === 32);

    expect(tiedPaths.map((path) => path.first.candidate.towerName)).toEqual(["Tsunami", "Plague"]);
    expect(tiedPaths[0].immediateValue).toBeGreaterThan(tiedPaths[1].immediateValue);
  });
});
