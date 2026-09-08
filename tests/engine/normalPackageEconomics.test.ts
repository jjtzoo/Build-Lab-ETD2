import {
  describe,
  expect,
  it,
} from "vitest";

import {
  TOWERS,
} from "@/lib/domain/towerCatalog";

import {
  NORMAL_TOWER_COST_SEMANTICS,
  resolveNormalTowerCost,
} from "@/lib/domain/towerEconomics";

import {
  normalPackageCandidateDominates,
  type NormalPackageCandidate,
} from "@/lib/engine/normalPackageSearch";

import {
  minimumNormalPackageCapital,
  normalTowerDevelopmentStatus,
} from "@/lib/engine/normalPackageEconomics";

import {
  resolveTowerContribution,
} from "@/lib/engine/resolvedTowerContribution";

function candidate(
  overrides:
    Partial<NormalPackageCandidate> = {},
): NormalPackageCandidate {
  return {
    towerId: "well",
    reachableLevel: 1,
    directJustifications: [{
      key: "anchor:laser:attack-speed-buff",
      kind: "anchor-interaction",
    }],
    futureEndpointSignature: [
      "p:attack-speed-buff:4",
    ],
    meaningfulOffense: false,
    baseDps: 675,
    range: 1125,
    minimumFieldCost: 500,
    availabilityRank: 3,
    tensionDelta: 0,
    ...overrides,
  };
}

describe(
  "Phase 5C normal package economics",
  () => {
    it("resolves verified cumulative field costs directly", () => {
      expect(
        resolveNormalTowerCost(
          "well",
          3,
        ),
      ).toEqual({
        towerId: "well",
        level: 3,
        currency: "gold",
        costSemantics:
          NORMAL_TOWER_COST_SEMANTICS,
        minimumFieldCost: 3300,
      });

      expect(
        resolveNormalTowerCost(
          "laser",
          2,
        ).minimumFieldCost,
      ).toBe(5000);
      expect(
        resolveNormalTowerCost(
          "phantom-zone",
          1,
        ).minimumFieldCost,
      ).toBe(4250);
    });

    it("does not double-count earlier cumulative levels", () => {
      const contributions = [
        resolveTowerContribution(
          "well",
          3,
        ),
        resolveTowerContribution(
          "laser",
          2,
        ),
        resolveTowerContribution(
          "phantom-zone",
          1,
        ),
      ];

      expect(
        minimumNormalPackageCapital(
          contributions,
        ),
      ).toBe(12_550);
    });

    it("allows a strategically equivalent cheaper candidate to dominate", () => {
      const expensive = candidate({
        towerId: "life-altar",
        minimumFieldCost: 4250,
      });
      const cheap = candidate();

      expect(
        normalPackageCandidateDominates(
          cheap,
          expensive,
        ),
      ).toBe(true);
      expect(
        normalPackageCandidateDominates(
          expensive,
          cheap,
        ),
      ).toBe(false);
    });

    it("does not discard a more expensive candidate with stronger evidence", () => {
      const expensiveStrong =
        candidate({
          towerId: "life-altar",
          minimumFieldCost: 4250,
          baseDps: 10_000,
        });
      const cheap = candidate();

      expect(
        normalPackageCandidateDominates(
          cheap,
          expensiveStrong,
        ),
      ).toBe(false);
      expect(
        normalPackageCandidateDominates(
          expensiveStrong,
          cheap,
        ),
      ).toBe(false);
    });

    it("has no hard normal-package capital cap", () => {
      const everyNormalTowerAtMax =
        TOWERS.map((tower) =>
          resolveTowerContribution(
            tower.id,
            tower.maxLevel,
          ),
        );

      expect(
        minimumNormalPackageCapital(
          everyNormalTowerAtMax,
        ),
      ).toBe(213_250);
    });

    it("classifies Quad L1 as developed", () => {
      expect(
        normalTowerDevelopmentStatus(
          resolveTowerContribution(
            "phantom-zone",
            1,
          ),
          false,
        ),
      ).toBe("developed");
    });

    it("classifies a mandatory Buff L2 as a core target", () => {
      expect(
        normalTowerDevelopmentStatus(
          resolveTowerContribution(
            "well",
            2,
          ),
          true,
        ),
      ).toBe("core-target");
    });

    it("marks the same below-max Dual as underdeveloped outside the core", () => {
      expect(
        normalTowerDevelopmentStatus(
          resolveTowerContribution(
            "well",
            2,
          ),
          false,
        ),
      ).toBe("underdeveloped");
    });
  },
);
