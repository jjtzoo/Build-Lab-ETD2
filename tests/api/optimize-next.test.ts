import { describe, expect, it } from "vitest";

import { POST as optimizePost } from "@/app/api/optimize/route";
import { POST as nextRecommendationPost } from "@/app/api/optimize/next/route";
import { createBuildState } from "@/lib/engine/build-state";
import { rankLegalCandidates } from "@/lib/engine/candidate-ranking";
import { SEQUENTIAL_ENGINE_VERSION } from "@/lib/sequential-recommendation";
import type {
  BuildStateInput,
  ElementAllocation,
  SequentialRecommendationResponse,
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

function buildState(overrides: Partial<BuildStateInput> = {}): BuildStateInput {
  return {
    selectedTowers: [{ towerName: "Poison", level: 1 }],
    elementAllocation: allocation({ Darkness: 1, Water: 1, Fire: 1, Nature: 1, Earth: 1 }),
    maxTowerSlots: 6,
    ...overrides,
  };
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/optimize/next", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/optimize/next", () => {
  it("returns ranked legal candidates for a valid BuildState", async () => {
    const response = await nextRecommendationPost(jsonRequest({ state: buildState(), limit: 5 }));
    const payload = await response.json() as SequentialRecommendationResponse;

    expect(response.status).toBe(200);
    expect(payload.engineVersion).toBe(SEQUENTIAL_ENGINE_VERSION);
    expect(payload.candidates).toHaveLength(5);
    expect(payload.topRecommendation).toEqual(payload.candidates[0]);
    expect(payload.candidates.every((candidate) => candidate.rank >= 1)).toBe(true);
    expect(payload.intent).toBeUndefined();
    expect(payload.lookahead).toBeUndefined();
  });

  it("returns 400 for an unknown tower", async () => {
    const response = await nextRecommendationPost(jsonRequest({
      state: buildState({ selectedTowers: [{ towerName: "Not A Tower", level: 1 }] }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "unknown-tower" });
  });

  it("returns 400 for an illegal selected tower level", async () => {
    const response = await nextRecommendationPost(jsonRequest({
      state: buildState({ selectedTowers: [{ towerName: "Poison", level: 4 }] }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "invalid-level" });
  });

  it("returns 400 for duplicate selected towers", async () => {
    const response = await nextRecommendationPost(jsonRequest({
      state: buildState({
        selectedTowers: [
          { towerName: "Poison", level: 1 },
          { towerName: "Poison", level: 1 },
        ],
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "duplicate-tower" });
  });

  it("returns an explicit empty response when no next tower slot remains", async () => {
    const response = await nextRecommendationPost(jsonRequest({
      state: buildState({ maxTowerSlots: 1 }),
    }));
    const payload = await response.json() as SequentialRecommendationResponse;

    expect(response.status).toBe(200);
    expect(payload.topRecommendation).toBeNull();
    expect(payload.candidates).toEqual([]);
    expect(payload.warnings).toEqual([
      "No legal next towers are available for the current build state.",
    ]);
  });

  it("serializes the same ranking order produced by the engine", async () => {
    const input = buildState();
    const response = await nextRecommendationPost(jsonRequest({ state: input, limit: 20 }));
    const payload = await response.json() as SequentialRecommendationResponse;
    const expected = rankLegalCandidates(createBuildState(input));

    expect(payload.candidates.map((candidate) => candidate.candidate.towerName)).toEqual(
      expected.rankedCandidates.slice(0, 20).map((candidate) => candidate.candidate.towerName),
    );
    expect(payload.candidates.map((candidate) => candidate.contextualValue)).toEqual(
      expected.rankedCandidates.slice(0, 20).map((candidate) => candidate.contextualValue),
    );
  });

  it("rejects invalid or unknown intent values server-side", async () => {
    const invalidProfile = await nextRecommendationPost(jsonRequest({
      state: buildState(),
      intent: {
        focusedTowers: [],
        preferredProfiles: ["invented-profile"],
        mode: "normal",
      },
    }));
    const unknownFocus = await nextRecommendationPost(jsonRequest({
      state: buildState(),
      intent: {
        focusedTowers: [{ tower: "Not A Tower", priority: "balanced" }],
        mode: "normal",
      },
    }));

    expect(invalidProfile.status).toBe(400);
    expect(unknownFocus.status).toBe(400);
    await expect(unknownFocus.json()).resolves.toMatchObject({ code: "invalid-intent" });
  });

  it("returns resolved intent and serialized intent effects for a valid request", async () => {
    const response = await nextRecommendationPost(jsonRequest({
      state: buildState(),
      limit: 20,
      intent: {
        focusedTowers: [{ tower: "Haste", priority: "maximum-depth" }],
        preferredProfiles: ["sustained-dps", "scaling"],
        preferredCapabilities: ["attackSpeedScaling"],
        mode: "normal",
      },
    }));
    const payload = await response.json() as SequentialRecommendationResponse;
    const haste = payload.candidates.find((candidate) => candidate.candidate.towerName === "Haste");

    expect(response.status).toBe(200);
    expect(payload.intent).toMatchObject({
      preferredProfiles: ["sustainedDps", "scaling"],
      preferredCapabilities: ["attackSpeedScaling"],
    });
    expect(haste?.intentAlignment?.matchedProfiles).toEqual(expect.arrayContaining(["scaling"]));
    expect(haste?.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: "intent-profile-alignment", key: "scaling" }),
      expect.objectContaining({ component: "intent-capability-alignment", key: "attackSpeedScaling" }),
    ]));
  });

  it("returns normal one-step data plus structured two-step paths when requested", async () => {
    const input = buildState({
      selectedTowers: [{ towerName: "Windstorm", level: 1 }],
      elementAllocation: allocation({ Light: 1, Darkness: 1, Water: 1, Fire: 1, Earth: 1 }),
    });
    const response = await nextRecommendationPost(jsonRequest({
      state: input,
      limit: 20,
      intent: {
        focusedTowers: [{ tower: "Windstorm", priority: "maximum-depth" }],
        mode: "normal",
      },
      lookahead: { enabled: true },
    }));
    const payload = await response.json() as SequentialRecommendationResponse;

    expect(response.status).toBe(200);
    expect(payload.topRecommendation?.candidate.towerName).toBe("Runic");
    expect(payload.lookahead?.immediateTopRecommendation).toEqual(payload.topRecommendation);
    expect(payload.lookahead?.bestPath).toMatchObject({
      first: { candidate: { towerName: "Flamethrower" } },
      second: { candidate: { towerName: "Rage" } },
      immediateValue: 16,
      continuationValue: 28,
      pathValue: 30,
    });
    expect(payload.lookahead?.comparison).toMatchObject({ differs: true });
    expect(payload.lookahead?.bestPath?.first.contextualValue).toBe(
      payload.lookahead?.bestPath?.immediateValue,
    );
  });

  it("preserves the existing allocation explorer endpoint", async () => {
    const response = await optimizePost(new Request("http://localhost/api/optimize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ core: ["Light", "Darkness", "Fire"] }),
    }));
    const payload = await response.json() as { results: unknown[]; legalCount: number };

    expect(response.status).toBe(200);
    expect(payload.legalCount).toBeGreaterThan(0);
    expect(payload.results.length).toBeGreaterThan(0);
    expect(payload.results.length).toBeLessThanOrEqual(20);
  });
});
