import { describe, expect, it } from "vitest";

import {
  ANCHOR_ASSUMED_LEVEL,
  getAnchorAssumedAllocation,
  isCuratedAnchor,
} from "@/lib/domain/anchorPolicy";

import {
  ELEMENTS,
} from "@/lib/domain/elements";

import {
  getTower,
} from "@/lib/domain/towerCatalog";

describe("anchor policy", () => {
  it("recognizes curated anchors", () => {
    expect(
      isCuratedAnchor("atom"),
    ).toBe(true);

    expect(
      isCuratedAnchor("laser"),
    ).toBe(true);
  });

  it("rejects a non-curated tower as an anchor", () => {
    expect(
      isCuratedAnchor("rage"),
    ).toBe(false);

    expect(() =>
      getAnchorAssumedAllocation("rage"),
    ).toThrow(
      "Tower is not a curated Build Lab anchor: rage",
    );
  });

  it("builds a Dual anchor from an assumed 3-3 core", () => {
    const tower = getTower("atom");

    expect(
      tower.combination,
    ).toBe("Dual");

    const allocation =
      getAnchorAssumedAllocation(
        tower.id,
      );

    for (const element of tower.recipe) {
      expect(
        allocation[element],
      ).toBe(
        ANCHOR_ASSUMED_LEVEL.Dual,
      );
    }

    for (const element of ELEMENTS) {
      if (!tower.recipe.includes(element)) {
        expect(
          allocation[element],
        ).toBe(0);
      }
    }
  });

  it("builds a Trio anchor from an assumed 2-2-2 core", () => {
    const tower = getTower("laser");

    expect(
      tower.combination,
    ).toBe("Trio");

    const allocation =
      getAnchorAssumedAllocation(
        tower.id,
      );

    for (const element of tower.recipe) {
      expect(
        allocation[element],
      ).toBe(
        ANCHOR_ASSUMED_LEVEL.Trio,
      );
    }

    for (const element of ELEMENTS) {
      if (!tower.recipe.includes(element)) {
        expect(
          allocation[element],
        ).toBe(0);
      }
    }
  });

  it("uses exactly six starting keystones for both supported anchor classes", () => {
    const dual =
      getAnchorAssumedAllocation(
        "atom",
      );

    const trio =
      getAnchorAssumedAllocation(
        "laser",
      );

    const dualTotal =
      ELEMENTS.reduce(
        (sum, element) =>
          sum + dual[element],
        0,
      );

    const trioTotal =
      ELEMENTS.reduce(
        (sum, element) =>
          sum + trio[element],
        0,
      );

    expect(dualTotal).toBe(6);
    expect(trioTotal).toBe(6);
  });
});