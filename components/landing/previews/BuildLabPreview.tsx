"use client";

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
