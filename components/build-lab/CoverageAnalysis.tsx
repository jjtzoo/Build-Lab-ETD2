"use client";

import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import type { PlanDto } from "@/lib/engine/buildRecommendationDto";
import {
  ElementIcon,
  StatusBadge,
} from "@/components/build-lab/primitives";
import type { ElementName } from "@/lib/domain/elements";

function multiplierTone(value: number) {
  if (value >= 1.5) return "good";
  if (value <= 0.75) return "warn";
  return "neutral";
}

export function CoverageAnalysis({
  plan,
  assets,
}: {
  plan: PlanDto;
  assets: BuildLabAssets;
}) {
  return (
    <section className="lab-section coverage-section">
      <div className="section-rail">
        <span className="section-index mono">05</span>
        <div>
          <h2>Coverage analysis</h2>
          <p>
            How the whole offensive package performs against each armour
            type, next to the Anchor alone.
          </p>
        </div>
      </div>

      <div className="coverage-body">
        <div className="coverage-matrix">
          <div className="coverage-matrix-head">
            <span>Armour</span>
            <span>Anchor</span>
            <span>Build avg</span>
            <span />
          </div>
          {plan.coverage.rows.map((row) => (
            <div
              className="coverage-matrix-row"
              key={row.defender}
              data-weakness={
                row.isAnchorWeakness || undefined
              }
            >
              <span
                className="coverage-armour"
                data-element={row.defender}
              >
                <ElementIcon
                  element={
                    row.defender as ElementName
                  }
                  assets={assets}
                  size={22}
                />
                {row.defender}
              </span>
              <span className="mono coverage-anchor-mult">
                {row.anchorMultiplier}×
              </span>
              <span
                className="mono coverage-build-mult"
                data-tone={multiplierTone(
                  row.packageAverageMultiplier,
                )}
              >
                {row.packageAverageMultiplier.toFixed(
                  2,
                )}
                ×
              </span>
              <span className="coverage-status">
                {row.isAnchorWeakness ? (
                  row.covered ? (
                    <StatusBadge tone="good">
                      Covered
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="warn">
                      Weak · uncovered
                    </StatusBadge>
                  )
                ) : null}
              </span>
            </div>
          ))}
        </div>

        <div className="coverage-notes">
          <div className="coverage-note">
            <span className="coverage-note-label">
              Damage shape
            </span>
            <span>
              {[
                plan.coverage.hasSingleTarget
                  ? "single target"
                  : null,
                plan.coverage.hasAoe
                  ? "area damage"
                  : null,
              ]
                .filter(Boolean)
                .join(" + ") || "none"}
            </span>
          </div>
          <div className="coverage-note">
            <span className="coverage-note-label">
              Offensive range
            </span>
            <span className="mono">
              {plan.coverage.rangeMin}–
              {plan.coverage.rangeMax}
            </span>
            <span className="coverage-note-sub">
              {plan.coverage
                .rangeExtensionFromAnchor > 0
                ? `+${plan.coverage.rangeExtensionFromAnchor} beyond the Anchor`
                : "no extension beyond the Anchor"}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
