import { describe, expect, it } from "vitest";
import type { PortableBuild } from "@/lib/domain/portableBuild";
import { CURATED_ANCHORS } from "@/lib/domain/anchorPolicy";
import { isBasicTowerId, isMonoTowerId } from "@/lib/domain/auxiliaryTowers";
import { MATCH_PLAN_SCHEMA, parseMatchPlan } from "@/lib/domain/matchPlan";
import { getTower } from "@/lib/domain/towerCatalog";
import { planToPortableBuild } from "@/components/build-lab/OpenInLive";
import { buildRecommendationSetDto } from "@/lib/engine/buildRecommendationDto";
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
    // measured zero-leak win actually faced), that specific early race
    // moved to Waves 36–40. The 2026-09-18 rescue-valuation fix (deficit-
    // relevant headroom instead of a raw window-wide margin sum, plus a
    // surplus-spend pass that no longer lets a comfortably-passing window
    // bank its gold) makes every earlier window's own field stronger by the
    // time this build reaches it, so the race moved again, to Waves 41–45 —
    // each shift is the intended outcome of a real engine improvement, not a
    // regression, so the invariant is checked wherever it actually still
    // occurs in this build's own plan rather than forcing back a race an
    // earlier fix already closed.
    const plan = generateMatchPlan(laserBuild, { mapId: "forest" });
    const window = plan.phases[8];
    expect(window.label).toBe("Waves 41–45");
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

describe("Match Plan allocation timeline", () => {
  it("never lets a later allocation leak into an earlier window: Darkness first leaves Earth towers unavailable at W1", () => {
    // Howitzer (Darkness + Earth). The order is forced via an explicit
    // override so the scenario holds regardless of which element the
    // engine's own opening-bridge scoring would otherwise pick first —
    // this is the exact real report (2026-09-18): a Darkness-first opening
    // appeared to show an Earth tower already available on the map before
    // Earth had ever been allocated.
    const howitzerBuild: PortableBuild = {
      schema: "etd2-build/2",
      source: "engine",
      anchorTowerId: "howitzer",
      towers: [{ towerId: "howitzer", level: 2 }],
      allocation: {
        Light: 0,
        Darkness: 3,
        Water: 0,
        Fire: 0,
        Nature: 0,
        Earth: 3,
      },
      createdAt: "2026-09-14T00:00:00.000Z",
    };
    const plan = generateMatchPlan(howitzerBuild, {
      mapId: "forest",
      overrides: [
        {
          id: "force-darkness-first",
          kind: "allocation-order",
          elements: ["Darkness", "Earth", "Water", "Fire", "Light", "Nature"],
        },
      ],
    });
    const recipeOf = (towerId: string): readonly string[] => {
      if (isBasicTowerId(towerId)) return [];
      if (isMonoTowerId(towerId))
        return [towerId.slice(5, 6).toUpperCase() + towerId.slice(6)];
      try {
        return getTower(towerId).recipe;
      } catch {
        return [];
      }
    };
    const opening = plan.phases[0];
    expect(opening.actions[0]).toMatchObject({
      type: "allocate-element",
      element: "Darkness",
    });
    expect(opening.endAllocation.Earth).toBe(0);
    // Only base towers (no recipe) and Darkness-only towers may be on the
    // field once wave 1's own allocation is Darkness-only — never a tower
    // whose recipe needs Earth, or any other not-yet-allocated element.
    for (const tower of opening.endTowers) {
      const recipe = recipeOf(tower.towerId);
      expect(recipe.every((element) => element === "Darkness")).toBe(true);
    }
    expect(
      opening.endTowers.some((tower) =>
        recipeOf(tower.towerId).includes("Earth"),
      ),
    ).toBe(false);
    // Same check across every window of this build's own plan: a tower's
    // recipe elements can never outrun that same window's own allocation.
    for (const phase of plan.phases) {
      for (const tower of phase.endTowers) {
        for (const element of recipeOf(tower.towerId)) {
          expect(
            (phase.endAllocation as Record<string, number>)[element] ?? 0,
          ).toBeGreaterThanOrEqual(tower.level);
        }
      }
    }
  });

  it("an existing L1 copy stays L1 when its element's allocation rises later, until an explicit upgrade is purchased", () => {
    // Real report (2026-09-18): "Infernal 2" x3 in a wave-46 starting
    // field. Traced back: every Infernal copy did have a real, individually
    // paid build/upgrade action — the actual defect was one level over
    // (disease/mono-darkness, reproduced here as the real case in hand):
    // the opportunistic coverage-evolve and the fleet-copy rescue cascade
    // each mint a fresh copy's ordinal independently, and only the rescue
    // cascade's own cache remembered its choices. A coverage-evolve's mono
    // could mint the same ordinal — and therefore the same copyId — a
    // same-window rescue copy was about to mint for a *different* fresh
    // tower, merging two distinct, differently-placed towers into one
    // array slot; a later upgrade matching by that shared copyId then made
    // the merged tower's level "jump" with no single action explaining it.
    // Fixed generically in matchPlan.ts's `nextCopyOrdinal`: every ordinal
    // is now checked against the live field itself before being handed
    // out, not just whichever cache the calling site happened to consult.
    const anchor = CURATED_ANCHORS.find((entry) => entry.towerId === "disease")!;
    const set = buildRecommendationSetDto(anchor.towerId);
    const plan = set.plans.find((entry) => entry.id === "rank-1") ?? set.plans[0];
    const matchPlan = generateMatchPlan(planToPortableBuild(plan!), {
      mapId: "forest",
    });
    const levelByCopy = new Map<string, number>();
    for (const phase of matchPlan.phases) {
      const seen = new Set<string>();
      for (const tower of phase.endTowers) {
        // No copyId may name two different tower instances in one window —
        // the exact corruption that let a level "rise" with no action.
        expect(seen.has(tower.copyId)).toBe(false);
        seen.add(tower.copyId);
      }
      const actionedLevels = new Map<string, Set<number>>();
      for (const action of phase.actions) {
        if (
          !action.copyId ||
          action.toLevel == null ||
          (action.type !== "build" &&
            action.type !== "upgrade" &&
            action.type !== "evolve")
        )
          continue;
        const set2 = actionedLevels.get(action.copyId) ?? new Set<number>();
        set2.add(action.toLevel);
        actionedLevels.set(action.copyId, set2);
      }
      for (const tower of phase.endTowers) {
        const prior = levelByCopy.get(tower.copyId);
        if (prior != null && tower.level > prior) {
          expect(actionedLevels.get(tower.copyId)?.has(tower.level)).toBe(
            true,
          );
        }
        levelByCopy.set(tower.copyId, tower.level);
      }
    }
  });
});
