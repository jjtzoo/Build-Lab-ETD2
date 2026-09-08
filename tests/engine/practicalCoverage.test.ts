import {
  describe,
  expect,
  it,
} from "vitest";

import {
  ELEMENT_MATCHUPS,
} from "@/lib/domain/elementMatchupCatalog";

import {
  evaluateSelectedPackageEvidence,
} from "@/lib/engine/corePackageEvidence";

describe(
  "practical contextual coverage",
  () => {
    it("does not let an underdeveloped Runic technically solve Infernal's severe gaps", () => {
      const evidence =
        evaluateSelectedPackageEvidence(
          "infernal",
          ["infernal", "runic"],
          ELEMENT_MATCHUPS,
          new Map([
            ["infernal", 3],
            ["runic", 1],
          ]),
        );

      const runic =
        evidence
          .practicalOffensiveContributions[0];

      expect(runic)
        .toMatchObject({
          towerId: "runic",
          meaningful: false,
          justification:
            "insufficient-development-and-base-dps",
        });

      expect(
        evidence.coverage
          .damageShape
          .hasComplementaryShape,
      ).toBe(true);

      expect(
        evidence.coverage
          .damageShape
          .hasMeaningfulComplementaryShape,
      ).toBe(false);
    });

    it("recognizes developed Lightning as meaningful Ice coverage", () => {
      const evidence =
        evaluateSelectedPackageEvidence(
          "ice",
          ["ice", "lightning"],
          ELEMENT_MATCHUPS,
          new Map([
            ["ice", 3],
            ["lightning", 3],
          ]),
        );

      expect(
        evidence
          .practicalOffensiveContributions[0],
      ).toMatchObject({
        towerId: "lightning",
        meaningful: true,
        developedToClassMaximum:
          true,
      });

      expect(
        evidence.coverage
          .damageShape
          .hasMeaningfulComplementaryShape,
      ).toBe(true);
    });

    it("treats a Quad L1 as fully developed for its class", () => {
      const evidence =
        evaluateSelectedPackageEvidence(
          "laser",
          ["laser", "phantom-zone"],
          ELEMENT_MATCHUPS,
          new Map([
            ["laser", 2],
            ["phantom-zone", 1],
          ]),
        );

      expect(
        evidence
          .practicalOffensiveContributions[0],
      ).toMatchObject({
        towerId: "phantom-zone",
        meaningful: true,
        developedToClassMaximum:
          true,
        maxNormalLevel: 1,
      });
    });

    it("allows a low-level tower with superior factual offense to remain meaningful", () => {
      const evidence =
        evaluateSelectedPackageEvidence(
          "lightning",
          ["lightning", "runic"],
          ELEMENT_MATCHUPS,
          new Map([
            ["lightning", 1],
            ["runic", 1],
          ]),
        );

      expect(
        evidence
          .practicalOffensiveContributions[0],
      ).toMatchObject({
        towerId: "runic",
        meaningful: true,
        meetsOrExceedsAnchorBaseDps:
          true,
      });
    });
  },
);
