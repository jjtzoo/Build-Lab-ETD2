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

describe("copy-specific planned forms", () => {
  beforeEach(reset);
  it("raises only the selected copy's reached target and preserves it after reload", () => {
    fieldAndPlace("haste", 1, 2);
    store.getState().setFinalForm("forest:3,3", { towerId: "haste", level: 1 });
    store
      .getState()
      .placeTower("forest", "haste", 1, 4, 3, { towerId: "haste", level: 1 });
    store.getState().setBuiltLevel("haste", 1, 2, "forest:4,3");
    const saved = store.getState();
    store.getState().newGame();
    store.getState().hydrate(saved);
    expect(
      store.getState().placements.map((p) => [p.level, p.finalForm?.level]),
    ).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });
  it("keeps planned copies through reload and refuses double confirmation or an unaffordable purchase", () => {
    store
      .getState()
      .reserveCopy(
        { towerId: "cannon", level: 1 },
        { towerId: "haste", level: 2 },
      );
    const saved = store.getState();
    const id = saved.plannedCopies[0].id;
    expect(saved.built).toEqual([]);
    store.getState().newGame();
    store.getState().hydrate(saved);
    store.getState().placePlannedCopy(id, "forest", 3, 3);
    store.getState().placePlannedCopy(id, "forest", 4, 3);
    expect(store.getState().placements).toHaveLength(1);
    expect(store.getState().built).toEqual([
      { towerId: "cannon", level: 1, quantity: 1 },
    ]);
    reset();
    store.getState().addBuilt("haste", 2);
    store
      .getState()
      .reserveCopy(
        { towerId: "haste", level: 2 },
        { towerId: "haste", level: 2 },
      );
    store
      .getState()
      .placePlannedCopy(store.getState().plannedCopies[0].id, "forest", 3, 3);
    expect(store.getState().built).toEqual([
      { towerId: "haste", level: 2, quantity: 1 },
    ]);
    expect(store.getState().plannedCopies).toHaveLength(1);
    store.getState().cancelCopy(store.getState().plannedCopies[0].id);
    expect(store.getState().plannedCopies).toEqual([]);
  });
  it("locks only the selected copy and retains its path through evolution, undo, reload and move", () => {
    store.getState().addBuilt("vapor", 1);
    store.getState().addBuilt("vapor", 1);
    const finalForm = { towerId: "haste", level: 2 };
    store.getState().placeTower("forest", "vapor", 1, 3, 3, finalForm);
    store.getState().placeTower("forest", "vapor", 1, 4, 3);
    store.getState().setBuiltLevel("vapor", 1, 3, "forest:3,3");
    expect(store.getState().built[0].quantity).toBe(2);
    store.getState().evolveBuilt("vapor", 1, "haste", "forest:3,3");
    expect(store.getState().placements[0]).toMatchObject({
      towerId: "haste",
      finalForm,
    });
    expect(store.getState().placements[1].towerId).toBe("vapor");
    store.getState().undoEvolution();
    expect(store.getState().placements[0]).toMatchObject({
      towerId: "vapor",
      finalForm,
    });
    store.getState().hydrate(store.getState());
    expect(store.getState().placements[0].finalForm).toEqual(finalForm);
    store.getState().movePlacement("forest:3,3", 5, 5);
    expect(store.getState().placements[0]).toMatchObject({
      col: 5,
      row: 5,
      finalForm,
    });
    store.getState().clearFinalForm("forest:5,5");
    expect(store.getState().placements[0].finalForm).toBeUndefined();
  });
  it("rejects an unrelated destination without consuming a copy", () => {
    store.getState().addBuilt("vapor", 1);
    store
      .getState()
      .placeTower("forest", "vapor", 1, 1, 1, { towerId: "doom", level: 1 });
    expect(store.getState().placements).toEqual([]);
  });
});

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

  it("upgrades an unplaced copy and merges just that copy into the target row", () => {
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
    expect(state.placements[0].level).toBe(1);
    expect(state.built).toEqual([
      { towerId: "haste", level: 1, quantity: 1 },
      { towerId: "haste", level: 2, quantity: 2 },
    ]);
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

  it("arms each duplicate without adding a placement or hiding lower-level rows", () => {
    fieldAndPlace("haste", 2);
    store.getState().addBuilt("haste", 1);
    const cue = store.getState().placementCue;
    store.getState().addBuilt("haste", 1);
    expect(store.getState().placementCue).toEqual({
      towerId: "haste",
      level: 1,
    });
    expect(store.getState().placementCue).not.toBe(cue);
    expect(store.getState().built.find((r) => r.level === 1)?.quantity).toBe(2);
    expect(store.getState().placements).toHaveLength(1);
    store.getState().placeTower("forest", "haste", 1, 5, 5);
    store.getState().placeTower("forest", "haste", 1, 6, 6);
    expect(store.getState().placements).toHaveLength(3);
  });

  it("changes only one placement when every copy is placed", () => {
    fieldAndPlace("haste", 1, 2);
    store.getState().placeTower("forest", "haste", 1, 5, 5);
    store.getState().setBuiltLevel("haste", 1, 2);
    expect(store.getState().placements.map((p) => p.level)).toEqual([2, 1]);
    expect(store.getState().built.map((r) => r.quantity)).toEqual([1, 1]);
  });

  it("undoes multiple evolutions, restoring row counts and cells without undoing picks", () => {
    fieldAndPlace("mono-water", 1, 2);
    const before = store.getState();
    store.getState().evolveBuilt("mono-water", 1, "vapor");
    expect(store.getState().placements[0].towerId).toBe("mono-water");
    store.getState().evolveBuilt("vapor", 1, "haste");
    store.getState().spendPick("Light");
    expect(store.getState().evolutionHistory).toHaveLength(2);
    store.getState().undoEvolution();
    expect(store.getState().built.some((r) => r.towerId === "vapor")).toBe(
      true,
    );
    store.getState().undoEvolution();
    expect(store.getState().built).toEqual(before.built);
    expect(store.getState().placements).toEqual(before.placements);
    expect(store.getState().allocation.Light).toBe(1);
  });

  it("invalidates evolution snapshots after field or map edits and hydration", () => {
    fieldAndPlace("vapor", 1);
    store.getState().evolveBuilt("vapor", 1, "haste");
    store.getState().setBuiltLevel("haste", 1, 2);
    store.getState().undoEvolution();
    expect(store.getState().built).toEqual([
      { towerId: "haste", level: 2, quantity: 1 },
    ]);
    store.getState().addBuilt("vapor", 1);
    store.getState().evolveBuilt("vapor", 1, "haste");
    store.getState().hydrate(store.getState());
    expect(store.getState().evolutionHistory).toEqual([]);
    expect(store.getState().placementCue).toBeNull();
  });

  it("refuses upgrades and evolutions above current element depth", () => {
    store.getState().newGame();
    for (const el of ["Water", "Fire", "Earth"] as const)
      store.getState().spendPick(el);
    store.getState().addBuilt("vapor", 1);
    store.getState().setBuiltLevel("vapor", 1, 2);
    expect(store.getState().built[0].level).toBe(1);
    store
      .getState()
      .hydrate({ built: [{ towerId: "vapor", level: 2, quantity: 1 }] });
    store.getState().evolveBuilt("vapor", 2, "haste");
    expect(store.getState().built[0].towerId).toBe("vapor");
  });

  it("enforces Essence timing and budget through add and quantity controls", () => {
    store.getState().spendPick("Water");
    store.getState().addBuilt("pure-water");
    expect(store.getState().built).toEqual([]);
    for (let i = 0; i < 4; i++) store.getState().hold();
    store.getState().addBuilt("pure-water");
    store.getState().setBuiltQuantity("pure-water", 1, 3);
    expect(store.getState().built[0].quantity).toBe(1);
    store.getState().setBuiltQuantity("pure-water", 1, 2);
    store.getState().addBuilt("pure-water");
    expect(store.getState().built[0].quantity).toBe(2);
    store.getState().removeBuilt("pure-water", 1);
    store.getState().addBuilt("pure-water");
    expect(store.getState().built[0].quantity).toBe(1);
  });
});
