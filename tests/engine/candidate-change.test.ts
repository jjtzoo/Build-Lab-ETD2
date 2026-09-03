import { describe, expect, it } from "vitest";

import { TOWERS } from "@/lib/data";
import {
  evaluateCandidateChange,
  evaluateLegalCandidateChanges,
} from "@/lib/engine/candidate-change";
import {
  CandidateSimulationValidationError,
  simulateCandidate,
} from "@/lib/engine/candidate-simulation";
import { createBuildState } from "@/lib/engine/build-state";
import { getLegalNextCandidates } from "@/lib/engine/legal-candidates";
import type {
  BuildState,
  ElementAllocation,
  LegalNextCandidate,
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

function candidateFor(state: BuildState, towerName: string): LegalNextCandidate {
  const candidate = getLegalNextCandidates(state).find((item) => item.towerName === towerName);
  if (!candidate) throw new Error(`${towerName} is not legal for this fixture.`);
  return candidate;
}

function poisonWith(...elements: readonly (keyof ElementAllocation)[]) {
  return stateFor(
    [{ towerName: "Poison", level: 1 }],
    allocation(Object.fromEntries(elements.map((element) => [element, 1])) as Partial<ElementAllocation>),
  );
}

describe("candidate state simulation and marginal change evaluation", () => {
  it("does not mutate the original BuildState during simulation", () => {
    const state = poisonWith("Darkness", "Water", "Fire", "Nature");
    const candidate = candidateFor(state, "Solar");
    const before = structuredClone(state);

    simulateCandidate(state, candidate);

    expect(state).toEqual(before);
  });

  it("adds a candidate at its legal initial level", () => {
    const state = poisonWith("Darkness", "Water", "Fire", "Nature");
    const candidate = candidateFor(state, "Solar");
    const simulated = simulateCandidate(state, candidate);

    expect(simulated.selectedTowers.at(-1)).toEqual({ towerName: "Solar", level: 1 });
  });

  it("increases selected tower count by one and consumes one slot", () => {
    const state = poisonWith("Darkness", "Water", "Fire", "Nature");
    const simulated = simulateCandidate(state, candidateFor(state, "Solar"));

    expect(simulated.selectedTowers).toHaveLength(state.selectedTowers.length + 1);
    expect(simulated.remainingTowerSlots).toBe(state.remainingTowerSlots - 1);
  });

  it("rejects a candidate that is not legal for the supplied state", () => {
    const legalElsewhere = candidateFor(
      poisonWith("Darkness", "Water", "Fire", "Nature"),
      "Solar",
    );
    const incompatibleState = poisonWith("Darkness", "Water");

    expect(() => simulateCandidate(incompatibleState, legalElsewhere)).toThrow(
      CandidateSimulationValidationError,
    );
    expect(() => simulateCandidate(incompatibleState, legalElsewhere)).toThrow(/not legal/);
  });

  it("returns current interpretation, simulated state, resulting interpretation, and delta", () => {
    const state = poisonWith("Darkness", "Water", "Fire", "Earth");
    const evaluation = evaluateCandidateChange(state, candidateFor(state, "Blacksmith"));

    expect(evaluation.before.capabilities.capabilities.damageAmp.status).toBe("unknown");
    expect(evaluation.simulatedState.selectedTowers.map((tower) => tower.towerName)).toContain("Blacksmith");
    expect(evaluation.after.capabilities.capabilities.damageAmp.strongestTier).toBe("gold");
    expect(evaluation.delta.signals.length).toBeGreaterThan(0);
  });

  it("detects a newly introduced capability", () => {
    const state = poisonWith("Darkness", "Water", "Fire", "Earth");
    const evaluation = evaluateCandidateChange(state, candidateFor(state, "Blacksmith"));
    const signal = evaluation.delta.capabilitySignals.find((item) => item.key === "damageAmp");

    expect(signal).toMatchObject({ direction: "positive" });
    expect(evaluation.after.capabilities.capabilities.damageAmp.supportingTowers).toContain("Blacksmith");
  });

  it("detects a capability strengthened from bronze to silver", () => {
    const state = poisonWith("Darkness", "Water", "Nature", "Earth");
    const evaluation = evaluateCandidateChange(state, candidateFor(state, "Root"));
    const signal = evaluation.delta.capabilitySignals.find((item) => item.key === "range");

    expect(evaluation.before.capabilities.capabilities.range.strongestTier).toBe("bronze");
    expect(evaluation.after.capabilities.capabilities.range.strongestTier).toBe("silver");
    expect(signal).toMatchObject({ direction: "positive" });
  });

  it("can resolve a real vulnerability", () => {
    const state = poisonWith("Darkness", "Water", "Nature", "Earth");
    const evaluation = evaluateCandidateChange(state, candidateFor(state, "Root"));
    const signal = evaluation.delta.vulnerabilitySignals.find((item) => item.key === "range");

    expect(evaluation.before.vulnerabilities.map((item) => item.capability)).toContain("range");
    expect(evaluation.after.vulnerabilities.map((item) => item.capability)).not.toContain("range");
    expect(signal).toMatchObject({ direction: "positive" });
  });

  it("can introduce a new requirement through a new strategic profile", () => {
    const state = poisonWith("Darkness", "Water", "Fire", "Earth");
    const evaluation = evaluateCandidateChange(state, candidateFor(state, "Haste"));
    const signal = evaluation.delta.requirementSignals.find((item) => item.key === "attackSpeedScaling");

    expect(evaluation.before.strategicProfiles.map((profile) => profile.key)).not.toContain("scaling");
    expect(evaluation.after.strategicProfiles.map((profile) => profile.key)).toContain("scaling");
    expect(signal).toMatchObject({ direction: "mixed" });
  });

  it("marks compensation as no longer necessary after direct gap resolution", () => {
    const state = stateFor(
      [{ towerName: "Nova", level: 1 }],
      allocation({ Light: 1, Darkness: 1, Fire: 1, Nature: 1, Earth: 1 }),
    );
    const evaluation = evaluateCandidateChange(state, candidateFor(state, "Howitzer"));
    const signal = evaluation.delta.compensationSignals.find((item) => item.key === "aoeDps");

    expect(evaluation.before.compensations.map((item) => item.gapCapability)).toContain("aoeDps");
    expect(evaluation.after.compensations.map((item) => item.gapCapability)).not.toContain("aoeDps");
    expect(signal).toMatchObject({ direction: "positive" });
  });

  it("keeps elemental composition changes separate from capability changes", () => {
    const state = poisonWith("Darkness", "Water", "Fire", "Earth");
    const evaluation = evaluateCandidateChange(state, candidateFor(state, "Blacksmith"));

    expect(evaluation.delta.elementalComposition.recipeFootprintAdded).toEqual(expect.arrayContaining([
      expect.objectContaining({ element: "Fire", change: "introduced" }),
      expect.objectContaining({ element: "Earth", change: "introduced" }),
    ]));
    expect(evaluation.delta.elementSignals.every((signal) => signal.category === "element")).toBe(true);
    expect(evaluation.delta.capabilitySignals.some((signal) => signal.key === "damageAmp")).toBe(true);
  });

  it("surfaces an explicit stored candidate synergy with a selected tower", () => {
    const state = stateFor(
      [{ towerName: "Rage", level: 1 }],
      allocation({ Light: 1, Darkness: 1, Fire: 1, Earth: 1 }),
    );
    const evaluation = evaluateCandidateChange(state, candidateFor(state, "Laser"));

    expect(evaluation.delta.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "synergy",
        candidateTower: "Laser",
        selectedTower: "Rage",
        rawReference: "Rage",
        source: "mechanics-record",
      }),
    ]));
  });

  it("surfaces an explicit stored candidate anti-synergy with a selected tower", () => {
    const state = stateFor(
      [{ towerName: "Windstorm", level: 1 }],
      allocation({ Light: 1, Darkness: 1, Water: 1, Fire: 1, Earth: 1 }),
    );
    const evaluation = evaluateCandidateChange(state, candidateFor(state, "Laser"));

    expect(evaluation.delta.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "anti-synergy",
        candidateTower: "Laser",
        selectedTower: "Windstorm",
        rawReference: "Windstorm",
        source: "mechanics-record",
      }),
    ]));
  });

  it("records redundancy as factual evidence rather than an automatic penalty", () => {
    const state = poisonWith("Darkness", "Water", "Fire", "Nature");
    const evaluation = evaluateCandidateChange(state, candidateFor(state, "Solar"));
    const dotSignal = evaluation.delta.capabilitySignals.find((item) => item.key === "dot");

    expect(evaluation.delta.redundancy).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: "dot", candidateTower: "Solar", existingStrongestTier: "gold" }),
    ]));
    expect(dotSignal).toMatchObject({ direction: "neutral" });
    expect(JSON.stringify(evaluation.delta)).not.toMatch(/score|penalty/i);
  });

  it("reports objective slot consumption as opportunity-cost evidence", () => {
    const state = poisonWith("Darkness", "Water", "Fire", "Nature");
    const evaluation = evaluateCandidateChange(state, candidateFor(state, "Solar"));

    expect(evaluation.delta.opportunityCost).toEqual({
      slotsConsumed: 1,
      remainingSlotsBefore: state.remainingTowerSlots,
      remainingSlotsAfter: state.remainingTowerSlots - 1,
    });
  });

  it("allows positive and negative marginal signals to coexist", () => {
    const state = stateFor(
      [{ towerName: "Trickery", level: 1 }],
      allocation({ Light: 1, Darkness: 1, Water: 1 }),
    );
    const evaluation = evaluateCandidateChange(state, candidateFor(state, "Poison"));

    expect(evaluation.delta.signals.some((signal) => signal.direction === "positive")).toBe(true);
    expect(evaluation.delta.signals.some((signal) => signal.direction === "negative")).toBe(true);
  });

  it("preserves an UNKNOWN-to-known capability transition", () => {
    const state = poisonWith("Darkness", "Water", "Fire", "Earth");
    const evaluation = evaluateCandidateChange(state, candidateFor(state, "Blacksmith"));
    const signal = evaluation.delta.capabilitySignals.find((item) => item.key === "damageAmp");

    expect(signal?.before).toMatchObject({ status: "unknown" });
    expect(signal?.after).toMatchObject({
      status: "known",
      strongestTier: "gold",
      evidence: expect.arrayContaining([
        expect.objectContaining({
          source: "attribute-dataset",
          sourceConfidence: "medium",
          towerName: "Blacksmith",
          tier: "gold",
        }),
      ]),
    });
    expect(signal?.confidence).toBe("known");
  });

  it("evaluates every legal candidate exactly once", () => {
    const state = poisonWith("Darkness", "Water", "Fire", "Nature", "Earth");
    const expected = getLegalNextCandidates(state).map((candidate) => candidate.towerName);
    const evaluations = evaluateLegalCandidateChanges(state);

    expect(evaluations.map((evaluation) => evaluation.candidate.towerName)).toEqual(expected);
    expect(new Set(evaluations.map((evaluation) => evaluation.candidate.towerName)).size).toBe(expected.length);
  });

  it("keeps bulk evaluation in stable catalog order rather than quality order", () => {
    const state = poisonWith("Darkness", "Water", "Fire", "Nature", "Earth");
    const legalNames = new Set(getLegalNextCandidates(state).map((candidate) => candidate.towerName));
    const expectedCatalogOrder = TOWERS
      .filter((tower) => legalNames.has(tower.name))
      .map((tower) => tower.name);

    expect(evaluateLegalCandidateChanges(state).map((evaluation) => evaluation.candidate.towerName))
      .toEqual(expectedCatalogOrder);
  });

  it("is deterministic across repeated candidate evaluation", () => {
    const state = poisonWith("Darkness", "Water", "Fire", "Earth");
    const candidate = candidateFor(state, "Blacksmith");

    expect(evaluateCandidateChange(state, candidate)).toEqual(evaluateCandidateChange(state, candidate));
    expect(evaluateLegalCandidateChanges(state)).toEqual(evaluateLegalCandidateChanges(state));
  });
});
