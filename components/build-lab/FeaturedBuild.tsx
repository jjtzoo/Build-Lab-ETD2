"use client";

import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import type { PlanDto } from "@/lib/engine/buildRecommendationDto";
import {
  ElementIcon,
  gold,
} from "@/components/build-lab/primitives";
import type { ElementName } from "@/lib/domain/elements";

export function FeaturedBuild({
  plan,
  activeRank,
  engineRank,
  isPreviewing,
  assets,
}: {
  plan: PlanDto;
  activeRank: number;
  engineRank: number;
  isPreviewing: boolean;
  assets: BuildLabAssets;
}) {
  return (
    <section className="lab-section featured-section">
      <div className="section-rail">
        <span className="section-index mono">02</span>
        <div>
          <h2>Recommended build</h2>
          <p>
            {isPreviewing
              ? `Previewing alternative #${activeRank}. Leave to return to the engine's pick.`
              : activeRank === engineRank
                ? "The strongest defensible plan for this Anchor under the current game rules."
                : `You're working with alternative #${activeRank}. The engine still recommends #${engineRank}.`}
          </p>
        </div>
      </div>

      <div
        className="featured-card"
        data-previewing={isPreviewing || undefined}
      >
        <span
          className="featured-glow"
          aria-hidden="true"
        />

        <div className="featured-summary">
          <div className="featured-summary-lead">
            <span className="featured-rank mono">
              {activeRank === engineRank
                ? "Engine pick · #1"
                : `Alternative · #${activeRank}`}
            </span>
            <span className="featured-alloc">
              {Object.entries(
                plan.allocation,
              ).map(([element, level]) => (
                <span
                  key={element}
                  data-element={element}
                  className="featured-alloc-cell"
                >
                  <ElementIcon
                    element={
                      element as ElementName
                    }
                    assets={assets}
                    size={17}
                  />
                  <b className="mono">{level}</b>
                </span>
              ))}
            </span>
          </div>

          <div className="featured-metrics">
            <div className="featured-metric">
              <span className="featured-metric-label">
                Minimum capital
              </span>
              <span className="featured-metric-value mono">
                {gold(
                  plan.minimumCapital.complete ??
                    plan.minimumCapital.normal,
                )}
              </span>
              <span className="featured-metric-sub">
                {plan.minimumCapital.complete !==
                null
                  ? `${gold(plan.minimumCapital.normal)} package + ${gold(plan.minimumCapital.endgameAdded ?? 0)} Essence`
                  : "normal package"}
              </span>
            </div>
            <div className="featured-metric">
              <span className="featured-metric-label">
                Normal package
              </span>
              <span className="featured-metric-value mono">
                {plan.package.length}
              </span>
              <span className="featured-metric-sub">
                tower types
              </span>
            </div>
            <div className="featured-metric">
              <span className="featured-metric-label">
                Element allocation
              </span>
              <span className="featured-metric-value mono">
                {plan.keystoneCount}
              </span>
              <span className="featured-metric-sub">
                keystones
              </span>
            </div>
            <div className="featured-metric">
              <span className="featured-metric-label">
                Essence
              </span>
              <span className="featured-metric-value mono">
                {plan.essenceUses}
              </span>
              <span className="featured-metric-sub">
                {plan.endGame.best
                  ? plan.endGame.best.towers
                      .map(
                        (t) =>
                          `${t.name}${t.quantity > 1 ? ` ×${t.quantity}` : ""}`,
                      )
                      .join(" + ")
                  : "no legal package"}
              </span>
            </div>
          </div>
        </div>

        <p className="featured-caption">
          Minimum capital is the gold to field one copy of every tower
          at the shown levels — not expected match spend.
        </p>
      </div>
    </section>
  );
}
