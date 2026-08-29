import {
  describe,
  expect,
  it,
} from "vitest";

import {
  optimizeV8,
} from "@/lib/engine/v8-optimizer";

describe(
  "V8 marginal allocation analysis",
  () => {
    it(
      "analyzes one-point alternatives for the winning allocation",
      () => {
        const result =
          optimizeV8(
            [
              "Darkness",
              "Earth",
              "Fire",
            ],
            "Howitzer",
          );

        expect(
          result.winner,
        ).not.toBeNull();

        expect(
          result.marginalAnalysis,
        ).not.toBeNull();

        const analysis =
          result.marginalAnalysis!;

        expect(
          analysis.source,
        ).toEqual(
          result.winner!.allocation,
        );

        expect(
          analysis.moves.length,
        ).toBeGreaterThan(0);
      },
    );

    it(
      "reports a best move only from evaluated viable package alternatives",
      () => {
        const result =
          optimizeV8(
            [
              "Darkness",
              "Earth",
              "Fire",
            ],
            "Howitzer",
          );

        const analysis =
          result.marginalAnalysis!;

        if (
          analysis.bestMove
        ) {
          const matchingMove =
            analysis.moves.find(
              (move) =>
                move.move.from ===
                  analysis.bestMove!
                    .move.from &&
                move.move.to ===
                  analysis.bestMove!
                    .move.to &&
                move.packageAvailable,
            );

          expect(
            matchingMove,
          ).toBeDefined();

          expect(
            matchingMove!.packageDelta,
          ).toBe(
            analysis.bestMove
              .packageDelta,
          );
        }
      },
    );

    it(
      "includes marginal findings in optimizer rationale",
      () => {
        const result =
          optimizeV8(
            [
              "Darkness",
              "Earth",
              "Fire",
            ],
            "Howitzer",
          );

        expect(
          result.rationale.some(
            (line) =>
              line.includes(
                "Marginal allocation analysis:",
              ),
          ),
        ).toBe(true);

        expect(
          result.rationale.some(
            (line) =>
              line.includes(
                "Best move:",
              ) ||
              line.includes(
                "No viable one-point neighboring allocation",
              ),
          ),
        ).toBe(true);
      },
    );
  },
);