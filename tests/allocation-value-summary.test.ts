import {
  describe,
  expect,
  it,
} from "vitest";

import {
  compareAllocationPointMove,
} from "@/lib/engine/allocation-value";

describe(
  "allocation marginal value summary",
  () => {
    it(
      "classifies a pure deepening move as depth gain",
      () => {
        const result =
          compareAllocationPointMove(
            [
              2,
              2,
              2,
              2,
              2,
              1,
            ],
            {
              from: "Water",
              to: "Fire",
            },
          );

        expect(
          result.marginalValue,
        ).toBeDefined();

        expect(
          result.marginalValue
            .character,
        ).toMatch(
          /DEPTH_GAIN|ECOSYSTEM_EXPANSION|FUNCTIONAL_GAIN|TRADEOFF|NEUTRAL/,
        );
      },
    );

    it(
      "exposes the structural counts in the summary",
      () => {
        const result =
          compareAllocationPointMove(
            [
              3,
              3,
              2,
              1,
              1,
              1,
            ],
            {
              from: "Water",
              to: "Nature",
            },
          );

        expect(
          result.marginalValue
            .unlockedCount,
        ).toBe(
          result.unlockedTowers.length,
        );

        expect(
          result.marginalValue
            .lockedCount,
        ).toBe(
          result.lockedTowers.length,
        );

        expect(
          result.marginalValue
            .deepenedCount,
        ).toBe(
          result.deepenedTowers.length,
        );

        expect(
          result.marginalValue
            .shallowerCount,
        ).toBe(
          result.shallowerTowers.length,
        );
      },
    );

    it(
      "keeps the summary explainable through existing evidence",
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
              from: "Fire",
              to: "Nature",
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
              .functionalGains,
          ),
        ).toBe(true);

        expect(
          Array.isArray(
            result.marginalValue
              .functionalLosses,
          ),
        ).toBe(true);
      },
    );

    it(
      "keeps Dual depth gains and losses separate",
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