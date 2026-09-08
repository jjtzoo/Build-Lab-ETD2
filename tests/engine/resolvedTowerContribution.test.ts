import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveTowerContribution,
} from "@/lib/engine/resolvedTowerContribution";

describe(
  "resolved tower contribution",
  () => {
    it.each([
      ["runic", 1, 925],
      ["runic", 2, 3_700],
      ["well", 1, 450],
      ["well", 3, 7_200],
      ["geyser", 1, 1_100],
      ["geyser", 3, 17_600],
    ])(
      "resolves %s level %i from canonical per-level facts",
      (towerId, level, damage) => {
        const resolved =
          resolveTowerContribution(
            towerId,
            level,
          );

        expect(
          resolved.reachableLevel,
        ).toBe(level);

        expect(
          resolved
            .factualStatsAtLevel
            .damage,
        ).toBe(damage);
      },
    );

    it("derives transparent base DPS without claiming ability damage", () => {
      const resolved =
        resolveTowerContribution(
          "runic",
          2,
        );

      expect(
        resolved
          .factualStatsAtLevel
          .baseDps,
      ).toBe(
        resolved
          .factualStatsAtLevel
          .damage *
          resolved
            .factualStatsAtLevel
            .attackSpeed,
      );
    });

    it.each([
      ["ice", 3, 11_200, 1_000],
      ["howitzer", 3, 2_800, 1_750],
      ["astral", 2, 9_200, 1_500],
      ["jinx", 2, 2_200, 1_000],
      ["incantation", 2, 1_140, 1_000],
      ["corrosion", 2, 360, 1_000],
      ["root", 2, 200, 1_000],
      ["phantom-zone", 1, 14_000, 1_000],
      ["nuclear", 1, 8_000, 875],
      ["life-altar", 1, 8_000, 1_000],
      ["plague", 1, 800, 875],
      ["shredder", 1, 10_000, 1_000],
    ])(
      "uses latest-live %s level %i damage and range",
      (
        towerId,
        level,
        damage,
        range,
      ) => {
        const resolved =
          resolveTowerContribution(
            towerId,
            level,
          );

        expect(
          resolved
            .factualStatsAtLevel
            .damage,
        ).toBe(damage);

        expect(
          resolved
            .factualStatsAtLevel
            .range,
        ).toBe(range);
      },
    );

    it("treats Quad level 1 as its canonical normal maximum", () => {
      const resolved =
        resolveTowerContribution(
          "phantom-zone",
          1,
        );

      expect(
        resolved.reachableLevel,
      ).toBe(1);

      expect(
        resolved.maxNormalLevel,
      ).toBe(1);
    });

    it("rejects levels outside the canonical class maximum", () => {
      expect(() =>
        resolveTowerContribution(
          "phantom-zone",
          2,
        ),
      ).toThrow(
        /expected 1-1/,
      );
    });
  },
);
