import {
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  getTower,
} from "@/lib/domain/towerCatalog";

import {
  resolveNormalTowerCost,
} from "@/lib/domain/towerEconomics";

import {
  rankAnchorBuildPlans,
  type RankedBuildPlan,
} from "@/lib/engine/buildPlanner";

// A trio anchor with a wide unlocked space (the Phase 5B stress case)
// and a dual anchor with a narrower one, so the invariants are checked
// against both search shapes without running all 22 anchors.
const AUDITED_ANCHORS = [
  "laser",
  "ice",
  "infernal",
] as const;

const plansByAnchor =
  new Map<string, readonly RankedBuildPlan[]>();

beforeAll(() => {
  for (const anchor of AUDITED_ANCHORS) {
    plansByAnchor.set(
      anchor,
      rankAnchorBuildPlans(anchor, 5),
    );
  }
}, 60_000);

describe(
  "Phase 5C economic + development coherence",
  () => {
    it("reports minimum capital as the verified cumulative field cost of the shown levels", () => {
      for (const plans of plansByAnchor.values()) {
        for (const plan of plans) {
          const expected =
            plan.evidence.resolvedContributions.reduce(
              (total, contribution) =>
                total +
                resolveNormalTowerCost(
                  contribution.towerId,
                  contribution.reachableLevel,
                ).minimumFieldCost,
              0,
            );

          expect(
            plan.minimumNormalPackageCapital,
          ).toBe(expected);
          expect(
            plan.normalPackageEconomics
              .minimumNormalPackageCapital,
          ).toBe(expected);
        }
      }
    });

    it("does not double-count cumulative upgrade paths", () => {
      // Catalog values are cumulative totals; L3 Dual is 3300, never
      // 500 + 1300 + 3300.
      for (const plans of plansByAnchor.values()) {
        for (const plan of plans) {
          for (const selected of plan
            .normalPackageEconomics
            .selectedTowers) {
            expect(
              selected.minimumFieldCost,
            ).toBe(
              resolveNormalTowerCost(
                selected.towerId,
                selected.reachableLevel,
              ).minimumFieldCost,
            );
          }
        }
      }
    });

    it("keeps the engine recommendation off the cheapest-build extreme", () => {
      // A blind cheap-tower bias would drive every anchor to the
      // minimum-cost package. The Laser recommendation deliberately
      // fields expensive Trio/Quad pieces because they carry unique
      // strategic evidence.
      const laser = plansByAnchor.get("laser")!;
      const cheapest = [...laser].sort(
        (a, b) =>
          a.minimumNormalPackageCapital -
          b.minimumNormalPackageCapital,
      )[0];

      expect(laser[0].minimumNormalPackageCapital)
        .toBeGreaterThan(
          cheapest.minimumNormalPackageCapital,
        );
    });

    it("never lets a plan win on raw breadth alone", () => {
      for (const plans of plansByAnchor.values()) {
        for (
          let index = 1;
          index < plans.length;
          index += 1
        ) {
          const better = plans[index - 1];
          const worse = plans[index];

          // If a lower-ranked plan is strictly larger AND at least as
          // expensive, breadth cannot be the reason it lost — some
          // substantive evidence dimension must separate them.
          if (
            worse.selectedTowerIds.length >
              better.selectedTowerIds.length &&
            worse.minimumNormalPackageCapital >=
              better.minimumNormalPackageCapital
          ) {
            expect(
              better.decision
                .anchorDefiningSynergyCount +
                better.decision
                  .anchorStrongSynergyCount +
                (better.decision
                  .coreDeveloped
                  ? 1
                  : 0),
            ).toBeGreaterThanOrEqual(
              worse.decision
                .anchorDefiningSynergyCount +
                worse.decision
                  .anchorStrongSynergyCount +
                (worse.decision.coreDeveloped
                  ? 1
                  : 0),
            );
          }
        }
      }
    });

    it("requires an explicit development reason for every underdeveloped post-core tower", () => {
      for (const plans of plansByAnchor.values()) {
        for (const plan of plans) {
          for (const audit of plan
            .normalPackageEconomics
            .postCoreTowerAudits) {
            if (
              audit.developmentStatus !==
              "underdeveloped"
            ) {
              continue;
            }

            expect(
              audit.explicitDevelopmentReasons
                .length,
            ).toBeGreaterThan(0);
            // The reason must be substantive, not "it costs money".
            expect(
              audit.explicitDevelopmentReasons.every(
                (reason) =>
                  !reason.startsWith(
                    "reduces-minimum-capital",
                  ),
              ),
            ).toBe(true);
          }
        }
      }
    });

    it("treats Quad L1 as developed and never underdeveloped", () => {
      for (const plans of plansByAnchor.values()) {
        for (const plan of plans) {
          for (const selected of plan
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
        }
      }
    });

    it("produces a deterministic ranked plan set", () => {
      for (const anchor of AUDITED_ANCHORS) {
        const rerun = rankAnchorBuildPlans(
          anchor,
          5,
        );
        expect(
          rerun.map((plan) => ({
            towers: plan.selectedTowerIds,
            capital:
              plan.minimumNormalPackageCapital,
          })),
        ).toEqual(
          plansByAnchor
            .get(anchor)!
            .map((plan) => ({
              towers: plan.selectedTowerIds,
              capital:
                plan.minimumNormalPackageCapital,
            })),
        );
      }
    });

    it("never rejects a mandatory core tower for being below Dual L3", () => {
      // Doctrine allows an intentional Buff L2 core target. A core tower
      // is classified core-target, never underdeveloped, whatever its
      // level.
      for (const plans of plansByAnchor.values()) {
        for (const plan of plans) {
          const coreIds = new Set(
            plan.baseline.package
              .selectedTowerIds,
          );

          for (const selected of plan
            .normalPackageEconomics
            .selectedTowers) {
            if (
              coreIds.has(selected.towerId)
            ) {
              expect(
                selected.developmentStatus,
              ).toBe("core-target");
            }
          }
        }
      }
    });
  },
);

// The Phase 5B golden behaviors (Ice/Lightning, Infernal, Laser/Phantom
// Zone, pair-only Polar/Disease) are asserted at the search level in
// tests/engine/normalPackageSearch.test.ts, which runs with Phase 5C
// economic dominance active. They are intentionally not re-asserted here
// against the truncated top-5 ranked set.
