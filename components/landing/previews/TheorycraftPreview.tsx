"use client";

import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { TowerIcon, roman } from "@/components/build-lab/primitives";
import { ElementIcon } from "@/components/build-lab/primitives";
import { getTower } from "@/lib/domain/towerCatalog";
import { ELEMENTS } from "@/lib/domain/elements";
import {
  deriveAllocation,
  totalKeystones,
  MAX_KEYSTONES,
} from "@/lib/engine/customBuild";

const BUILD = [
  { towerId: "mushroom", level: 3, role: "Anchor" },
  { towerId: "nova", level: 2, role: "Slow" },
  { towerId: "jinx", level: 1, role: "Damage Amp" },
] as const;

export function TheorycraftPreview({
  assets,
}: {
  assets: BuildLabAssets;
}) {
  const allocation = deriveAllocation(
    BUILD.map((entry) => ({
      towerId: entry.towerId,
      level: entry.level,
    })),
  );
  const used = totalKeystones(allocation);

  return (
    <div className="lp lp-theorycraft">
      <div className="lp-slots">
        {BUILD.map((entry) => {
          const tower = getTower(entry.towerId);
          return (
            <span key={entry.towerId} className="lp-slot">
              <TowerIcon
                towerId={entry.towerId}
                name={tower.name}
                assets={assets}
                size={26}
              />
              <span className="lp-slot-name">
                {tower.name}
                <b className="mono"> {roman(entry.level)}</b>
              </span>
              <span className="lp-slot-role">{entry.role}</span>
            </span>
          );
        })}
      </div>

      <div className="lp-alloc">
        {ELEMENTS.map((element) => {
          const level = allocation[element] ?? 0;
          return (
            <span
              key={element}
              className="lp-alloc-pip"
              data-empty={level === 0 || undefined}
            >
              <ElementIcon element={element} assets={assets} size={14} />
              <b className="mono">{level > 0 ? roman(level) : "·"}</b>
            </span>
          );
        })}
        <span className="lp-alloc-count mono">
          {used} / {MAX_KEYSTONES}
        </span>
      </div>
    </div>
  );
}
