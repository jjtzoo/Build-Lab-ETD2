"use client";

import { useEffect, useState } from "react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import {
  ElementIcon,
  TowerIcon,
  roman,
} from "@/components/build-lab/primitives";
import { MechanicChip } from "@/components/build-lab/primitives";
import type { ElementName } from "@/lib/domain/elements";

export type BuildLabPreviewData = {
  anchorId: string;
  anchorName: string;
  package: readonly { id: string; name: string; level: number }[];
  synergyTags: readonly string[];
  coverage: readonly {
    defender: ElementName;
    multiplier: number;
    weak: boolean;
  }[];
  keystoneCount: number;
};

/**
 * The landing card for Build Lab, showing one anchor picked at random per
 * visit. Every anchor's preview is computed at build time (a recommendation
 * takes up to ~1.3s, too slow per request), and the pick happens after
 * mount so the static HTML and the first client render agree; the card
 * fades in once chosen rather than flashing one tower and swapping it.
 */
export function RandomBuildLabPreview({
  options,
  assets,
}: {
  options: readonly BuildLabPreviewData[];
  assets: BuildLabAssets;
}) {
  const [index, setIndex] = useState<number | null>(null);
  useEffect(() => {
    setIndex(Math.floor(Math.random() * options.length));
  }, [options.length]);
  if (!options.length) return null;
  return (
    <div className="lp-random" data-ready={index != null || undefined}>
      <BuildLabPreview data={options[index ?? 0]} assets={assets} />
    </div>
  );
}

export function BuildLabPreview({
  data,
  assets,
}: {
  data: BuildLabPreviewData;
  assets: BuildLabAssets;
}) {
  return (
    <div className="lp lp-buildlab">
      <div className="lp-row lp-head">
        <span className="lp-index mono">01</span>
        <TowerIcon
          towerId={data.anchorId}
          name={data.anchorName}
          assets={assets}
          size={34}
        />
        <div>
          <strong>{data.anchorName}</strong>
          <span className="lp-sub">
            Recommended package · {data.keystoneCount} keystones
          </span>
        </div>
      </div>

      <div className="lp-towers">
        {data.package.slice(0, 8).map((tower) => (
          <span key={tower.id} className="lp-tower">
            <TowerIcon
              towerId={tower.id}
              name={tower.name}
              assets={assets}
              size={26}
            />
            <b className="mono">{roman(tower.level)}</b>
          </span>
        ))}
      </div>

      <div className="lp-chips">
        {data.synergyTags.slice(0, 4).map((tag) => (
          <MechanicChip key={tag} tag={tag} label={tag} small />
        ))}
      </div>

      <div className="lp-coverage">
        {data.coverage.map((row) => (
          <span
            key={row.defender}
            className="lp-cov"
            data-weak={row.weak || undefined}
          >
            <ElementIcon
              element={row.defender}
              assets={assets}
              size={14}
            />
            <b className="mono">
              {row.multiplier === 0.5
                ? "½"
                : row.multiplier === 2
                  ? "2"
                  : "1"}
            </b>
          </span>
        ))}
      </div>
    </div>
  );
}
