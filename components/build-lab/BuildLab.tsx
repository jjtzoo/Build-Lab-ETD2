"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import type { ElementName } from "@/lib/domain/elements";
import type { Tower } from "@/lib/domain/tower";
import type { ElementAllocation } from "@/lib/domain/elements";
import type { PlannerDecision } from "@/lib/engine/buildPlanner";
import type { CorePackageEvidence } from "@/lib/engine/corePackageEvidence";
import type { CorePackageRoleEvidence } from "@/lib/engine/corePackageCandidates";

type Anchor = Tower & {
  level: number;
  shape: string;
  allocation: ElementAllocation;
};
type Step = {
  element: string;
  fromElementLevel: number;
  toElementLevel: number;
  newlyUnlockedTowerIds: string[];
  deepenedTowerIds: string[];
};
type Plan = {
  anchorTowerId: string;
  allocation: ElementAllocation;
  totalKeystones: number;
  additionalKeystones: number;
  selectedTowerIds: string[];
  optionalTowerId: string | null;
  towers: (Tower & { level: number })[];
  roles: CorePackageRoleEvidence[];
  decision: PlannerDecision;
  coverage: CorePackageEvidence["coverage"];
  synergy: Pick<CorePackageEvidence["synergy"], "applicable" | "tensions">;
  keystonePath: Step[];
};
const roleNames = { slow: "Slow", "damage-amp": "Damage Amp", buff: "Buff" };
const readable = (value: string) => value.replaceAll("-", " ");

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
  tower,
  assets,
}: {
  tower: Pick<Tower, "id" | "name">;
  assets: BuildLabAssets;
}) {
  const src = assets.towerIcons[tower.id];

  return src ? (
    <Image className="tower-icon" src={src} alt="" width={64} height={64} />
  ) : (
    <span className="tower-icon tower-icon-fallback" aria-hidden="true">
      {tower.name
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
          sizes="(max-width: 767px) 55vw, (max-width: 1200px) 34vw, 390px"
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

export function BuildLab({
  anchors,
  names,
  assets,
}: {
  anchors: Anchor[];
  names: Record<string, string>;
  assets: BuildLabAssets;
}) {
  const [index, setIndex] = useState(() =>
    anchors.findIndex((a) => a.id === "laser"),
  );
  const [plan, setPlan] = useState<Plan | null>(null);
  const [state, setState] = useState<"empty" | "loading" | "ready" | "error">(
    "empty",
  );
  const [error, setError] = useState("");
  const [direction, setDirection] = useState(1);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const reduce = useReducedMotion();
  const anchor = anchors[index];
  useEffect(() => () => request.current?.abort(), []);
  function select(next: number) {
    request.current?.abort();
    sequence.current += 1;
    const normalized = (next + anchors.length) % anchors.length;
    const forwardDistance =
      (normalized - index + anchors.length) % anchors.length;
    if (forwardDistance !== 0) {
      setDirection(forwardDistance <= anchors.length / 2 ? 1 : -1);
    }
    setIndex(normalized);
    setPlan(null);
    setState("empty");
    setError("");
  }
  async function build() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = ++sequence.current;
    setState("loading");
    setPlan(null);
    setError("");
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
      setPlan(data);
      setState("ready");
    } catch (err) {
      if (controller.signal.aborted || current !== sequence.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "Connection failed. Please try again.",
      );
      setState("error");
    }
  }
  const nameList = (ids: string[]) =>
    ids.map((id) => names[id] ?? id).join(", ");
  const baselineAllocation =
    anchors.find((item) => item.id === plan?.anchorTowerId)?.allocation ??
    anchor.allocation;
  const carouselTransition = reduce
    ? { duration: 0 }
    : {
        layout: {
          type: "spring" as const,
          stiffness: 230,
          damping: 27,
          mass: 1.08,
        },
        opacity: { duration: 0.2 },
        scale: {
          type: "spring" as const,
          stiffness: 250,
          damping: 26,
          mass: 1.05,
        },
        x: {
          type: "spring" as const,
          stiffness: 230,
          damping: 27,
          mass: 1.08,
        },
      };
  const transitionText = (step: Step) => {
    const unlocked = step.newlyUnlockedTowerIds.filter((id) =>
      plan?.selectedTowerIds.includes(id),
    );
    const deepened = step.deepenedTowerIds.filter((id) =>
      plan?.selectedTowerIds.includes(id),
    );
    return (
      [
        unlocked.length ? `Unlocks ${nameList(unlocked)}.` : "",
        deepened.length ? `Raises reachable level: ${nameList(deepened)}.` : "",
      ]
        .filter(Boolean)
        .join(" ") || "Advances the allocation toward the selected build."
    );
  };
  return (
    <main className="lab-shell">
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
        <div className="mode-note">
          <strong>Guided planning</strong>
          <span>What If, the manual sandbox, is coming later.</span>
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
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              select(index + (event.key === "ArrowLeft" ? -1 : 1));
            }
          }}
          tabIndex={0}
        >
          <AnimatePresence initial={false} mode="popLayout" custom={direction}>
            {[-1, 0, 1].map((offset) => {
              const item =
                anchors[(index + offset + anchors.length) % anchors.length];
              const motionState = reduce
                ? undefined
                : {
                    initial: {
                      opacity: 0,
                      x: direction * 88,
                      scale: 0.88,
                    },
                    animate: {
                      opacity: offset === 0 ? 1 : 0.62,
                      x: 0,
                      scale: offset === 0 ? 1 : 0.92,
                    },
                    exit: {
                      opacity: 0,
                      x: direction * -88,
                      scale: 0.86,
                    },
                  };

              return offset === 0 ? (
                <motion.article
                  key={item.id}
                  layout
                  layoutId={`anchor-${item.id}`}
                  className="anchor-card selected"
                  initial={motionState?.initial ?? false}
                  animate={motionState?.animate}
                  exit={motionState?.exit}
                  transition={carouselTransition}
                  aria-live="polite"
                >
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
                </motion.article>
              ) : (
                <motion.button
                  key={item.id}
                  layout
                  layoutId={`anchor-${item.id}`}
                  className={`anchor-card preview preview-${offset < 0 ? "left" : "right"}`}
                  initial={motionState?.initial ?? false}
                  animate={motionState?.animate}
                  exit={motionState?.exit}
                  transition={carouselTransition}
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
                </motion.button>
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
          . This is a planning baseline, not your live-game allocation.
        </p>
        <motion.button
          className="build-button"
          whileTap={reduce ? undefined : { scale: 0.98 }}
          onClick={build}
          disabled={state === "loading"}
        >
          {state === "loading"
            ? `PLANNING ${anchor.name.toUpperCase()}…`
            : `BUILD AROUND ${anchor.name.toUpperCase()}`}
          <span aria-hidden="true">→</span>
        </motion.button>
      </section>
      <section
        id="build-result"
        className="result-section"
        aria-busy={state === "loading"}
      >
        <div className="section-heading">
          <h2>Recommended build</h2>
          {plan && (
            <span>
              {plan.towers.length} towers / {plan.totalKeystones} keystones
            </span>
          )}
        </div>
        <div role="status" aria-live="polite" className="sr-only">
          {state === "loading"
            ? "Planning your build."
            : state === "ready"
              ? `Build ready for ${anchor.name}.`
              : ""}
        </div>
        {state === "empty" && (
          <div className="empty-state">
            <h3>Your anchor sets the direction.</h3>
            <p>
              Build around {anchor.name} to reveal its recommended towers and
              keystone route.
            </p>
          </div>
        )}
        {state === "loading" && (
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
        {state === "error" && (
          <div className="empty-state" role="alert">
            <h3>Could not plan this build</h3>
            <p>{error}</p>
            <button className="secondary-button" onClick={build}>
              Try again
            </button>
          </div>
        )}
        {plan && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <p className="section-note">
              Levels show maximum normal tower levels reachable in this final
              allocation.
            </p>
            <div className="build-grid">
              {plan.towers.map((tower) => {
                const isAnchor = tower.id === plan.anchorTowerId;
                const optional = tower.id === plan.optionalTowerId;
                const roles = plan.roles.filter((role) =>
                  role.candidates.some(
                    (candidate) => candidate.towerId === tower.id,
                  ),
                );
                return (
                  <article
                    key={tower.id}
                    className={`build-tower ${isAnchor ? "build-anchor" : ""} ${optional ? "build-optional" : ""}`}
                  >
                    <div className="tower-top">
                      <div className="roles">
                        {isAnchor && <span data-role="anchor">Anchor</span>}
                        {roles.map((role) => (
                          <span key={role.role} data-role={role.role}>
                            {roleNames[role.role]}
                          </span>
                        ))}
                        {optional && (
                          <span data-role="optional">Optional Synergy</span>
                        )}
                      </div>
                      <strong className="level">LV {tower.level}</strong>
                    </div>
                    <div className="tower-identity">
                      <TowerIcon tower={tower} assets={assets} />
                      <h3>{tower.name}</h3>
                    </div>
                    <Recipe elements={tower.recipe} assets={assets} />
                    <div className="tower-bottom">
                      <span>{tower.combination}</span>
                      <span data-element={tower.damageElement}>
                        {tower.damageElement} damage
                      </span>
                    </div>
                  </article>
                );
              })}
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
            <section className="route-section">
              <div className="section-heading">
                <h2>Build progression</h2>
                <span>{plan.additionalKeystones} additional keystones</span>
              </div>
              <p className="section-note">
                Start shows the assumed anchor allocation. Every numbered row
                after it is one additional keystone from that baseline.
              </p>
              <ol className="route-list">
                <li className="route-baseline">
                  <span className="route-number">START</span>
                  <div className="baseline-detail">
                    <h3>Anchor baseline</h3>
                    <div className="baseline-allocation">
                      {Object.entries(baselineAllocation).map(
                        ([element, level]) => (
                          <span key={element} data-element={element}>
                            <ElementIcon
                              element={element as ElementName}
                              assets={assets}
                              size={25}
                            />
                            <span>{element}</span>
                            <b>{level}</b>
                          </span>
                        ),
                      )}
                    </div>
                    <p>
                      Anchor planning begins here. Tower purchases are not
                      assigned to this timeline.
                    </p>
                  </div>
                </li>
                {plan.keystonePath.map((step, i) => (
                  <li key={i} className={i === 0 ? "route-next" : undefined}>
                    <span className="route-number">{i + 1}</span>
                    <ElementIcon
                      element={step.element as ElementName}
                      assets={assets}
                      size={30}
                    />
                    <div>
                      <h3>
                        <span data-element={step.element}>{step.element}</span>{" "}
                        <span className="mono">
                          {step.fromElementLevel} → {step.toElementLevel}
                        </span>
                        {i === 0 && <span className="next-label">Next</span>}
                      </h3>
                      <p>{transitionText(step)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
            <section className="why-section">
              <h2>Why this build</h2>
              <div className="evidence-layout">
                <section>
                  <h3>Coverage</h3>
                  <p className="section-note">
                    Unweighted average across the build&apos;s offensive
                    contributors. Direct counters remain supporting evidence.
                  </p>
                  <div className="coverage-table">
                    <div className="coverage-row table-head">
                      <span>Armor</span>
                      <span>Anchor</span>
                      <span>Build average</span>
                      <span>Direct</span>
                    </div>
                    {plan.coverage.element.map((entry) => (
                      <div className="coverage-row" key={entry.defender}>
                        <span
                          className="coverage-element"
                          data-element={entry.defender}
                        >
                          <ElementIcon
                            element={entry.defender}
                            assets={assets}
                            size={26}
                          />
                          <span>{entry.defender}</span>
                        </span>
                        <span className="mono">{entry.anchorMultiplier}×</span>
                        <span className="mono coverage-average">
                          {entry.packageAverageMultiplier.toFixed(2)}×
                        </span>
                        <span className="coverage-direct">
                          {entry.hasDirectCounter ? "2× available" : "None"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p>
                    Damage shape:{" "}
                    {plan.coverage.damageShape.hasSingleTargetCapability
                      ? "single target"
                      : "no single target"}
                    ;{" "}
                    {plan.coverage.damageShape.hasAoeCapability
                      ? "area damage"
                      : "no area damage"}
                    .
                  </p>
                  <p>
                    Offensive range:{" "}
                    <span className="mono">
                      {plan.coverage.range.packageMinRange} to
                      {plan.coverage.range.packageMaxRange}
                    </span>
                    .{" "}
                    {plan.coverage.range.hasLongerRangeContributor
                      ? `Extends ${plan.coverage.range.rangeExtensionFromAnchor} beyond the anchor.`
                      : "No range extension beyond the anchor."}
                  </p>
                </section>
                <section>
                  <h3>Synergy</h3>
                  <p className="section-note">
                    Confirmed mechanic relationships, with overlapping
                    contributions accounted for. These are not damage estimates.
                  </p>
                  <ul className="evidence-list">
                    {plan.synergy.applicable
                      .filter((match) => match.contribution !== "ignored")
                      .map((match, i) => (
                        <li key={i}>
                          <strong>
                            {names[match.providerTowerId]} →{" "}
                            {names[match.consumerTowerId]}
                          </strong>
                          <p>
                            {readable(match.signal)}:{" "}
                            {readable(match.relationshipType)} relationship.{" "}
                            {match.contribution === "diminished"
                              ? "Diminished contribution from overlapping support."
                              : "Full mechanic contribution."}
                          </p>
                        </li>
                      ))}
                  </ul>
                  {!plan.synergy.applicable.some(
                    (match) => match.contribution !== "ignored",
                  ) && (
                    <p>
                      No confirmed mechanic synergy in the current evidence.
                    </p>
                  )}
                </section>
              </div>
              <section className="warnings">
                <h3>Warnings & tensions</h3>
                <ul>
                  {plan.roles
                    .filter((role) => !role.developed)
                    .map((role) => (
                      <li key={role.role}>
                        {roleNames[role.role]} has not reached its planned
                        development target.
                      </li>
                    ))}
                  {plan.coverage.element
                    .filter(
                      (entry) =>
                        entry.anchorMultiplier === 0.5 &&
                        !entry.hasDirectCounter,
                    )
                    .map((entry) => (
                      <li key={entry.defender}>
                        The anchor is weak against {entry.defender} armor, with
                        no direct counter in this build.
                      </li>
                    ))}
                  {!plan.coverage.damageShape.hasComplementaryShape && (
                    <li>
                      The build does not complement the anchor&apos;s damage
                      shape.
                    </li>
                  )}
                  {plan.synergy.tensions.map((tension, i) => (
                    <li key={i}>
                      <strong>
                        {names[tension.providerTowerId]} /{" "}
                        {names[tension.affectedTowerId]}:
                      </strong>{" "}
                      Potential tension. {tension.condition}
                    </li>
                  ))}
                </ul>
                <p>
                  {plan.synergy.tensions.length === 0
                    ? "No potential mechanic tensions identified. "
                    : ""}
                  Unknown or unmet conditional synergies are not counted as
                  confirmed benefits.
                </p>
              </section>
            </section>
          </motion.div>
        )}
      </section>
      <footer>
        Element TD 2 Build Lab
        <span>
          Recommendations explain a plan. Placement and execution remain yours.
        </span>
      </footer>
    </main>
  );
}
