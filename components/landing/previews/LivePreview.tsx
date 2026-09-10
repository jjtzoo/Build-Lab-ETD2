"use client";

import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { ElementIcon, TowerIcon } from "@/components/build-lab/primitives";
import type { ElementName } from "@/lib/domain/elements";

const PICKS: readonly {
  element: ElementName;
  done: boolean;
}[] = [
  { element: "Light", done: true },
  { element: "Darkness", done: true },
  { element: "Earth", done: true },
  { element: "Light", done: true },
  { element: "Fire", done: false },
  { element: "Nature", done: false },
];

export function LivePreview({ assets }: { assets: BuildLabAssets }) {
  return (
    <div className="lp lp-live">
      <div className="lp-live-track">
        {PICKS.map((pick, index) => (
          <span
            key={index}
            className="lp-live-pick"
            data-done={pick.done || undefined}
            data-current={
              !pick.done && (index === 0 || PICKS[index - 1].done)
                ? true
                : undefined
            }
          >
            <ElementIcon
              element={pick.element}
              assets={assets}
              size={16}
            />
          </span>
        ))}
      </div>
      <p className="lp-live-wave mono">Wave 12 · 4 / 11 picks</p>

      <div className="lp-live-next">
        <span className="lp-live-next-label">Next move</span>
        <span className="lp-live-next-body">
          <TowerIcon
            towerId="nova"
            name="Nova"
            assets={assets}
            size={24}
          />
          Build <strong>Nova II</strong> — your Slow, now in reach
        </span>
      </div>
    </div>
  );
}
