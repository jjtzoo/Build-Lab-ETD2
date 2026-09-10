"use client";

import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { ElementIcon, roman } from "@/components/build-lab/primitives";
import { ELEMENTS, type ElementName } from "@/lib/domain/elements";
import { MAX_KEYSTONES } from "@/lib/engine/customBuild";

/**
 * The pinned running tally of element keystones the current build holds,
 * against the 11-keystone game budget.
 */
export function AllocationBar({
  allocation,
  used,
  assets,
}: {
  allocation: Record<ElementName, number>;
  used: number;
  assets: BuildLabAssets;
}) {
  const over = used > MAX_KEYSTONES;

  return (
    <div
      className="tc-alloc-bar"
      role="status"
      aria-label={`Element allocation: ${used} of ${MAX_KEYSTONES} keystones used`}
      data-over={over || undefined}
    >
      <div className="tc-alloc-elements">
        {ELEMENTS.map((element) => {
          const level = allocation[element] ?? 0;
          return (
            <span
              key={element}
              className="tc-alloc-pip"
              data-element={element}
              data-empty={level === 0 || undefined}
              title={`${element} ${level > 0 ? roman(level) : "—"}`}
            >
              <ElementIcon element={element} assets={assets} size={20} />
              <b className="mono">{level > 0 ? roman(level) : "·"}</b>
            </span>
          );
        })}
      </div>
      <div className="tc-alloc-count">
        <span className="tc-alloc-count-label">Keystones</span>
        <span className="mono tc-alloc-count-value">
          {used} / {MAX_KEYSTONES}
        </span>
      </div>
    </div>
  );
}
