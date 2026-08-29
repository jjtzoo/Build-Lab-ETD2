import type {
  CandidateEvaluation,
} from "./types";

import type {
  ElementName,
} from "@/lib/types";

import {
  evaluateAllocation,
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
): V8OptimizationResult {
  const evaluations: CandidateEvaluation[] = [];

  for (const allocation of legalAllocations(core)) {
    const legacyCandidate =
      evaluateAllocation(allocation);

    const evaluation =
      evaluateCandidate(
        allocation,
        core,
        legacyCandidate.selected,
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