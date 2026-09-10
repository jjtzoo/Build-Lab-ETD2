import { describe, expect, it } from "vitest";

import { getTower } from "@/lib/domain/towerCatalog";
import {
  deriveAllocation,
  fitsBudget,
  maxFittingLevel,
  mergeAllocation,
  keystoneCost,
  emptyAllocation,
} from "@/lib/engine/customBuild";
import { totalKeystones } from "@/lib/engine/allocation";

describe("deriveAllocation", () => {
  it("takes the element-wise max level across placed towers", () => {
    // ice = Light/Water dual; nova = Light/Fire/Nature trio
    const allocation = deriveAllocation([
      { towerId: "ice", level: 3 },
      { towerId: "nova", level: 2 },
    ]);
    expect(allocation).toEqual({
      Light: 3,
      Water: 3,
      Fire: 2,
      Nature: 2,
      Darkness: 0,
      Earth: 0,
    });
    expect(totalKeystones(allocation)).toBe(10);
  });

  it("charges nothing for an element already held deeper", () => {
    const base = deriveAllocation([{ towerId: "ice", level: 3 }]);
    // windstorm = Light/Water/Fire trio: Light+Water already at 3
    const withWindstorm = deriveAllocation([
      { towerId: "ice", level: 3 },
      { towerId: "windstorm", level: 2 },
    ]);
    expect(totalKeystones(withWindstorm) - totalKeystones(base)).toBe(2);
  });
});

describe("fitsBudget", () => {
  it("rejects an allocation over 11 keystones", () => {
    expect(
      fitsBudget({
        Light: 3,
        Darkness: 3,
        Water: 3,
        Fire: 3,
        Nature: 0,
        Earth: 0,
      }),
    ).toBe(false);
  });

  it("accepts an allocation at exactly 11 keystones", () => {
    expect(
      fitsBudget({
        Light: 3,
        Darkness: 3,
        Water: 3,
        Fire: 2,
        Nature: 0,
        Earth: 0,
      }),
    ).toBe(true);
  });
});

describe("maxFittingLevel", () => {
  it("caps at the tower's own maxLevel when budget is free", () => {
    const ice = getTower("ice");
    expect(maxFittingLevel(ice, emptyAllocation())).toBe(3);
  });

  it("returns the deepest level that still fits the remaining budget", () => {
    // ice L3 = 6 keystones. root = Darkness/Nature/Earth trio (no overlap):
    // L2 would add 6 -> 12 (over), L1 adds 3 -> 9 (fits).
    const base = deriveAllocation([{ towerId: "ice", level: 3 }]);
    expect(maxFittingLevel(getTower("root"), base)).toBe(1);
  });

  it("returns 0 when a tower cannot be added at all", () => {
    // 11 keystones spent on three elements; a tower needing a fourth new
    // element cannot be fielded.
    const base = mergeAllocation(
      mergeAllocation(emptyAllocation(), ["Light", "Water"], 3),
      ["Fire"],
      3,
    ); // Light3 Water3 Fire3 wait that's 9
    const full = mergeAllocation(base, ["Nature"], 2); // 11
    expect(maxFittingLevel(getTower("muck"), full)).toBe(0);
  });
});

describe("keystoneCost", () => {
  it("charges only the elements not already held deep enough", () => {
    const base = deriveAllocation([{ towerId: "ice", level: 3 }]);
    // lightning = Light/Fire dual. Light 3 already held; Fire 0 -> 2.
    expect(keystoneCost(getTower("lightning"), base, 2)).toBe(2);
  });

  it("is zero for a tower whose recipe is fully covered", () => {
    const base = deriveAllocation([
      { towerId: "ice", level: 3 },
      { towerId: "lightning", level: 3 },
    ]); // Light3 Water3 Fire3
    // solar = Fire/Nature... not covered. Use a Light/Fire need instead:
    expect(keystoneCost(getTower("lightning"), base, 2)).toBe(0);
  });
});
