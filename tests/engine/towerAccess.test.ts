import { describe, expect, it } from "vitest";

import {
  type ElementAllocation,
} from "@/lib/domain/elements";

import type {
  CombinationClass,
  Tower,
} from "@/lib/domain/tower";

import {
  TOWERS,
} from "@/lib/domain/towerCatalog";

import {
  availableTowers,
  isTowerAvailable,
  maxReachableTowerLevel,
} from "@/lib/engine/allocation";

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
  tower: Tower,
  level: number,
): ElementAllocation {
  const allocation =
    emptyAllocation();

  for (const element of tower.recipe) {
    allocation[element] = level;
  }

  return allocation;
}

function towerOfCombination<
  T extends CombinationClass,
>(
  combination: T,
): Extract<Tower, { combination: T }> {
  const tower = TOWERS.find(
    (candidate) =>
      candidate.combination === combination,
  );

  if (!tower) {
    throw new Error(
      `Expected canonical ${combination} tower.`,
    );
  }

  return tower as Extract<
    Tower,
    { combination: T }
  >;
}

describe("tower access", () => {
  it("keeps a tower unavailable when a required element is missing", () => {
    const tower =
      towerOfCombination("Dual");

    const allocation =
      allocationForTower(tower, 1);

    allocation[tower.recipe[0]] = 0;

    expect(
      maxReachableTowerLevel(
        tower,
        allocation,
      ),
    ).toBe(0);

    expect(
      isTowerAvailable(
        tower,
        allocation,
      ),
    ).toBe(false);
  });

  it("derives Dual level from the shallowest recipe element", () => {
    const tower =
      towerOfCombination("Dual");

    const allocation =
      emptyAllocation();

    allocation[tower.recipe[0]] = 3;
    allocation[tower.recipe[1]] = 2;

    expect(
      maxReachableTowerLevel(
        tower,
        allocation,
      ),
    ).toBe(2);
  });

  it("allows a Dual tower to reach level 3 at 3-3", () => {
    const tower =
      towerOfCombination("Dual");

    expect(
      maxReachableTowerLevel(
        tower,
        allocationForTower(tower, 3),
      ),
    ).toBe(3);
  });

  it("derives Trio level from the shallowest recipe element", () => {
    const tower =
      towerOfCombination("Trio");

    const allocation =
      emptyAllocation();

    allocation[tower.recipe[0]] = 2;
    allocation[tower.recipe[1]] = 2;
    allocation[tower.recipe[2]] = 1;

    expect(
      maxReachableTowerLevel(
        tower,
        allocation,
      ),
    ).toBe(1);

    allocation[tower.recipe[2]] = 2;

    expect(
      maxReachableTowerLevel(
        tower,
        allocation,
      ),
    ).toBe(2);
  });

  it("caps Quad towers at level 1", () => {
    const tower =
      towerOfCombination("Quad");

    expect(
      maxReachableTowerLevel(
        tower,
        allocationForTower(tower, 3),
      ),
    ).toBe(1);
  });

  it("returns level-aware available tower entries", () => {
    const tower =
      towerOfCombination("Dual");

    const allocation =
      allocationForTower(tower, 2);

    const available =
      availableTowers(allocation);

    const entry = available.find(
      ({ tower: candidate }) =>
        candidate.id === tower.id,
    );

    expect(entry).toBeDefined();
    expect(entry?.maxLevel).toBe(2);
  });
});