import type { Metadata } from "next";
import { BuildLab } from "@/components/build-lab/BuildLab";
import { resolveBuildLabAssets } from "@/components/build-lab/assetResolver";
import {
  CURATED_ANCHORS,
  getAnchorAssumedAllocation,
} from "@/lib/domain/anchorPolicy";
import { getTower, TOWERS } from "@/lib/domain/towerCatalog";
import { getTowerProfile } from "@/lib/domain/towerProfileCatalog";
import { maxReachableTowerLevel } from "@/lib/engine/allocation";

export const metadata: Metadata = {
  title: "Build Lab — Element TD 2",
  description:
    "Plan around your anchor tower. Explore recommended support, keystone routes, coverage, and synergy.",
};

// Rendered per request so each visit opens on a random anchor rather than
// always the same one. The anchor list itself is cheap to build.
export const dynamic = "force-dynamic";

export default function BuildLabPage() {
  const anchors = CURATED_ANCHORS.map(({ towerId }) => {
    const tower = getTower(towerId);
    const profile = getTowerProfile(towerId);
    return {
      ...tower,
      level: maxReachableTowerLevel(tower, getAnchorAssumedAllocation(towerId)),
      shape: profile.offense?.damageShape ?? null,
      profile: profile.offense?.damageProfile ?? null,
      delivery: profile.offense?.damageDelivery ?? null,
      scaling: profile.offense?.scalingTriggers ?? [],
      allocation: getAnchorAssumedAllocation(towerId),
    };
  });
  const initialAnchorId =
    anchors[Math.floor(Math.random() * anchors.length)]?.id;
  return (
    <BuildLab
      anchors={anchors}
      initialAnchorId={initialAnchorId}
      names={Object.fromEntries(TOWERS.map((tower) => [tower.id, tower.name]))}
      assets={resolveBuildLabAssets()}
    />
  );
}
