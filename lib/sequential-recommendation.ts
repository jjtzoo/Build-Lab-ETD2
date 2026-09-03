import { interpretBuild } from "@/lib/engine/build-interpreter";
import type { BuildIntent } from "@/lib/engine/build-intent";
import { rankLegalCandidates } from "@/lib/engine/candidate-ranking";
import { rankFuturePaths } from "@/lib/engine/future-path";
import { explainNoLegalNextCandidate } from "@/lib/engine/legal-candidates";
import type {
  BuildState,
  FuturePath,
  FuturePathRanking,
  RankedCandidate,
  SequentialRecommendationResponse,
  SerializedFuturePath,
  SerializedFuturePathRanking,
  SerializedRankedCandidate,
} from "@/lib/types";

export const SEQUENTIAL_ENGINE_VERSION = "sequential-v1";

export function serializeCandidate(
  ranked: RankedCandidate,
): SerializedRankedCandidate {
  return Object.freeze({
    rank: ranked.rank,
    candidate: ranked.candidate,
    contextualValue: ranked.contextualValue,
    confidence: ranked.confidence,
    category: ranked.category,
    strengths: ranked.strengths,
    tradeoffs: ranked.tradeoffs,
    warnings: ranked.warnings,
    components: ranked.components,
    ...(ranked.intentAlignment ? { intentAlignment: ranked.intentAlignment } : {}),
  });
}

function serializeFuturePath(path: FuturePath): SerializedFuturePath {
  return Object.freeze({
    rank: path.rank,
    first: serializeCandidate(path.first),
    stateAfterFirst: path.stateAfterFirst,
    second: path.second ? serializeCandidate(path.second) : null,
    stateAfterSecond: path.stateAfterSecond,
    continuationStatus: path.continuationStatus,
    immediateValue: path.immediateValue,
    continuationValue: path.continuationValue,
    pathValue: path.pathValue,
    confidence: path.confidence,
    strengths: path.strengths,
    tradeoffs: path.tradeoffs,
    warnings: path.warnings,
    explanation: path.explanation,
  });
}

function serializeFuturePathRanking(
  ranking: FuturePathRanking,
): SerializedFuturePathRanking {
  const paths = Object.freeze(ranking.paths.map(serializeFuturePath));
  return Object.freeze({
    firstStepLimit: ranking.firstStepLimit,
    immediateWeight: ranking.immediateWeight,
    futureDiscount: ranking.futureDiscount,
    immediateTopRecommendation: ranking.immediateTopRecommendation
      ? serializeCandidate(ranking.immediateTopRecommendation)
      : null,
    paths,
    bestPath: paths[0] ?? null,
    comparison: ranking.comparison,
  });
}

export function createSequentialRecommendationResponse(
  state: BuildState,
  limit: number,
  intent?: BuildIntent,
  lookaheadEnabled = false,
): SequentialRecommendationResponse {
  const ranking = rankLegalCandidates(state, intent);
  const candidates = Object.freeze(
    ranking.rankedCandidates.slice(0, limit).map(serializeCandidate),
  );
  const topRecommendation = candidates[0] ?? null;
  const interpretation = interpretBuild(state);
  const noLegalCandidateReason = candidates.length === 0
    ? explainNoLegalNextCandidate(state)
    : null;

  return Object.freeze({
    engineVersion: SEQUENTIAL_ENGINE_VERSION,
    state,
    interpretation: Object.freeze({
      strategicProfiles: interpretation.strategicProfiles,
      vulnerabilities: interpretation.vulnerabilities,
      relevantGaps: Object.freeze(interpretation.gaps.filter((gap) => (
        gap.requirement !== null && gap.status !== "low-relevance"
      ))),
      compensations: interpretation.compensations,
    }),
    topRecommendation,
    candidates,
    warnings: Object.freeze(noLegalCandidateReason ? [noLegalCandidateReason.message] : []),
    noLegalCandidateReason,
    ...(ranking.intent ? { intent: ranking.intent } : {}),
    ...(lookaheadEnabled ? { lookahead: serializeFuturePathRanking(rankFuturePaths(state, intent)) } : {}),
  });
}
