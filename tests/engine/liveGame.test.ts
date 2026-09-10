import { describe, expect, it } from "vitest";

import type { ElementAllocation } from "@/lib/domain/elements";
import type { PortableProgressionStage } from "@/lib/domain/portableBuild";
import {
  basicBuildables,
  buildableByRole,
  coreRoleStatus,
  deriveGoldSpent,
  emptyLiveAllocation,
  endGameReadiness,
  essenceForPhase,
  isEndGameTowerId,
  livePhaseLabel,
  nextPickOptions,
  planProgress,
  resolveLiveTowerCost,
} from "@/lib/engine/liveGame";

function alloc(
  partial: Partial<ElementAllocation>,
): ElementAllocation {
  return { ...emptyLiveAllocation(), ...partial };
}

describe("deriveGoldSpent", () => {
  it("sums cumulative field cost at each tower's current level", () => {
    // Trio L2 = 5000, Quad L1 = 4250
    expect(
      deriveGoldSpent([
        { towerId: "laser", level: 2, quantity: 1 },
        { towerId: "nova", level: 2, quantity: 1 },
        { towerId: "rage", level: 1, quantity: 1 },
      ]),
    ).toBe(14250);
  });

  it("multiplies by quantity and ignores empty rows", () => {
    // Dual L1 = 500
    expect(
      deriveGoldSpent([
        { towerId: "ice", level: 1, quantity: 3 },
        { towerId: "nova", level: 2, quantity: 0 },
      ]),
    ).toBe(1500);
  });

  it("prices end-game towers from their own catalog", () => {
    expect(isEndGameTowerId("pure-nature")).toBe(true);
    expect(
      deriveGoldSpent([
        { towerId: "pure-nature", level: 1, quantity: 2 },
      ]),
    ).toBe(27500);
  });

  it("prices Arrow / Cannon flat and mono towers per level", () => {
    expect(resolveLiveTowerCost("arrow", 1)).toBe(75);
    expect(resolveLiveTowerCost("cannon", 1)).toBe(75);
    expect(resolveLiveTowerCost("mono-fire", 1)).toBe(175);
    expect(resolveLiveTowerCost("mono-fire", 2)).toBe(675);
    expect(resolveLiveTowerCost("mono-fire", 3)).toBe(2500);
    expect(
      deriveGoldSpent([
        { towerId: "cannon", level: 1, quantity: 2 },
        { towerId: "mono-water", level: 2, quantity: 1 },
      ]),
    ).toBe(150 + 675);
  });
});

describe("basicBuildables", () => {
  it("always offers Arrow and Cannon regardless of picks", () => {
    const ids = basicBuildables(emptyLiveAllocation()).map((t) => t.id);
    expect(ids).toEqual(["arrow", "cannon"]);
  });

  it("opens a mono tower up to the level its element is held at", () => {
    const list = basicBuildables(alloc({ Fire: 2 }));
    const fire = list.find((t) => t.id === "mono-fire");
    expect(fire?.maxLevel).toBe(2);
    expect(fire?.element).toBe("Fire");
    expect(list.some((t) => t.id === "mono-water")).toBe(false);
  });
});

describe("phase helpers", () => {
  it("labels phases by wave bracket and marks the last as Essence", () => {
    expect(livePhaseLabel(1)).toBe("Waves 1–5");
    expect(livePhaseLabel(4)).toBe("Waves 16–20");
    expect(livePhaseLabel(11)).toBe("Waves 51–55 · Essence");
  });

  it("grants essence only at the final phase", () => {
    expect(essenceForPhase(10)).toBe(0);
    expect(essenceForPhase(11)).toBe(2);
  });
});

describe("buildableByRole", () => {
  it("returns nothing at an empty allocation", () => {
    expect(buildableByRole(emptyLiveAllocation())).toEqual([]);
  });

  it("groups reachable towers under their core role", () => {
    // nova = Light/Fire/Nature trio, coreRoles ["slow"]
    const groups = buildableByRole(
      alloc({ Light: 1, Fire: 1, Nature: 1 }),
    );
    const slow = groups.find((group) => group.role === "slow");
    expect(slow?.label).toBe("Slow");
    expect(
      slow?.towers.map((entry) => entry.tower.id),
    ).toContain("nova");
  });
});

describe("nextPickOptions", () => {
  it("ranks keystones that open a missing core role above the rest", () => {
    const options = nextPickOptions(alloc({ Light: 1, Fire: 1 }));
    // The winner must open at least one still-missing core role.
    expect(options[0].coreRolesOpened.length).toBeGreaterThan(0);
    // ...and every role-opening option outranks every non-opening one.
    const lastOpener = options.findLastIndex(
      (option) => option.coreRolesOpened.length > 0,
    );
    const firstNonOpener = options.findIndex(
      (option) => option.coreRolesOpened.length === 0,
    );
    if (firstNonOpener !== -1) {
      expect(lastOpener).toBeLessThan(firstNonOpener);
    }
  });

  it("credits the keystone that makes a Slow reachable", () => {
    // Light 1 / Fire 1 held: Nature completes Nova's Light/Fire/Nature recipe.
    const nature = nextPickOptions(alloc({ Light: 1, Fire: 1 })).find(
      (option) => option.element === "Nature",
    );
    expect(nature?.coreRolesOpened).toContain("slow");
    expect(nature?.newlyUnlocked).toContain("Nova");
  });

  it("returns nothing once the keystone budget is spent", () => {
    expect(
      nextPickOptions(
        alloc({ Light: 3, Darkness: 3, Water: 3, Fire: 2 }),
      ),
    ).toEqual([]);
  });
});

describe("coreRoleStatus", () => {
  const allocation = alloc({ Light: 1, Fire: 1, Nature: 1 });

  it("reports a reachable-but-unbuilt role as buildable", () => {
    const slow = coreRoleStatus(allocation, []).find(
      (entry) => entry.role === "slow",
    );
    expect(slow?.status).toBe("buildable");
    expect(slow?.candidateNames).toContain("Nova");
  });

  it("flips to built once that tower is on the field", () => {
    const slow = coreRoleStatus(allocation, [
      { towerId: "nova", level: 1, quantity: 1 },
    ]).find((entry) => entry.role === "slow");
    expect(slow?.status).toBe("built");
    expect(slow?.builtTowerNames).toContain("Nova");
  });

  it("reports an out-of-reach role as unreachable", () => {
    const buff = coreRoleStatus(allocation, []).find(
      (entry) => entry.role === "buff",
    );
    expect(buff?.status).toBe("unreachable");
  });
});

describe("endGameReadiness", () => {
  it("is locked until an element hits III or all six hit I", () => {
    const locked = endGameReadiness(alloc({ Light: 2 }), null, 1);
    expect(locked.unlocked).toBe(false);
    expect(locked.requirement).toContain("III");
  });

  it("unlocks the matching Pure tower at element III", () => {
    const ready = endGameReadiness(alloc({ Nature: 3 }), null, 1);
    expect(ready.unlocked).toBe(true);
    expect(
      ready.access.pureCandidates.map((entry) => entry.towerId),
    ).toContain("pure-nature");
  });

  it("grants no essence before the last phase and 2 at it", () => {
    expect(endGameReadiness(alloc({ Nature: 3 }), null, 10).essenceAvailable)
      .toBe(0);
    expect(endGameReadiness(alloc({ Nature: 3 }), null, 11).essenceAvailable)
      .toBe(2);
  });

  it("counts logged end-game towers as essence spent", () => {
    const spent = endGameReadiness(alloc({ Nature: 3 }), null, 11, [
      { towerId: "pure-nature", level: 1, quantity: 2 },
    ]);
    expect(spent.essenceSpent).toBe(2);
  });
});

describe("planProgress", () => {
  const progression: PortableProgressionStage[] = [
    {
      stage: "EARLY",
      headline: "Get the anchor firing.",
      reason: "anchor first",
      primaryAction: {
        kind: "build",
        towerId: "laser",
        towerName: "Laser",
        toLevel: 2,
        roles: ["Main DPS"],
      },
      keystoneSteps: [
        { element: "Light", from: 0, to: 1, unlocks: [] },
        { element: "Light", from: 1, to: 2, unlocks: [] },
      ],
    },
    {
      stage: "MID",
      headline: "Lock in the core.",
      reason: "core roles",
      primaryAction: {
        kind: "build",
        towerId: "nova",
        towerName: "Nova",
        toLevel: 2,
        roles: ["Slow"],
      },
      keystoneSteps: [
        { element: "Fire", from: 0, to: 2, unlocks: [] },
      ],
    },
  ];

  it("marks roadmap steps done from the held allocation, order-independent", () => {
    const progress = planProgress(
      progression,
      alloc({ Fire: 2 }),
      [],
    )!;
    expect(progress.roadmap.map((entry) => entry.done)).toEqual([
      false,
      false,
      true,
    ]);
    expect(progress.keystonesDone).toBe(1);
    expect(progress.keystonesPlanned).toBe(3);
  });

  it("reports the earliest incomplete stage", () => {
    expect(
      planProgress(progression, emptyLiveAllocation(), [])!.stage,
    ).toBe("EARLY");
    expect(
      planProgress(progression, alloc({ Light: 2 }), [])!.stage,
    ).toBe("MID");
  });

  it("skips a next action the player has already built", () => {
    const progress = planProgress(progression, alloc({ Light: 2 }), [
      { towerId: "nova", level: 2, quantity: 1 },
    ])!;
    expect(progress.nextActionDone).toBe(true);
    expect(progress.nextAction).toBeNull();
  });

  it("names the next unbuilt action", () => {
    const progress = planProgress(
      progression,
      emptyLiveAllocation(),
      [],
    )!;
    expect(progress.nextAction?.towerId).toBe("laser");
  });

  it("returns null with no progression", () => {
    expect(planProgress([], emptyLiveAllocation(), [])).toBeNull();
  });
});
