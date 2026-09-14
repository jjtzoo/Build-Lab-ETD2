import type { Metadata } from "next";
import { MatchPlanView } from "@/components/match-plan/MatchPlan";
import { decodePortableBuild } from "@/lib/domain/portableBuild";

export const metadata: Metadata = {
  title: "Match Plan — Element TD 2 Build Lab",
  description:
    "Compatibility route for Match Plan. Existing Live Tracker links and saved builds continue to open here.",
};

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string }>;
}) {
  const { b } = await searchParams;
  const initialPlan = b ? decodePortableBuild(b) : null;

  return <MatchPlanView initialPlan={initialPlan} />;
}
