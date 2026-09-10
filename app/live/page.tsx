import type { Metadata } from "next";
import { LiveTracker } from "@/components/live/LiveTracker";
import { resolveBuildLabAssets } from "@/components/build-lab/assetResolver";
import { decodePortableBuild } from "@/lib/domain/portableBuild";

export const metadata: Metadata = {
  title: "Live Tracking — Element TD 2 Build Lab",
  description:
    "Mirror your live Element TD 2 game: log element picks and towers, see what just came into reach, and follow your plan wave by wave.",
};

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string }>;
}) {
  const { b } = await searchParams;
  const initialPlan = b ? decodePortableBuild(b) : null;

  return (
    <LiveTracker
      assets={resolveBuildLabAssets()}
      initialPlan={initialPlan}
    />
  );
}
