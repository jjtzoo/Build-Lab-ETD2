import {
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  rankAnchorBuildPlans,
} from "@/lib/engine/buildPlanner";

import {
  combineBuildPlan,
  getBestCombinedBuildPlan,
  rankCombinedBuildPlans,
  type CombinedBuildPlan,
} from "@/lib/engine/combinedBuildPlan";

import {
  emptyNormalPackageSearchDiagnostics,
} from "@/lib/engine/normalPackageSearch";

const ANCHORS = [
  "laser",
  "ice",
  "poison",
] as const;

const combinedByAnchor = new Map<
  string,
  CombinedBuildPlan[]
>();

beforeAll(() => {
  for (const anchor of ANCHORS) {
    combinedByAnchor.set(
      anchor,
      [
        ...rankCombinedBuildPlans(anchor, 3)
          .plans,
      ],
    );
  }
}, 90_000);

describe("Phase 8 combined final plan", () => {
  it("is deterministic across reruns", () => {
    for (const anchor of ANCHORS) {
      const rerun = rankCombinedBuildPlans(
        anchor,
        3,
      ).plans;

      expect(
        rerun.map((plan) => ({
          towers:
            plan.normalPlan
              .selectedTowerIds,
          allocation:
            plan.normalPlan.baseline
              .routeState.allocation,
          endGame:
            plan.bestEndGamePackage
              ?.package.selections ??
            null,
          complete:
            plan.minimumCompletePlanCapital,
        })),
      ).toEqual(
        combinedByAnchor
          .get(anchor)!
          .map((plan) => ({
            towers:
              plan.normalPlan
                .selectedTowerIds,
            allocation:
              plan.normalPlan.baseline
                .routeState.allocation,
            endGame:
              plan.bestEndGamePackage
                ?.package.selections ??
              null,
            complete:
              plan.minimumCompletePlanCapital,
          })),
      );
    }
  });

  it("keeps the original Anchor as the Anchor", () => {
    for (const [
      anchor,
      plans,
    ] of combinedByAnchor) {
      for (const plan of plans) {
        expect(plan.anchorTowerId).toBe(
          anchor,
        );
        expect(
          plan.normalPlan.anchorTowerId,
        ).toBe(anchor);
        expect(
          plan.normalPlan.selectedTowerIds,
        ).toContain(anchor);
      }
    }
  });

  it("carries normal-wave viability and endgame value as separate dimensions", () => {
    for (const plans of combinedByAnchor.values()) {
      for (const plan of plans) {
        expect(
          plan.normalWaveViability,
        ).toMatchObject({
          coreDeveloped: expect.any(
            Boolean,
          ),
          elementWeaknessesRemaining:
            expect.any(Number),
          tensionCount: expect.any(Number),
        });

        if (plan.bestEndGamePackage) {
          expect(
            plan.endGameValue,
          ).toMatchObject({
            anchorWeaknessesImproved:
              expect.any(Number),
            totalSustainedEngagementDps:
              expect.any(Number),
          });
        }
      }
    }
  });

  it("does not let endgame value override the normal planner's ranking", () => {
    for (const anchor of ANCHORS) {
      const normalTop = rankAnchorBuildPlans(
        anchor,
        1,
      )[0];
      const combinedTop = combinedByAnchor
        .get(anchor)!
        .at(0)!;

      // The combined recommendation's normal build is exactly the
      // normal planner's #1 — endgame only reorders normal-equivalent
      // plans, it never promotes a weaker normal package.
      expect(
        combinedTop.normalPlan
          .selectedTowerIds,
      ).toEqual(
        normalTop.selectedTowerIds,
      );
      expect(
        combinedTop.normalPlan.baseline
          .routeState.allocation,
      ).toEqual(
        normalTop.baseline.routeState
          .allocation,
      );
    }
  });

  it("never ranks an undeveloped-core plan above a core-developed one", () => {
    // Build a synthetic comparison: the real ranker only ever emits
    // core-developed plans when one exists, so exercise the comparator
    // path directly through combineBuildPlan + rankCombinedBuildPlans
    // invariant instead.
    for (const plans of combinedByAnchor.values()) {
      let seenUndeveloped = false;
      for (const plan of plans) {
        if (
          plan.normalWaveViability
            .coreDeveloped
        ) {
          expect(seenUndeveloped).toBe(
            false,
          );
        } else {
          seenUndeveloped = true;
        }
      }
    }
  });

  it("reports complete-plan capital as normal capital plus endgame capital", () => {
    for (const plans of combinedByAnchor.values()) {
      for (const plan of plans) {
        if (
          plan.minimumEndGameOptionCapital ===
          null
        ) {
          expect(
            plan.minimumCompletePlanCapital,
          ).toBeNull();
          continue;
        }

        expect(
          plan.minimumCompletePlanCapital,
        ).toBe(
          plan.minimumNormalPackageCapital +
            plan.minimumEndGameOptionCapital,
        );
        // Two Essence towers at 13750 each.
        expect(
          plan.minimumEndGameOptionCapital,
        ).toBe(27_500);
      }
    }
  });

  it("exposes a best and a distinct second-best endgame package when the allocation allows one", () => {
    for (const plans of combinedByAnchor.values()) {
      for (const plan of plans) {
        if (!plan.bestEndGamePackage) {
          continue;
        }
        if (
          plan.secondBestEndGamePackage
        ) {
          expect(
            plan.bestEndGamePackage
              .package.selections,
          ).not.toEqual(
            plan.secondBestEndGamePackage
              .package.selections,
          );
        }
      }
    }
  });

  it("combineBuildPlan is a pure projection of a normal plan", () => {
    const normalPlan = rankAnchorBuildPlans(
      "laser",
      1,
    )[0];
    const a = combineBuildPlan(
      normalPlan,
      emptyNormalPackageSearchDiagnostics(),
    );
    const b = combineBuildPlan(
      normalPlan,
      emptyNormalPackageSearchDiagnostics(),
    );

    expect(a.bestEndGamePackage?.package)
      .toEqual(
        b.bestEndGamePackage?.package,
      );
    expect(a.minimumCompletePlanCapital)
      .toBe(b.minimumCompletePlanCapital);
  });

  it("getBestCombinedBuildPlan returns the rank-1 combined plan", () => {
    for (const anchor of ANCHORS) {
      expect(
        getBestCombinedBuildPlan(anchor)
          ?.normalPlan.selectedTowerIds,
      ).toEqual(
        combinedByAnchor
          .get(anchor)!
          .at(0)!.normalPlan
          .selectedTowerIds,
      );
    }
  });
});
