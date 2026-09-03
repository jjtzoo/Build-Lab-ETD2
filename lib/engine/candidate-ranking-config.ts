import type { RecommendationCategory, RecommendationConfidence } from "@/lib/types";

export const CONTEXTUAL_RANKING_WEIGHTS = Object.freeze({
  vulnerabilityResolved: 8,
  vulnerabilityIntroduced: -7,
  primaryGapRelief: 6,
  supportingGapRelief: 3,
  strategicFit: 3,
  capabilityImprovement: 2,
  explicitSynergy: 2,
  elementalDirectionFit: 1,
  strategicOption: 1,
  lowMarginalRedundancy: -2,
  explicitAntiSynergy: -3,
  unmetNewRequirement: -2,
  constrainedSlotPressure: -2,
} as const);

/**
 * Intent is intentionally narrower than vulnerability and primary-gap relief.
 * Priority scales only preference components, never fact-based components.
 */
export const INTENT_RANKING_WEIGHTS = Object.freeze({
  profileAlignment: 4,
  capabilityAlignment: 3,
  focalTowerSupport: 3,
  focalTowerArchitectureSupport: 2,
  focalTowerConflict: -3,
  explorationOption: 1,
} as const);

export const INTENT_PRIORITY_MULTIPLIERS = Object.freeze({
  explore: 0.4,
  balanced: 0.75,
  "maximum-depth": 1,
} as const);

export const RANKING_CONFIDENCE_MULTIPLIERS = Object.freeze({
  high: 1,
  medium: 0.75,
  partial: 0.5,
  unknown: 0,
} satisfies Record<RecommendationConfidence, number>);

export const RECOMMENDATION_CATEGORY_THRESHOLDS = Object.freeze({
  highPriority: 8,
  strongFit: 5,
  useful: 2,
  situational: 0,
} as const);

export function recommendationCategoryFor(
  contextualValue: number,
): RecommendationCategory {
  if (contextualValue >= RECOMMENDATION_CATEGORY_THRESHOLDS.highPriority) {
    return "high-priority";
  }
  if (contextualValue >= RECOMMENDATION_CATEGORY_THRESHOLDS.strongFit) {
    return "strong-fit";
  }
  if (contextualValue >= RECOMMENDATION_CATEGORY_THRESHOLDS.useful) {
    return "useful";
  }
  if (contextualValue >= RECOMMENDATION_CATEGORY_THRESHOLDS.situational) {
    return "situational";
  }
  return "low-impact";
}
