import type {
  CandidateEvaluation,
} from "./types";

import {
  searchPackage,
} from "./package-search";

import type {
  ElementName,
} from "@/lib/types";

import {
  legalAllocations,
} from "./allocation";

import {
  evaluateCandidate,
} from "./evaluator-run";

import {
  makeDecision,
} from "./decision-engine";

export interface V8OptimizationResult {
  winner: CandidateEvaluation | null;
  finalists: CandidateEvaluation[];
  evaluations: CandidateEvaluation[];
  rationale: string[];
}

export function optimizeV8(
  core: ElementName[],
  anchor = "Auto",
): V8OptimizationResult {
  const evaluations: CandidateEvaluation[] = [];

  for (const allocation of legalAllocations(core)) {
    const packageResult =
      searchPackage(
        allocation,
        core,
        anchor,
      );

    if (!packageResult) {
      continue;
    }

    const evaluation =
      evaluateCandidate(
        allocation,
        core,
        packageResult.towers,
        anchor,
      );

    evaluations.push(evaluation);
  }

  const decision = makeDecision(
    evaluations,
  );

  return {
    winner: decision.winner,
    finalists: decision.finalists,
    evaluations,
    rationale: decision.rationale,
  };
}