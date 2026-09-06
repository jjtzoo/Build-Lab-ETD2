import {
  describe,
  expect,
  it,
} from "vitest";

import {
  evaluateAnchorPackages,
} from "@/lib/engine/anchorPackageEvaluations";

import {
  evaluateAnchorPackageAdditions,
  evaluatePackageAdditions,
} from "@/lib/engine/candidateAdditionEvaluations";

function laserBaselineWithAdditions() {
  const baselines =
    evaluateAnchorPackages(
      "laser",
    );

  const baseline =
    baselines.find(
      (candidate) =>
        evaluatePackageAdditions(
          candidate,
        ).length > 0,
    );

  if (!baseline) {
    throw new Error(
      "Expected a Laser package with optional additions.",
    );
  }

  return baseline;
}

describe(
  "candidate addition evaluations",
  () => {
    it("finds available optional towers for a selected package", () => {
      const baseline =
        laserBaselineWithAdditions();

      const additions =
        evaluatePackageAdditions(
          baseline,
        );

      expect(
        additions.length,
      ).toBeGreaterThan(0);
    });

    it("never proposes a tower already selected in the baseline package", () => {
      const baseline =
        laserBaselineWithAdditions();

      const selected =
        new Set(
          baseline.package
            .selectedTowerIds,
        );

      const additions =
        evaluatePackageAdditions(
          baseline,
        );

      for (const addition of additions) {
        expect(
          selected.has(
            addition.candidateTowerId,
          ),
        ).toBe(false);
      }
    });

    it("only proposes towers available at the exact route state", () => {
      const baseline =
        laserBaselineWithAdditions();

      const available =
        new Map(
          baseline.routeState
            .availableTowers
            .map(
              (entry) => [
                entry.tower.id,
                entry.maxLevel,
              ],
            ),
        );

      const additions =
        evaluatePackageAdditions(
          baseline,
        );

      for (const addition of additions) {
        expect(
          available.get(
            addition.candidateTowerId,
          ),
        ).toBe(
          addition.candidateReachableLevel,
        );
      }
    });

    it("preserves the baseline evidence as the before state", () => {
      const baseline =
        laserBaselineWithAdditions();

      const additions =
        evaluatePackageAdditions(
          baseline,
        );

      for (const addition of additions) {
        expect(
          addition.beforeEvidence,
        ).toBe(
          baseline.evidence,
        );
      }
    });

    it("adds exactly the candidate tower to the selected package evidence", () => {
      const baseline =
        laserBaselineWithAdditions();

      const additions =
        evaluatePackageAdditions(
          baseline,
        );

      for (const addition of additions) {
        expect(
          addition.afterEvidence
            .selectedTowerIds,
        ).toEqual([
          ...baseline.package
            .selectedTowerIds,
          addition.candidateTowerId,
        ]);
      }
    });

    it("keeps all after-state evidence inside the extended selected package", () => {
      const baseline =
        laserBaselineWithAdditions();

      const additions =
        evaluatePackageAdditions(
          baseline,
        );

      for (const addition of additions) {
        const selectedAfter =
          new Set(
            addition.afterEvidence
              .selectedTowerIds,
          );

        for (
          const match
          of addition.afterEvidence
            .synergy.applicable
        ) {
          expect(
            selectedAfter.has(
              match.providerTowerId,
            ),
          ).toBe(true);

          expect(
            selectedAfter.has(
              match.consumerTowerId,
            ),
          ).toBe(true);
        }
      }
    });

    it("can expose Rage isolation synergy with a Laser package containing Incantation", () => {
      const additions =
        evaluateAnchorPackageAdditions(
          "laser",
        );

      const rageAddition =
        additions.find(
          (addition) =>
            addition
              .candidateTowerId ===
              "rage" &&
            addition.baseline.package
              .selectedTowerIds
              .includes(
                "incantation",
              ),
        );

      expect(
        rageAddition,
      ).toBeDefined();

      expect(
        rageAddition!.synergy
          .applicable.after.some(
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
        rageAddition!.synergy
          .applicable.after.some(
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