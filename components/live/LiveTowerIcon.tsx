"use client";

import Image from "next/image";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { ElementIcon, TowerIcon } from "@/components/build-lab/primitives";
import type { EndGameTowerId } from "@/lib/domain/endGameTower";
import {
  getBasicTower,
  getMonoTower,
  isBasicTowerId,
  isMonoTowerId,
  type BasicTowerId,
  type MonoTowerId,
} from "@/lib/domain/auxiliaryTowers";
import { isEndGameTowerId, liveTowerName } from "@/lib/engine/liveGame";

/**
 * One icon for any tower the tracker can log — normal, mono, Arrow/Cannon,
 * or an end-game Pure/Periodic. Keeps the mono → basic → end-game → normal
 * fallback chain in a single place.
 */
export function LiveTowerIcon({
  towerId,
  assets,
  size = 26,
}: {
  towerId: string;
  assets: BuildLabAssets;
  size?: number;
}) {
  if (isMonoTowerId(towerId)) {
    return (
      <ElementIcon
        element={getMonoTower(towerId as MonoTowerId).element}
        assets={assets}
        size={size}
      />
    );
  }

  if (isBasicTowerId(towerId)) {
    return (
      <span
        className="live-tower-glyph"
        aria-hidden="true"
        style={{ width: size, height: size }}
      >
        {getBasicTower(towerId as BasicTowerId).name[0]}
      </span>
    );
  }

  if (isEndGameTowerId(towerId)) {
    const src = assets.endGameForms[towerId as EndGameTowerId];
    return src ? (
      <Image
        className="live-tower-endgame"
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    ) : (
      <span
        className="live-tower-glyph"
        aria-hidden="true"
        style={{ width: size, height: size }}
      >
        {liveTowerName(towerId)
          .split(" ")
          .map((part) => part[0])
          .join("")
          .slice(0, 2)}
      </span>
    );
  }

  return (
    <TowerIcon
      towerId={towerId}
      name={liveTowerName(towerId)}
      assets={assets}
      size={size}
    />
  );
}
