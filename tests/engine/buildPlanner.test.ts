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
  rankAnchorBuildPlansWithDiagnostics,
  type RankedBuildPlan,
} from "@/lib/engine/buildPlanner";

import type {
  NormalPackageSearchDiagnostics,
} from "@/lib/engine/normalPackageSearch";

let laserPlans:
  readonly RankedBuildPlan[];
let laserDiagnostics:
  NormalPackageSearchDiagnostics;
let laserSearchDurationMs = 0;
let laserHeapDeltaMb = 0;

beforeAll(() => {
  const heapBefore =
    process.memoryUsage().heapUsed;
  const startedAt =
    performance.now();
  const result =
    rankAnchorBuildPlansWithDiagnostics(
      "laser",
      10,
    );
  laserSearchDurationMs =
    performance.now() - startedAt;
  laserHeapDeltaMb =
    (
      process.memoryUsage().heapUsed -
      heapBefore
    ) /
    1024 /
    1024;
  laserPlans = result.plans;
  laserDiagnostics =
    result.diagnostics;
}, 120_000);

describe(
  "build planner",
  () => {
    it("does not rank unused tower or Quad access breadth", () => {
      const baseline =
        laserPlans[0]
          .decision;

      const narrow = {
        ...baseline,
        availableQuadCount: 0,
        availableTowerCount: 12,
      };

      const broad = {
        ...baseline,
        availableQuadCount: 15,
        availableTowerCount: 50,
      };

      expect(
        comparePlannerDecisions(
          narrow,
          broad,
        ),
      ).toBe(0);

      expect(
        comparePlannerDecisions(
          broad,
          narrow,
        ),
      ).toBe(0);
    });

    it("lets a developed scaling buff outrank one more discretionary tower", () => {
      // Blacksmith / Well scale 10 -> 30 -> 90. A baseline that reaches
      // buff L3 (realizedBuffMagnitude 90) must outrank one that stops at
      // L2 (30) and instead fields another tower whose only edge is raw
      // synergy potency, range or breadth.
      const baseline = laserPlans[0].decision;

      const buffL3 = {
        ...baseline,
        realizedBuffMagnitude: 90,
      };
      const buffL2PlusTower = {
        ...baseline,
        realizedBuffMagnitude: 30,
        persistentSynergyStrength:
          baseline.persistentSynergyStrength + 8,
        fullSynergyStrength:
          baseline.fullSynergyStrength + 8,
        rangeExtensionFromAnchor:
          baseline.rangeExtensionFromAnchor + 500,
        selectedTowerCount:
          baseline.selectedTowerCount + 1,
      };

      expect(
        comparePlannerDecisions(
          buffL3,
          buffL2PlusTower,
        ),
      ).toBeLessThan(0);
    });

    it("keeps the developed buff below anchor synergy and coverage", () => {
      const baseline = laserPlans[0].decision;

      const buffL3ButLessCoverage = {
        ...baseline,
        realizedBuffMagnitude: 90,
        elementWeaknessesCovered:
          baseline.elementWeaknessesCovered,
        anchorDefiningSynergyCount:
          baseline.anchorDefiningSynergyCount,
      };
      const strongerAnchorSynergy = {
        ...baseline,
        realizedBuffMagnitude: 30,
        anchorDefiningSynergyCount:
          baseline.anchorDefiningSynergyCount + 1,
      };

      expect(
        comparePlannerDecisions(
          strongerAnchorSynergy,
          buffL3ButLessCoverage,
        ),
      ).toBeLessThan(0);
    });

    it("uses capital only after substantive strategic evidence", () => {
      const baseline =
        laserPlans[0].decision;
      const cheap = {
        ...baseline,
        minimumNormalPackageCapital:
          1,
      };
      const expensiveEquivalent = {
        ...baseline,
        minimumNormalPackageCapital:
          1_000_000,
      };
      const expensiveStronger = {
        ...expensiveEquivalent,
        fullSynergyStrength:
          baseline
            .fullSynergyStrength + 1,
      };

      expect(
        comparePlannerDecisions(
          cheap,
          expensiveEquivalent,
        ),
      ).toBeLessThan(0);
      expect(
        comparePlannerDecisions(
          expensiveStronger,
          cheap,
        ),
      ).toBeLessThan(0);
    });

    it("exposes coherent capital and leave-one-out audits", () => {
      for (const plan of laserPlans) {
        expect(
          plan
            .minimumNormalPackageCapital,
        ).toBe(
          plan.normalPackageEconomics
            .selectedTowers.reduce(
              (total, tower) =>
                total +
                tower.minimumFieldCost,
              0,
            ),
        );
        expect(
          plan.normalPackageEconomics
            .towerAudits.map(
              (audit) =>
                audit.towerId,
            ).sort(),
        ).toEqual(
          [...plan.selectedTowerIds]
            .sort(),
        );

        for (const audit of
          plan.normalPackageEconomics
            .towerAudits) {
          expect(
            audit.rolePurpose.length,
          ).toBeGreaterThan(0);
          expect(
            audit
              .leaveOneOutConsequences
              .length,
          ).toBeGreaterThan(1);
        }

        for (const audit of
          plan.normalPackageEconomics
            .postCoreTowerAudits) {
          expect(
            audit.marginalMinimumCapital,
          ).toBe(
            audit.minimumFieldCost,
          );
          expect(
            audit.rolePurpose.length,
          ).toBeGreaterThan(0);
          expect(
            audit
              .leaveOneOutConsequences
              .some((entry) =>
                !entry.startsWith(
                  "reduces-minimum-capital-by:",
                ),
              ),
          ).toBe(true);

          if (
            audit.developmentStatus ===
              "underdeveloped"
          ) {
            expect(
              audit
                .explicitDevelopmentReasons
                .length,
            ).toBeGreaterThan(0);
          }
        }
      }
    });

    it("keeps the Laser search inside the Phase 5B need-directed envelope", () => {
      // The deterministic shape of the search is the real regression
      // guard: if the need-directed architecture degraded toward brute
      // force these would blow up. Wall time is only a loose sanity
      // bound because it is unreliable under parallel test load.
      expect(
        laserDiagnostics.truncationStatus,
      ).toBe(false);
      expect(
        laserDiagnostics
          .maximumCandidatesAfterJustificationFiltering,
      ).toBeLessThanOrEqual(24);
      expect(
        laserDiagnostics
          .maximumFrontierSize,
      ).toBeLessThanOrEqual(105);
      expect(
        laserDiagnostics.packagesEvaluated,
      ).toBeLessThan(20_000);
      expect(
        laserDiagnostics
          .maximumRecursionDepth,
      ).toBeLessThanOrEqual(12);
      expect(
        laserHeapDeltaMb,
      ).toBeLessThan(256);
      // Generous: catches a pathological blow-up, tolerates a busy CI.
      expect(
        laserSearchDurationMs,
      ).toBeLessThan(60_000);
    });

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

        expect(
          new Set(
            plan.selectedTowerIds,
          ).size,
        ).toBe(
          plan.selectedTowerIds.length,
        );

        const available =
          new Set(
            plan.baseline
              .routeState
              .availableTowers
              .map((entry) =>
                entry.tower.id,
              ),
          );

        expect(
          plan.selectedTowerIds
            .every((towerId) =>
              available.has(towerId),
            ),
        ).toBe(true);

        expect(
          plan.optionalTowerId,
        ).toBe(
          plan.postCoreTowerIds
            .length === 1
            ? plan.postCoreTowerIds[0]
            : null,
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
