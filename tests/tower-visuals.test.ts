import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ELEMENTS, TOWERS } from "@/lib/data";
import { ELEMENT_VISUALS } from "@/lib/element-visuals";
import { getTowerVisual, TOWER_ARTWORK } from "@/lib/tower-visuals";
import { createBuildState } from "@/lib/engine/build-state";
import { rankLegalCandidates } from "@/lib/engine/candidate-ranking";
import { createSequentialRecommendationResponse } from "@/lib/sequential-recommendation";
import { humanizeEngineText, labelStrategicProfile } from "@/lib/presentation-labels";

describe("tower presentation boundary", () => {
  it("provides every catalog tower with artwork or a complete deterministic fallback", () => {
    for (const tower of TOWERS) {
      const visual = getTowerVisual(tower.name);
      expect(visual).toEqual(getTowerVisual(tower.name));
      expect(visual.alt).toContain(tower.name);
      expect(visual.fallbackLabel.length).toBeGreaterThan(0);
      expect(visual.recipe).toEqual(tower.recipe);
      expect(visual.type).toBe(tower.type);
      if (visual.imageSrc) {
        expect(visual.imageSrc).toMatch(/^\/towers\//);
        expect(existsSync(join(process.cwd(), "public", visual.imageSrc))).toBe(true);
        expect(TOWER_ARTWORK[tower.name].source).toBeTruthy();
        expect(TOWER_ARTWORK[tower.name].license).toBeTruthy();
      } else {
        expect(visual.imageSrc).toBeNull();
      }
    }
  });

  it("returns fallback metadata without guessing an image URL", () => {
    expect(getTowerVisual("Unregistered Tower")).toMatchObject({ imageSrc: null, fallbackLabel: "UT", type: "Tower" });
    const missing = TOWERS.find((tower) => !TOWER_ARTWORK[tower.name]);
    if (missing) expect(getTowerVisual(missing.name).imageSrc).toBeNull();
  });

  it("provides distinct readable visual metadata for all six canonical elements", () => {
    expect(Object.keys(ELEMENT_VISUALS)).toEqual(ELEMENTS);
    expect(new Set(Object.values(ELEMENT_VISUALS).map((value) => value.color)).size).toBe(6);
    for (const element of ELEMENTS) {
      expect(ELEMENT_VISUALS[element].color).toMatch(/^#[a-f0-9]{6}$/i);
      expect(ELEMENT_VISUALS[element].symbol).toBeTruthy();
    }
  });

  it("keeps labels deterministic and preserves surrounding prose", () => {
    const input = "attackSpeedScaling gains supported evidence from networked towers.";
    expect(humanizeEngineText(input)).toBe("Attack-Speed Scaling gains supported evidence from networked towers.");
    expect(labelStrategicProfile("replicationNetwork")).toBe(labelStrategicProfile("replicationNetwork"));
  });

  it("resolves visuals without changing serialized recommendations or engine rankings", () => {
    const state = createBuildState({ selectedTowers: [{ towerName: "Windstorm", level: 1 }], elementAllocation: { Light: 1, Darkness: 1, Water: 1, Fire: 1, Nature: 0, Earth: 1 }, maxTowerSlots: 10 });
    const rankingBefore = rankLegalCandidates(state);
    const response = createSequentialRecommendationResponse(state, 10, undefined, true);
    const serializedBefore = JSON.stringify(response);
    for (const item of response.candidates) getTowerVisual(item.candidate.towerName);
    expect(JSON.stringify(response)).toBe(serializedBefore);
    expect(rankLegalCandidates(state)).toEqual(rankingBefore);
    expect(createSequentialRecommendationResponse(state, 10, undefined, true)).toEqual(response);
    expect(serializedBefore).not.toContain("imageSrc");
  });
});
