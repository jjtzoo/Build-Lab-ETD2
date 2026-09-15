import { describe, expect, it } from "vitest";
import type { PortableBuild } from "@/lib/domain/portableBuild";
import { MATCH_PLAN_SCHEMA, parseMatchPlan } from "@/lib/domain/matchPlan";
import { getTower } from "@/lib/domain/towerCatalog";
import {
  generateMatchPlan,
  migrateLegacyLiveState,
  serializeCopilotActions,
} from "@/lib/engine/matchPlan";

const laserBuild: PortableBuild = {
  schema: "etd2-build/2",
  source: "engine",
  anchorTowerId: "laser",
  towers: [{ towerId: "laser", level: 2 }],
  allocation: { Light: 3, Darkness: 3, Earth: 3, Water: 1, Fire: 1, Nature: 0 },
  createdAt: "2026-09-14T00:00:00.000Z",
  progression: [
    {
      stage: "EARLY",
      headline: "Bridge",
      reason: "Survive before Laser",
      primaryAction: null,
      keystoneSteps: [
        { element: "Light", from: 0, to: 1, unlocks: [] },
        { element: "Earth", from: 0, to: 1, unlocks: [] },
        { element: "Light", from: 1, to: 2, unlocks: [] },
        { element: "Darkness", from: 0, to: 1, unlocks: [] },
      ],
    },
  ],
};

describe("Match Plan", () => {
  it("creates all phase snapshots with deterministic IDs", () => {
    const a = generateMatchPlan(laserBuild, {
      mapId: "forest",
      now: "2026-09-14T00:00:00.000Z",
    });
    const b = generateMatchPlan(laserBuild, {
      mapId: "forest",
      now: "2026-09-14T00:00:00.000Z",
    });
    expect(a.schema).toBe(MATCH_PLAN_SCHEMA);
    expect(a.phases).toHaveLength(12);
    expect(a.phases.map((phase) => phase.id)).toEqual(
      b.phases.map((phase) => phase.id),
    );
    expect(a.phases.at(-1)?.label).toContain("Boss");
    expect(parseMatchPlan(JSON.stringify(a))?.id).toBe(a.id);
  });

  it("scores a legal damage dual instead of hard-coding an early carry", () => {
    const plan = generateMatchPlan(laserBuild, {
      mapId: "forest",
      reserveGold: 0,
    });
    const towers = plan.phases.flatMap((phase) => phase.endTowers);
    const carry = towers.find((tower) => {
      if (["arrow", "cannon"].includes(tower.towerId)) return false;
      try {
        return getTower(tower.towerId).combination === "Dual";
      } catch {
        return false;
      }
    });
    expect(carry?.level).toBe(1);
    expect(carry?.status).toBe("temporary");
    expect(
      plan.phases
        .flatMap((phase) => phase.actions)
        .find(
          (action) => action.towerId === carry?.towerId && action.affordable,
        )?.reason,
    ).toContain("early-bridge score");
    expect(
      towers.some(
        (tower) =>
          tower.towerId === "trickery" && tower.roles.includes("main-dps"),
      ),
    ).toBe(false);
    expect(
      towers.some(
        (tower) => tower.towerId.startsWith("mono-") && tower.level === 2,
      ),
    ).toBe(true);
  });

  it("re-scores the early bridge for a different elemental build", () => {
    const golemBuild: PortableBuild = {
      schema: "etd2-build/2",
      source: "engine",
      anchorTowerId: "golem",
      towers: [{ towerId: "golem", level: 2 }],
      allocation: {
        Light: 0,
        Darkness: 0,
        Water: 3,
        Fire: 0,
        Nature: 3,
        Earth: 3,
      },
      createdAt: "2026-09-14T00:00:00.000Z",
    };
    const carryFor = (build: PortableBuild) =>
      generateMatchPlan(build, { mapId: "forest", reserveGold: 0 })
        .phases[1].endTowers.filter(
          (tower) => !["arrow", "cannon"].includes(tower.towerId),
        )
        .find((tower) => {
          try {
            return getTower(tower.towerId).combination === "Dual";
          } catch {
            return false;
          }
        });
    const laserCarry = carryFor(laserBuild);
    const golemCarry = carryFor(golemBuild);
    expect(laserCarry).toBeDefined();
    expect(golemCarry).toBeDefined();
    expect(golemCarry?.towerId).not.toBe(laserCarry?.towerId);
    expect(
      getTower(golemCarry!.towerId).recipe.every(
        (element) => golemBuild.allocation[element] >= 1,
      ),
    ).toBe(true);
  });

  it("starts with a wave-one survival tower and fields the dual carry before wave 11", () => {
    const plan = generateMatchPlan(laserBuild, {
      mapId: "forest",
      reserveGold: 300,
    });
    const opening = plan.phases[0];
    const secondWindow = plan.phases[1];
    expect(
      opening.endTowers.some((tower) =>
        ["arrow", "cannon"].includes(tower.towerId),
      ),
    ).toBe(true);
    expect(
      opening.actions.some((action) => action.reason.includes("wave 1")),
    ).toBe(true);
    // The dual carry is on the field by wave 11 — bought in this window or
    // as the first purchase of the next one, whichever the gold allows.
    const carry = [secondWindow, plan.phases[2]]
      .flatMap((phase) => phase.actions)
      .find((action) => {
        if (!action.affordable || action.toLevel !== 1) return false;
        try {
          return getTower(action.towerId ?? "").combination === "Dual";
        } catch {
          return false;
        }
      });
    expect(carry?.targetWave).toBeLessThanOrEqual(11);
    expect(plan.phases[2].startTowers.length).toBeGreaterThan(0);
  });

  it("puts the benchmark survival shell ahead of the elemental bridge", () => {
    const opening = generateMatchPlan(laserBuild, {
      mapId: "forest",
    }).phases[0];
    expect(
      opening.endTowers.filter((tower) => tower.towerId === "arrow"),
    ).toHaveLength(3);
    expect(
      opening.actions.filter(
        (action) => action.towerId === "arrow" && action.targetWave === 1,
      ),
    ).toHaveLength(3);
    expect(opening.survival.status).not.toBe("fails");
    // The bridge is a Dual inside Laser's own recipe (Light/Darkness/Earth).
    const bridge = generateMatchPlan(laserBuild, {
      mapId: "forest",
    })
      .phases.flatMap((phase) => phase.actions)
      .find((action) => action.towerId === "atom" && action.affordable);
    expect(bridge?.targetWave).toBeLessThanOrEqual(11);
  });

  it("buys survival before a package purchase that cannot land in time", () => {
    // Waves 6–10 for a Trio anchor: the 500g bridge only lands at W10–11,
    // so banking for it would leave an earlier wave leaking. Survival over
    // economy — a cheap copy that lands before the leak is bought first and
    // the bridge follows. Which wave leaks depends on where the opening
    // shell stands, so the assertion is on the order, not on a wave number:
    // the first repair lands no later than the bridge and is bought first.
    const plan = generateMatchPlan(laserBuild, { mapId: "forest" });
    const window = plan.phases[1];
    const repairs = window.actions.filter((action) =>
      action.id.includes(":survival-repair:"),
    );
    expect(repairs.length).toBeGreaterThan(0);
    expect(repairs[0].reason).toMatch(
      /before the next package purchase|takes priority over the reserve/,
    );
    const bridge = plan.phases
      .flatMap((phase) => phase.actions)
      .find((action) => action.towerId === "atom" && action.affordable);
    expect(bridge?.targetWave).toBeLessThanOrEqual(11);
    expect(repairs[0].targetWave).toBeLessThanOrEqual(bridge!.targetWave!);
    expect(bridge!.order).toBeGreaterThan(repairs[0].order);
    const w7 = window.survival.waves.find((wave) => wave.wave === 7);
    expect(w7?.status).toBe("survives");
    expect(window.survival.status).not.toBe("fails");
    // Nothing is banked while a wave in the window is short.
    expect(window.survival.waves.every((wave) => (wave.margin ?? 0) >= 1)).toBe(
      true,
    );
  });

  it("does not replan a window whose economy plan already survives", () => {
    const opening = generateMatchPlan(laserBuild, { mapId: "forest" })
      .phases[0];
    expect(opening.survival.status).not.toBe("fails");
    expect(
      opening.actions.some((action) =>
        action.reason.includes("before the next package purchase"),
      ),
    ).toBe(false);
  });

  it("separates legal purchases from conservative affordability", () => {
    const plan = generateMatchPlan(laserBuild, {
      mapId: "forest",
      reserveGold: 100_000,
    });
    const wait = plan.phases
      .flatMap((phase) => phase.actions)
      .find((action) => action.legal && !action.affordable);
    expect(wait?.waitForGold).toBeGreaterThan(0);
    expect(wait?.reason).toContain("reserve");
  });

  it("allocates each phase budget from benchmark gold without manual spending", () => {
    const plan = generateMatchPlan(laserBuild, { mapId: "forest" });
    expect(plan.settings.difficulty).toBe("veryHard");
    expect(plan.phases[0].economy).toMatchObject({
      phaseStartGold: 300,
      incomeThisPhase: 390,
      phaseCost: 400,
      phaseEndGold: 290,
    });
    expect(plan.phases[0].survival.waves).toHaveLength(5);
    for (const phase of plan.phases) {
      expect(phase.economy.assumptions[0]).toContain("per-wave bounty");
      expect(phase.economy.cumulativeCost).toBeLessThanOrEqual(
        phase.economy.goldUpperBound,
      );
      expect(
        phase.actions
          .filter((action) => action.affordable)
          .reduce((sum, action) => sum + action.cost, 0),
      ).toBe(phase.economy.phaseCost);
    }
  });

  it("derives multiple viable timing camps instead of one stack", () => {
    const plan = generateMatchPlan(laserBuild, { mapId: "forest" });
    expect(plan.camps.filter((camp) => camp.viable).length).toBeGreaterThan(1);
    expect(
      plan.camps.every((camp) => camp.capacity === camp.cells.length),
    ).toBe(true);
    const damageCamps = new Set(
      plan.phases
        .at(-1)
        ?.endTowers.filter(
          (tower) => tower.effect === "damage" || tower.effect === "hybrid",
        )
        .flatMap((tower) => (tower.campId ? [tower.campId] : [])),
    );
    expect(damageCamps.size).toBeGreaterThan(1);
    const earlyDamageCamps = new Set(
      plan.phases[2].endTowers
        .filter(
          (tower) => tower.effect === "damage" || tower.effect === "hybrid",
        )
        .flatMap((tower) => (tower.campId ? [tower.campId] : [])),
    );
    expect(earlyDamageCamps.size).toBeGreaterThan(1);
  });

  it("exports a versioned, ordered Co-pilot action contract", () => {
    const plan = generateMatchPlan(laserBuild, {
      mapId: "forest",
      reserveGold: 0,
    });
    const actions = serializeCopilotActions(plan);
    expect(actions.length).toBeGreaterThan(0);
    expect(
      actions.every((action) => action.schema === "etd2-copilot-action/1"),
    ).toBe(true);
    expect(actions.map((action) => action.sequence)).toEqual(
      [...actions.map((action) => action.sequence)].sort((a, b) => a - b),
    );
  });

  it("migrates legacy pick order, compatible cells and final-form intent", () => {
    const migrated = migrateLegacyLiveState(
      laserBuild,
      JSON.stringify({
        allocation: { Light: 1, Darkness: 1, Earth: 1 },
        pickLog: ["Earth", "Light", "Darkness"],
        built: [{ towerId: "atom", level: 1, quantity: 1 }],
        placements: [
          {
            mapId: "forest",
            towerId: "atom",
            level: 1,
            col: 6,
            row: 0,
            finalForm: { towerId: "laser", level: 1 },
          },
        ],
        matchLength: "full",
      }),
      { mapId: "forest", reserveGold: 0 },
    );
    expect(migrated.plan).not.toBeNull();
    expect(
      migrated.plan?.overrides.some(
        (entry) => entry.kind === "allocation-order",
      ),
    ).toBe(true);
    const atom = migrated.plan?.phases
      .flatMap((phase) => phase.endTowers)
      .find((tower) => tower.towerId === "atom");
    expect(atom?.cell).toEqual({ col: 6, row: 0 });
    expect(atom?.finalForm).toEqual({ towerId: "laser", level: 1 });
  });

  it("reports malformed legacy data without crashing", () => {
    const migrated = migrateLegacyLiveState(laserBuild, "{broken", {
      mapId: "forest",
    });
    expect(migrated.plan?.phases).toHaveLength(12);
    expect(migrated.warnings[0]).toContain("malformed");
  });

  it("recalculates downstream snapshots for legal cell and temporary-retention overrides", () => {
    const base = generateMatchPlan(laserBuild, {
      mapId: "forest",
      reserveGold: 0,
    });
    const carry = base.phases
      .flatMap((phase) => phase.endTowers)
      .find(
        (tower) =>
          tower.status === "temporary" &&
          !["arrow", "cannon"].includes(tower.towerId),
      );
    expect(carry).toBeDefined();
    const overridden = generateMatchPlan(laserBuild, {
      mapId: "forest",
      reserveGold: 0,
      overrides: [
        {
          id: "cell",
          kind: "cell",
          copyId: carry!.copyId,
          cell: { col: 6, row: 0 },
        },
        {
          id: "retain",
          kind: "retain-temporary",
          copyId: carry!.copyId,
          retain: true,
        },
      ],
    });
    const overriddenCarry = overridden.phases
      .flatMap((phase) => phase.endTowers)
      .find((tower) => tower.copyId === carry!.copyId);
    expect(overriddenCarry?.cell).toEqual({ col: 6, row: 0 });
    expect(overriddenCarry?.status).toBe("permanent");
  });
});
