import { describe, expect, it } from "vitest";

import type { TowerProfile } from "@/lib/domain/towerProfile";
import {
  countCoreRoles,
  getCoreRoleStatus,
  getNextMissingCoreRole,
  hasCompleteCorePackage,
} from "@/lib/engine/coreRoleDetection";

function profile(
  towerId: string,
  coreRoles: TowerProfile["coreRoles"],
): TowerProfile {
  return {
    towerId,
    coreRoles,
    mechanics: {
      provides: [],
      consumes: [],
    },
  };
}

describe("core role detection", () => {
  it("counts core roles correctly", () => {
    const profiles: TowerProfile[] = [
      profile("main-dps-a", ["main-dps"]),
      profile("main-dps-b", ["main-dps"]),
      profile("slow-a", ["slow"]),
      profile("amp-a", ["damage-amp"]),
      profile("buff-a", ["buff"]),
    ];

    expect(countCoreRoles(profiles)).toEqual({
      "main-dps": 2,
      slow: 1,
      "damage-amp": 1,
      buff: 1,
    });
  });

  it("returns the first missing role in planner priority order", () => {
    const profiles: TowerProfile[] = [
      profile("main-dps", ["main-dps"]),
      profile("buff", ["buff"]),
    ];

    expect(getNextMissingCoreRole(profiles)).toBe("slow");
  });

  it("reports status for every core role", () => {
    const profiles: TowerProfile[] = [
      profile("main-dps", ["main-dps"]),
      profile("slow", ["slow"]),
    ];

    expect(getCoreRoleStatus(profiles)).toEqual([
      {
        role: "main-dps",
        count: 1,
        minimum: 1,
        satisfied: true,
      },
      {
        role: "slow",
        count: 1,
        minimum: 1,
        satisfied: true,
      },
      {
        role: "damage-amp",
        count: 0,
        minimum: 1,
        satisfied: false,
      },
      {
        role: "buff",
        count: 0,
        minimum: 1,
        satisfied: false,
      },
    ]);
  });

  it("treats core role requirements as minimums, not maximums", () => {
    const profiles: TowerProfile[] = [
      profile("main-dps-a", ["main-dps"]),
      profile("main-dps-b", ["main-dps"]),
      profile("slow-a", ["slow"]),
      profile("slow-b", ["slow"]),
      profile("amp", ["damage-amp"]),
      profile("buff", ["buff"]),
    ];

    expect(hasCompleteCorePackage(profiles)).toBe(true);
    expect(getNextMissingCoreRole(profiles)).toBeNull();
  });

  it("detects an incomplete core package", () => {
    const profiles: TowerProfile[] = [
      profile("main-dps", ["main-dps"]),
      profile("slow", ["slow"]),
      profile("amp", ["damage-amp"]),
    ];

    expect(hasCompleteCorePackage(profiles)).toBe(false);
    expect(getNextMissingCoreRole(profiles)).toBe("buff");
  });
});