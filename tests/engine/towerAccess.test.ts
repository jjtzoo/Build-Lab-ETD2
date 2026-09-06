import { describe, expect, it } from "vitest";

import { ELEMENTS, TOWERS } from "@/lib/data";
import type {
  Allocation,
  ElementName,
  Tower,
} from "@/lib/types";

import {
  availableTowers,
  isTowerAvailable,
  maxReachableTowerLevel,
} from "@/lib/engine/allocation";

function emptyAllocation(): Allocation {
  return [0, 0, 0, 0, 0, 0];
}

function allocationWith(
  values: Partial<Record<ElementName, number>>,
): Allocation {
  const allocation = emptyAllocation();

  for (const [element, level] of Object.entries(values)) {
    const index = ELEMENTS.indexOf(
      element as ElementName,
    );

    allocation[index] = level ?? 0;
  }

  return allocation;
}

function allocationForTower(
  tower: Tower,
  level: number,
): Allocation {
  const allocation = emptyAllocation();

  for (const element of tower.recipe) {
    allocation[ELEMENTS.indexOf(element)] = level;
  }

  return allocation;
}

function towerOfType(
  type: Tower["type"],
): Tower {
  const tower = TOWERS.find(
    (candidate) => candidate.type === type,
  );

  if (!tower) {
    throw new Error(
      `Expected at least one ${type} tower in canonical data.`,
    );
  }

  return tower;
}

describe("tower access", () => {
  it("keeps a tower unavailable when a required element is missing", () => {
    const tower = towerOfType("Dual");

    const allocation = allocationForTower(
      tower,
      1,
    );

    const missingElement = tower.recipe[0];

    allocation[
      ELEMENTS.indexOf(missingElement)
    ] = 0;

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
    const tower = towerOfType("Dual");

    const [first, second] = tower.recipe;

    const allocation = allocationWith({
      [first]: 3,
      [second]: 2,
    });

    expect(
      maxReachableTowerLevel(
        tower,
        allocation,
      ),
    ).toBe(2);
  });

  it("allows a Dual tower to reach level 3 at 3-3", () => {
    const tower = towerOfType("Dual");

    expect(
      maxReachableTowerLevel(
        tower,
        allocationForTower(tower, 3),
      ),
    ).toBe(3);
  });

  it("derives Trio level from the shallowest of its three elements", () => {
    const tower = towerOfType("Trio");

    const [
      first,
      second,
      third,
    ] = tower.recipe;

    const levelOneAllocation =
      allocationWith({
        [first]: 2,
        [second]: 2,
        [third]: 1,
      });

    expect(
      maxReachableTowerLevel(
        tower,
        levelOneAllocation,
      ),
    ).toBe(1);

    const levelTwoAllocation =
      allocationWith({
        [first]: 2,
        [second]: 2,
        [third]: 2,
      });

    expect(
      maxReachableTowerLevel(
        tower,
        levelTwoAllocation,
      ),
    ).toBe(2);
  });

  it("caps Quad towers at level 1", () => {
    const tower = towerOfType("Quad");

    expect(
      maxReachableTowerLevel(
        tower,
        allocationForTower(tower, 3),
      ),
    ).toBe(1);
  });

  it("returns level-aware available tower entries", () => {
    const tower = towerOfType("Dual");

    const allocation =
      allocationForTower(tower, 2);

    const available =
      availableTowers(allocation);

    const entry = available.find(
      ({ tower: candidate }) =>
        candidate.name === tower.name,
    );

    expect(entry).toBeDefined();
    expect(entry?.maxLevel).toBe(2);
  });
});