import { describe, expect, it } from "vitest";

import type { Allocation } from "@/lib/types";

import {
  buildAllocationProfile,
} from "@/lib/engine/allocation-profile";

describe("buildAllocationProfile", () => {
  it("recognizes a concentrated allocation as depth-oriented", () => {
    const allocation: Allocation = [
      3,
      3,
      3,
      2,
      0,
      0,
    ];

    const profile =
      buildAllocationProfile(
        allocation,
      );

    expect(
      profile.activeElements,
    ).toBe(4);

    expect(
      profile.maxElementLevel,
    ).toBe(3);

    expect(
      profile.shape,
    ).toBe("DEPTH");
  });

  it("exposes dual depth information", () => {
    const allocation: Allocation = [
      3,
      3,
      3,
      2,
      0,
      0,
    ];

    const profile =
      buildAllocationProfile(
        allocation,
      );

    expect(
      profile.dualDepth.length,
    ).toBeGreaterThan(0);

    const maxDepth =
      Math.max(
        ...profile.dualDepth.map(
          (dual) =>
            dual.depth,
        ),
      );

    expect(
      maxDepth,
    ).toBeGreaterThanOrEqual(2);
  });

  it("recognizes a six-element allocation", () => {
    const allocation: Allocation = [
      2,
      2,
      2,
      2,
      2,
      1,
    ];

    const profile =
      buildAllocationProfile(
        allocation,
      );

    expect(
      profile.activeElements,
    ).toBe(6);

    expect(
      profile.shape,
    ).toBe("SIX_ELEMENT");
  });

  it("reports unlocked Tri and Quad ecosystem access", () => {
    const allocation: Allocation = [
      2,
      2,
      2,
      2,
      2,
      1,
    ];

    const profile =
      buildAllocationProfile(
        allocation,
      );

    expect(
      profile.triAccess,
    ).toBeGreaterThanOrEqual(0);

    expect(
      profile.quadAccess,
    ).toBeGreaterThanOrEqual(0);

    expect(
      profile.quadCount,
    ).toBe(
      profile.quadAccess,
    );
  });

  it("reports functional access from unlocked tower states", () => {
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

    expect(
      profile.functionalAccess.mainDPS,
    ).toBeGreaterThanOrEqual(0);

    expect(
      profile.functionalAccess.control,
    ).toBeGreaterThanOrEqual(0);

    expect(
      profile.functionalAccess.coverage,
    ).toBeGreaterThanOrEqual(0);

    expect(
      profile.functionalAccess.amplification,
    ).toBeGreaterThanOrEqual(0);
  });

  it("does not hard-ban structurally weak allocations", () => {
    const allocation: Allocation = [
      3,
      3,
      1,
      1,
      1,
      2,
    ];

    const profile =
      buildAllocationProfile(
        allocation,
      );

    expect(
      profile.allocation,
    ).toEqual(
      allocation,
    );

    expect(
      typeof profile
        .structuralWeakness
        .isWeak,
    ).toBe("boolean");
  });

  it("keeps the allocation unchanged in the profile", () => {
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

    expect(
      profile.allocation,
    ).toEqual(
      allocation,
    );
  });
});