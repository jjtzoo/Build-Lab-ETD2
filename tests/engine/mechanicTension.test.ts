import { describe, expect, it } from "vitest";

import type { TowerProfile } from "@/lib/domain/towerProfile";
import { findConditionalMechanicTensions } from "@/lib/engine/mechanicTension";

// Synthetic profiles isolate the rule from canonical tower data.
const isolationProvider: TowerProfile = {
  towerId: "isolation-provider",
  coreRoles: [],
  mechanics: {
    provides: [{ signal: "target-isolation", strength: 4 }],
    consumes: [],
  },
};

const densityConsumer: TowerProfile = {
  towerId: "density-consumer",
  coreRoles: ["main-dps"],
  offense: {
    damageShape: "aoe",
    damageProfile: "sustained",
    damageDelivery: "basic-attack",
    offensiveElement: "Water",
    scalingTriggers: ["density-scaling"],
  },
  mechanics: {
    provides: [],
    consumes: [],
  },
};

describe("findConditionalMechanicTensions", () => {
  it("reports isolation versus density as potential and conditional", () => {
    const result = findConditionalMechanicTensions([
      isolationProvider,
      densityConsumer,
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      providerTowerId: "isolation-provider",
      affectedTowerId: "density-consumer",
      signal: "target-isolation",
      affectedScalingTrigger: "density-scaling",
      relationshipType: "conditional",
      status: "potential",
    });
    expect(result[0].condition).toBeTruthy();
  });

  it("does not treat grouping as isolation", () => {
    const groupingProvider: TowerProfile = {
      ...isolationProvider,
      mechanics: {
        provides: [{ signal: "enemy-grouping", strength: 4 }],
        consumes: [],
      },
    };

    expect(
      findConditionalMechanicTensions([
        groupingProvider,
        densityConsumer,
      ]),
    ).toEqual([]);
  });

  it("does not infer density scaling from AoE alone", () => {
    const ordinaryAoe: TowerProfile = {
      ...densityConsumer,
      offense: {
        damageShape: "aoe",
        damageProfile: "sustained",
        damageDelivery: "basic-attack",
        offensiveElement: "Water",
      },
    };

    expect(
      findConditionalMechanicTensions([
        isolationProvider,
        ordinaryAoe,
      ]),
    ).toEqual([]);
  });

  it("handles a support tower without an offense profile", () => {
    const support: TowerProfile = {
      towerId: "support",
      coreRoles: ["buff"],
      mechanics: {
        provides: [],
        consumes: [],
      },
    };

    expect(
      findConditionalMechanicTensions([
        isolationProvider,
        support,
      ]),
    ).toEqual([]);
  });

  it("does not report a tower against itself", () => {
    const combinedProfile: TowerProfile = {
      ...densityConsumer,
      mechanics: isolationProvider.mechanics,
    };

    expect(
      findConditionalMechanicTensions([combinedProfile]),
    ).toEqual([]);
  });

  it("reports each affected tower separately", () => {
    const secondConsumer: TowerProfile = {
      ...densityConsumer,
      towerId: "second-density-consumer",
    };

    const result = findConditionalMechanicTensions([
      isolationProvider,
      densityConsumer,
      secondConsumer,
    ]);

    expect(result.map((entry) => entry.affectedTowerId)).toEqual([
      "density-consumer",
      "second-density-consumer",
    ]);
  });

  it("returns no tensions for an empty package", () => {
    expect(findConditionalMechanicTensions([])).toEqual([]);
  });
});