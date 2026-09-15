import { describe, expect, it } from "vitest";
import type { PlannedTowerState } from "@/lib/domain/matchPlan";
import type { PortableBuild } from "@/lib/domain/portableBuild";
import { getMap } from "@/lib/domain/mapCatalog";
import { generateMatchPlan } from "@/lib/engine/matchPlan";
import {
  combatFacts,
  evaluatePhaseSurvival,
} from "@/lib/engine/matchPlanSurvival";

const laserBuild: PortableBuild = {
  schema: "etd2-build/2",
  source: "engine",
  anchorTowerId: "laser",
  towers: [{ towerId: "laser", level: 2 }],
  allocation: { Light: 3, Darkness: 3, Earth: 3, Water: 1, Fire: 1, Nature: 0 },
  createdAt: "2026-09-14T00:00:00.000Z",
};

/** A placed Atom copy (the Laser build's bridge) borrowed from a real plan so the cell is legal. */
function placedAtom() {
  const plan = generateMatchPlan(laserBuild, { mapId: "forest" });
  const tower = plan.phases
    .flatMap((phase) => phase.endTowers)
    .find((t) => t.towerId === "atom" && t.cell);
  if (!tower) throw new Error("expected a placed Atom copy");
  return tower;
}

describe("evaluatePhaseSurvival level timeline", () => {
  const map = getMap("forest");
  const base = {
    map,
    mode: "standard" as const,
    difficulty: "veryHard" as const,
    startWave: 11,
    endWave: 15,
  };

  it("keeps an upgraded copy at its old level until the upgrade wave", () => {
    const bridge = placedAtom();
    const asLevel1 = evaluatePhaseSurvival({
      ...base,
      towers: [{ ...bridge, level: 1 }],
    });
    const asLevel2 = evaluatePhaseSurvival({
      ...base,
      towers: [{ ...bridge, level: 2 }],
    });
    const upgradedAt14 = evaluatePhaseSurvival({
      ...base,
      towers: [{ ...bridge, level: 2 }],
      levelTimeline: new Map([
        [
          bridge.copyId,
          [
            { fromWave: 11, level: 1 },
            { fromWave: 14, level: 2 },
          ],
        ],
      ]),
    });
    const damageAt = (
      result: ReturnType<typeof evaluatePhaseSurvival>,
      wave: number,
    ) => result.waves.find((w) => w.wave === wave)?.modeledDamage;

    expect(damageAt(asLevel2, 11)).toBeGreaterThan(damageAt(asLevel1, 11) ?? 0);
    // Before the upgrade lands the copy still deals level-1 damage — it does
    // not vanish from the field.
    expect(damageAt(upgradedAt14, 11)).toBe(damageAt(asLevel1, 11));
    expect(damageAt(upgradedAt14, 13)).toBe(damageAt(asLevel1, 13));
    expect(damageAt(upgradedAt14, 14)).toBe(damageAt(asLevel2, 14));
    expect(damageAt(upgradedAt14, 15)).toBe(damageAt(asLevel2, 15));
  });

  it("credits nothing for a copy before the wave it is built", () => {
    const bridge = placedAtom();
    const builtAt13 = evaluatePhaseSurvival({
      ...base,
      towers: [bridge],
      levelTimeline: new Map([
        [bridge.copyId, [{ fromWave: 13, level: bridge.level }]],
      ]),
    });
    expect(builtAt13.waves[0]?.modeledDamage).toBe(0);
    expect(builtAt13.waves[1]?.modeledDamage).toBe(0);
    expect(builtAt13.waves[2]?.modeledDamage).toBeGreaterThan(0);
  });
});

describe("End Game tower crediting", () => {
  const map = getMap("forest");

  function essenceTower(
    towerId: "periodic" | "pure-fire" | "pure-darkness",
    towerName: string,
  ): PlannedTowerState {
    return {
      copyId: `test-${towerId}`,
      towerId,
      towerName,
      level: 1,
      quantity: 1,
      purpose: "test",
      roles: ["main-dps"],
      status: "permanent",
      effect: "damage",
      globalBuff: false,
      directHitDebuff: false,
      cell: map.buildableCells[0],
      cellLabel: null,
      campId: null,
    };
  }

  it("resolves a Pure tower's damage via its sustained-engagement facts", () => {
    const facts = combatFacts("pure-fire", 1);
    expect(facts).not.toBeNull();
    // Blaze ramps, so the sustained figure exceeds the flat base DPS
    // (damage 17280 * attackSpeed 3 = 51840) it is derived from.
    expect(facts?.averageDps).toBeGreaterThan(17280 * 3);
    expect(facts?.damageElement).toBe("Fire");
    expect(facts?.unresolvedFactors).toEqual([]);
  });

  it("flags Overkill as an open factor rather than crediting a guess", () => {
    const facts = combatFacts("pure-darkness", 1);
    expect(facts?.unresolvedFactors).toContain(
      "overkill-spread-value-depends-on-creep-max-hp",
    );
  });

  it("keeps a clearing wave unverified when an essence tower's damage carries an unresolved factor", () => {
    // Wave 1 has no special ability (modelConfidence "verified"), so this
    // isolates essenceUnresolved's own effect from the boss-ability gate.
    const result = evaluatePhaseSurvival({
      map,
      mode: "standard",
      difficulty: "normal",
      startWave: 1,
      endWave: 1,
      towers: [essenceTower("pure-darkness", "Pure Darkness")],
    });
    const wave = result.waves[0];
    expect(wave?.margin).toBeGreaterThanOrEqual(1);
    expect(wave?.status).toBe("unverified");
  });

  it("reads as a clean pass once every credited tower has no open factor", () => {
    const result = evaluatePhaseSurvival({
      map,
      mode: "standard",
      difficulty: "normal",
      startWave: 1,
      endWave: 1,
      towers: [essenceTower("periodic", "Periodic")],
    });
    const wave = result.waves[0];
    expect(wave?.margin).toBeGreaterThanOrEqual(1);
    expect(wave?.status).toBe("survives");
  });
});
