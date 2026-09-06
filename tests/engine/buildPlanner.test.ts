import {
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  getAnchorAssumedAllocation,
} from "@/lib/domain/anchorPolicy";

import {
  ELEMENTS,
} from "@/lib/domain/elements";

import {
  evaluateAnchorPackages,
} from "@/lib/engine/anchorPackageEvaluations";

import {
  evaluatePackageAdditions,
} from "@/lib/engine/candidateAdditionEvaluations";

import {
  buildPlannerDecision,
  comparePlannerDecisions,
  getBestAnchorBuildPlan,
  rankAnchorBuildPlans,
  type RankedBuildPlan,
} from "@/lib/engine/buildPlanner";

let laserPlans:
  readonly RankedBuildPlan[];

beforeAll(() => {
  laserPlans =
    rankAnchorBuildPlans(
      "laser",
      10,
    );
});

describe(
  "build planner",
  () => {
    it("produces ranked future build plans for a curated anchor", () => {
      expect(
        laserPlans.length,
      ).toBeGreaterThan(0);

      for (const plan of laserPlans) {
        expect(
          plan.anchorTowerId,
        ).toBe("laser");

        expect(
          plan.baseline
            .routeState
            .coreFeasible,
        ).toBe(true);

        expect(
          plan.selectedTowerIds,
        ).toContain(
          "laser",
        );
      }
    });

    it("uses the full normal keystone budget for final build plans", () => {
        for (const plan of laserPlans) {
            expect(
            plan.baseline
                .routeState
                .totalKeystones,
            ).toBe(11);
        }
        });

    it("returns plans in planner-decision order", () => {
      for (
        let index = 1;
        index < laserPlans.length;
        index += 1
      ) {
        expect(
          comparePlannerDecisions(
            laserPlans[index - 1]
              .decision,
            laserPlans[index]
              .decision,
          ),
        ).toBeLessThanOrEqual(
          0,
        );
      }
    });

    it("reconstructs a path ending at the selected future allocation", () => {
      const plan =
        laserPlans[0];

      expect(plan)
        .toBeDefined();

      const start =
        getAnchorAssumedAllocation(
          "laser",
        );

      let current =
        start;

      for (
        const step
        of plan.keystonePath
      ) {
        expect(
          step.transition
            .fromAllocation,
        ).toEqual(
          current,
        );

        expect(
          step.transition
            .toTotalKeystones,
        ).toBe(
          step.transition
            .fromTotalKeystones + 1,
        );

        current =
          step.transition
            .toAllocation;
      }

      expect(current)
        .toEqual(
          plan.baseline
            .routeState
            .allocation,
        );
    });

    it("uses exactly the route state's additional keystone count in the reconstructed path", () => {
      const plan =
        laserPlans[0];

      expect(
        plan.keystonePath.length,
      ).toBe(
        plan.baseline
          .routeState
          .additionalKeystones,
      );
    });

    it("never leaves the final target allocation while reconstructing the path", () => {
      const plan =
        laserPlans[0];

      const target =
        plan.baseline
          .routeState
          .allocation;

      for (
        const step
        of plan.keystonePath
      ) {
        for (
          const element
          of ELEMENTS
        ) {
          expect(
            step.transition
              .toAllocation[element],
          ).toBeLessThanOrEqual(
            target[element],
          );
        }
      }
    });

    it("recognizes Rage as defining anchor synergy for a Laser + Incantation package", () => {
      const baselines =
        evaluateAnchorPackages(
          "laser",
        );

      let found = false;

      for (const baseline of baselines) {
        if (
          !baseline.package
            .selectedTowerIds
            .includes(
              "incantation",
            )
        ) {
          continue;
        }

        const rage =
          evaluatePackageAdditions(
            baseline,
          ).find(
            (addition) =>
              addition
                .candidateTowerId ===
                "rage",
          );

        if (!rage) {
          continue;
        }

        const before =
          buildPlannerDecision(
            baseline,
            baseline.evidence,
          );

        const after =
          buildPlannerDecision(
            baseline,
            rage.afterEvidence,
            rage,
          );

        expect(
          after
            .anchorDefiningSynergyCount,
        ).toBeGreaterThan(
          before
            .anchorDefiningSynergyCount,
        );

        expect(
          comparePlannerDecisions(
            after,
            before,
          ),
        ).toBeLessThan(
          0,
        );

        found = true;
        break;
      }

      expect(found)
        .toBe(true);
    });

    it("returns the first ranked plan as the best build", () => {
      const best =
        getBestAnchorBuildPlan(
          "laser",
        );

      expect(best)
        .not.toBeNull();

      expect(
        best!.selectedTowerIds,
      ).toEqual(
        laserPlans[0]
          .selectedTowerIds,
      );

      expect(
        best!.baseline
          .routeState
          .allocation,
      ).toEqual(
        laserPlans[0]
          .baseline
          .routeState
          .allocation,
      );
    });
  },
);

it("does not prefer a strategically dead final keystone when broader Quad access is available", () => {
  const best =
    getBestAnchorBuildPlan(
      "laser",
    );

  expect(best)
    .not.toBeNull();

  const finalStep =
    best!.keystonePath[
      best!.keystonePath.length - 1
    ];

  expect(finalStep)
    .toBeDefined();

  const finalChangeCount =
    finalStep.transition
      .newlyUnlockedTowerIds.length +
    finalStep.transition
      .deepenedTowerIds.length;

  expect(
    finalChangeCount,
  ).toBeGreaterThan(0);
});