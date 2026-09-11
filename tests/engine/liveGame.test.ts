import { describe, expect, it } from "vitest";

import type { ElementAllocation } from "@/lib/domain/elements";
import type {
  PortableBuild,
  PortableProgressionStage,
} from "@/lib/domain/portableBuild";
import {
  basicBuildables,
  buildableByRole,
  builtRowKey,
  coreRoleStatus,
  coverageGaps,
  deriveGoldSpent,
  derivedPhase,
  emptyLiveAllocation,
  endGameReadiness,
  essenceForPhase,
  isEndGame,
  isEndGameTowerId,
  isSameBuiltRow,
  isTowerLoggable,
  liveTowerMaxLevel,
  liveTowerName,
  livePhaseLabel,
  loggableTowers,
  nextPickOptions,
  planKeystoneProgress,
  planProgress,
  planTargets,
  resolveLiveTowerCost,
  staleFieldRows,
  towerReachGap,
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
    expect(livePhaseLabel(13)).toBe("Waves 56+ · Boss");
  });

  it("grants essence only at the final phase", () => {
    expect(essenceForPhase(10)).toBe(0);
    expect(essenceForPhase(11)).toBe(2);
    expect(essenceForPhase(14)).toBe(2);
  });

  it("derives the phase from picks plus deliberate holds", () => {
    expect(derivedPhase(emptyLiveAllocation(), 0)).toBe(0);
    expect(derivedPhase(alloc({ Light: 3, Fire: 2 }), 0)).toBe(5);
    // Held two summons: at wave phase 7 with only 5 picks spent.
    expect(derivedPhase(alloc({ Light: 3, Fire: 2 }), 2)).toBe(7);
  });

  it("is end game once every keystone is spent", () => {
    expect(isEndGame(alloc({ Light: 3, Fire: 2, Nature: 3 }))).toBe(false);
    expect(
      isEndGame(alloc({ Light: 3, Fire: 2, Nature: 3, Earth: 3 })),
    ).toBe(true);
  });

  it("unlocks essence on the 11th keystone with no manual stepping", () => {
    const eleven = alloc({ Light: 3, Fire: 2, Nature: 3, Earth: 3 });
    expect(essenceForPhase(derivedPhase(eleven, 0))).toBe(2);
  });
});

describe("coverageGaps", () => {
  it("is quiet with nothing on the field", () => {
    expect(coverageGaps([])).toEqual({
      weakAgainst: [],
      unanswered: [],
    });
  });

  it("flags Fire armour when most damage is Nature", () => {
    // Bloom + Mushroom = Nature dmg, one lone mono-light for Light dmg.
    const gaps = coverageGaps([
      { towerId: "bloom", level: 3, quantity: 1 },
      { towerId: "mushroom", level: 3, quantity: 1 },
      { towerId: "mono-light", level: 1, quantity: 1 },
    ]);
    expect(gaps.weakAgainst).toContain("Fire");
  });

  it("clears the Fire hole once enough non-Nature damage is fielded", () => {
    const gaps = coverageGaps([
      { towerId: "bloom", level: 3, quantity: 1 },
      { towerId: "mono-water", level: 3, quantity: 2 },
    ]);
    expect(gaps.weakAgainst).not.toContain("Fire");
  });
});

describe("field row identity", () => {
  it("keys a row by tower and level together", () => {
    expect(builtRowKey("mono-light", 1)).toBe("mono-light@1");
    expect(builtRowKey("mono-light", 2)).not.toBe(
      builtRowKey("mono-light", 1),
    );
    expect(
      isSameBuiltRow(
        { towerId: "mono-light", level: 2, quantity: 1 },
        "mono-light",
        2,
      ),
    ).toBe(true);
    expect(
      isSameBuiltRow(
        { towerId: "mono-light", level: 1, quantity: 1 },
        "mono-light",
        2,
      ),
    ).toBe(false);
  });

  it("sums Light I beside Light II without collapsing them", () => {
    // 175×2 (mono L1) + 675×1 (mono L2)
    expect(
      deriveGoldSpent([
        { towerId: "mono-light", level: 1, quantity: 2 },
        { towerId: "mono-light", level: 2, quantity: 1 },
      ]),
    ).toBe(175 * 2 + 675);
  });
});

describe("tower name / level resolution", () => {
  it("names every loggable id kind", () => {
    expect(liveTowerName("laser")).toBe("Laser");
    expect(liveTowerName("arrow")).toBe("Arrow");
    expect(liveTowerName("mono-fire")).toBe("Fire");
    expect(liveTowerName("pure-light")).toContain("Pure");
  });

  it("caps levels by kind", () => {
    expect(liveTowerMaxLevel("mono-fire")).toBe(3);
    expect(liveTowerMaxLevel("arrow")).toBe(1);
    expect(liveTowerMaxLevel("pure-light")).toBe(1);
    expect(liveTowerMaxLevel("nova")).toBe(2); // Trio
  });
});

describe("loggableTowers", () => {
  it("always offers Arrow and Cannon and never an out-of-reach tower", () => {
    const list = loggableTowers(emptyLiveAllocation());
    expect(list.map((tower) => tower.id)).toEqual(["arrow", "cannon"]);
  });

  it("adds element and end-game towers as the allocation opens them", () => {
    const list = loggableTowers(
      alloc({ Light: 3, Fire: 2, Nature: 3, Earth: 3 }),
    );
    const ids = list.map((tower) => tower.id);
    expect(ids).toContain("rage"); // Quad L1 in reach
    expect(ids).toContain("pure-light"); // Light III
    expect(ids).not.toContain("tesla-tree"); // needs Water
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

  it("does not let a row an undone pick stranded count as built", () => {
    // Nova was logged at Light/Fire/Nature I, then Nature was undone.
    const stranded = alloc({ Light: 1, Fire: 1 });
    const slow = coreRoleStatus(stranded, [
      { towerId: "nova", level: 1, quantity: 1 },
    ]).find((entry) => entry.role === "slow");
    expect(slow?.status).not.toBe("built");
    expect(slow?.builtTowerNames).not.toContain("Nova");
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

describe("plans without a staged roadmap (Theory Craft imports)", () => {
  const plan = {
    schema: "etd2-build/2",
    source: "theorycraft",
    anchorTowerId: "bloom",
    towers: [
      { towerId: "bloom", level: 3 },
      { towerId: "nova", level: 2 },
    ],
    allocation: {
      Light: 3,
      Darkness: 0,
      Water: 0,
      Fire: 2,
      Nature: 3,
      Earth: 3,
    },
    createdAt: "2026-09-11T00:00:00.000Z",
  } as unknown as PortableBuild;

  it("grades each plan tower against the field and the picks", () => {
    const targets = planTargets(
      plan,
      alloc({ Light: 3, Fire: 2, Nature: 3 }),
      [{ towerId: "nova", level: 2, quantity: 1 }],
    );

    const bloom = targets.find((t) => t.towerId === "bloom");
    const nova = targets.find((t) => t.towerId === "nova");
    expect(bloom?.status).toBe("buildable");
    expect(nova?.status).toBe("built");
  });

  it("drops a target back off 'built' once its row is stranded", () => {
    // Nova (Light+Fire+Nature) logged at II, then Nature undone to 0.
    const targets = planTargets(
      plan,
      alloc({ Light: 3, Fire: 2 }),
      [{ towerId: "nova", level: 2, quantity: 1 }],
    );
    expect(targets.find((t) => t.towerId === "nova")?.status).not.toBe(
      "built",
    );
  });

  it("names the keystones a target is still waiting on", () => {
    const bloom = planTargets(plan, emptyLiveAllocation(), []).find(
      (t) => t.towerId === "bloom",
    );
    expect(bloom?.status).toBe("out-of-reach");
    expect(bloom?.missing).toContain("Light III");
    expect(bloom?.missing).toContain("Nature III");
  });

  it("measures the keystone route order-independently", () => {
    const progress = planKeystoneProgress(
      plan,
      alloc({ Nature: 3, Earth: 1 }),
    );
    expect(progress.plannedTotal).toBe(11);
    expect(progress.heldTotal).toBe(4);
    // Earth is 2 short, Light 3 short, Fire 2 short — deepest gap first.
    expect(progress.stillNeeded[0]).toBe("Light");
    expect(progress.stillNeeded).not.toContain("Nature");
    expect(progress.stillNeeded).not.toContain("Darkness");
  });

  it("returns nothing without a plan", () => {
    expect(planTargets(null, emptyLiveAllocation(), [])).toEqual([]);
    expect(
      planKeystoneProgress(null, emptyLiveAllocation()).plannedTotal,
    ).toBe(0);
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
    // Nova (Light+Fire+Nature) must actually be reachable at II, or the
    // logged row is stale and can no longer satisfy the action.
    const progress = planProgress(
      progression,
      alloc({ Light: 2, Fire: 2, Nature: 2 }),
      [{ towerId: "nova", level: 2, quantity: 1 }],
    )!;
    expect(progress.nextActionDone).toBe(true);
    expect(progress.nextAction).toBeNull();
  });

  it("does not credit a plan action to a row an undone pick stranded", () => {
    // Nova logged at II, then Fire and Nature were undone back to 0 —
    // the row is stale and must stop satisfying the plan's Nova action.
    const progress = planProgress(progression, alloc({ Light: 2 }), [
      { towerId: "nova", level: 2, quantity: 1 },
    ])!;
    expect(progress.nextActionDone).toBe(false);
  });

  it("never offers a next move the picks can't reach — surfaces it as blocked", () => {
    // Empty allocation: Laser (Light+Darkness+Earth) is not loggable yet.
    const progress = planProgress(progression, emptyLiveAllocation(), [])!;
    expect(progress.nextAction).toBeNull();
    expect(progress.blockedAction?.action.towerId).toBe("laser");
    expect(progress.blockedAction?.missing.length).toBeGreaterThan(0);
  });

  it("promotes the blocked action to a real next move once it is reachable", () => {
    // A one-stage plan whose build (Laser I) needs Light+Darkness+Earth.
    const oneStage: PortableProgressionStage[] = [
      {
        stage: "EARLY",
        headline: "Anchor.",
        reason: "anchor",
        primaryAction: {
          kind: "build",
          towerId: "laser",
          towerName: "Laser",
          toLevel: 1,
          roles: ["Main DPS"],
        },
        keystoneSteps: [
          { element: "Light", from: 0, to: 1, unlocks: [] },
          { element: "Darkness", from: 0, to: 1, unlocks: [] },
          { element: "Earth", from: 0, to: 1, unlocks: [] },
        ],
      },
    ];
    expect(
      planProgress(oneStage, alloc({ Light: 1 }), [])!.blockedAction
        ?.action.towerId,
    ).toBe("laser");
    const ready = planProgress(
      oneStage,
      alloc({ Light: 1, Darkness: 1, Earth: 1 }),
      [],
    )!;
    expect(ready.nextAction?.towerId).toBe("laser");
    expect(ready.blockedAction).toBeNull();
  });

  it("returns null with no progression", () => {
    expect(planProgress([], emptyLiveAllocation(), [])).toBeNull();
  });
});

describe("field-log reachability guard", () => {
  it("only lets a tower be logged when its recipe is satisfied", () => {
    // Jinx = Darkness + Fire + Nature.
    expect(isTowerLoggable("jinx", alloc({ Fire: 1, Earth: 1 }))).toBe(
      false,
    );
    expect(
      isTowerLoggable("jinx", alloc({ Darkness: 1, Fire: 1, Nature: 1 })),
    ).toBe(true);
    // Arrow / Cannon are always loggable; mono needs its element.
    expect(isTowerLoggable("arrow", emptyLiveAllocation())).toBe(true);
    expect(isTowerLoggable("mono-fire", emptyLiveAllocation())).toBe(false);
    expect(isTowerLoggable("mono-fire", alloc({ Fire: 1 }))).toBe(true);
    // Pure towers need their Essence access.
    expect(isTowerLoggable("pure-fire", alloc({ Fire: 2 }))).toBe(false);
    expect(isTowerLoggable("pure-fire", alloc({ Fire: 3 }))).toBe(true);
  });

  it("flags field rows that fell out of reach after an undo", () => {
    // Logged Jinx II legitimately, then a Darkness pick was undone.
    const stale = staleFieldRows(alloc({ Fire: 2, Nature: 2 }), [
      { towerId: "jinx", level: 2, quantity: 1 },
      { towerId: "mono-fire", level: 2, quantity: 1 },
    ]);
    expect(stale.map((row) => row.towerId)).toEqual(["jinx"]);
  });

  it("names the keystones a tower is still short of", () => {
    const gap = towerReachGap("jinx", alloc({ Fire: 1 }), 1);
    expect(gap).toContain("Darkness I");
    expect(gap).toContain("Nature I");
    expect(gap).not.toContain("Fire I");
  });
});
