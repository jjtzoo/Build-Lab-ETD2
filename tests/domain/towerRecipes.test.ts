import { describe, expect, it } from "vitest";

import { ELEMENTS, type ElementName } from "@/lib/domain/elements";
import { TOWERS, getTower } from "@/lib/domain/towerCatalog";

/**
 * Recipe lock.
 *
 * Every Quad recipe below was transcribed from the running game by the
 * user on 2026-09-11, after the catalog was found to have seven of them
 * rotated in a cycle (Tesla Tree was carrying Rage's recipe, and so on).
 * A real match confirmed the correction: at Light 3 / Fire 2 / Nature 3 /
 * Earth 3 the player fielded Rage, which is only reachable if Rage is
 * Light+Fire+Nature+Earth.
 *
 * These are game facts, not engine tuning — nothing may quietly change
 * them. If a test here fails, the data regressed, not the test.
 */
const QUAD_RECIPES: Record<string, readonly ElementName[]> = {
  railgun: ["Light", "Water", "Fire", "Earth"],
  singularity: ["Light", "Darkness", "Water", "Fire"],
  plague: ["Darkness", "Water", "Nature", "Earth"],
  doom: ["Darkness", "Fire", "Nature", "Earth"],
  "phantom-zone": ["Darkness", "Water", "Earth", "Light"],
  tsunami: ["Water", "Fire", "Nature", "Earth"],
  "crystal-spire": ["Water", "Fire", "Earth", "Darkness"],
  obelisk: ["Fire", "Nature", "Light", "Water"],
  rage: ["Fire", "Nature", "Earth", "Light"],
  archdruid: ["Nature", "Darkness", "Water", "Fire"],
  "tesla-tree": ["Nature", "Light", "Darkness", "Water"],
  "life-altar": ["Nature", "Light", "Darkness", "Fire"],
  shredder: ["Earth", "Light", "Darkness", "Fire"],
  nuclear: ["Earth", "Light", "Darkness", "Nature"],
  "gravity-cannon": ["Earth", "Light", "Water", "Nature"],
};

/** Order-insensitive recipe key. */
function key(recipe: readonly string[]): string {
  return [...recipe].sort().join("+");
}

/** Every k-sized subset of the six elements. */
function subsets(k: number): string[] {
  const out: string[] = [];
  const walk = (start: number, picked: ElementName[]) => {
    if (picked.length === k) {
      out.push(key(picked));
      return;
    }
    for (let i = start; i < ELEMENTS.length; i += 1) {
      walk(i + 1, [...picked, ELEMENTS[i]]);
    }
  };
  walk(0, []);
  return out;
}

describe("Quad recipes", () => {
  it.each(Object.entries(QUAD_RECIPES))(
    "%s matches the recipe the game shows",
    (towerId, recipe) => {
      expect(key(getTower(towerId).recipe)).toBe(key(recipe));
    },
  );

  it("covers all fifteen four-element combinations exactly once", () => {
    const quads = TOWERS.filter(
      (tower) => tower.combination === "Quad",
    );
    expect(quads).toHaveLength(15);
    expect(new Set(quads.map((tower) => key(tower.recipe))).size).toBe(15);
    expect([...new Set(quads.map((tower) => key(tower.recipe)))].sort())
      .toEqual(subsets(4).sort());
  });

  it("reaches Rage — but not Tesla Tree — on Light/Fire/Nature/Earth", () => {
    // The exact allocation from the confirming match.
    const held = new Set(["Light", "Fire", "Nature", "Earth"]);
    const reachable = (towerId: string) =>
      getTower(towerId).recipe.every((element) => held.has(element));

    expect(reachable("rage")).toBe(true);
    expect(reachable("tesla-tree")).toBe(false);
  });
});

describe("catalog recipe integrity", () => {
  it.each([
    ["Dual", 2, 15],
    ["Trio", 3, 20],
    ["Quad", 4, 15],
  ] as const)(
    "%s towers cover every %i-element combination",
    (combination, size, count) => {
      const group = TOWERS.filter(
        (tower) => tower.combination === combination,
      );
      expect(group).toHaveLength(count);
      expect(
        group.every((tower) => tower.recipe.length === size),
      ).toBe(true);
      expect([...new Set(group.map((tower) => key(tower.recipe)))].sort())
        .toEqual(subsets(size).sort());
    },
  );

  it("gives every tower a damage element drawn from its own recipe", () => {
    for (const tower of TOWERS) {
      expect(
        tower.recipe,
        `${tower.id} deals ${tower.damageElement} damage`,
      ).toContain(tower.damageElement);
    }
  });
});
