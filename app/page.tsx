import { BuildLab } from "@/components/build-lab/BuildLab";
import { resolveBuildLabAssets } from "@/components/build-lab/assetResolver";
import {
  CURATED_ANCHORS,
  getAnchorAssumedAllocation,
} from "@/lib/domain/anchorPolicy";
import { getTower, TOWERS } from "@/lib/domain/towerCatalog";
import { getTowerProfile } from "@/lib/domain/towerProfileCatalog";
import { maxReachableTowerLevel } from "@/lib/engine/allocation";

export default function Home() {
  const anchors = CURATED_ANCHORS.map(({ towerId }) => {
    const tower = getTower(towerId);
    return {
      ...tower,
      level: maxReachableTowerLevel(tower, getAnchorAssumedAllocation(towerId)),
      shape: getTowerProfile(towerId).offense?.damageShape ?? "",
      allocation: getAnchorAssumedAllocation(towerId),
    };
  });
  return (
    <BuildLab
      anchors={anchors}
      names={Object.fromEntries(TOWERS.map((tower) => [tower.id, tower.name]))}
      assets={resolveBuildLabAssets()}
    />
  );
}
