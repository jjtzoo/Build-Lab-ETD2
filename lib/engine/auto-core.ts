import type {
  ElementName,
} from "@/lib/types";

import {
  allCoreCombinations,
} from "./core-search";

import {
  optimizeV8,
  type V8OptimizationResult,
} from "./v8-optimizer";

import {
  getAllocationShortlist,
} from "./allocation-shortlist";

import {
  searchPackage,
} from "./package-search";

import {
  evaluateCandidate,
} from "./evaluator-run";

import {
  makeDecision,
} from "./decision-engine";

export interface AutoCoreResult {
  core: ElementName[];
  result: V8OptimizationResult;
}

const AUTO_ALLOCATION_LIMIT = 64;

export function optimizeAutoCore(
  anchor = "Auto",
): AutoCoreResult | null {
  let best:
    AutoCoreResult | null =
    null;

  for (
    const core of
    allCoreCombinations()
  ) {
    /*
     * Use the cheap allocation shortlist
     * before the expensive V8 evaluation.
     */
    const shortlist =
      getAllocationShortlist(
        core,
        anchor,
        AUTO_ALLOCATION_LIMIT,
      );

    /*
     * Reproduce optimizeV8's pipeline over
     * the shortlisted allocations only.
     *
     * Marginal analysis stays disabled while
     * Auto Core is searching all cores.
     */
    const evaluations = [];

    for (
      const allocation of
      shortlist
    ) {
      const packageResult =
        searchPackage(
          allocation,
          core,
          anchor,
        );

      if (
        !packageResult
      ) {
        continue;
      }

      evaluations.push(
        evaluateCandidate(
          allocation,
          core,
          packageResult.towers,
          anchor,
        ),
      );
    }

    const decision =
      makeDecision(
        evaluations,
      );

    const result:
      V8OptimizationResult = {
      winner:
        decision.winner,

      finalists:
        decision.finalists,

      evaluations,

      rationale:
        decision.rationale,

      marginalAnalysis:
        null,
    };

    if (
      !result.winner
    ) {
      continue;
    }

    if (
      best === null ||
      compareResults(
        result,
        best.result,
      ) > 0
    ) {
      best = {
        core,
        result,
      };
    }
  }

  return best;
}

function compareResults(
  left: V8OptimizationResult,
  right: V8OptimizationResult,
): number {
  if (
    !left.winner &&
    !right.winner
  ) {
    return 0;
  }

  if (
    !left.winner
  ) {
    return -1;
  }

  if (
    !right.winner
  ) {
    return 1;
  }

  const leftScore =
    Number.isFinite(
      left.winner
        .fineScore,
    )
      ? left.winner
          .fineScore
      : -Infinity;

  const rightScore =
    Number.isFinite(
      right.winner
        .fineScore,
    )
      ? right.winner
          .fineScore
      : -Infinity;

  if (
    leftScore !==
    rightScore
  ) {
    return (
      leftScore -
      rightScore
    );
  }

  return (
    right.winner
      .towers.length -
    left.winner
      .towers.length
  );
}