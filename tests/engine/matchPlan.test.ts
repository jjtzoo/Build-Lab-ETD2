import { describe, expect, it } from "vitest";
import type { PortableBuild } from "@/lib/domain/portableBuild";
import { MATCH_PLAN_SCHEMA, parseMatchPlan } from "@/lib/domain/matchPlan";
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

  it("uses Atom rather than Trickery as Laser's temporary early carry", () => {
    const plan = generateMatchPlan(laserBuild, {
      mapId: "forest",
      reserveGold: 0,
    });
    const towers = plan.phases.flatMap((phase) => phase.endTowers);
    expect(
      towers.some(
        (tower) => tower.towerId === "atom" && tower.status === "temporary",
      ),
    ).toBe(true);
    expect(
      towers.some(
        (tower) =>
          tower.towerId === "trickery" && tower.roles.includes("main-dps"),
      ),
    ).toBe(false);
    expect(
      towers.some(
        (tower) => tower.towerId === "mono-earth" && tower.level === 2,
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
    expect(
      secondWindow.endTowers.some(
        (tower) => tower.towerId === "atom" && tower.level === 1,
      ),
    ).toBe(true);
    expect(plan.phases[2].startTowers.length).toBeGreaterThan(0);
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
    const atom = base.phases
      .flatMap((phase) => phase.endTowers)
      .find((tower) => tower.towerId === "atom");
    expect(atom).toBeDefined();
    const overridden = generateMatchPlan(laserBuild, {
      mapId: "forest",
      reserveGold: 0,
      overrides: [
        {
          id: "cell",
          kind: "cell",
          copyId: atom!.copyId,
          cell: { col: 6, row: 0 },
        },
        {
          id: "retain",
          kind: "retain-temporary",
          copyId: atom!.copyId,
          retain: true,
        },
      ],
    });
    const overriddenAtom = overridden.phases
      .flatMap((phase) => phase.endTowers)
      .find((tower) => tower.copyId === atom!.copyId);
    expect(overriddenAtom?.cell).toEqual({ col: 6, row: 0 });
    expect(overriddenAtom?.status).toBe("permanent");
  });
});
