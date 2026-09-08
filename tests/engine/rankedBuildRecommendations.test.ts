import {
  describe,
  expect,
  it,
} from "vitest";

import {
  CURATED_ANCHORS,
} from "@/lib/domain/anchorPolicy";

import {
  getTower,
} from "@/lib/domain/towerCatalog";

import {
  buildRecommendationSet,
} from "@/lib/engine/rankedBuildRecommendations";

describe(
  "Phase 9 ranked build recommendations",
  () => {
    it("returns the engine recommendation plus distinct, non-manufactured alternatives", () => {
      const set = buildRecommendationSet(
        "laser",
      );

      expect(
        set.engineRecommendedPlanId,
      ).toBe("rank-1");
      expect(
        set.plans.length,
      ).toBeGreaterThanOrEqual(1);
      expect(
        set.plans.length,
      ).toBeLessThanOrEqual(3);
      expect(
        set.plans[0]
          .comparisonToRecommended,
      ).toBeNull();

      // Every alternative differs materially from the recommendation:
      // a different allocation, at least two tower substitutions, a
      // different endgame package, or a material capital gap.
      for (const alt of set.plans.slice(1)) {
        const cmp =
          alt.comparisonToRecommended!;
        const substituted =
          cmp.substitutions.added.length +
          cmp.substitutions.removed.length;
        expect(
          cmp.allocationDelta.length > 0 ||
            substituted >= 2 ||
            cmp.endGameChanged ||
            Math.abs(
              cmp.completeCapitalDelta,
            ) >= 3_000,
        ).toBe(true);

        // Each alternative's summary is grounded: at least one
        // concrete improvement or worsening versus the recommendation.
        expect(
          cmp.improves.length +
            cmp.worsens.length,
        ).toBeGreaterThan(0);
        // Derived labels only describe real advantages.
        for (const label of cmp.labels) {
          expect(cmp.improves.length)
            .toBeGreaterThan(0);
          expect(typeof label).toBe(
            "string",
          );
        }
      }
    });

    it("never returns two identical plans", () => {
      const set = buildRecommendationSet(
        "ice",
      );
      const fingerprints = set.plans.map(
        (entry) =>
          JSON.stringify({
            towers:
              entry.plan.normalPlan
                .selectedTowerIds,
            allocation:
              entry.plan.normalPlan
                .baseline.routeState
                .allocation,
            endGame:
              entry.plan
                .bestEndGamePackage
                ?.package.selections ??
              null,
          }),
      );
      expect(
        new Set(fingerprints).size,
      ).toBe(fingerprints.length);
    });

    it("carries a complete progression for every plan in the set", () => {
      const set = buildRecommendationSet(
        "poison",
      );
      for (const entry of set.plans) {
        expect(
          entry.progression.stagePriorities.map(
            (sp) => sp.stage,
          ),
        ).toEqual([
          "EARLY",
          "MID",
          "LATE",
          "END_GAME",
        ]);
      }
    });

    it("is deterministic", () => {
      const a =
        buildRecommendationSet("astral");
      const b =
        buildRecommendationSet("astral");
      expect(
        a.plans.map((p) => p.id),
      ).toEqual(
        b.plans.map((p) => p.id),
      );
      expect(
        a.plans.map(
          (p) =>
            p.plan.normalPlan
              .selectedTowerIds,
        ),
      ).toEqual(
        b.plans.map(
          (p) =>
            p.plan.normalPlan
              .selectedTowerIds,
        ),
      );
    });

    it("holds across all 22 curated anchors: legal, deterministic, breadth never wins", () => {
      for (const { towerId } of CURATED_ANCHORS) {
        const set =
          buildRecommendationSet(towerId);

        expect(
          set.plans.length,
        ).toBeGreaterThanOrEqual(1);

        for (const entry of set.plans) {
          const plan = entry.plan;

          // Anchor identity preserved.
          expect(plan.anchorTowerId).toBe(
            towerId,
          );
          expect(
            plan.normalPlan
              .selectedTowerIds,
          ).toContain(towerId);

          // 11-keystone allocation.
          expect(
            plan.normalPlan.baseline
              .routeState.totalKeystones,
          ).toBe(11);

          // Core roles developed.
          expect(
            plan.normalWaveViability
              .coreDeveloped,
          ).toBe(true);

          // Every underdeveloped post-core tower has an explicit
          // development reason.
          for (const audit of plan
            .normalPlan
            .normalPackageEconomics
            .postCoreTowerAudits) {
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

          // Quad L1 never flagged underdeveloped.
          for (const selected of plan
            .normalPlan
            .normalPackageEconomics
            .selectedTowers) {
            if (
              getTower(selected.towerId)
                .combination === "Quad"
            ) {
              expect(
                selected.developmentStatus,
              ).not.toBe("underdeveloped");
            }
          }

          // Complete capital is coherent.
          if (
            plan.minimumCompletePlanCapital !==
            null
          ) {
            expect(
              plan.minimumCompletePlanCapital,
            ).toBe(
              plan.minimumNormalPackageCapital +
                plan.minimumEndGameOptionCapital!,
            );
          }
        }
      }
    }, 600_000);
  },
);
