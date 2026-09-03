import { interpretBuild } from "@/lib/engine/build-interpreter";
import { rankLegalCandidates } from "@/lib/engine/candidate-ranking";
import type {
  BuildState,
  RankedCandidate,
  SequentialRecommendationResponse,
  SerializedRankedCandidate,
} from "@/lib/types";

export const SEQUENTIAL_ENGINE_VERSION = "sequential-v1";

function serializeCandidate(
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
  });
}

export function createSequentialRecommendationResponse(
  state: BuildState,
  limit: number,
): SequentialRecommendationResponse {
  const ranking = rankLegalCandidates(state);
  const candidates = Object.freeze(
    ranking.rankedCandidates.slice(0, limit).map(serializeCandidate),
  );
  const topRecommendation = candidates[0] ?? null;
  const interpretation = interpretBuild(state);

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
    warnings: Object.freeze(candidates.length === 0
      ? ["No legal next towers are available for the current build state."]
      : []),
  });
}
