import { describe, expect, it } from "vitest";
import type { Allocation } from "@/lib/types";

import { TOWERS } from "@/lib/data";

import {
  buildAllocationProfile,
} from "@/lib/engine/allocation-profile";

import {
  evaluatePackageRequirements,
} from "@/lib/engine/package-requirements";

import {
  buildTowerState,
} from "@/lib/engine/tower-state";

describe("evaluatePackageRequirements", () => {
  it("requires a Main DPS function", () => {
    const allocation: Allocation = [
      3,
      3,
      2,
      2,
      1,
      0,
    ];

    const profile =
      buildAllocationProfile(
        allocation,
      );

    const towers =
      profile.mainDPSTowers
        .map((name) =>
          TOWERS.find(
            (tower) =>
              tower.name === name,
          ),
        )
        .filter(
          (
            tower,
          ): tower is NonNullable<typeof tower> =>
            tower !== undefined,
        );

    expect(
      towers.length,
    ).toBeGreaterThan(0);

    const result =
      evaluatePackageRequirements(
        allocation,
        towers,
      );

    expect(
      result.satisfied.mainDPS,
    ).toBe(true);
  });

  it("recognizes Control or Coverage as the functional floor", () => {
    const allocation: Allocation = [
      3,
      3,
      2,
      2,
      1,
      0,
    ];

    const profile =
      buildAllocationProfile(
        allocation,
      );

    const names = [
      ...profile.controlTowers,
      ...profile.coverageTowers,
    ];

    const towers = names
      .map((name) =>
        TOWERS.find(
          (tower) =>
            tower.name === name,
        ),
      )
      .filter(
        (
          tower,
        ): tower is NonNullable<typeof tower> =>
          tower !== undefined,
      );

    expect(
      towers.length,
    ).toBeGreaterThan(0);

    const result =
      evaluatePackageRequirements(
        allocation,
        towers,
      );

    expect(
      result.satisfied.controlOrCoverage,
    ).toBe(true);

    expect(result.viable).toBe(true);
  });

  it("reports missing structural functions", () => {
    const allocation: Allocation = [
      3,
      3,
      2,
      2,
      1,
      0,
    ];

    const profile =
      buildAllocationProfile(
        allocation,
      );

    const mainTowerWithoutUtility =
      profile.mainDPSTowers
        .map((name) =>
          TOWERS.find(
            (tower) =>
              tower.name === name,
          ),
        )
        .filter(
          (
            tower,
          ): tower is NonNullable<typeof tower> =>
            tower !== undefined,
        )
        .find((tower) => {
          const state =
            buildTowerState(
              tower,
              allocation,
            );

          return (
            state.roles.control ===
              "None" &&
            state.roles.coverage ===
              "None"
          );
        });

    expect(
      mainTowerWithoutUtility,
    ).toBeDefined();

    const result =
      evaluatePackageRequirements(
        allocation,
        mainTowerWithoutUtility
          ? [mainTowerWithoutUtility]
          : [],
      );

    expect(
      result.satisfied.mainDPS,
    ).toBe(true);

    expect(
      result.satisfied.controlOrCoverage,
    ).toBe(false);

    expect(result.viable).toBe(false);

    expect(
      result.missing,
    ).toContain(
      "Control or Coverage",
    );
  });

  it("does not require amplification for viability", () => {
    const allocation: Allocation = [
      3,
      3,
      2,
      2,
      1,
      0,
    ];

    const profile =
      buildAllocationProfile(
        allocation,
      );

    const mainTower =
      TOWERS.find(
        (tower) =>
          tower.name ===
          profile.mainDPSTowers[0],
      );

    const controlTower =
      TOWERS.find(
        (tower) =>
          tower.name ===
          profile.controlTowers[0],
      );

    const towers = [
      mainTower,
      controlTower,
    ].filter(
      (
        tower,
      ): tower is NonNullable<typeof tower> =>
        tower !== undefined,
    );

    expect(towers.length).toBe(2);

    const result =
      evaluatePackageRequirements(
        allocation,
        towers,
      );

    expect(result.viable).toBe(true);
  });

  it("keeps provenance for explainability", () => {
    const allocation: Allocation = [
      3,
      3,
      2,
      2,
      1,
      0,
    ];

    const profile =
      buildAllocationProfile(
        allocation,
      );

    const towers =
      TOWERS.filter(
        (tower) =>
          profile.mainDPSTowers.includes(
            tower.name,
          ) ||
          profile.controlTowers.includes(
            tower.name,
          ),
      ).slice(0, 3);

    const result =
      evaluatePackageRequirements(
        allocation,
        towers,
      );

    expect(
      result.provenance,
    ).toContain(
      "TowerState role evidence",
    );
  });
});