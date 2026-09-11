import { describe, expect, it } from "vitest";

import { TOWERS, getTower } from "@/lib/domain/towerCatalog";
import {
  canEvolveInto,
  evolutionCost,
  evolutionSources,
  evolutionTargets,
  fieldedCost,
  towerElements,
} from "@/lib/domain/towerEvolution";

/**
 * Evolution lock.
 *
 * The expectations below were read off the in-game Tower Table by the
 * user (2026-09-12): selecting Vapor highlights exactly four Trios and
 * six Quads, and selecting Haste exactly three Quads. These are game
 * facts, not engine tuning — if one fails, the derivation or the recipe
 * data regressed, not the test.
 */
const names = (steps: { towerId: string }[]) =>
  steps.map((step) => getTower(step.towerId).name).sort();

describe("evolutionTargets — against the in-game Tower Table", () => {
  it("offers Vapor exactly the four Trios holding Water+Fire", () => {
    const trios = evolutionTargets("vapor", 2).filter(
      (step) => getTower(step.towerId).combination === "Trio",
    );
    expect(names(trios)).toEqual([
      "Corrosion",
      "Haste",
      "Impulse",
      "Windstorm",
    ]);
  });

  it("offers Vapor exactly the six Quads holding Water+Fire", () => {
    const quads = evolutionTargets("vapor", 1).filter(
      (step) => getTower(step.towerId).combination === "Quad",
    );
    expect(names(quads)).toEqual([
      "Archdruid",
      "Crystal Spire",
      "Obelisk",
      "Railgun",
      "Singularity",
      "Tsunami",
    ]);
  });

  it("offers Haste exactly the three Quads holding all of its elements", () => {
    const quads = evolutionTargets("haste", 1);
    expect(names(quads)).toEqual([
      "Crystal Spire",
      "Railgun",
      "Tsunami",
    ]);
  });
});

describe("the level ceiling", () => {
  it("lets a Dual II become a Trio II but stops a Dual III", () => {
    expect(canEvolveInto("vapor", "haste", 2)).toBe(true);
    // Trio maxes at II, so a Dual that already outgrew it has nowhere
    // to go — the case the user called out explicitly.
    expect(canEvolveInto("vapor", "haste", 3)).toBe(false);
  });

  it("lets a Trio I become a Quad but stops a Trio II", () => {
    expect(canEvolveInto("haste", "railgun", 1)).toBe(true);
    expect(canEvolveInto("haste", "railgun", 2)).toBe(false);
  });

  it("lets a mono at any normal level become a Dual", () => {
    for (const level of [1, 2, 3]) {
      expect(canEvolveInto("mono-water", "vapor", level)).toBe(true);
    }
    // Level 4 is Pure Essence, past every Dual's ceiling.
    expect(canEvolveInto("mono-water", "vapor", 4)).toBe(false);
  });

  it("carries the level across rather than resetting it", () => {
    for (const step of evolutionTargets("vapor", 2)) {
      expect(step.level).toBe(2);
    }
  });
});

describe("structure holds across the whole catalog", () => {
  it("gives every Dual exactly 4 Trios and 6 Quads downstream", () => {
    for (const tower of TOWERS.filter((t) => t.combination === "Dual")) {
      const trios = evolutionTargets(tower.id, 1).filter(
        (step) => getTower(step.towerId).combination === "Trio",
      );
      const quads = evolutionTargets(tower.id, 1).filter(
        (step) => getTower(step.towerId).combination === "Quad",
      );
      expect({ id: tower.id, trios: trios.length, quads: quads.length })
        .toEqual({ id: tower.id, trios: 4, quads: 6 });
    }
  });

  it("gives every Trio exactly 3 Quads downstream", () => {
    for (const tower of TOWERS.filter((t) => t.combination === "Trio")) {
      const quads = evolutionTargets(tower.id, 1);
      expect({ id: tower.id, quads: quads.length }).toEqual({
        id: tower.id,
        quads: 3,
      });
    }
  });

  it("never offers a target that drops or repeats an element", () => {
    for (const tower of TOWERS) {
      const from = towerElements(tower.id);
      for (const step of evolutionTargets(tower.id, 1)) {
        const to = towerElements(step.towerId);
        expect(to.length).toBeGreaterThan(from.length);
        for (const element of from) expect(to).toContain(element);
      }
    }
  });

  it("is symmetric: every target lists its source in reverse", () => {
    for (const tower of TOWERS.filter((t) => t.combination === "Dual")) {
      for (const step of evolutionTargets(tower.id, 1)) {
        const sources = evolutionSources(step.towerId, 1).map(
          (s) => s.towerId,
        );
        expect(sources).toContain(tower.id);
      }
    }
  });
});

describe("Arrow and Cannon — the root of the tree", () => {
  it("grows a starter into any of the six monos", () => {
    for (const starter of ["arrow", "cannon"]) {
      const targets = evolutionTargets(starter, 1);
      expect(targets).toHaveLength(6);
      expect(targets.map((t) => t.towerId).sort()).toEqual([
        "mono-darkness",
        "mono-earth",
        "mono-fire",
        "mono-light",
        "mono-nature",
        "mono-water",
      ]);
    }
  });

  it("never lets a starter skip straight to an elemental combination", () => {
    // With no elements of its own a starter would read as a subset of
    // every recipe, so it has to be handled apart from that rule.
    const ids = evolutionTargets("arrow", 1).map((t) => t.towerId);
    expect(ids).not.toContain("vapor");
    expect(ids).not.toContain("haste");
  });

  it("lists the starters as what a Level 1 mono came from", () => {
    const sources = evolutionSources("mono-water", 1).map(
      (s) => s.towerId,
    );
    expect(sources).toEqual(["arrow", "cannon"]);
    // A mono past Level 1 outgrew the 75g seed.
    expect(evolutionSources("mono-water", 2)).toEqual([]);
  });

  it("costs 100 to turn a 75g starter into a Level 1 mono", () => {
    expect(fieldedCost("arrow", 1)).toBe(75);
    expect(
      evolutionCost(
        { towerId: "arrow", level: 1 },
        { towerId: "mono-water", level: 1 },
      ),
    ).toBe(100);
  });
});

describe("evolution cost — the route doesn't change the total", () => {
  it("charges only the difference", () => {
    // Dual II is 1,300 sunk; Trio II costs 5,000 all-in.
    expect(
      evolutionCost(
        { towerId: "vapor", level: 2 },
        { towerId: "haste", level: 2 },
      ),
    ).toBe(3700);
  });

  it("reaches a Trio II for 5,000 whichever way round", () => {
    const direct = fieldedCost("haste", 2);

    // mono I -> Dual I -> Dual II -> Trio II, paying the gap each time.
    const stepped =
      fieldedCost("mono-water", 1) +
      evolutionCost(
        { towerId: "mono-water", level: 1 },
        { towerId: "vapor", level: 1 },
      ) +
      (fieldedCost("vapor", 2) - fieldedCost("vapor", 1)) +
      evolutionCost(
        { towerId: "vapor", level: 2 },
        { towerId: "haste", level: 2 },
      );

    expect(stepped).toBe(direct);
    expect(direct).toBe(5000);
    // ...and the first tower goes up for a fraction of the anchor.
    expect(fieldedCost("mono-water", 1)).toBe(175);
  });
});

describe("evolutionSources — the cheap route in", () => {
  it("lists the monos and Duals that can grow into a Trio", () => {
    const sources = evolutionSources("haste", 1);
    const ids = sources.map((s) => s.towerId);
    // Water+Fire+Earth: its three monos, and the three Duals pairing them.
    expect(ids).toContain("mono-water");
    expect(ids).toContain("mono-fire");
    expect(ids).toContain("mono-earth");
    expect(ids).toContain("vapor");
    expect(ids).not.toContain("mono-light");
  });
});
