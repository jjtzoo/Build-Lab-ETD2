import { describe, expect, it } from "vitest";

import {
  type ElementAllocation,
} from "@/lib/domain/elements";

import {
  getTower,
} from "@/lib/domain/towerCatalog";

import {
  getCoreRoleFeasibility,
  hasDevelopedCorePackage,
  hasFeasibleCorePackage,
} from "@/lib/engine/coreRoleDetection";

function emptyAllocation(): ElementAllocation {
  return {
    Light: 0,
    Darkness: 0,
    Water: 0,
    Fire: 0,
    Nature: 0,
    Earth: 0,
  };
}

function allocationForTower(
  towerId: string,
  level: number,
): ElementAllocation {
  const tower = getTower(towerId);
  const allocation = emptyAllocation();

  for (const element of tower.recipe) {
    allocation[element] = level;
  }

  return allocation;
}

function roleStatus(
  allocation: ElementAllocation,
  role:
    | "main-dps"
    | "slow"
    | "damage-amp"
    | "buff",
) {
  const status =
    getCoreRoleFeasibility(allocation).find(
      (entry) => entry.role === role,
    );

  if (!status) {
    throw new Error(
      `Missing feasibility status for ${role}.`,
    );
  }

  return status;
}

describe("core role feasibility", () => {
  it("reports no feasible core package with no element allocation", () => {
    const allocation =
      emptyAllocation();

    expect(
      hasFeasibleCorePackage(allocation),
    ).toBe(false);

    expect(
      hasDevelopedCorePackage(allocation),
    ).toBe(false);
  });

  it("treats Well L1 as available Buff but not developed", () => {
    const allocation =
      allocationForTower("well", 1);

    const buff =
      roleStatus(allocation, "buff");

    const well =
      buff.candidates.find(
        (candidate) =>
          candidate.towerId === "well",
      );

    expect(well).toBeDefined();

    expect(well).toEqual(
      expect.objectContaining({
        towerId: "well",
        reachableLevel: 1,
        targetLevel: 2,
        atTargetLevel: false,
      }),
    );

    expect(buff.available).toBe(true);
  });

  it("treats Well L2 as a developed Buff option", () => {
    const allocation =
      allocationForTower("well", 2);

    const buff =
      roleStatus(allocation, "buff");

    const well =
      buff.candidates.find(
        (candidate) =>
          candidate.towerId === "well",
      );

    expect(well).toEqual(
      expect.objectContaining({
        towerId: "well",
        reachableLevel: 2,
        targetLevel: 2,
        atTargetLevel: true,
      }),
    );

    expect(buff.developed).toBe(true);
  });

  it("plans Nova toward its canonical maximum level for Slow", () => {
    const tower =
      getTower("nova");

    const allocation =
      allocationForTower(
        "nova",
        tower.maxLevel - 1,
      );

    const slow =
      roleStatus(allocation, "slow");

    const nova =
      slow.candidates.find(
        (candidate) =>
          candidate.towerId === "nova",
      );

    expect(nova).toEqual(
      expect.objectContaining({
        towerId: "nova",
        reachableLevel:
          tower.maxLevel - 1,
        targetLevel:
          tower.maxLevel,
        atTargetLevel: false,
      }),
    );
  });

  it("treats Nova at maximum level as developed Slow", () => {
    const tower =
      getTower("nova");

    const allocation =
      allocationForTower(
        "nova",
        tower.maxLevel,
      );

    const slow =
      roleStatus(allocation, "slow");

    const nova =
      slow.candidates.find(
        (candidate) =>
          candidate.towerId === "nova",
      );

    expect(nova).toEqual(
      expect.objectContaining({
        towerId: "nova",
        reachableLevel:
          tower.maxLevel,
        targetLevel:
          tower.maxLevel,
        atTargetLevel: true,
      }),
    );

    expect(slow.developed).toBe(true);
  });

  it("plans Incantation toward its canonical maximum level for Damage Amp", () => {
    const tower =
      getTower("incantation");

    const allocation =
      allocationForTower(
        "incantation",
        tower.maxLevel,
      );

    const damageAmp =
      roleStatus(
        allocation,
        "damage-amp",
      );

    const incantation =
      damageAmp.candidates.find(
        (candidate) =>
          candidate.towerId ===
          "incantation",
      );

    expect(incantation).toEqual(
      expect.objectContaining({
        towerId: "incantation",
        reachableLevel:
          tower.maxLevel,
        targetLevel:
          tower.maxLevel,
        atTargetLevel: true,
      }),
    );

    expect(
      damageAmp.developed,
    ).toBe(true);
  });

  it("preserves reachable tower level on Main DPS candidates", () => {
    const tower =
      getTower("laser");

    const allocation =
      allocationForTower(
        "laser",
        tower.maxLevel,
      );

    const mainDps =
      roleStatus(
        allocation,
        "main-dps",
      );

    const laser =
      mainDps.candidates.find(
        (candidate) =>
          candidate.towerId === "laser",
      );

    expect(laser).toEqual(
      expect.objectContaining({
        towerId: "laser",
        reachableLevel:
          tower.maxLevel,
        targetLevel:
          tower.maxLevel,
        atTargetLevel: true,
      }),
    );
  });

  it("returns the four mandatory roles in planner priority order", () => {
    const statuses =
      getCoreRoleFeasibility(
        emptyAllocation(),
      );

    expect(
      statuses.map(
        (status) => status.role,
      ),
    ).toEqual([
      "main-dps",
      "slow",
      "damage-amp",
      "buff",
    ]);
  });
});