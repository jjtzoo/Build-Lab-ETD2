import { NextResponse } from "next/server";

import {
  isCuratedAnchor,
} from "@/lib/domain/anchorPolicy";

import {
  getBestAnchorBuildPlan,
} from "@/lib/engine/buildPlanner";

export async function POST(
  request: Request,
) {
  const body =
    await request
      .json()
      .catch(() => null);

  const anchorTowerId =
    body?.anchorTowerId;

  if (
    typeof anchorTowerId !==
    "string"
  ) {
    return NextResponse.json(
      {
        error:
          "anchorTowerId is required.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !isCuratedAnchor(
      anchorTowerId,
    )
  ) {
    return NextResponse.json(
      {
        error:
          `Unsupported Build Lab anchor: ${anchorTowerId}`,
      },
      {
        status: 400,
      },
    );
  }

  const plan =
    getBestAnchorBuildPlan(
      anchorTowerId,
    );

  if (!plan) {
    return NextResponse.json(
      {
        error:
          `No legal Build Lab plan found for anchor: ${anchorTowerId}`,
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json({
    anchorTowerId:
      plan.anchorTowerId,

    allocation:
      plan.baseline
        .routeState
        .allocation,

    totalKeystones:
      plan.baseline
        .routeState
        .totalKeystones,

    additionalKeystones:
      plan.baseline
        .routeState
        .additionalKeystones,

    selectedTowerIds:
      plan.selectedTowerIds,

    optionalTowerId:
      plan.optionalTowerId,

    decision:
      plan.decision,

    coverage: {
      element:
        plan.evidence
          .coverage
          .element,

      damageShape:
        plan.evidence
          .coverage
          .damageShape,

      range:
        plan.evidence
          .coverage
          .range,
    },

    synergy: {
      applicable:
        plan.evidence
          .synergy
          .applicable,

      tensions:
        plan.evidence
          .synergy
          .tensions,
    },

    keystonePath:
      plan.keystonePath.map(
        (step) => ({
          element:
            step.transition
              .element,

          fromElementLevel:
            step.transition
              .fromElementLevel,

          toElementLevel:
            step.transition
              .toElementLevel,

          fromAllocation:
            step.transition
              .fromAllocation,

          toAllocation:
            step.transition
              .toAllocation,

          newlyUnlockedTowerIds:
            step.transition
              .newlyUnlockedTowerIds,

          deepenedTowerIds:
            step.transition
              .deepenedTowerIds,
        }),
      ),
  });
}