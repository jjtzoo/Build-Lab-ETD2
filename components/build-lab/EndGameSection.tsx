"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";

import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import type {
  EndGamePackageDto,
  PlanDto,
} from "@/lib/engine/buildRecommendationDto";
import type { EndGameTowerId } from "@/lib/domain/endGameTower";
import { DamageShapeGlyph } from "@/components/build-lab/glyphs";
import { RangeDial, gold, readable } from "@/components/build-lab/primitives";

function EndGamePortrait({
  towerId,
  name,
  quantity,
  assets,
}: {
  towerId: string;
  name: string;
  quantity: number;
  assets: BuildLabAssets;
}) {
  const src =
    assets.endGameForms[towerId as EndGameTowerId] ?? null;
  return (
    <figure className="endgame-portrait">
      <span className="endgame-portrait-frame">
        {src ? (
          <Image
            src={src}
            alt={`${name} tower`}
            fill
            sizes="(max-width: 760px) 40vw, 200px"
            quality={88}
          />
        ) : (
          <span className="endgame-portrait-fallback" aria-hidden="true">
            {name.slice(0, 1)}
          </span>
        )}
        {quantity > 1 && (
          <span className="endgame-portrait-qty mono">×{quantity}</span>
        )}
      </span>
      <figcaption>{name}</figcaption>
    </figure>
  );
}

function EndGameOption({
  pkg,
  label,
  rank,
  anchorRange,
  assets,
}: {
  pkg: EndGamePackageDto;
  label: string;
  rank: "primary" | "secondary";
  anchorRange: number;
  assets: BuildLabAssets;
}) {
  const reduce = useReducedMotion();
  const headline = pkg.towers
    .map((t) => `${t.name}${t.quantity > 1 ? ` ×${t.quantity}` : ""}`)
    .join(" + ");
  const shapeKind = pkg.aoeCopies > 0 ? "aoe" : "single-target";
  const unresolved = [
    ...new Set(pkg.towers.flatMap((t) => t.unresolvedFacts)),
  ];

  return (
    <motion.article
      className="endgame-option"
      data-rank={rank}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="endgame-option-head">
        <span className="endgame-option-label">{label}</span>
        <span className="endgame-option-cost mono">
          +{gold(pkg.minimumAddedCapital)}
        </span>
      </header>

      <div className="endgame-option-body">
        <div className="endgame-portraits">
          {pkg.towers.map((tower) => (
            <EndGamePortrait
              key={tower.towerId}
              towerId={tower.towerId}
              name={tower.name}
              quantity={tower.quantity}
              assets={assets}
            />
          ))}
        </div>

        <div className="endgame-headline">
          <span className="endgame-headline-name">{headline}</span>
          <div className="endgame-stats">
            <div className="endgame-stat">
              <span className="endgame-stat-label">
                <DamageShapeGlyph kind={shapeKind} size={15} />
                Shape
              </span>
              <span className="endgame-stat-value">
                {pkg.aoeCopies > 0 ? "Area" : "Single target"}
              </span>
            </div>
            <div className="endgame-stat">
              <span className="endgame-stat-label">Sustained DPS</span>
              <span className="endgame-stat-value mono">
                {pkg.totalSustainedDps.toLocaleString()}
              </span>
              <span className="endgame-stat-sub">
                over {pkg.engagementSeconds}s
              </span>
            </div>
            {pkg.towers[0]?.aoe > 0 && (
              <div className="endgame-stat">
                <span className="endgame-stat-label">Splash</span>
                <span className="endgame-stat-value mono">
                  {pkg.towers[0].aoe}
                </span>
              </div>
            )}
            <div className="endgame-stat endgame-stat-range">
              <span className="endgame-stat-label">Range</span>
              <RangeDial
                range={pkg.maxRange}
                reference={anchorRange}
                referenceLabel="anchor"
                size={62}
              />
            </div>
          </div>
        </div>
      </div>

      <dl className="endgame-rationale">
        {pkg.rationale.map((row) => (
          <div className="endgame-rationale-row" key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.detail}</dd>
          </div>
        ))}
      </dl>

      {unresolved.length > 0 && (
        <p className="endgame-unresolved">
          Not counted as damage: {unresolved.map(readable).join(", ")}.
        </p>
      )}
    </motion.article>
  );
}

export function EndGameSection({
  plan,
  assets,
  index = "04",
}: {
  plan: PlanDto;
  assets: BuildLabAssets;
  index?: string;
}) {
  return (
    <section className="lab-section endgame-section">
      <div className="section-rail">
        <span className="section-index mono">{index}</span>
        <div>
          <h2>End Game destination</h2>
          <p>
            Where both Essence uses go. The engine optimises the two uses as
            one package — no duplicate penalty, no forced variety.
          </p>
        </div>
      </div>

      {plan.endGame.best ? (
        <div
          className="endgame-layout"
          data-single={plan.endGame.secondBest ? undefined : true}
        >
          <EndGameOption
            pkg={plan.endGame.best}
            label="Best endgame option"
            rank="primary"
            anchorRange={plan.coverage.anchorRange}
            assets={assets}
          />
          {plan.endGame.secondBest && (
            <EndGameOption
              pkg={plan.endGame.secondBest}
              label="Runner-up"
              rank="secondary"
              anchorRange={plan.coverage.anchorRange}
              assets={assets}
            />
          )}
        </div>
      ) : (
        <p className="endgame-empty">
          This allocation has no legal complete two-use Essence package.
        </p>
      )}
    </section>
  );
}
