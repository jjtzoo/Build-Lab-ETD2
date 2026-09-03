import type { RecommendationConfidence } from "@/lib/types";

/**
 * Search policy, not a game-performance model. Only the already-ranked top
 * first choices are evaluated, and one best legal continuation is considered.
 */
export const LOOKAHEAD_POLICY = Object.freeze({
  firstStepLimit: 8,
  immediateWeight: 1,
  futureDiscount: 0.5,
} as const);

export const PATH_CONFIDENCE_RANK: Readonly<Record<RecommendationConfidence, number>> = {
  unknown: 0,
  partial: 1,
  medium: 2,
  high: 3,
};
