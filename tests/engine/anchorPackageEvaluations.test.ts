import {
  describe,
  expect,
  it,
} from "vitest";

import {
  ELEMENT_MATCHUPS,
} from "@/lib/domain/elementMatchupCatalog";

import {
  getElementMultiplier,
} from "@/lib/engine/elementMatchups";

import {
  evaluateAnchorPackages,
  evaluateDevelopedAnchorPackages,
} from "@/lib/engine/anchorPackageEvaluations";

describe(
  "anchor package evaluations",
  () => {
    it("loads the canonical element matchup table", () => {
      expect(
        getElementMultiplier(
          ELEMENT_MATCHUPS,
          "Fire",
          "Nature",
        ),
      ).toBe(2);

      expect(
        getElementMultiplier(
          ELEMENT_MATCHUPS,
          "Fire",
          "Water",
        ),
      ).toBe(0.5);
    });

    it("evaluates selectable packages across the anchor route space", () => {
      const evaluations =
        evaluateAnchorPackages(
          "laser",
        );

      expect(
        evaluations.length,
      ).toBeGreaterThan(0);
    });

    it("keeps Laser as the selected anchor in every evaluation", () => {
      const evaluations =
        evaluateAnchorPackages(
          "laser",
        );

      for (const evaluation of evaluations) {
        expect(
          evaluation.package
            .anchorTowerId,
        ).toBe("laser");

        expect(
          evaluation.evidence
            .anchorTowerId,
        ).toBe("laser");
      }
    });

    it("only evaluates packages that are feasible at their route state", () => {
      const evaluations =
        evaluateAnchorPackages(
          "laser",
        );

      for (const evaluation of evaluations) {
        expect(
          evaluation.routeState
            .coreFeasible,
        ).toBe(true);
      }
    });

    it("preserves the exact selected package inside its evidence", () => {
      const evaluations =
        evaluateAnchorPackages(
          "laser",
        );

      for (const evaluation of evaluations) {
        expect(
          evaluation.evidence
            .selectedTowerIds,
        ).toEqual(
          evaluation.package
            .selectedTowerIds,
        );
      }
    });

    it("does not stop at the earliest core-completion depth", () => {
      const evaluations =
        evaluateAnchorPackages(
          "laser",
        );

      expect(
        evaluations.length,
      ).toBeGreaterThan(0);

      const depths =
        evaluations.map(
          (evaluation) =>
            evaluation.routeState
              .additionalKeystones,
        );

      const earliestDepth =
        Math.min(...depths);

      expect(
        depths.some(
          (depth) =>
            depth >
            earliestDepth,
        ),
      ).toBe(true);
    });

    it("retains legal full-budget package evaluations", () => {
      const evaluations =
        evaluateAnchorPackages(
          "laser",
        );

      expect(
        evaluations.some(
          (evaluation) =>
            evaluation.routeState
              .totalKeystones === 11,
        ),
      ).toBe(true);
    });

    it("developed package evaluations are a subset of all evaluations", () => {
      const all =
        evaluateAnchorPackages(
          "laser",
        );

      const developed =
        evaluateDevelopedAnchorPackages(
          "laser",
        );

      expect(
        developed.length,
      ).toBeGreaterThan(0);

      expect(
        developed.length,
      ).toBeLessThanOrEqual(
        all.length,
      );

      expect(
        developed.every(
          (evaluation) =>
            evaluation.package
              .coreDeveloped,
        ),
      ).toBe(true);
    });
  },
);