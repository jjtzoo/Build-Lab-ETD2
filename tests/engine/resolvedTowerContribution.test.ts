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
      ["runic", 1, 1_150],
      ["runic", 2, 4_600],
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
