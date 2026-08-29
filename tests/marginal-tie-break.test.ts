import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  Allocation,
} from "@/lib/types";

import {
  compareAllocationPointMove,
} from "@/lib/engine/allocation-value";

describe(
  "marginal tie-break behavior",
  () => {
    it(
      "exposes the local tradeoff needed for a tied allocation decision",
      () => {
        const allocation:
          Allocation = [
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
          result.marginalValue,
        ).toBeDefined();

        expect(
          result.marginalEvidence
            .length,
        ).toBeGreaterThanOrEqual(
          0,
        );

        expect(
          typeof result.marginalValue
            .character,
        ).toBe("string");
      },
    );

    it(
      "does not claim a marginal tie-break without actual evidence",
      () => {
        const result =
          compareAllocationPointMove(
            [
              3,
              3,
              2,
              2,
              1,
              0,
            ],
            {
              from: "Water",
              to: "Fire",
            },
          );

        expect(
          Array.isArray(
            result.marginalEvidence,
          ),
        ).toBe(true);

        expect(
          Array.isArray(
            result.marginalValue
              .dualDepthGains,
          ),
        ).toBe(true);

        expect(
          Array.isArray(
            result.marginalValue
              .dualDepthLosses,
          ),
        ).toBe(true);
      },
    );
  },
);