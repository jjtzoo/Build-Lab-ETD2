import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  Allocation,
  ElementName,
} from "@/lib/types";

import {
  compareAllocationPointMove,
} from "@/lib/engine/allocation-value";

describe("compareAllocationPointMove", () => {
  it("moves exactly one point between two elements", () => {
    const allocation: Allocation = [
      3,
      3,
      2,
      2,
      1,
      0,
    ];

    const result =
      compareAllocationPointMove(
        allocation,
        {
          from: "Fire",
          to: "Nature",
        },
      );

    expect(result.before).toEqual(
      allocation,
    );

    expect(result.after).toEqual([
      3,
      3,
      2,
      1,
      2,
      0,
    ]);

    expect(
      result.after.reduce(
        (sum, value) =>
          sum + value,
        0,
      ),
    ).toBe(11);
  });

  it("records the source and destination elements", () => {
    const allocation: Allocation = [
      3,
      3,
      2,
      2,
      1,
      0,
    ];

    const result =
      compareAllocationPointMove(
        allocation,
        {
          from: "Fire",
          to: "Nature",
        },
      );

    expect(result.move).toEqual({
      from: "Fire",
      to: "Nature",
    });
  });

  it("reports actual tower state changes", () => {
    const allocation: Allocation = [
      3,
      3,
      3,
      2,
      0,
      0,
    ];

    const result =
      compareAllocationPointMove(
        allocation,
        {
          from: "Water",
          to: "Nature",
        },
      );

    expect(
      result.towerDeltas,
    ).toBeInstanceOf(Array);

    for (
      const delta of result.towerDeltas
    ) {
      expect(
        [
          "UNLOCKED",
          "LOCKED",
          "DEEPENED",
          "SHALLOWER",
        ],
      ).toContain(
        delta.kind,
      );

      expect(
        delta.beforeTier,
      ).toBeGreaterThanOrEqual(0);

      expect(
        delta.afterTier,
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it("exposes ecosystem changes", () => {
    const allocation: Allocation = [
      3,
      3,
      2,
      2,
      1,
      0,
    ];

    const result =
      compareAllocationPointMove(
        allocation,
        {
          from: "Fire",
          to: "Earth",
        },
      );

    expect(
      typeof result.ecosystem.before.quadCount,
    ).toBe("number");

    expect(
      typeof result.ecosystem.after.quadCount,
    ).toBe("number");

    expect(
      typeof result.ecosystem.delta.quadCount,
    ).toBe("number");

    expect(
      typeof result.ecosystem.delta.triAccess,
    ).toBe("number");
  });

  it("exposes Dual depth changes", () => {
    const allocation: Allocation = [
      3,
      3,
      2,
      2,
      1,
      0,
    ];

    const result =
      compareAllocationPointMove(
        allocation,
        {
          from: "Darkness",
          to: "Water",
        },
      );

    for (
      const change of result.dualDepthChanges
    ) {
      expect(
        change.elements.length,
      ).toBe(2);

      expect(
        change.beforeDepth,
      ).toBeGreaterThanOrEqual(0);

      expect(
        change.afterDepth,
      ).toBeGreaterThanOrEqual(0);

      expect(
        change.delta,
      ).toBe(
        change.afterDepth -
          change.beforeDepth,
      );
    }
  });

  it("produces explainable marginal evidence", () => {
    const allocation: Allocation = [
      3,
      3,
      2,
      2,
      1,
      0,
    ];

    const result =
      compareAllocationPointMove(
        allocation,
        {
          from: "Fire",
          to: "Nature",
        },
      );

    expect(
      result.marginalEvidence,
    ).toBeInstanceOf(Array);

    expect(
      result.provenance,
    ).toContain(
      "Allocation transition",
    );

    expect(
      result.provenance,
    ).toContain(
      "Allocation Profile",
    );
  });

  it("rejects removing a point from a zero-level element", () => {
    const allocation: Allocation = [
      3,
      3,
      2,
      2,
      1,
      0,
    ];

    expect(() =>
      compareAllocationPointMove(
        allocation,
        {
          from: "Earth",
          to: "Light",
        },
      ),
    ).toThrow(
      /current level is 0/,
    );
  });

  it("rejects adding a point to a level-3 element", () => {
    const allocation: Allocation = [
      3,
      3,
      2,
      2,
      1,
      0,
    ];

    expect(() =>
      compareAllocationPointMove(
        allocation,
        {
          from: "Nature",
          to: "Light",
        },
      ),
    ).toThrow(
      /already 3/,
    );
  });

  it("rejects moving a point to the same element", () => {
    const allocation: Allocation = [
      3,
      3,
      2,
      2,
      1,
      0,
    ];

    const elements: ElementName[] = [
      "Light",
      "Darkness",
      "Water",
      "Fire",
      "Nature",
      "Earth",
    ];

    for (const element of elements) {
      expect(() =>
        compareAllocationPointMove(
          allocation,
          {
            from: element,
            to: element,
          },
        ),
      ).toThrow(
        /must differ/,
      );
    }
  });
});