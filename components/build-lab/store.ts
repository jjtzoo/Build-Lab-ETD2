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
  }));

/**
 * The plan the whole page should render right now: the previewed plan
 * when one is hovered, otherwise the active plan. Never mutates state.
 */
export function resolveVisiblePlan(
  state: Pick<
    BuildLabState,
    | "recommendationSet"
    | "activePlanId"
    | "previewPlanId"
  >,
): PlanDto | null {
  const plans =
    state.recommendationSet?.plans ?? [];
  const id =
    state.previewPlanId ??
    state.activePlanId;
  return (
    plans.find(
      (plan) => plan.id === id,
    ) ?? null
  );
}
