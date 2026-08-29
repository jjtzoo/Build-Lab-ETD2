import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  Allocation,
  ElementName,
} from "@/lib/types";

import {
  legalAllocations,
} from "@/lib/engine/allocation";

import {
  getAllocationShortlist,
} from "@/lib/engine/allocation-shortlist";

import {
  searchPackage,
} from "@/lib/engine/package-search";

import {
  evaluateCandidate,
} from "@/lib/engine/evaluator-run";

import {
  makeDecision,
} from "@/lib/engine/decision-engine";

import {
  optimizeV8,
} from "@/lib/engine/v8-optimizer";

function allocationKey(
  allocation: Allocation,
): string {
  return allocation.join(",");
}

function isLegal(
  allocation: Allocation,
  core: ElementName[],
): boolean {
  return legalAllocations(core).some(
    (candidate) =>
      allocationKey(candidate) ===
      allocationKey(allocation),
  );
}

function getExhaustiveWinner(
  core: ElementName[],
  anchor = "Auto",
) {
  /*
   * Disable marginal analysis here.
   *
   * This test is measuring:
   *
   * exhaustive allocation search
   * vs
   * shortlisted allocation search
   *
   * not the marginal-analysis layer.
   */
  return optimizeV8(
    core,
    anchor,
    {
      includeMarginalAnalysis:
        false,
    },
  ).winner;
}

function getShortlistWinner(
  core: ElementName[],
  anchor = "Auto",
) {
  const shortlist =
    getAllocationShortlist(
      core,
      anchor,
    );

  const evaluations = [];

  for (
    const allocation of shortlist
  ) {
    const packageResult =
      searchPackage(
        allocation,
        core,
        anchor,
      );

    if (
      !packageResult
    ) {
      continue;
    }

    evaluations.push(
      evaluateCandidate(
        allocation,
        core,
        packageResult.towers,
        anchor,
      ),
    );
  }

  return makeDecision(
    evaluations,
  ).winner;
}

const REPRESENTATIVE_CORES:
  ElementName[][] = [
    [
      "Darkness",
      "Earth",
      "Fire",
    ],

    [
      "Nature",
      "Water",
      "Fire",
    ],

    [
      "Light",
      "Darkness",
      "Water",
    ],

    [
      "Light",
      "Fire",
      "Nature",
    ],
  ];

describe(
  "allocation shortlist regression",
  () => {
    it(
      "returns a substantially smaller search space",
      () => {
        for (
          const core of
          REPRESENTATIVE_CORES
        ) {
          const legal =
            legalAllocations(
              core,
            );

          const shortlist =
            getAllocationShortlist(
              core,
              "Auto",
            );

          expect(
            shortlist.length,
          ).toBeLessThan(
            legal.length,
          );

          expect(
            shortlist.length,
          ).toBeLessThanOrEqual(
            32,
          );
        }
      },
    );

    it(
      "keeps every shortlisted allocation legal",
      () => {
        for (
          const core of
          REPRESENTATIVE_CORES
        ) {
          const shortlist =
            getAllocationShortlist(
              core,
              "Auto",
            );

          for (
            const allocation of
            shortlist
          ) {
            expect(
              isLegal(
                allocation,
                core,
              ),
            ).toBe(true);
          }
        }
      },
    );

    it(
      "preserves the exhaustive winner for representative cores",
      () => {
        for (
          const core of
          REPRESENTATIVE_CORES
        ) {
          const exhaustiveWinner =
            getExhaustiveWinner(
              core,
              "Auto",
            );

          expect(
            exhaustiveWinner,
          ).not.toBeNull();

          const shortlist =
            getAllocationShortlist(
              core,
              "Auto",
            );

          expect(
            shortlist.some(
              (allocation) =>
                allocationKey(
                  allocation,
                ) ===
                allocationKey(
                  exhaustiveWinner!
                    .allocation,
                ),
            ),
          ).toBe(true);
        }
      },
    );

    it(
      "keeps the shortlisted winner aligned with the exhaustive winner",
      () => {
        for (
          const core of
          REPRESENTATIVE_CORES
        ) {
          const exhaustiveWinner =
            getExhaustiveWinner(
              core,
              "Auto",
            );

          const shortlistWinner =
            getShortlistWinner(
              core,
              "Auto",
            );

          expect(
            exhaustiveWinner,
          ).not.toBeNull();

          expect(
            shortlistWinner,
          ).not.toBeNull();

          expect(
            allocationKey(
              shortlistWinner!
                .allocation,
            ),
          ).toBe(
            allocationKey(
              exhaustiveWinner!
                .allocation,
            ),
          );
        }
      },
    );

    it(
      "preserves a deep allocation family",
      () => {
        for (
          const core of
          REPRESENTATIVE_CORES
        ) {
          const shortlist =
            getAllocationShortlist(
              core,
              "Auto",
            );

          const hasDeep =
            shortlist.some(
              (allocation) => {
                const sorted =
                  [
                    ...allocation,
                  ].sort(
                    (a, b) =>
                      b - a,
                  );

                return (
                  sorted[0] === 3 &&
                  sorted[1] === 3
                );
              },
            );

          expect(
            hasDeep,
          ).toBe(true);
        }
      },
    );

    it(
      "preserves a broad allocation family",
      () => {
        for (
          const core of
          REPRESENTATIVE_CORES
        ) {
          const shortlist =
            getAllocationShortlist(
              core,
              "Auto",
            );

          const hasBroad =
            shortlist.some(
              (allocation) =>
                allocation.filter(
                  (level) =>
                    level > 0,
                ).length >= 5,
            );

          expect(
            hasBroad,
          ).toBe(true);
        }
      },
    );

    it(
      "preserves the explicit Howitzer anchor family",
      () => {
        const core:
          ElementName[] = [
          "Darkness",
          "Earth",
          "Fire",
        ];

        const shortlist =
          getAllocationShortlist(
            core,
            "Howitzer",
          );

        const hasHowitzerReady =
          shortlist.some(
            (allocation) =>
              allocation[1] >= 3 &&
              allocation[5] >= 3,
          );

        expect(
          hasHowitzerReady,
        ).toBe(true);
      },
    );
  },
);