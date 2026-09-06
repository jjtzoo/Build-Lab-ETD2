import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  ElementMatchupTable,
} from "@/lib/domain/elementMatchups";

import {
  ELEMENTS,
} from "@/lib/domain/elements";

import {
  getTower,
} from "@/lib/domain/towerCatalog";

import {
  getTowerProfile,
} from "@/lib/domain/towerProfileCatalog";

import {
  getEarliestCoreFeasibleStates,
} from "@/lib/engine/anchorRouteStates";

import {
  evaluateCombinedSynergyPackage,
} from "@/lib/engine/combinedSynergyOpportunity";

import {
  getCorePackageCandidates,
} from "@/lib/engine/corePackageCandidates";

import {
  evaluateCorePackageEvidence,
} from "@/lib/engine/corePackageEvidence";

import {
  evaluateDamageShapeCoverage,
} from "@/lib/engine/damageShapeCoverage";

import {
  evaluateElementCoverage,
} from "@/lib/engine/elementCoverage";

import {
  evaluateRangeCoverage,
} from "@/lib/engine/rangeCoverage";

function neutralMatchups():
  ElementMatchupTable {
  return Object.fromEntries(
    ELEMENTS.map(
      (attacker) => [
        attacker,
        Object.fromEntries(
          ELEMENTS.map(
            (defender) => [
              defender,
              1,
            ],
          ),
        ),
      ],
    ),
  ) as unknown as ElementMatchupTable;
}

function laserPackage() {
  const state =
    getEarliestCoreFeasibleStates(
      "laser",
    )[0];

  if (!state) {
    throw new Error(
      "Expected Laser core-feasible state.",
    );
  }

  const candidate =
    getCorePackageCandidates(
      state,
    )[0];

  if (!candidate) {
    throw new Error(
      "Expected Laser core package candidate.",
    );
  }

  return candidate;
}

describe(
  "core package evidence",
  () => {
    it("evaluates only towers actually selected into the package", () => {
      const candidate =
        laserPackage();

      const evidence =
        evaluateCorePackageEvidence(
          candidate,
          neutralMatchups(),
        );

      expect(
        evidence.selectedTowerIds,
      ).toEqual(
        candidate.selectedTowerIds,
      );

      expect(
        evidence.selectedTowerIds,
      ).toContain("laser");

      const selected =
        new Set(
          candidate.selectedTowerIds,
        );

      for (
        const towerId
        of evidence
          .offensiveContributorTowerIds
      ) {
        expect(
          selected.has(towerId),
        ).toBe(true);
      }
    });

    it("does not treat non-offensive selected supports as offensive coverage contributors", () => {
      const candidate =
        laserPackage();

      const evidence =
        evaluateCorePackageEvidence(
          candidate,
          neutralMatchups(),
        );

      for (
        const towerId
        of candidate.supportTowerIds
      ) {
        const profile =
          getTowerProfile(
            towerId,
          );

        if (!profile.offense) {
          expect(
            evidence
              .offensiveContributorTowerIds,
          ).not.toContain(
            towerId,
          );
        }
      }
    });

    it("wires selected offensive towers into element coverage", () => {
      const candidate =
        laserPackage();

      const matchups =
        neutralMatchups();

      const evidence =
        evaluateCorePackageEvidence(
          candidate,
          matchups,
        );

      const anchor =
        getTower(
          candidate.anchorTowerId,
        );

      const supportingElements =
        candidate.supportTowerIds
          .filter(
            (towerId) =>
              getTowerProfile(
                towerId,
              ).offense !==
              undefined,
          )
          .map(
            (towerId) =>
              getTower(
                towerId,
              ).damageElement,
          );

      expect(
        evidence.coverage.element,
      ).toEqual(
        evaluateElementCoverage(
          matchups,
          anchor.damageElement,
          supportingElements,
        ),
      );
    });

    it("wires selected offensive towers into damage-shape coverage", () => {
      const candidate =
        laserPackage();

      const evidence =
        evaluateCorePackageEvidence(
          candidate,
          neutralMatchups(),
        );

      const anchorProfile =
        getTowerProfile(
          candidate.anchorTowerId,
        );

      if (!anchorProfile.offense) {
        throw new Error(
          "Laser must have offense.",
        );
      }

      const supportingShapes =
        candidate.supportTowerIds
          .map(
            (towerId) =>
              getTowerProfile(
                towerId,
              ).offense,
          )
          .filter(
            (
              offense,
            ): offense is NonNullable<
              typeof offense
            > =>
              offense !==
              undefined,
          )
          .map(
            (offense) =>
              offense.damageShape,
          );

      expect(
        evidence.coverage
          .damageShape,
      ).toEqual(
        evaluateDamageShapeCoverage(
          anchorProfile.offense
            .damageShape,
          supportingShapes,
        ),
      );
    });

    it("wires only offensive supports into range coverage", () => {
      const candidate =
        laserPackage();

      const evidence =
        evaluateCorePackageEvidence(
          candidate,
          neutralMatchups(),
        );

      const anchor =
        getTower(
          candidate.anchorTowerId,
        );

      const supportingRanges =
        candidate.supportTowerIds
          .filter(
            (towerId) =>
              getTowerProfile(
                towerId,
              ).offense !==
              undefined,
          )
          .map(
            (towerId) =>
              getTower(
                towerId,
              ).stats.range,
          );

      expect(
        evidence.coverage.range,
      ).toEqual(
        evaluateRangeCoverage(
          anchor.stats.range,
          supportingRanges,
        ),
      );
    });

    it("keeps all synergy evidence inside the selected package", () => {
      const candidate =
        laserPackage();

      const evidence =
        evaluateCorePackageEvidence(
          candidate,
          neutralMatchups(),
        );

      const selected =
        new Set(
          candidate.selectedTowerIds,
        );

      for (
        const match
        of evidence.synergy.applicable
      ) {
        expect(
          selected.has(
            match.providerTowerId,
          ),
        ).toBe(true);

        expect(
          selected.has(
            match.consumerTowerId,
          ),
        ).toBe(true);
      }

      for (
        const tension
        of evidence.synergy.tensions
      ) {
        expect(
          selected.has(
            tension.providerTowerId,
          ),
        ).toBe(true);

        expect(
          selected.has(
            tension.affectedTowerId,
          ),
        ).toBe(true);
      }
    });

    it("evaluates known whole-package mechanic synergy", () => {
      const evidence =
        evaluateCombinedSynergyPackage(
          [
            getTowerProfile(
              "rage",
            ),
            getTowerProfile(
              "laser",
            ),
            getTowerProfile(
              "incantation",
            ),
          ],
        );

      expect(
        evidence.applicable.some(
          (match) =>
            match.providerTowerId ===
              "rage" &&
            match.consumerTowerId ===
              "laser" &&
            match.signal ===
              "target-isolation",
        ),
      ).toBe(true);

      expect(
        evidence.applicable.some(
          (match) =>
            match.providerTowerId ===
              "rage" &&
            match.consumerTowerId ===
              "incantation" &&
            match.signal ===
              "target-isolation",
        ),
      ).toBe(true);
    });
  },
);