import { describe, expect, it } from "vitest";
import type { PortableBuild } from "@/lib/domain/portableBuild";
import { getMap } from "@/lib/domain/mapCatalog";
import { generateMatchPlan } from "@/lib/engine/matchPlan";
import { evaluatePhaseSurvival } from "@/lib/engine/matchPlanSurvival";

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
