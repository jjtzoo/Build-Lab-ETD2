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
    expect(a.phases).toHaveLength(13);
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

  it("buys survival repairs ahead of continuing the package queue when a wave is short", () => {
    // Historically this fired in Waves 6–10 on Very Hard: the 500g elemental
    // bridge only landed at W10–11, so an early wave leaked without a
    // repair bought first. After the 2026-09-16 wave-HP calibration fix
    // (HP_CALIBRATION_SCALE in lib/engine/waveBenchmarks.ts corrected an
    // undocumented curve that had been crediting 1.8x-2.4x more HP than any
    // measured zero-leak win actually faced), that specific early race is
    // gone at every difficulty up to Legendary — the opening shell now
    // comfortably covers it, which is the intended outcome, not a
    // regression. The same repair-before-queue mechanism still fires later
    // in this build's own plan (Waves 36–40, the default Hard difficulty),
    // so the invariant is checked there instead of forcing back a race
    // that was itself an artifact of the old, disproven calibration.
    const plan = generateMatchPlan(laserBuild, { mapId: "forest" });
    const window = plan.phases[7];
    expect(window.label).toBe("Waves 36–40");
    const repairs = window.actions.filter((action) =>
      action.id.includes(":survival-repair:"),
    );
    expect(repairs.length).toBeGreaterThan(0);
    expect(repairs[0].reason).toMatch(
      /before the next package purchase|takes priority over the reserve/,
    );
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
    expect(plan.settings.difficulty).toBe("hard");
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

  it("evolves stale starters into whatever legal mono helps coverage, when the build's own queue has already moved past them", () => {
    // laserBuild's opening Arrows go stale well before the queue ever asks
    // for a fresh mono again (the anchor's own upgrades dominate by then) —
    // this is the real, organic case the exact-queue-match path can never
    // reach on its own, and the one the owner's real game hit.
    const plan = generateMatchPlan(laserBuild, { mapId: "forest" });
    const evolves = plan.phases.flatMap((phase) =>
      phase.actions.filter((action) => action.type === "evolve"),
    );
    expect(evolves.length).toBeGreaterThan(0);
    expect(
      evolves.every(
        (action) =>
          (action.fromTowerId === "arrow" || action.fromTowerId === "cannon") &&
          action.towerId !== action.fromTowerId,
      ),
    ).toBe(true);
    const sells = plan.phases.flatMap((phase) =>
      phase.actions.filter(
        (action) =>
          action.type === "sell" &&
          (action.towerId === "arrow" || action.towerId === "cannon"),
      ),
    );
    expect(sells).toEqual([]);
  });

  it("serializes an evolve action with its own tower identity, distinct from a fresh build", () => {
    const plan = generateMatchPlan(laserBuild, {
      mapId: "forest",
      reserveGold: 0,
    });
    const withEvolve = {
      ...plan,
      phases: plan.phases.map((phase, index) =>
        index === 0
          ? {
              ...phase,
              actions: [
                ...phase.actions,
                {
                  id: "test:evolve",
                  phaseId: phase.id,
                  order: 9999,
                  type: "evolve" as const,
                  summary: "Evolve Arrow into Light 1",
                  reason: "test fixture",
                  towerId: "mono-light",
                  towerName: "Light",
                  fromTowerId: "arrow",
                  fromTowerName: "Arrow",
                  copyId: "test-copy",
                  fromLevel: 1,
                  toLevel: 1,
                  cost: 100,
                  legal: true,
                  affordable: true,
                },
              ],
            }
          : phase,
      ),
    };
    const actions = serializeCopilotActions(withEvolve);
    const evolve = actions.find((action) => action.actionId === "test:evolve");
    expect(evolve?.command).toBe("evolve");
    expect(evolve?.tower?.id).toBe("mono-light");
    expect(evolve?.tower?.fromTowerId).toBe("arrow");
    expect(evolve?.tower?.fromTowerName).toBe("Arrow");
  });

  it("clusters repeat Tesla Trees in the same camp instead of spreading them, and names the uncredited link bonus", () => {
    const build: PortableBuild = {
      schema: "etd2-build/2",
      source: "engine",
      anchorTowerId: "laser",
      towers: [
        { towerId: "laser", level: 2 },
        { towerId: "tesla-tree", level: 1 },
        { towerId: "tesla-tree", level: 1 },
      ],
      allocation: {
        Light: 3,
        Darkness: 3,
        Earth: 3,
        Water: 1,
        Fire: 0,
        Nature: 1,
      },
      createdAt: "2026-09-14T00:00:00.000Z",
    };
    const plan = generateMatchPlan(build, { mapId: "forest" });
    const finalField = plan.phases.at(-1)!.endTowers;
    const teslaTrees = finalField.filter(
      (tower) => tower.towerId === "tesla-tree",
    );
    expect(teslaTrees.length).toBeGreaterThanOrEqual(2);
    const camps = new Set(teslaTrees.map((tower) => tower.campId));
    expect(camps.size).toBe(1);
    const risked = plan.phases.some((phase) =>
      phase.risks.some((risk) =>
        risk.includes("credited at its own single-tower DPS only"),
      ),
    );
    expect(risked).toBe(true);
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
    expect(migrated.plan?.phases).toHaveLength(13);
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

describe("End Game essence queue", () => {
  const essenceActions = (plan: ReturnType<typeof generateMatchPlan>) =>
    plan.phases.flatMap((phase) =>
      phase.actions.filter((action) =>
        action.reason?.startsWith("Essence pick"),
      ),
    );

  it("uses the build's own recommended End Game selection when present", () => {
    // Pure Light is legal for laserBuild (Light 3); the build's own endGame
    // selection is used as-is rather than re-ranked against the fallback.
    const plan = generateMatchPlan(
      { ...laserBuild, endGame: [{ name: "Pure Light", quantity: 2 }] },
      { mapId: "forest", difficulty: "hard" },
    );
    const picks = essenceActions(plan);
    expect(picks.length).toBeGreaterThan(0);
    for (const action of picks) expect(action.towerId).toBe("pure-light");
  });

  it("falls back to the highest sustained-DPS legal candidate when no endGame selection is recorded", () => {
    // laserBuild carries no `endGame` (a Theory-Craft-shaped build): Light 3 /
    // Darkness 3 / Earth 3 clear Pure access for those three elements; Water 1 /
    // Fire 1 / Nature 0 do not, and Periodic needs every element at 1+.
    const plan = generateMatchPlan(laserBuild, {
      mapId: "forest",
      difficulty: "hard",
    });
    const picks = essenceActions(plan);
    expect(picks.length).toBeGreaterThan(0);
    const towerIds = new Set(picks.map((action) => action.towerId));
    expect(towerIds.size).toBe(1);
    expect([...towerIds][0]).toMatch(/^pure-(light|darkness|earth)$/);
  });

  it("never offers the first essence pick before wave 50, or the second before wave 55", () => {
    const plan = generateMatchPlan(
      { ...laserBuild, endGame: [{ name: "Periodic", quantity: 2 }] },
      { mapId: "forest", difficulty: "hard" },
    );
    const picks = essenceActions(plan).sort(
      (a, b) => (a.targetWave ?? 0) - (b.targetWave ?? 0),
    );
    if (picks[0]) expect(picks[0].targetWave).toBeGreaterThanOrEqual(50);
    if (picks[1]) expect(picks[1].targetWave).toBeGreaterThanOrEqual(55);
  });

  it("never exceeds the two-use essence ceiling across the whole plan", () => {
    const plan = generateMatchPlan(
      { ...laserBuild, endGame: [{ name: "Periodic", quantity: 5 }] },
      { mapId: "forest", difficulty: "hard" },
    );
    expect(essenceActions(plan).length).toBeLessThanOrEqual(2);
  });

  it("offers nothing when the build's allocation never reaches a legal Pure or Periodic pick", () => {
    const noAccess: PortableBuild = {
      ...laserBuild,
      allocation: {
        Light: 2,
        Darkness: 2,
        Earth: 2,
        Water: 0,
        Fire: 0,
        Nature: 0,
      },
    };
    const plan = generateMatchPlan(noAccess, {
      mapId: "forest",
      difficulty: "hard",
    });
    expect(essenceActions(plan)).toEqual([]);
  });
});
