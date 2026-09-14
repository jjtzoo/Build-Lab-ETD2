import { describe, expect, it } from "vitest";
import type { PortableBuild } from "@/lib/domain/portableBuild";
import { PENDING_IMPORT_KEY } from "@/lib/domain/portableBuild";
import {
  consumeLiveImport,
  liveImportUrl,
  resolveLiveImport,
} from "@/lib/domain/liveImport";
import { emptyLiveAllocation, recommendedPick } from "@/lib/engine/liveGame";
import { liveAvailability } from "@/lib/engine/liveAvailability";
import { liveCoaching } from "@/lib/engine/liveCoaching";
import { calibratedEconomy } from "@/lib/engine/liveEconomy";
import { placementDestinations } from "@/lib/engine/livePlacement";
import { evolutionTargets } from "@/lib/domain/towerEvolution";

const allocation = { ...emptyLiveAllocation(), Water: 2, Fire: 2, Earth: 2 };
const plan: PortableBuild = {
  schema: "etd2-build/2",
  source: "theorycraft",
  anchorTowerId: "haste",
  towers: [{ towerId: "haste", level: 2 }],
  allocation,
  createdAt: "2026-09-13T00:00:00Z",
};

describe("live availability", () => {
  it("makes ordinary Mono levels first-class choices beside basics and Duals", () => {
    const towers = liveAvailability(allocation, 0, []);
    expect(towers.find((t) => t.id === "mono-water")).toMatchObject({
      group: "mono",
      maxLevel: 2,
      blockedReason: null,
    });
    expect(towers.find((t) => t.id === "arrow")).toMatchObject({
      group: "basic",
      blockedReason: null,
    });
    expect(towers.find((t) => t.id === "vapor")).toMatchObject({
      group: "element",
      blockedReason: null,
    });
    expect(towers.some((t) => t.id === "mono-light")).toBe(false);
  });
  it("shows eligible Pure and Periodic together while Essence-locked", () => {
    const readyElements = {
      ...allocation,
      Water: 3,
      Light: 1,
      Darkness: 1,
      Nature: 1,
    };
    const towers = liveAvailability(readyElements, 0, []);
    for (const id of ["pure-water", "periodic"])
      expect(towers.find((t) => t.id === id)).toMatchObject({
        group: "end-game",
        blockedReason: "Essence arrives in waves 51–55",
      });
    const unlocked = liveAvailability(readyElements, 1, []);
    expect(unlocked.find((t) => t.id === "periodic")?.blockedReason).toBeNull();
    expect(evolutionTargets("pure-water", 1)).toEqual([]);
    expect(evolutionTargets("periodic", 1)).toEqual([]);
  });
});

describe("placement destinations", () => {
  it("offers Muck II and Quad branches from Muck I", () => {
    const destinations = placementDestinations("muck", 1);
    expect(
      destinations.some((p) => p.tower.id === "muck" && p.level === 2),
    ).toBe(true);
    expect(
      destinations.some((p) => p.tower.id === "crystal-spire" && p.level === 1),
    ).toBe(true);
    expect(
      placementDestinations("muck", 2).some(
        (p) => p.tower.id === "crystal-spire",
      ),
    ).toBe(false);
  });
  it("allows a basic precursor to scout its eventual normal form", () => {
    expect(
      placementDestinations("arrow", 1).some((p) => p.tower.id === "doom"),
    ).toBe(true);
  });
});

describe("Now / Next / Later", () => {
  it("does not label an element-ready plan tower as buildable before its bank can buy it", () => {
    const coaching = liveCoaching(plan, allocation, [], 0, 300);
    expect(coaching.nextAction).toBeNull();
    expect(coaching.blockedAction).toMatchObject({ towerId: "haste" });
    expect(
      coaching.blockedAction?.missing.some((gap) => gap.startsWith("Save ")),
    ).toBe(true);
  });
  it("offers a single-copy upgrade for Theory Craft goals", () => {
    const result = liveCoaching(
      plan,
      allocation,
      [{ towerId: "haste", level: 1, quantity: 2 }],
      0,
    );
    expect(result.nextAction).toMatchObject({
      towerId: "haste",
      kind: "upgrade",
      fromLevel: 1,
      toLevel: 2,
    });
    expect(result.complete).toBe(false);
    expect(
      liveCoaching(
        plan,
        allocation,
        [{ towerId: "haste", level: 2, quantity: 1 }],
        0,
      ).complete,
    ).toBe(true);
  });
  it("does not abandon earlier unbuilt actions when their picks are complete", () => {
    const engine: PortableBuild = {
      ...plan,
      source: "engine",
      progression: [
        {
          stage: "EARLY",
          headline: "Start",
          reason: "clear",
          primaryAction: {
            kind: "build",
            towerId: "vapor",
            towerName: "Vapor",
            toLevel: 1,
            roles: [],
          },
          keystoneSteps: [
            { element: "Water", from: 0, to: 1, unlocks: [] },
            { element: "Fire", from: 0, to: 1, unlocks: [] },
          ],
        },
      ],
    };
    expect(liveCoaching(engine, allocation, [], 0).nextAction?.towerId).toBe(
      "vapor",
    );
    expect(recommendedPick(emptyLiveAllocation(), engine)?.element).toBe(
      "Water",
    );
  });
  it("keeps every keystone unlock in order and labels a legal recovery move", () => {
    const staged: PortableBuild = {
      ...plan,
      source: "engine",
      towers: [{ towerId: "arrow", level: 1 }],
      progression: [
        {
          stage: "EARLY",
          headline: "Open Laser",
          reason: "anchor first",
          primaryAction: {
            kind: "build",
            towerId: "laser",
            towerName: "Laser",
            toLevel: 1,
            roles: [],
          },
          keystoneSteps: [
            {
              element: "Earth",
              from: 0,
              to: 1,
              unlocks: [
                {
                  kind: "build",
                  towerId: "laser",
                  towerName: "Laser",
                  toLevel: 1,
                  roles: [],
                },
              ],
            },
          ],
        },
      ],
    };
    const coaching = liveCoaching(staged, emptyLiveAllocation(), [], 0);
    expect(coaching.actions.map((action) => action.towerId)).toEqual([
      "laser",
      "arrow",
    ]);
    expect(coaching.nextAction?.towerId).toBe("arrow");
    expect(coaching.blockedAction?.towerId).toBe("laser");
    expect(coaching.isAdaptive).toBe(true);
  });
  it("keeps the main DPS anchor ahead of an out-of-order support step", () => {
    const supportFirst: PortableBuild = {
      ...plan,
      source: "engine",
      progression: [
        {
          stage: "EARLY",
          headline: "Incorrect import order",
          reason: "support first",
          primaryAction: null,
          keystoneSteps: [{ element: "Light", from: 0, to: 1, unlocks: [] }],
        },
      ],
    };
    const pick = recommendedPick(emptyLiveAllocation(), supportFirst);
    // Haste is Water/Fire/Earth. A stale Light support unlock cannot jump it.
    expect(pick).toMatchObject({
      element: "Water",
      planPriority: { kind: "anchor-first", towerName: "Haste" },
    });
  });
  it("keeps end-game goals blocked by Essence and counts repeated selections", () => {
    const alloc = { ...allocation, Water: 3 };
    const endPlan = {
      ...plan,
      allocation: alloc,
      endGame: [{ name: "Pure Water", quantity: 2 }],
    };
    const built = [{ towerId: "haste", level: 2, quantity: 1 }];
    expect(
      liveCoaching(endPlan, alloc, built, 0).blockedAction?.missing,
    ).toContain("Essence arrives in waves 51–55");
    expect(
      liveCoaching(
        endPlan,
        alloc,
        [...built, { towerId: "pure-water", level: 1, quantity: 1 }],
        4,
      ).nextAction?.towerId,
    ).toBe("pure-water");
  });
});

describe("live economy calibration", () => {
  it("uses the supplied match-length starting checkpoints before deducting field spend", () => {
    expect(calibratedEconomy(0, 0, "full").availableGold).toBe(300);
    expect(calibratedEconomy(0, 500, "short").availableGold).toBe(1000);
    expect(calibratedEconomy(0, 0, "extra-short").availableGold).toBe(7500);
    expect(calibratedEconomy(0, 0, "boss-hunt").availableGold).toBe(130000);
  });
});

describe("import resolution", () => {
  it("preserves saved match data only for keep, never pre-fields plan towers", () => {
    const saved = {
      allocation,
      built: [{ towerId: "vapor", level: 1, quantity: 2 }],
      placements: [
        { towerId: "vapor", level: 1, mapId: "forest", col: 3, row: 3 },
      ],
    };
    expect(resolveLiveImport("keep", plan, saved)).toEqual({
      plan,
      snapshot: saved,
    });
    expect(resolveLiveImport("fresh", plan, saved)).toEqual({
      plan,
      snapshot: null,
    });
  });
  it("removes pending handoff and URL payload only at consumption", () => {
    const items = new Map<string, string>();
    const storage = {
      setItem: (k: string, v: string) => {
        items.set(k, v);
      },
      removeItem: (k: string) => {
        items.delete(k);
      },
    };
    expect(liveImportUrl(plan, storage)).toContain("/match-plan?b=");
    expect(items.has(PENDING_IMPORT_KEY)).toBe(true);
    expect(
      consumeLiveImport(storage, "https://lab.example/live?b=payload&edit=1"),
    ).toBe("/live?edit=1");
    expect(items.has(PENDING_IMPORT_KEY)).toBe(false);
  });
  it("uses URL fallback when storage is unavailable, including oversized builds", () => {
    const longPlan = { ...plan, createdAt: "x".repeat(7000) };
    expect(liveImportUrl(longPlan, null)).toContain("/match-plan?b=");
    expect(consumeLiveImport(null, "https://lab.example/live?b=x")).toBe(
      "/live",
    );
  });
});
