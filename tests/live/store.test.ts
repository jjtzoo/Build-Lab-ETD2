import { beforeEach, describe, expect, it } from "vitest";

import { useLiveGame } from "@/components/live/store";

/**
 * Placement invariants in the live store.
 *
 * A placement is a claim about a physical cell, so it has to stay in step
 * with the field log that owns the tower standing there. Every one of
 * these was a real inconsistency: a cell drawing a tower the player no
 * longer had, or a copy offered for placement twice because its row had
 * moved out from under the placement.
 */
const store = useLiveGame;

/**
 * Haste is a Water/Fire/Earth Trio, so two keystones in each is the
 * smallest allocation that both makes it loggable and lets it reach
 * level II — `addBuilt` refuses anything the current picks can't reach,
 * and `setBuiltLevel` clamps to the same ceiling.
 */
function reset() {
  store.getState().newGame();
  const spend = store.getState().spendPick;
  for (const element of ["Water", "Fire", "Earth"] as const) {
    spend(element);
    spend(element);
  }
}

/** Put a tower on the field and stand one copy on a cell. */
function fieldAndPlace(towerId: string, level: number, quantity = 1) {
  const s = store.getState();
  s.addBuilt(towerId, level);
  store.getState().setBuiltQuantity(towerId, level, quantity);
  store.getState().placeTower("forest", towerId, level, 3, 3);
}

describe("live store — placements track the field log", () => {
  beforeEach(reset);

  it("carries a placement across a level change", () => {
    // Levelling is an upgrade in place: the building does not move, so
    // its placement must follow it to the new level or the map keeps
    // drawing the old one and offers the copy for placement again.
    fieldAndPlace("haste", 1);
    store.getState().setBuiltLevel("haste", 1, 2);

    const { built, placements } = store.getState();
    expect(built).toEqual([{ towerId: "haste", level: 2, quantity: 1 }]);
    expect(placements).toEqual([
      { mapId: "forest", towerId: "haste", level: 2, col: 3, row: 3 },
    ]);
  });

  it("carries a placement when levelling merges into an existing row", () => {
    const s = store.getState();
    s.addBuilt("haste", 1);
    s.addBuilt("haste", 1);
    s.setBuiltQuantity("haste", 1, 2);
    s.placeTower("forest", "haste", 1, 3, 3);
    // A second row already at the target level — the rows fold together,
    // and the placement still has to end up at that level.
    s.addBuilt("haste", 2);
    s.setBuiltLevel("haste", 1, 2);

    const state = store.getState();
    expect(state.placements[0].level).toBe(2);
    expect(
      state.built.filter((row) => row.towerId === "haste"),
    ).toHaveLength(1);
  });

  it("carries a placement across an evolution", () => {
    // Same cell, different tower — the slot was bought for whatever ends
    // up standing in it. Vapor is the Water/Fire Dual, so this allocation
    // can genuinely grow it into the Water/Fire/Earth Trio; a Quad target
    // would be refused for want of a fourth element, which is correct and
    // would prove nothing about placements.
    fieldAndPlace("vapor", 1);
    store.getState().evolveBuilt("vapor", 1, "haste");

    const { built, placements } = store.getState();
    expect(built.map((row) => row.towerId)).toEqual(["haste"]);
    expect(placements).toHaveLength(1);
    expect(placements[0].towerId).toBe("haste");
    expect(placements[0].col).toBe(3);
    expect(placements[0].row).toBe(3);
  });

  it("drops placements for copies removed from the field", () => {
    fieldAndPlace("haste", 1, 2);
    store.getState().placeTower("forest", "haste", 1, 5, 5);
    expect(store.getState().placements).toHaveLength(2);

    // Down to one copy: only one of the two cells can still be occupied.
    store.getState().setBuiltQuantity("haste", 1, 1);
    expect(store.getState().placements).toHaveLength(1);

    store.getState().removeBuilt("haste", 1);
    expect(store.getState().placements).toHaveLength(0);
  });

  it("refuses to stand two towers on one cell", () => {
    fieldAndPlace("haste", 1, 2);
    store.getState().placeTower("forest", "haste", 1, 3, 3);
    expect(store.getState().placements).toHaveLength(1);
  });

  it("never stands more copies than the field holds", () => {
    fieldAndPlace("haste", 1, 1);
    store.getState().placeTower("forest", "haste", 1, 9, 9);
    expect(store.getState().placements).toHaveLength(1);
  });

  it("keeps placements per map", () => {
    fieldAndPlace("haste", 1, 2);
    store.getState().placeTower("lava", "haste", 1, 3, 3);
    const { placements } = store.getState();
    expect(placements.map((p) => p.mapId).sort()).toEqual(["forest", "lava"]);
    // Lifting on one map leaves the other alone.
    store.getState().unplaceTower("forest", 3, 3);
    expect(store.getState().placements).toEqual([
      { mapId: "lava", towerId: "haste", level: 1, col: 3, row: 3 },
    ]);
  });
});
