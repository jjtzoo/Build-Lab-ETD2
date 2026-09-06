import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getAnchorRouteStates,
  getEarliestCoreFeasibleStates,
} from "@/lib/engine/anchorRouteStates";

import {
  getCorePackageCandidates,
  getDevelopedCorePackageCandidates,
} from "@/lib/engine/corePackageCandidates";

describe("core package candidates", () => {
  it("produces packages for an earliest core-feasible state", () => {
    const states =
      getEarliestCoreFeasibleStates(
        "laser",
      );

    expect(states.length)
      .toBeGreaterThan(0);

    const packages =
      getCorePackageCandidates(
        states[0],
      );

    expect(packages.length)
      .toBeGreaterThan(0);
  });

  it("keeps the selected anchor fixed in every package", () => {
    const state =
      getEarliestCoreFeasibleStates(
        "laser",
      )[0];

    expect(state)
      .toBeDefined();

    const packages =
      getCorePackageCandidates(
        state,
      );

    for (const candidate of packages) {
      expect(
        candidate.anchorTowerId,
      ).toBe("laser");

      expect(
        candidate.selectedTowerIds,
      ).toContain("laser");
    }
  });

  it("selects actual candidates for Slow, Damage Amp and Buff", () => {
    const state =
      getEarliestCoreFeasibleStates(
        "laser",
      )[0];

    expect(state)
      .toBeDefined();

    const packages =
      getCorePackageCandidates(
        state,
      );

    for (const candidate of packages) {
      expect(
        candidate.roles.map(
          (role) => role.role,
        ),
      ).toEqual([
        "slow",
        "damage-amp",
        "buff",
      ]);

      expect(
        candidate.roles.every(
          (role) =>
            role.candidates.length >
            0,
        ),
      ).toBe(true);
    }
  });

  it("only selects support towers that are available in the route state", () => {
    const state =
      getEarliestCoreFeasibleStates(
        "laser",
      )[0];

    expect(state)
      .toBeDefined();

    const availableIds =
      new Set(
        state.availableTowers.map(
          (entry) =>
            entry.tower.id,
        ),
      );

    const packages =
      getCorePackageCandidates(
        state,
      );

    for (const candidate of packages) {
      for (
        const towerId
        of candidate.supportTowerIds
      ) {
        expect(
          availableIds.has(
            towerId,
          ),
        ).toBe(true);
      }
    }
  });

  it("does not return duplicate selected support packages", () => {
    const state =
      getEarliestCoreFeasibleStates(
        "laser",
      )[0];

    expect(state)
      .toBeDefined();

    const packages =
      getCorePackageCandidates(
        state,
      );

    const keys =
      packages.map(
        (candidate) =>
          [...candidate.supportTowerIds]
            .sort()
            .join("|"),
      );

    expect(
      new Set(keys).size,
    ).toBe(keys.length);
  });

  it("returns no package for a state without a feasible core", () => {
    const state =
      getAnchorRouteStates(
        "laser",
      ).find(
        (candidate) =>
          !candidate.coreFeasible,
      );

    expect(state)
      .toBeDefined();

    expect(
      getCorePackageCandidates(
        state!,
      ),
    ).toEqual([]);
  });

  it("developed-package filtering agrees with package role evidence", () => {
    const state =
      getAnchorRouteStates(
        "laser",
      ).find(
        (candidate) =>
          candidate.coreDeveloped,
      );

    expect(state)
      .toBeDefined();

    const developed =
      getDevelopedCorePackageCandidates(
        state!,
      );

    expect(developed.length)
      .toBeGreaterThan(0);

    expect(
      developed.every(
        (candidate) =>
          candidate.coreDeveloped &&
          candidate.roles.every(
            (role) =>
              role.developed,
          ),
      ),
    ).toBe(true);
  });
});