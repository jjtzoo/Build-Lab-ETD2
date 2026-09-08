"use client";

import { motion, useReducedMotion } from "motion/react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import type {
  EndGamePackageDto,
  PackageTowerDto,
  PlanDto,
} from "@/lib/engine/buildRecommendationDto";
import { useBuildLab } from "@/components/build-lab/store";
import { resolveHighlight } from "@/components/build-lab/highlight";
import {
  MechanicTag,
  Recipe,
  StatusBadge,
  TowerIcon,
  gold,
  readable,
} from "@/components/build-lab/primitives";

function TowerCard({
  tower,
  assets,
  size = "supporting",
  delta,
}: {
  tower: PackageTowerDto;
  assets: BuildLabAssets;
  size?: "core" | "supporting";
  delta?: "leaving" | null;
}) {
  const reduce = useReducedMotion();
  const setHighlightTower = useBuildLab(
    (s) => s.setHighlightTower,
  );
  const highlightTowerId = useBuildLab(
    (s) => s.highlightTowerId,
  );
  const highlightMechanicTag = useBuildLab(
    (s) => s.highlightMechanicTag,
  );

  const active =
    highlightTowerId === tower.id ||
    (highlightMechanicTag !== null &&
      tower.synergyTags.includes(
        highlightMechanicTag,
      ));

  return (
    <motion.article
      className="tower-card"
      data-size={size}
      data-anchor={tower.isAnchor || undefined}
      data-development={tower.developmentStatus}
      data-active={active || undefined}
      data-delta={delta ?? undefined}
      data-element={tower.damageElement}
      initial={
        reduce ? false : { opacity: 0, y: 14 }
      }
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{
        duration: 0.4,
        ease: [0.16, 1, 0.3, 1],
      }}
      onMouseEnter={() =>
        setHighlightTower(tower.id)
      }
      onMouseLeave={() => setHighlightTower(null)}
      onFocus={() => setHighlightTower(tower.id)}
      onBlur={() => setHighlightTower(null)}
      tabIndex={0}
    >
      <span
        className="tower-card-sheen"
        aria-hidden="true"
      />
      {delta === "leaving" && (
        <span className="tower-card-delta">
          Replaced on this route
        </span>
      )}
      <header className="tower-card-top">
        <span className="tower-card-role">
          {tower.isAnchor
            ? "Anchor · Main DPS"
            : tower.roles.length > 0
              ? tower.roles.join(" · ")
              : tower.purpose}
        </span>
        <span className="tower-card-level mono">
          L{tower.level}
          <span className="tower-card-level-max">
            /{tower.maxLevel}
          </span>
        </span>
      </header>

      {tower.isProgressionPriority &&
        tower.progressionStage && (
          <span className="tower-card-priority">
            {tower.progressionStage} priority
          </span>
        )}

      <div className="tower-card-identity">
        <TowerIcon
          towerId={tower.id}
          name={tower.name}
          assets={assets}
          size={size === "core" ? 60 : 48}
        />
        <div>
          <h3>{tower.name}</h3>
          <span className="tower-card-class">
            {tower.combination}
          </span>
        </div>
      </div>

      <Recipe
        elements={tower.recipe}
        assets={assets}
      />

      {tower.synergyTags.length > 0 && (
        <div className="tower-card-tags">
          {tower.synergyTags.map((tag) => (
            <MechanicTag key={tag} tag={tag} small />
          ))}
        </div>
      )}

      {tower.developmentReason ? (
        <p className="tower-card-note">
          {tower.developmentReason}
        </p>
      ) : tower.developmentStatus ===
          "developed" &&
        tower.combination === "Quad" ? (
        <p className="tower-card-note ok">
          Quad L1 is fully developed.
        </p>
      ) : (
        <p className="tower-card-note muted">
          {tower.purpose}
        </p>
      )}

      <footer className="tower-card-rail">
        <span data-element={tower.damageElement}>
          {tower.damageElement} damage
        </span>
        <span className="mono">
          {gold(tower.minimumFieldCost)}
        </span>
      </footer>
    </motion.article>
  );
}

function EndGameOption({
  label,
  pkg,
  primary,
}: {
  label: string;
  pkg: EndGamePackageDto;
  primary: boolean;
}) {
  return (
    <article
      className="endgame-option"
      data-primary={primary || undefined}
    >
      <header className="endgame-option-head">
        <span className="endgame-option-label">
          {label}
        </span>
        <span className="mono endgame-option-cost">
          +{gold(pkg.minimumAddedCapital)}
        </span>
      </header>
      <div className="endgame-option-towers">
        {pkg.towers.map((tower) => (
          <div
            className="endgame-tower"
            key={tower.towerId}
          >
            <span className="endgame-tower-name">
              {tower.name}
              {tower.quantity > 1
                ? ` ×${tower.quantity}`
                : ""}
            </span>
            <span className="mono endgame-tower-stat">
              {tower.sustainedDps.toLocaleString()}{" "}
              DPS
              {tower.aoe > 0
                ? ` · ${tower.aoe} AoE`
                : ""}{" "}
              · rng {tower.range}
            </span>
            {tower.unresolvedFacts.length > 0 && (
              <span className="endgame-tower-unresolved">
                unverified:{" "}
                {tower.unresolvedFacts
                  .map(readable)
                  .join(", ")}
              </span>
            )}
          </div>
        ))}
      </div>
      <ul className="endgame-option-why">
        {pkg.why.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </article>
  );
}

export function TowerPackage({
  plan,
  previewPlan,
  assets,
}: {
  plan: PlanDto;
  previewPlan: PlanDto | null;
  assets: BuildLabAssets;
}) {
  const highlightTowerId = useBuildLab(
    (s) => s.highlightTowerId,
  );
  const highlightMechanicTag = useBuildLab(
    (s) => s.highlightMechanicTag,
  );
  const highlight = resolveHighlight(
    plan,
    highlightTowerId,
    highlightMechanicTag,
  );

  const underdeveloped = plan.package.filter(
    (tower) =>
      tower.developmentStatus ===
        "underdeveloped" && !tower.isAnchor,
  ).length;

  // Core comes straight from the engine's mandatory package; every other
  // selected tower stays visible in the supporting group. Nothing is cut.
  const core = plan.package.filter(
    (tower) => tower.isCore,
  );
  const supporting = plan.package.filter(
    (tower) => !tower.isCore,
  );

  // Towers this hovered alternative route would replace.
  const leaving = new Set(
    previewPlan?.comparisonToRecommended?.removedTowers.map(
      (tower) => tower.id,
    ) ?? [],
  );
  const arriving =
    previewPlan?.comparisonToRecommended
      ?.addedTowers ?? [];

  const renderCell = (
    tower: (typeof plan.package)[number],
    size: "core" | "supporting",
  ) => (
    <div
      key={tower.id}
      className="tower-deck-cell"
      data-dimmed={
        highlight.active &&
        highlight.isTowerDimmed(tower.id)
          ? true
          : undefined
      }
    >
      <TowerCard
        tower={tower}
        assets={assets}
        size={size}
        delta={
          leaving.has(tower.id)
            ? "leaving"
            : null
        }
      />
    </div>
  );

  return (
    <section className="lab-section package-section">
      <div className="section-rail">
        <span className="section-index mono">04</span>
        <div>
          <h2>Final tower package</h2>
          <p>
            All {plan.package.length} tower types in this route.{" "}
            {underdeveloped === 0
              ? "Every non-Anchor tower is at its class maximum or an intentional core target."
              : `${underdeveloped} tower${underdeveloped > 1 ? "s sit" : " sits"} below class max — each carries its reason.`}
          </p>
        </div>
      </div>

      {arriving.length > 0 && (
        <p className="package-delta-note">
          Route #{previewPlan?.rank} would bring in{" "}
          <strong>
            {arriving
              .map((tower) => tower.name)
              .join(", ")}
          </strong>
          .
        </p>
      )}

      <div
        className="package-groups"
        data-highlighting={
          highlight.active || undefined
        }
      >
        <div className="package-group">
          <div className="package-group-head">
            <h4>Core package</h4>
            <span>
              The towers that define this route.
            </span>
          </div>
          <div className="tower-deck" data-tier="core">
            {core.map((tower) =>
              renderCell(tower, "core"),
            )}
          </div>
        </div>

        {supporting.length > 0 && (
          <div className="package-group">
            <div className="package-group-head">
              <h4>Supporting package</h4>
              <span>
                Justified additions — coverage,
                synergy, and offensive
                complement.
              </span>
            </div>
            <div
              className="tower-deck"
              data-tier="supporting"
            >
              {supporting.map((tower) =>
                renderCell(tower, "supporting"),
              )}
            </div>
          </div>
        )}
      </div>

      <div className="endgame-block">
        <div className="endgame-block-head">
          <h3>End Game towers</h3>
          {plan.endGame.best && (
            <StatusBadge tone="info">
              Essence 2 / 2
            </StatusBadge>
          )}
        </div>
        {plan.endGame.best ? (
          <div className="endgame-options">
            <EndGameOption
              label="Best option"
              pkg={plan.endGame.best}
              primary
            />
            {plan.endGame.secondBest && (
              <EndGameOption
                label="Second best"
                pkg={plan.endGame.secondBest}
                primary={false}
              />
            )}
          </div>
        ) : (
          <p>
            This allocation has no legal complete two-use Essence
            package.
          </p>
        )}
      </div>
    </section>
  );
}
