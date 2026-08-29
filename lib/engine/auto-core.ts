import type { ElementName } from "@/lib/types";

import {
  allCoreCombinations,
} from "./core-search";

import {
  optimizeV8,
  type V8OptimizationResult,
} from "./v8-optimizer";

export interface AutoCoreResult {
  core: ElementName[];
  result: V8OptimizationResult;
}

export function optimizeAutoCore(
  anchor = "Auto",
): AutoCoreResult | null {
  let best: AutoCoreResult | null = null;

  for (const core of allCoreCombinations()) {
    const result = optimizeV8(
      core,
      anchor,
    );

    if (!result.winner) {
      continue;
    }

    if (
      best === null ||
      compareResults(result, best.result) > 0
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
  if (!left.winner && !right.winner) {
    return 0;
  }

  if (!left.winner) {
    return -1;
  }

  if (!right.winner) {
    return 1;
  }

  const leftScore =
    Number.isFinite(left.winner.fineScore)
      ? left.winner.fineScore
      : -Infinity;

  const rightScore =
    Number.isFinite(right.winner.fineScore)
      ? right.winner.fineScore
      : -Infinity;

  if (leftScore !== rightScore) {
    return leftScore - rightScore;
  }

  return (
    right.winner.towers.length -
    left.winner.towers.length
  );
}