import type {
  CandidateEvaluation,
} from "./types";

import type {
  Allocation,
  ElementName,
} from "@/lib/types";

import {
  searchPackage,
} from "./package-search";

import {
  legalAllocations,
} from "./allocation";

import {
  evaluateCandidate,
} from "./evaluator-run";

import {
  compareCandidates,
  makeDecision,
} from "./decision-engine";

import {
  compareAllocationPointMove,
  type PointMove,
} from "./allocation-value";

export interface MarginalAllocationAnalysis {
  source: Allocation;

  moves: {
    move: PointMove;

    targetAllocation:
      Allocation;

    packageAvailable: boolean;

    packageScore:
      number | null;

    packageDelta:
      number | null;

    character:
      | "DEPTH_GAIN"
      | "ECOSYSTEM_EXPANSION"
      | "FUNCTIONAL_GAIN"
      | "TRADEOFF"
      | "NEUTRAL";

    evidence: string[];

    allocationEvidence:
      string[];
  }[];

  bestMove:
    | {
        move: PointMove;

        targetAllocation:
          Allocation;

        packageDelta:
          number;

        character:
          MarginalAllocationAnalysis["moves"][number]["character"];

        evidence:
          string[];

        allocationEvidence:
          string[];
      }
    | null;

  rationale: string[];
}

export interface V8OptimizationResult {
  winner:
    CandidateEvaluation | null;

  finalists:
    CandidateEvaluation[];

  evaluations:
    CandidateEvaluation[];

  rationale:
    string[];

  marginalAnalysis:
    MarginalAllocationAnalysis | null;
}

const MAX_MARGINAL_FINALISTS = 5;

function cloneAllocation(
  allocation: Allocation,
): Allocation {
  return [
    ...allocation,
  ] as Allocation;
}

function getPointMoves(
  allocation: Allocation,
): PointMove[] {
  const elements =
    [
      "Light",
      "Darkness",
      "Water",
      "Fire",
      "Nature",
      "Earth",
    ] as ElementName[];

  const moves: PointMove[] =
    [];

  for (
    const from of elements
  ) {
    const fromIndex =
      elements.indexOf(
        from,
      );

    if (
      allocation[fromIndex] <= 0
    ) {
      continue;
    }

    for (
      const to of elements
    ) {
      if (
        from === to
      ) {
        continue;
      }

      const toIndex =
        elements.indexOf(
          to,
        );

      if (
        allocation[toIndex] >= 3
      ) {
        continue;
      }

      moves.push({
        from,
        to,
      });
    }
  }

  return moves;
}

function applyPointMove(
  allocation: Allocation,
  move: PointMove,
): Allocation {
  const elements =
    [
      "Light",
      "Darkness",
      "Water",
      "Fire",
      "Nature",
      "Earth",
    ] as ElementName[];

  const fromIndex =
    elements.indexOf(
      move.from,
    );

  const toIndex =
    elements.indexOf(
      move.to,
    );

  const next =
    cloneAllocation(
      allocation,
    );

  next[fromIndex] -= 1;
  next[toIndex] += 1;

  return next;
}

function packageScore(
  candidate:
    CandidateEvaluation,
): number {
  return candidate.package.score;
}

function analyzeMarginalMoves(
  source:
    CandidateEvaluation,
  core: ElementName[],
  anchor: string,
): MarginalAllocationAnalysis {
  const moves =
    getPointMoves(
      source.allocation,
    );

  const analyzed:
    MarginalAllocationAnalysis["moves"] =
    [];

  /*
   * Only the winner receives full neighboring
   * allocation analysis. This function itself
   * is already called after the primary search.
   */
  for (
    const move of moves
  ) {
    const targetAllocation =
      applyPointMove(
        source.allocation,
        move,
      );

    const allocationComparison =
      compareAllocationPointMove(
        source.allocation,
        move,
      );

    const packageResult =
      searchPackage(
        targetAllocation,
        core,
        anchor,
      );

    if (
      !packageResult
    ) {
      analyzed.push({
        move,

        targetAllocation,

        packageAvailable:
          false,

        packageScore:
          null,

        packageDelta:
          null,

        character:
          allocationComparison
            .marginalValue
            .character,

        evidence: [
          ...allocationComparison
            .marginalEvidence,

          "No viable package was produced for the target allocation.",
        ],

        allocationEvidence:
          allocationComparison
            .marginalEvidence,
      });

      continue;
    }

    const targetEvaluation =
      evaluateCandidate(
        targetAllocation,
        core,
        packageResult.towers,
        anchor,
      );

    const delta =
      packageScore(
        targetEvaluation,
      ) -
      packageScore(
        source,
      );

    analyzed.push({
      move,

      targetAllocation,

      packageAvailable:
        true,

      packageScore:
        packageScore(
          targetEvaluation,
        ),

      packageDelta:
        delta,

      character:
        allocationComparison
          .marginalValue
          .character,

      evidence: [
        ...allocationComparison
          .marginalEvidence,

        `Target package score changed by ${delta.toFixed(2)}.`,
      ],

      allocationEvidence:
        allocationComparison
          .marginalEvidence,
    });
  }

  const available =
    analyzed
      .filter(
        (move) =>
          move.packageAvailable &&
          move.packageDelta !==
            null,
      )
      .sort(
        (a, b) =>
          (b.packageDelta ??
            -Infinity) -
          (a.packageDelta ??
            -Infinity),
      );

  const bestMove =
    available.length > 0
      ? {
          move:
            available[0].move,

          targetAllocation:
            available[0]
              .targetAllocation,

          packageDelta:
            available[0]
              .packageDelta!,

          character:
            available[0]
              .character,

          evidence:
            available[0]
              .evidence,

          allocationEvidence:
            available[0]
              .allocationEvidence,
        }
      : null;

  const rationale:
    string[] = [];

  if (
    bestMove
  ) {
    if (
      bestMove.packageDelta >
      0
    ) {
      rationale.push(
        `Best one-point alternative improves package score by ${bestMove.packageDelta.toFixed(2)}.`,
      );
    } else if (
      bestMove.packageDelta <
      0
    ) {
      rationale.push(
        `All evaluated one-point alternatives reduce the package score; the best alternative changes it by ${bestMove.packageDelta.toFixed(2)}.`,
      );
    } else {
      rationale.push(
        "The best evaluated one-point alternative leaves package score unchanged.",
      );
    }

    rationale.push(
      `Best move: ${bestMove.move.from} → ${bestMove.move.to}.`,
    );

    rationale.push(
      `Marginal character: ${bestMove.character}.`,
    );

    rationale.push(
      ...bestMove.allocationEvidence.slice(
        0,
        4,
      ),
    );
  } else {
    rationale.push(
      "No viable one-point neighboring allocation was found.",
    );
  }

  return {
    source:
      source.allocation,

    moves:
      analyzed,

    bestMove,

    rationale,
  };
}

function getBestObservedNeighborDelta(
  candidate: CandidateEvaluation,
  evaluations: CandidateEvaluation[],
): number | null {
  const elements: ElementName[] = [
    "Light",
    "Darkness",
    "Water",
    "Fire",
    "Nature",
    "Earth",
  ];

  const key = (
    allocation: Allocation,
  ) => allocation.join(",");

  const evaluationMap =
    new Map(
      evaluations.map(
        (evaluation) => [
          key(
            evaluation.allocation,
          ),
          evaluation,
        ],
      ),
    );

  let bestDelta:
    number | null = null;

  for (
    const from of elements
  ) {
    const fromIndex =
      elements.indexOf(from);

    if (
      candidate.allocation[
        fromIndex
      ] <= 0
    ) {
      continue;
    }

    for (
      const to of elements
    ) {
      if (
        from === to
      ) {
        continue;
      }

      const toIndex =
        elements.indexOf(to);

      if (
        candidate.allocation[
          toIndex
        ] >= 3
      ) {
        continue;
      }

      const target =
        [
          ...candidate.allocation,
        ] as Allocation;

      target[fromIndex] -= 1;
      target[toIndex] += 1;

      const neighbor =
        evaluationMap.get(
          key(target),
        );

      if (!neighbor) {
        continue;
      }

      const delta =
        neighbor.package.score -
        candidate.package.score;

      if (
        bestDelta === null ||
        delta > bestDelta
      ) {
        bestDelta = delta;
      }
    }
  }

  return bestDelta;
}

export function optimizeV8(
  core: ElementName[],
  anchor = "Auto",
  options: {
    includeMarginalAnalysis?: boolean;
  } = {},
): V8OptimizationResult {
  const includeMarginalAnalysis =
    options.includeMarginalAnalysis ??
    true;

  const evaluations:
    CandidateEvaluation[] =
    [];

  for (
    const allocation of
    legalAllocations(core)
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

    const evaluation =
      evaluateCandidate(
        allocation,
        core,
        packageResult.towers,
        anchor,
      );

    evaluations.push(
      evaluation,
    );
  }

  const decision =
    makeDecision(
      evaluations,
    );

  const refinedWinner =
    refineExactTiesWithMarginalValue(
      decision.winner,
      decision.finalists,
      evaluations,
    );

  const marginalAnalysis =
    includeMarginalAnalysis &&
    refinedWinner
      ? analyzeMarginalMoves(
          refinedWinner,
          core,
          anchor,
        )
      : null;

  const rationale = [
    ...decision.rationale,
  ];

  if (
    marginalAnalysis
  ) {
    rationale.push(
      "Marginal allocation analysis:",
    );

    rationale.push(
      ...marginalAnalysis.rationale,
    );
  }

  return {
    winner:
      refinedWinner,

    finalists:
      decision.finalists,

    evaluations,

    rationale,

    marginalAnalysis,
  };
}

function refineExactTiesWithMarginalValue(
    winner: CandidateEvaluation | null,
    finalists: CandidateEvaluation[],
    evaluations: CandidateEvaluation[],
  ): CandidateEvaluation | null {
    if (
      !winner ||
      finalists.length < 2
    ) {
      return winner;
    }

    let refinedWinner =
      winner;

    for (
      const candidate of finalists
    ) {
      if (
        candidate ===
        refinedWinner
      ) {
        continue;
      }

      /*
      * Only use marginal value when the existing
      * hierarchical decision considers both candidates
      * exactly equal.
      */
      if (
        compareCandidates(
          refinedWinner,
          candidate,
        ) !== 0
      ) {
        continue;
      }

      const currentDelta =
        getBestObservedNeighborDelta(
          refinedWinner,
          evaluations,
        );

      const candidateDelta =
        getBestObservedNeighborDelta(
          candidate,
          evaluations,
        );

      /*
      * No evaluated neighbor means no marginal
      * evidence, so leave the existing winner alone.
      */
      if (
        currentDelta === null &&
        candidateDelta === null
      ) {
        continue;
      }

      if (
        currentDelta === null
      ) {
        continue;
      }

      if (
        candidateDelta === null
      ) {
        refinedWinner =
          candidate;
        continue;
      }

      /*
      * Lower best-upside neighbor delta means the
      * current allocation is locally more settled.
      *
      * Example:
      *   A's best neighbor = +0.2
      *   B's best neighbor = +4.8
      *
      * A is the stronger locally-stable allocation
      * when everything else is tied.
      */
      if (
        candidateDelta <
        currentDelta
      ) {
        refinedWinner =
          candidate;
      }
    }

    return refinedWinner;
}