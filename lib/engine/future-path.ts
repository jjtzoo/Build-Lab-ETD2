import type { BuildIntent } from "@/lib/engine/build-intent";
import {
  resolveBuildIntent,
  type ResolvedBuildIntent,
} from "@/lib/engine/build-intent-resolver";
import {
  rankLegalCandidatesWithResolvedIntent,
} from "@/lib/engine/candidate-ranking";
import {
  LOOKAHEAD_POLICY,
  PATH_CONFIDENCE_RANK,
} from "@/lib/engine/future-path-config";
import type {
  BuildState,
  FuturePath,
  FuturePathComparison,
  FuturePathExplanation,
  FuturePathRanking,
  FuturePathReason,
  RankedCandidate,
  RecommendationConfidence,
  RecommendationReason,
} from "@/lib/types";

function conservativePathConfidence(
  first: RecommendationConfidence,
  second: RecommendationConfidence | undefined,
): RecommendationConfidence {
  if (!second) return first;
  return PATH_CONFIDENCE_RANK[first] <= PATH_CONFIDENCE_RANK[second]
    ? first
    : second;
}

function pathValue(
  immediateValue: number,
  continuationValue: number | null,
): number {
  return immediateValue * LOOKAHEAD_POLICY.immediateWeight
    + (continuationValue ?? 0) * LOOKAHEAD_POLICY.futureDiscount;
}

function reasonsFor(
  step: FuturePathReason["step"],
  reasons: readonly RecommendationReason[],
): readonly FuturePathReason[] {
  return Object.freeze(reasons.map((reason) => Object.freeze({ step, reason })));
}

function explanationFor(
  first: RankedCandidate,
  second: RankedCandidate | null,
  continuationValue: number | null,
): FuturePathExplanation {
  return Object.freeze({
    immediate: `${first.candidate.towerName} has immediate contextual value ${first.contextualValue}.`,
    continuation: second
      ? `${second.candidate.towerName} is the best legal next candidate after ${first.candidate.towerName}, with contextual value ${continuationValue}.`
      : `No legal second candidate remains after ${first.candidate.towerName}; this is a valid one-step path.`,
    policy: `Path value = immediate value × ${LOOKAHEAD_POLICY.immediateWeight} + continuation value × ${LOOKAHEAD_POLICY.futureDiscount}.`,
  });
}

function createFuturePath(
  first: RankedCandidate,
  second: RankedCandidate | null,
): Omit<FuturePath, "rank"> {
  const continuationValue = second?.contextualValue ?? null;
  return Object.freeze({
    first,
    stateAfterFirst: first.change.simulatedState,
    second,
    stateAfterSecond: second?.change.simulatedState ?? null,
    continuationStatus: second ? "available" : "unavailable",
    immediateValue: first.contextualValue,
    continuationValue,
    pathValue: pathValue(first.contextualValue, continuationValue),
    confidence: conservativePathConfidence(first.confidence, second?.confidence),
    strengths: Object.freeze([
      ...reasonsFor("first", first.strengths),
      ...(second ? reasonsFor("second", second.strengths) : []),
    ]),
    tradeoffs: Object.freeze([
      ...reasonsFor("first", first.tradeoffs),
      ...(second ? reasonsFor("second", second.tradeoffs) : []),
    ]),
    warnings: Object.freeze([
      ...reasonsFor("first", first.warnings),
      ...(second ? reasonsFor("second", second.warnings) : []),
    ]),
    explanation: explanationFor(first, second, continuationValue),
  });
}

function comparePaths(
  left: Omit<FuturePath, "rank">,
  right: Omit<FuturePath, "rank">,
): number {
  return right.pathValue - left.pathValue
    || right.immediateValue - left.immediateValue
    || (right.continuationValue ?? Number.NEGATIVE_INFINITY)
      - (left.continuationValue ?? Number.NEGATIVE_INFINITY)
    || left.first.rank - right.first.rank;
}

function comparisonFor(
  immediateTopRecommendation: RankedCandidate | null,
  bestPath: FuturePath | null,
): FuturePathComparison {
  const immediateTopCandidate = immediateTopRecommendation?.candidate.towerName ?? null;
  const bestPathFirstCandidate = bestPath?.first.candidate.towerName ?? null;
  const differs = immediateTopCandidate !== bestPathFirstCandidate;

  const detail = !immediateTopCandidate || !bestPathFirstCandidate
    ? "No legal first-step candidate is available for bounded future-path evaluation."
    : differs
      ? `${bestPathFirstCandidate} has immediate value ${bestPath?.immediateValue}, continuation value ${bestPath?.continuationValue ?? "unavailable"}, and path value ${bestPath?.pathValue}; it exceeds the immediate top ${immediateTopCandidate} under the discounted path policy.`
      : `${immediateTopCandidate} remains first with immediate value ${bestPath?.immediateValue}, continuation value ${bestPath?.continuationValue ?? "unavailable"}, and path value ${bestPath?.pathValue}.`;

  return Object.freeze({
    immediateTopCandidate,
    bestPathFirstCandidate,
    differs,
    detail,
  });
}

/**
 * Bounded depth-two search. Each state is evaluated exclusively by the
 * existing contextual ranking engine; this module adds no game facts or
 * cross-step bonuses.
 */
export function rankFuturePathsWithResolvedIntent(
  state: BuildState,
  intent?: ResolvedBuildIntent,
): FuturePathRanking {
  const firstStepRanking = rankLegalCandidatesWithResolvedIntent(state, intent);
  const firstSteps = firstStepRanking.rankedCandidates.slice(0, LOOKAHEAD_POLICY.firstStepLimit);
  const paths = firstSteps
    .map((first) => {
      const secondStepRanking = rankLegalCandidatesWithResolvedIntent(
        first.change.simulatedState,
        intent,
      );
      return createFuturePath(first, secondStepRanking.topRecommendation);
    })
    .sort(comparePaths)
    .map((path, index) => Object.freeze({ ...path, rank: index + 1 }));
  const bestPath = paths[0] ?? null;

  return Object.freeze({
    firstStepLimit: LOOKAHEAD_POLICY.firstStepLimit,
    futureDiscount: LOOKAHEAD_POLICY.futureDiscount,
    immediateTopRecommendation: firstStepRanking.topRecommendation,
    paths: Object.freeze(paths),
    bestPath,
    comparison: comparisonFor(firstStepRanking.topRecommendation, bestPath),
  });
}

export function rankFuturePaths(
  state: BuildState,
  rawIntent?: BuildIntent,
): FuturePathRanking {
  return rankFuturePathsWithResolvedIntent(
    state,
    rawIntent ? resolveBuildIntent(rawIntent) : undefined,
  );
}
