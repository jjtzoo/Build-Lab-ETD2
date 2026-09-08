"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "motion/react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import type { ElementName } from "@/lib/domain/elements";
import type { Tower } from "@/lib/domain/tower";
import type { ElementAllocation } from "@/lib/domain/elements";
import type { PlanDto } from "@/lib/engine/buildRecommendationDto";
import {
  resolveVisiblePlan,
  useBuildLab,
} from "@/components/build-lab/store";

type Anchor = Tower & {
  level: number;
  shape: string;
  allocation: ElementAllocation;
};

const readable = (value: string) => value.replaceAll("-", " ");
const gold = (value: number) => `${value.toLocaleString()} g`;

function ElementIcon({
  element,
  assets,
  size = 22,
}: {
  element: ElementName;
  assets: BuildLabAssets;
  size?: number;
}) {
  const src = assets.elements[element];
  return src ? (
    <Image
      className="element-icon"
      src={src}
      alt=""
      width={size}
      height={size}
    />
  ) : (
    <span className="element-fallback" aria-hidden="true" />
  );
}

function TowerIcon({
  towerId,
  name,
  assets,
}: {
  towerId: string;
  name: string;
  assets: BuildLabAssets;
}) {
  const src = assets.towerIcons[towerId];
  return src ? (
    <Image className="tower-icon" src={src} alt="" width={64} height={64} />
  ) : (
    <span className="tower-icon tower-icon-fallback" aria-hidden="true">
      {name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)}
    </span>
  );
}

function TowerArt({
  tower,
  assets,
  decorative = false,
}: {
  tower: Pick<Tower, "id" | "name">;
  assets: BuildLabAssets;
  decorative?: boolean;
}) {
  const src = assets.towerForms[tower.id];
  return (
    <span className="tower-art">
      {src ? (
        <Image
          src={src}
          alt={decorative ? "" : `${tower.name} tower`}
          fill
          quality={90}
          sizes="(max-width: 767px) 168px, (max-width: 1199px) 230px, 264px"
          priority={tower.id === "laser"}
        />
      ) : (
        <span className="tower-art-fallback" aria-hidden="true">
          {tower.name.slice(0, 1)}
        </span>
      )}
    </span>
  );
}

function Recipe({
  elements,
  assets,
}: {
  elements: readonly ElementName[];
  assets: BuildLabAssets;
}) {
  return (
    <span className="recipe">
      {elements.map((element) => (
        <span key={element} data-element={element}>
          <ElementIcon element={element} assets={assets} />
          {element}
        </span>
      ))}
    </span>
  );
}

function CapitalPanel({ plan }: { plan: PlanDto }) {
  return (
    <div className="capital-panel">
      <dl>
        <div>
          <dt>Normal package</dt>
          <dd>{plan.package.length} towers</dd>
        </div>
        <div>
          <dt>Element allocation</dt>
          <dd>{plan.keystoneCount} keystones</dd>
        </div>
        <div>
          <dt>Essence uses</dt>
          <dd>{plan.essenceUses}</dd>
        </div>
        <div className="capital-figure" title="Minimum gold to field one copy of every tower in this build at the shown levels.">
          <dt>Minimum capital</dt>
          <dd>{gold(plan.minimumCapital.normal)}</dd>
        </div>
      </dl>
      {plan.minimumCapital.complete !== null && (
        <p className="capital-breakdown">
          Normal {gold(plan.minimumCapital.normal)} + End Game{" "}
          {gold(plan.minimumCapital.endgameAdded ?? 0)} ={" "}
          <strong>{gold(plan.minimumCapital.complete)}</strong> complete plan.
          Not expected total match spending.
        </p>
      )}
    </div>
  );
}

function ProgressionStrip({ plan }: { plan: PlanDto }) {
  return (
    <section className="progression-stages">
      <div className="section-heading">
        <h2>Build progression</h2>
        <span>No wave numbers — milestones only</span>
      </div>
      <ol>
        {plan.progression.map((stage) => (
          <li key={stage.stage} data-stage={stage.stage}>
            <div className="stage-head">
              <span className="stage-name">{stage.stage.replace("_", " ")}</span>
              <span className="stage-headline">{stage.headline}</span>
            </div>
            {stage.primaryAction && (
              <p className="stage-priority">
                <span className="priority-label">Highest priority</span>
                {stage.primaryAction}
              </p>
            )}
            <p className="stage-allocation">
              Keystones: <span className="mono">{stage.allocationAction}</span>
            </p>
            {stage.secondaryActions.length > 0 && (
              <p className="stage-secondary">
                Then: {stage.secondaryActions.join(" · ")}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function SynergyLayer({ plan }: { plan: PlanDto }) {
  if (plan.synergy.relations.length === 0) {
    return (
      <section className="synergy-groups">
        <h3>Synergy</h3>
        <p>No confirmed mechanic synergy in the current evidence.</p>
      </section>
    );
  }
  return (
    <section className="synergy-groups">
      <h3>Synergy</h3>
      <div className="synergy-tag-row">
        {plan.synergy.tags.map((tag) => (
          <span className="mechanic-tag" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      {plan.synergy.grouped.map((group) => (
        <div className="synergy-group" key={group.mechanicTag}>
          <h4>{group.mechanicTag}</h4>
          <ul>
            {group.relations.map((relation, i) => (
              <li key={i}>
                <strong>
                  {relation.providerName} → {relation.consumerName}
                </strong>
                {relation.availabilityTag !== "Persistent" && (
                  <span className="avail-tag">{relation.availabilityTag}</span>
                )}
                <p>{relation.text}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function EndGameSection({ plan }: { plan: PlanDto }) {
  const { best, secondBest } = plan.endGame;
  if (!best) {
    return (
      <section className="endgame-section">
        <h2>End Game Towers</h2>
        <p>This allocation has no legal complete two-use Essence package.</p>
      </section>
    );
  }
  const render = (
    label: string,
    pkg: NonNullable<PlanDto["endGame"]["best"]>,
  ) => (
    <article className="endgame-option">
      <header>
        <span className="endgame-label">{label}</span>
        <span>
          Essence uses: {pkg.essenceUses}/2 · added {gold(pkg.minimumAddedCapital)}
        </span>
      </header>
      <div className="endgame-towers">
        {pkg.towers.map((tower) => (
          <span className="endgame-tower" key={tower.towerId}>
            <strong>
              {tower.name}
              {tower.quantity > 1 ? ` ×${tower.quantity}` : ""}
            </strong>
            <span className="mono">
              {tower.sustainedDps.toLocaleString()} DPS
              {tower.aoe > 0 ? ` · ${tower.aoe} AoE` : ""} · rng {tower.range}
            </span>
            {tower.unresolvedFacts.length > 0 && (
              <span className="unresolved">
                unverified: {tower.unresolvedFacts.map(readable).join(", ")}
              </span>
            )}
          </span>
        ))}
      </div>
      <ul className="endgame-why">
        {pkg.why.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </article>
  );
  return (
    <section className="endgame-section">
      <h2>End Game Towers</h2>
      {render("Best option", best)}
      {secondBest && render("Second best", secondBest)}
    </section>
  );
}

function AlternativeDeck({
  alternatives,
}: {
  alternatives: readonly PlanDto[];
}) {
  const previewPlan = useBuildLab((s) => s.previewPlan);
  const openDetail = useBuildLab((s) => s.openAlternativeDetail);

  if (alternatives.length === 0) return null;

  return (
    <section className="alt-deck">
      <div className="section-heading">
        <h2>Alternative builds</h2>
        <span>Preview on hover · click for detail</span>
      </div>
      <div className="alt-deck-stack">
        {alternatives.map((plan) => {
          const cmp = plan.comparisonToRecommended;
          return (
            <button
              key={plan.id}
              className="alt-card"
              onMouseEnter={() => previewPlan(plan.id)}
              onMouseLeave={() => previewPlan(null)}
              onFocus={() => previewPlan(plan.id)}
              onBlur={() => previewPlan(null)}
              onClick={() => openDetail(plan.id)}
            >
              <span className="alt-rank">#{plan.rank}</span>
              <span className="alt-fingerprint mono">
                {Object.values(plan.allocation).join("-")}
              </span>
              <span className="alt-meta">
                {plan.package.length} towers · {gold(plan.minimumCapital.complete ?? plan.minimumCapital.normal)}
              </span>
              <span className="alt-labels">
                {(cmp?.labels ?? []).map((label) => (
                  <span className="derived-label" key={label}>
                    {label}
                  </span>
                ))}
                {(!cmp?.labels || cmp.labels.length === 0) && (
                  <span className="derived-label">Route variant</span>
                )}
              </span>
              {cmp && cmp.substitutions.added.length > 0 && (
                <span className="alt-subs">
                  swaps in {cmp.substitutions.added.join(", ")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AlternativeModal({
  plans,
  names,
}: {
  plans: readonly PlanDto[];
  names: Record<string, string>;
}) {
  void names;
  const isOpen = useBuildLab((s) => s.isAlternativeDetailOpen);
  const selectedId = useBuildLab((s) => s.selectedAlternativePlanId);
  const close = useBuildLab((s) => s.closeAlternativeDetail);
  const activate = useBuildLab((s) => s.activatePlan);
  const engineId = useBuildLab((s) => s.engineRecommendedPlanId);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const plan = plans.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    if (!isOpen) return;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  if (!isOpen || !plan) return null;
  const cmp = plan.comparisonToRecommended;

  return (
    <div
      className="alt-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="alt-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Alternative build ${plan.rank}`}
        tabIndex={-1}
        ref={dialogRef}
      >
        <header>
          <h2>
            Alternative #{plan.rank}
            {engineId === plan.id ? " (engine recommendation)" : ""}
          </h2>
          <button className="modal-close" onClick={close} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <p className="mono">
            Allocation {Object.values(plan.allocation).join("-")} ·{" "}
            {plan.package.length} towers ·{" "}
            {gold(plan.minimumCapital.complete ?? plan.minimumCapital.normal)}
          </p>

          {cmp && (
            <>
              <h3>Why different</h3>
              {cmp.improves.length > 0 && (
                <ul className="mod-improves">
                  {cmp.improves.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              )}
              {cmp.worsens.length > 0 && (
                <ul className="mod-worsens">
                  {cmp.worsens.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              )}
              <p className="mono">
                Capital {cmp.completeCapitalDelta >= 0 ? "+" : ""}
                {cmp.completeCapitalDelta.toLocaleString()} g · package{" "}
                {cmp.packageSizeDelta >= 0 ? "+" : ""}
                {cmp.packageSizeDelta}
              </p>
              {cmp.allocationDelta.length > 0 && (
                <p className="mono">
                  {cmp.allocationDelta
                    .map((d) => `${d.element} ${d.from}→${d.to}`)
                    .join(", ")}
                </p>
              )}
              {(cmp.substitutions.added.length > 0 ||
                cmp.substitutions.removed.length > 0) && (
                <p>
                  Substitutions: −{cmp.substitutions.removed.join(", ") || "none"}{" "}
                  / +{cmp.substitutions.added.join(", ") || "none"}
                </p>
              )}
            </>
          )}

          <h3>Tower package</h3>
          <ul className="mod-package">
            {plan.package.map((tower) => (
              <li key={tower.id}>
                {tower.name} L{tower.level}
                {tower.developmentStatus === "underdeveloped" ? " (below max)" : ""}
                {" — "}
                {tower.purpose}
              </li>
            ))}
          </ul>

          <h3>End Game</h3>
          {plan.endGame.best ? (
            <p>
              {plan.endGame.best.towers
                .map(
                  (t) =>
                    `${t.name}${t.quantity > 1 ? ` ×${t.quantity}` : ""}`,
                )
                .join(" + ")}{" "}
              — added {gold(plan.endGame.best.minimumAddedCapital)}
            </p>
          ) : (
            <p>No legal Essence package for this allocation.</p>
          )}
        </div>

        <footer>
          <button className="use-build-button" onClick={() => activate(plan.id)}>
            USE THIS BUILD
          </button>
        </footer>
      </div>
    </div>
  );
}

function PlanView({
  plan,
  assets,
}: {
  plan: PlanDto;
  assets: BuildLabAssets;
}) {
  return (
    <>
      <CapitalPanel plan={plan} />

      <p className="section-note">
        Levels show the maximum normal tower level reachable in this final
        allocation.
      </p>
      <div className="build-grid">
        {plan.package.map((tower) => (
          <article
            key={tower.id}
            className={`build-tower ${tower.isAnchor ? "build-anchor" : ""}`}
            data-development={tower.developmentStatus}
          >
            <div className="tower-top">
              <div className="roles">
                {tower.isAnchor && <span data-role="anchor">Anchor</span>}
                {tower.roles
                  .filter((role) => role !== "Main DPS")
                  .map((role) => (
                    <span key={role} data-role={role.toLowerCase().replace(" ", "-")}>
                      {role}
                    </span>
                  ))}
                {!tower.isAnchor && (
                  <span data-role="purpose">{tower.purpose}</span>
                )}
              </div>
              <strong className="level">LV {tower.level}</strong>
            </div>
            <div className="tower-identity">
              <TowerIcon towerId={tower.id} name={tower.name} assets={assets} />
              <h3>{tower.name}</h3>
            </div>
            <Recipe elements={tower.recipe} assets={assets} />
            {tower.synergyTags.length > 0 && (
              <div className="tower-synergy-tags">
                {tower.synergyTags.map((tag) => (
                  <span className="mechanic-tag small" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {tower.developmentReason && (
              <p className="dev-reason">{tower.developmentReason}</p>
            )}
            {tower.developmentStatus === "developed" &&
              tower.combination === "Quad" && (
                <p className="dev-reason ok">Quad L1 is fully developed.</p>
              )}
            <div className="tower-bottom">
              <span>{tower.combination}</span>
              <span data-element={tower.damageElement}>
                {tower.damageElement} damage
              </span>
              <span className="mono">{gold(tower.minimumFieldCost)}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="allocation-strip">
        <strong>Final allocation</strong>
        {Object.entries(plan.allocation).map(([element, level]) => (
          <span data-element={element} key={element}>
            <ElementIcon
              element={element as ElementName}
              assets={assets}
              size={24}
            />
            {element} <b>{level}</b>
          </span>
        ))}
      </div>

      <ProgressionStrip plan={plan} />

      <section className="why-section">
        <h2>Why this build</h2>
        <div className="evidence-layout">
          <section>
            <h3>Coverage</h3>
            <div className="coverage-table">
              <div className="coverage-row table-head">
                <span>Armor</span>
                <span>Anchor</span>
                <span>Build avg</span>
                <span>Status</span>
              </div>
              {plan.coverage.rows.map((row) => (
                <div className="coverage-row" key={row.defender}>
                  <span className="coverage-element" data-element={row.defender}>
                    <ElementIcon
                      element={row.defender}
                      assets={assets}
                      size={26}
                    />
                    <span>{row.defender}</span>
                  </span>
                  <span className="mono">{row.anchorMultiplier}×</span>
                  <span className="mono">
                    {row.packageAverageMultiplier.toFixed(2)}×
                  </span>
                  <span>
                    {!row.isAnchorWeakness
                      ? "—"
                      : row.covered
                        ? "Covered"
                        : "Weak, uncovered"}
                  </span>
                </div>
              ))}
            </div>
            <p>
              Damage shape:{" "}
              {plan.coverage.hasSingleTarget ? "single target" : "no single target"}
              ; {plan.coverage.hasAoe ? "area damage" : "no area damage"}.
            </p>
            <p>
              Offensive range{" "}
              <span className="mono">
                {plan.coverage.rangeMin}–{plan.coverage.rangeMax}
              </span>
              {plan.coverage.rangeExtensionFromAnchor > 0
                ? `, +${plan.coverage.rangeExtensionFromAnchor} beyond the anchor.`
                : ", no extension beyond the anchor."}
            </p>
          </section>

          <SynergyLayer plan={plan} />
        </div>

        {plan.tensions.length > 0 && (
          <section className="warnings">
            <h3>Tensions</h3>
            <ul>
              {plan.tensions.map((tension, i) => (
                <li key={i}>
                  <strong>
                    {tension.providerName} / {tension.affectedName}:
                  </strong>{" "}
                  {tension.condition}
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>

      <EndGameSection plan={plan} />
    </>
  );
}

export function BuildLab({
  anchors,
  names,
  assets,
}: {
  anchors: Anchor[];
  names: Record<string, string>;
  assets: BuildLabAssets;
}) {
  const reduce = useReducedMotion();
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const directionRef = useRef(1);

  const anchorId = useBuildLab((s) => s.anchorId);
  const requestState = useBuildLab((s) => s.requestState);
  const error = useBuildLab((s) => s.error);
  const recommendationSet = useBuildLab((s) => s.recommendationSet);
  const activePlanId = useBuildLab((s) => s.activePlanId);
  const previewPlanId = useBuildLab((s) => s.previewPlanId);
  const engineRecommendedPlanId = useBuildLab((s) => s.engineRecommendedPlanId);
  const setAnchor = useBuildLab((s) => s.setAnchor);
  const startRequest = useBuildLab((s) => s.startRequest);
  const failRequest = useBuildLab((s) => s.failRequest);
  const receiveRecommendationSet = useBuildLab(
    (s) => s.receiveRecommendationSet,
  );

  const index = Math.max(
    0,
    anchors.findIndex((a) => a.id === anchorId),
  );
  const anchor = anchors[index];

  const visiblePlan = useMemo(
    () =>
      resolveVisiblePlan({
        recommendationSet,
        activePlanId,
        previewPlanId,
      }),
    [recommendationSet, activePlanId, previewPlanId],
  );

  const alternatives = useMemo(
    () =>
      (recommendationSet?.plans ?? []).filter(
        (plan) => plan.id !== activePlanId,
      ),
    [recommendationSet, activePlanId],
  );

  useEffect(() => () => request.current?.abort(), []);

  function select(next: number) {
    request.current?.abort();
    sequence.current += 1;
    const normalized = (next + anchors.length) % anchors.length;
    const forwardDistance =
      (normalized - index + anchors.length) % anchors.length;
    if (forwardDistance !== 0) {
      directionRef.current = forwardDistance <= anchors.length / 2 ? 1 : -1;
    }
    setAnchor(anchors[normalized].id);
  }

  async function build() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = ++sequence.current;
    startRequest();
    try {
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anchorTowerId: anchor.id }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "The planner could not complete this build.",
        );
      if (current !== sequence.current) return;
      receiveRecommendationSet(data);
    } catch (err) {
      if (controller.signal.aborted || current !== sequence.current) return;
      failRequest(
        err instanceof Error
          ? err.message
          : "Connection failed. Please try again.",
      );
    }
  }

  const isPreviewing =
    previewPlanId !== null && previewPlanId !== activePlanId;
  const activePlan = (recommendationSet?.plans ?? []).find(
    (plan) => plan.id === activePlanId,
  );

  return (
    <main className="lab-shell" data-previewing={isPreviewing || undefined}>
      <a href="#build-result" className="skip-link">
        Skip to build result
      </a>
      <header className="lab-header">
        <Link href="/" className="wordmark">
          ELEMENT TD 2 <span>BUILD LAB</span>
        </Link>
        <span className="header-note">Strategy planner</span>
      </header>

      <div className="intro">
        <div>
          <p className="eyebrow">Build Lab</p>
          <h1>Start with your anchor.</h1>
          <p>Find its support. Plan the keystones. Understand the tradeoffs.</p>
        </div>
      </div>

      <section aria-label="Choose an anchor tower" className="anchor-section">
        <div className="selector-heading">
          <label htmlFor="anchor-picker">Anchor tower</label>
          <select
            id="anchor-picker"
            value={anchor.id}
            onChange={(event) =>
              select(anchors.findIndex((a) => a.id === event.target.value))
            }
          >
            {anchors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div
          className="carousel"
          role="region"
          aria-roledescription="carousel"
          aria-label="Anchor towers"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              select(index + (event.key === "ArrowLeft" ? -1 : 1));
            }
          }}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {[-1, 0, 1].map((offset) => {
              const item =
                anchors[(index + offset + anchors.length) % anchors.length];
              return (
                <motion.div
                  key={item.id}
                  layout={reduce ? false : "position"}
                  className="carousel-slot"
                  initial={reduce ? false : { opacity: 0, scale: 0.9 }}
                  animate={{
                    opacity: offset === 0 ? 1 : 0.7,
                    scale: offset === 0 ? 1 : 0.95,
                  }}
                  exit={reduce ? undefined : { opacity: 0, scale: 0.9 }}
                  transition={{ duration: reduce ? 0 : 0.2 }}
                >
                  {offset === 0 ? (
                    <article className="anchor-card selected" aria-live="polite">
                      <TowerArt tower={item} assets={assets} />
                      <div className="anchor-copy">
                        <div className="anchor-meta">
                          <span>Selected anchor</span>
                          <span className="level">LV {item.level}</span>
                        </div>
                        <div className="anchor-title">
                          <span className="tower-class">
                            {item.combination} tower
                          </span>
                          <h2>{item.name}</h2>
                        </div>
                        <Recipe elements={item.recipe} assets={assets} />
                        <div className="anchor-facts">
                          <span>{readable(item.shape)}</span>
                          <span>
                            Range <b>{item.stats.range}</b>
                          </span>
                          <span data-element={item.damageElement}>
                            {item.damageElement} damage
                          </span>
                        </div>
                      </div>
                    </article>
                  ) : (
                    <button
                      className={`anchor-card preview preview-${offset < 0 ? "left" : "right"}`}
                      onClick={() => select(index + offset)}
                      aria-label={`Select ${item.name}, level ${item.level}`}
                    >
                      <TowerArt tower={item} assets={assets} decorative />
                      <span className="anchor-meta">
                        {offset < 0 ? "Previous" : "Next"}
                        <span className="level">LV {item.level}</span>
                      </span>
                      <span className="preview-name">{item.name}</span>
                      <Recipe elements={item.recipe} assets={assets} />
                    </button>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
        <div className="carousel-controls">
          <button
            className="arrow-button"
            onClick={() => select(index - 1)}
            aria-label="Previous anchor"
          >
            ←
          </button>
          <span>
            {index + 1} / {anchors.length} anchors
          </span>
          <button
            className="arrow-button"
            onClick={() => select(index + 1)}
            aria-label="Next anchor"
          >
            →
          </button>
        </div>
        <p className="assumption">
          Starting assumption:{" "}
          {anchor.recipe
            .map((element) => `${element} ${anchor.allocation[element]}`)
            .join(" / ")}
          . A planning baseline, not your live-game allocation.
        </p>
        <button
          className="build-button"
          onClick={build}
          disabled={requestState === "loading"}
        >
          {requestState === "loading"
            ? `PLANNING ${anchor.name.toUpperCase()}…`
            : `BUILD AROUND ${anchor.name.toUpperCase()}`}
          <span aria-hidden="true">→</span>
        </button>
      </section>

      <section
        id="build-result"
        className="result-section"
        aria-busy={requestState === "loading"}
      >
        <div className="section-heading">
          <h2>Recommended build</h2>
          {recommendationSet && activePlan && (
            <span>
              Engine recommendation: #
              {(recommendationSet.plans.find(
                (p) => p.id === engineRecommendedPlanId,
              )?.rank) ?? 1}
              {activePlanId !== engineRecommendedPlanId && activePlan
                ? ` · Current build: #${activePlan.rank}`
                : ""}
            </span>
          )}
        </div>

        <div role="status" aria-live="polite" className="sr-only">
          {requestState === "loading"
            ? "Planning your build."
            : requestState === "ready"
              ? `Build ready for ${anchor.name}.`
              : ""}
        </div>

        {isPreviewing && (
          <div className="preview-banner" role="status">
            PREVIEWING ALTERNATIVE #
            {alternatives.find((p) => p.id === previewPlanId)?.rank}
          </div>
        )}

        {requestState === "empty" && (
          <div className="empty-state">
            <h3>Your anchor sets the direction.</h3>
            <p>
              Build around {anchor.name} to reveal its recommended towers,
              keystone route, and End Game options.
            </p>
          </div>
        )}

        {requestState === "loading" && (
          <div className="build-grid skeleton-grid" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div className="skeleton" key={i}>
                <span />
                <span />
                <span />
              </div>
            ))}
          </div>
        )}

        {requestState === "error" && (
          <div className="empty-state" role="alert">
            <h3>Could not plan this build</h3>
            <p>{error}</p>
            <button className="secondary-button" onClick={build}>
              Try again
            </button>
          </div>
        )}

        {requestState === "ready" && visiblePlan && (
          <>
            <AlternativeDeck alternatives={alternatives} />
            <PlanView plan={visiblePlan} assets={assets} />
          </>
        )}
      </section>

      {recommendationSet && (
        <AlternativeModal plans={recommendationSet.plans} names={names} />
      )}

      <footer>
        Element TD 2 Build Lab
        <span>
          Recommendations explain a plan. Placement and execution remain yours.
        </span>
      </footer>
    </main>
  );
}
