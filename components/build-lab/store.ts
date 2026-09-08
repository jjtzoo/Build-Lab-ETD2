"use client";

import { create } from "zustand";
import type {
  BuildRecommendationSetDto,
  PlanDto,
} from "@/lib/engine/buildRecommendationDto";

type RequestState =
  | "empty"
  | "loading"
  | "ready"
  | "error";

type BuildLabState = {
  anchorId: string;
  requestState: RequestState;
  error: string;

  recommendationSet:
    BuildRecommendationSetDto | null;

  /** The engine's rank-1 plan id. Never changes on user selection. */
  engineRecommendedPlanId: string | null;
  /** The plan the user has chosen to work with. */
  activePlanId: string | null;
  /** A plan being hovered/focused in the alternative deck, or null. */
  previewPlanId: string | null;
  /** The alternative whose detail modal is open, or null. */
  selectedAlternativePlanId: string | null;
  isAlternativeDetailOpen: boolean;

  /**
   * Cross-highlight focus. Set while a tower card or a synergy relation
   * is hovered/focused; drives dimming of unrelated content. Purely
   * presentational and never persisted.
   */
  highlightTowerId: string | null;
  highlightMechanicTag: string | null;

  setAnchor: (anchorId: string) => void;
  startRequest: () => void;
  failRequest: (message: string) => void;
  receiveRecommendationSet: (
    set: BuildRecommendationSetDto,
  ) => void;

  activatePlan: (planId: string) => void;
  previewPlan: (
    planId: string | null,
  ) => void;
  openAlternativeDetail: (
    planId: string,
  ) => void;
  closeAlternativeDetail: () => void;

  setHighlightTower: (
    towerId: string | null,
  ) => void;
  setHighlightMechanic: (
    tag: string | null,
  ) => void;
};

export const useBuildLab =
  create<BuildLabState>((set) => ({
    anchorId: "laser",
    requestState: "empty",
    error: "",
    recommendationSet: null,
    engineRecommendedPlanId: null,
    activePlanId: null,
    previewPlanId: null,
    selectedAlternativePlanId: null,
    isAlternativeDetailOpen: false,
    highlightTowerId: null,
    highlightMechanicTag: null,

    setAnchor: (anchorId) =>
      set({
        anchorId,
        requestState: "empty",
        error: "",
        recommendationSet: null,
        engineRecommendedPlanId: null,
        activePlanId: null,
        previewPlanId: null,
        selectedAlternativePlanId: null,
        isAlternativeDetailOpen: false,
      }),

    startRequest: () =>
      set({
        requestState: "loading",
        error: "",
      }),

    failRequest: (message) =>
      set({
        requestState: "error",
        error: message,
      }),

    receiveRecommendationSet: (
      recommendationSet,
    ) =>
      set({
        recommendationSet,
        requestState: "ready",
        error: "",
        engineRecommendedPlanId:
          recommendationSet.engineRecommendedPlanId,
        activePlanId:
          recommendationSet.engineRecommendedPlanId,
        previewPlanId: null,
        selectedAlternativePlanId: null,
        isAlternativeDetailOpen: false,
      }),

    // A user activation never rewrites engine ranking: only activePlanId
    // moves. The previous active plan returns to the alternative deck
    // automatically because the deck is derived from
    // `plans.filter(p => p.id !== activePlanId)`.
    activatePlan: (planId) =>
      set({
        activePlanId: planId,
        previewPlanId: null,
        isAlternativeDetailOpen: false,
        selectedAlternativePlanId: null,
      }),

    previewPlan: (planId) =>
      set({ previewPlanId: planId }),

    openAlternativeDetail: (planId) =>
      set({
        selectedAlternativePlanId: planId,
        isAlternativeDetailOpen: true,
      }),

    closeAlternativeDetail: () =>
      set({
        isAlternativeDetailOpen: false,
        selectedAlternativePlanId: null,
      }),

    setHighlightTower: (towerId) =>
      set({
        highlightTowerId: towerId,
        highlightMechanicTag: null,
      }),

    setHighlightMechanic: (tag) =>
      set({
        highlightMechanicTag: tag,
        highlightTowerId: null,
      }),
  }));

/**
 * The plan the page renders. Hovering an alternative route does NOT swap
 * this: previewing shows the delta against the active build instead of
 * replacing it, so "added" and "removed" stay unambiguous.
 */
export function resolveVisiblePlan(
  state: Pick<
    BuildLabState,
    "recommendationSet" | "activePlanId"
  >,
): PlanDto | null {
  return (
    state.recommendationSet?.plans.find(
      (plan) =>
        plan.id === state.activePlanId,
    ) ?? null
  );
}

/** The alternative route currently being hovered or focused, if any. */
export function resolvePreviewPlan(
  state: Pick<
    BuildLabState,
    | "recommendationSet"
    | "activePlanId"
    | "previewPlanId"
  >,
): PlanDto | null {
  if (
    !state.previewPlanId ||
    state.previewPlanId === state.activePlanId
  ) {
    return null;
  }
  return (
    state.recommendationSet?.plans.find(
      (plan) =>
        plan.id === state.previewPlanId,
    ) ?? null
  );
}
