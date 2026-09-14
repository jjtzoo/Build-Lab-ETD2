import type { Metadata } from "next";
import { MatchPlanView } from "@/components/match-plan/MatchPlan";
import { decodePortableBuild } from "@/lib/domain/portableBuild";

export const metadata: Metadata = {
  title: "Match Plan — Element TD 2 Build Lab",
  description: "Turn a build into a complete pre-game strategy with phase snapshots, camps, economy, coverage and a Co-pilot-ready action stream.",
};

export default async function MatchPlanPage({ searchParams }: { searchParams: Promise<{ b?: string }> }) {
  const { b } = await searchParams;
  return <MatchPlanView initialPlan={b ? decodePortableBuild(b) : null} />;
}
