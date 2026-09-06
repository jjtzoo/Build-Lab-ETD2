import { NextResponse } from "next/server";
import { isCuratedAnchor } from "@/lib/domain/anchorPolicy";
import { getTower } from "@/lib/domain/towerCatalog";
import { getBestAnchorBuildPlan } from "@/lib/engine/buildPlanner";
import { maxReachableTowerLevel } from "@/lib/engine/allocation";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const anchorTowerId = body?.anchorTowerId;
  if (typeof anchorTowerId !== "string") {
    return NextResponse.json(
      { error: "anchorTowerId is required." },
      { status: 400 },
    );
  }
  if (!isCuratedAnchor(anchorTowerId)) {
    return NextResponse.json(
      { error: `Unsupported Build Lab anchor: ${anchorTowerId}` },
      { status: 400 },
    );
  }
  try {
    const plan = getBestAnchorBuildPlan(anchorTowerId);
    if (!plan)
      return NextResponse.json(
        { error: "No legal build found for this anchor." },
        { status: 404 },
      );
    const allocation = plan.baseline.routeState.allocation;
    return NextResponse.json({
      anchorTowerId,
      allocation,
      totalKeystones: plan.baseline.routeState.totalKeystones,
      additionalKeystones: plan.baseline.routeState.additionalKeystones,
      selectedTowerIds: plan.selectedTowerIds,
      optionalTowerId: plan.optionalTowerId,
      decision: plan.decision,
      coverage: plan.evidence.coverage,
      synergy: {
        applicable: plan.evidence.synergy.applicable,
        tensions: plan.evidence.synergy.tensions,
      },
      roles: plan.baseline.package.roles,
      towers: plan.selectedTowerIds.map((id) => ({
        ...getTower(id),
        level: maxReachableTowerLevel(getTower(id), allocation),
      })),
      keystonePath: plan.keystonePath.map(({ transition }) => ({
        element: transition.element,
        fromElementLevel: transition.fromElementLevel,
        toElementLevel: transition.toElementLevel,
        fromAllocation: transition.fromAllocation,
        toAllocation: transition.toAllocation,
        newlyUnlockedTowerIds: transition.newlyUnlockedTowerIds,
        deepenedTowerIds: transition.deepenedTowerIds,
      })),
    });
  } catch (error) {
    console.error("Build Lab planning failed", error);
    return NextResponse.json(
      { error: "The build could not be planned. Please try again." },
      { status: 500 },
    );
  }
}
