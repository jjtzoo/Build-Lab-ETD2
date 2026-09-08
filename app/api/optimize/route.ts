import { NextResponse } from "next/server";
import { isCuratedAnchor } from "@/lib/domain/anchorPolicy";
import { buildRecommendationSetDto } from "@/lib/engine/buildRecommendationDto";

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
    const recommendationSet = buildRecommendationSetDto(anchorTowerId);

    if (recommendationSet.plans.length === 0) {
      return NextResponse.json(
        { error: "No legal build found for this anchor." },
        { status: 404 },
      );
    }

    return NextResponse.json(recommendationSet);
  } catch (error) {
    console.error("Build Lab planning failed", error);
    return NextResponse.json(
      { error: "The build could not be planned. Please try again." },
      { status: 500 },
    );
  }
}
