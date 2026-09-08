"use client";

import { useEffect, useRef } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "motion/react";
import type { PlanDto } from "@/lib/engine/buildRecommendationDto";
import { useBuildLab } from "@/components/build-lab/store";
import { gold } from "@/components/build-lab/primitives";

/* ------------------------------------------------------------------ */
/* Hover preview — the route delta, anchored to the hovered chip        */
/* ------------------------------------------------------------------ */

function RoutePreview({
  plan,
}: {
  plan: PlanDto;
}) {
  const cmp = plan.comparisonToRecommended;

  return (
    <motion.div
      className="route-preview"
      role="tooltip"
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.99 }}
      transition={{
        duration: 0.16,
        ease: [0.32, 0.72, 0, 1],
      }}
    >
      <div className="route-preview-head">
        <span className="route-preview-rank mono">
          Route #{plan.rank}
        </span>
        <span className="route-preview-alloc mono">
          {Object.values(plan.allocation).join(
            "-",
          )}
        </span>
      </div>

      {cmp && cmp.substitutionPairs.length > 0 && (
        <div className="route-preview-block">
          <span className="route-preview-label">
            Swaps
          </span>
          <ul className="route-swaps">
            {cmp.substitutionPairs.map(
              (pair, i) => (
                <li key={i}>
                  <span className="swap-from">
                    {pair.from?.name ?? "—"}
                  </span>
                  <span
                    className="swap-arrow"
                    aria-hidden="true"
                  >
                    →
                  </span>
                  <span className="swap-to">
                    {pair.to?.name ?? "—"}
                  </span>
                </li>
              ),
            )}
          </ul>
        </div>
      )}

      {cmp &&
        (cmp.improves.length > 0 ||
          cmp.worsens.length > 0) && (
          <div className="route-preview-block">
            <span className="route-preview-label">
              Changes
            </span>
            <ul className="route-changes">
              {cmp.improves
                .slice(0, 3)
                .map((line, i) => (
                  <li
                    key={`i${i}`}
                    data-tone="up"
                  >
                    {line}
                  </li>
                ))}
              {cmp.worsens
                .slice(0, 3)
                .map((line, i) => (
                  <li
                    key={`w${i}`}
                    data-tone="down"
                  >
                    {line}
                  </li>
                ))}
            </ul>
          </div>
        )}

      <div className="route-preview-foot mono">
        <span>{plan.package.length} towers</span>
        <span>
          {gold(
            plan.minimumCapital.complete ??
              plan.minimumCapital.normal,
          )}
        </span>
        <span>{plan.essenceUses} Essence</span>
      </div>
      <span className="route-preview-hint">
        Click for full inspection
      </span>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* The rail: one compact chip per alternative route                     */
/* ------------------------------------------------------------------ */

function RouteChip({
  plan,
  index,
}: {
  plan: PlanDto;
  index: number;
}) {
  const reduce = useReducedMotion();
  const previewPlan = useBuildLab(
    (s) => s.previewPlan,
  );
  const openDetail = useBuildLab(
    (s) => s.openAlternativeDetail,
  );
  const previewPlanId = useBuildLab(
    (s) => s.previewPlanId,
  );
  const isPreviewed = previewPlanId === plan.id;
  const cmp = plan.comparisonToRecommended;
  const headline =
    cmp?.labels[0] ??
    (cmp && cmp.allocationDelta.length > 0
      ? "Route variant"
      : "Variant");

  return (
    <div className="route-chip-wrap">
      <motion.button
        className="route-chip"
        data-previewed={isPreviewed || undefined}
        aria-describedby={
          isPreviewed
            ? `route-preview-${plan.id}`
            : undefined
        }
        initial={
          reduce
            ? false
            : { opacity: 0, y: 8 }
        }
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{
          duration: 0.32,
          delay: index * 0.05,
          ease: [0.16, 1, 0.3, 1],
        }}
        onMouseEnter={() => previewPlan(plan.id)}
        onMouseLeave={() => previewPlan(null)}
        onFocus={() => previewPlan(plan.id)}
        onBlur={() => previewPlan(null)}
        onClick={() => openDetail(plan.id)}
      >
        <span className="route-chip-rank mono">
          #{plan.rank}
        </span>
        <span className="route-chip-body">
          <span className="route-chip-label">
            {headline}
          </span>
          <span className="route-chip-alloc mono">
            {Object.values(
              plan.allocation,
            ).join("-")}
          </span>
        </span>
      </motion.button>

      <AnimatePresence>
        {isPreviewed && (
          <div
            className="route-preview-anchor"
            id={`route-preview-${plan.id}`}
          >
            <RoutePreview plan={plan} />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AlternativeRouteExplorer({
  alternatives,
}: {
  alternatives: readonly PlanDto[];
}) {
  if (alternatives.length === 0) return null;

  return (
    <div className="route-explorer">
      <span className="route-explorer-label">
        Alternative routes
      </span>
      <div className="route-rail">
        {alternatives.map((plan, i) => (
          <RouteChip
            key={plan.id}
            plan={plan}
            index={i}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Click target: the full inspection dialog                             */
/* ------------------------------------------------------------------ */

export function RouteDetailModal({
  plans,
}: {
  plans: readonly PlanDto[];
}) {
  const isOpen = useBuildLab(
    (s) => s.isAlternativeDetailOpen,
  );
  const selectedId = useBuildLab(
    (s) => s.selectedAlternativePlanId,
  );
  const close = useBuildLab(
    (s) => s.closeAlternativeDetail,
  );
  const activate = useBuildLab(
    (s) => s.activatePlan,
  );
  const engineId = useBuildLab(
    (s) => s.engineRecommendedPlanId,
  );
  const dialogRef =
    useRef<HTMLDivElement | null>(null);
  const closeRef =
    useRef<HTMLButtonElement | null>(null);

  const plan =
    plans.find((p) => p.id === selectedId) ??
    null;

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused =
      document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (
        event.key !== "Tab" ||
        !dialogRef.current
      )
        return;
      const focusables =
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], [tabindex]:not([tabindex="-1"])',
        );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last =
        focusables[focusables.length - 1];
      if (
        event.shiftKey &&
        document.activeElement === first
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener(
        "keydown",
        onKey,
      );
      document.body.style.overflow = "";
      previouslyFocused?.focus?.();
    };
  }, [isOpen, close]);

  if (!isOpen || !plan) return null;
  const cmp = plan.comparisonToRecommended;
  const core = plan.package.filter(
    (tower) => tower.isCore,
  );
  const supporting = plan.package.filter(
    (tower) => !tower.isCore,
  );

  return (
    <div
      className="alt-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget)
          close();
      }}
    >
      <motion.div
        className="alt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="route-modal-title"
        ref={dialogRef}
        initial={{
          opacity: 0,
          y: 12,
          scale: 0.985,
        }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          duration: 0.22,
          ease: [0.32, 0.72, 0, 1],
        }}
      >
        <header className="alt-modal-head">
          <div>
            <span className="alt-modal-eyebrow mono">
              {engineId === plan.id
                ? "Engine recommendation"
                : "Alternative route"}
            </span>
            <h2 id="route-modal-title">
              Route #{plan.rank}
            </h2>
          </div>
          <button
            className="modal-close"
            onClick={close}
            aria-label="Close route detail"
            ref={closeRef}
          >
            ✕
          </button>
        </header>

        <div className="alt-modal-body">
          <dl className="mod-deltas mono">
            <div>
              <dt>Allocation</dt>
              <dd>
                {Object.values(
                  plan.allocation,
                ).join("-")}
              </dd>
            </div>
            <div>
              <dt>Towers</dt>
              <dd>{plan.package.length}</dd>
            </div>
            <div>
              <dt>Capital</dt>
              <dd>
                {gold(
                  plan.minimumCapital
                    .complete ??
                    plan.minimumCapital.normal,
                )}
              </dd>
            </div>
            <div>
              <dt>Essence</dt>
              <dd>{plan.essenceUses}</dd>
            </div>
          </dl>

          {cmp && (
            <>
              <h3>Why different</h3>
              {cmp.substitutionPairs.length >
                0 && (
                <ul className="route-swaps modal-swaps">
                  {cmp.substitutionPairs.map(
                    (pair, i) => (
                      <li key={i}>
                        <span className="swap-from">
                          {pair.from?.name ??
                            "—"}
                        </span>
                        <span
                          className="swap-arrow"
                          aria-hidden="true"
                        >
                          →
                        </span>
                        <span className="swap-to">
                          {pair.to?.name ?? "—"}
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              )}
              {cmp.improves.length > 0 && (
                <ul className="mod-list mod-improves">
                  {cmp.improves.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              )}
              {cmp.worsens.length > 0 && (
                <ul className="mod-list mod-worsens">
                  {cmp.worsens.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              )}
            </>
          )}

          <h3>Core package</h3>
          <ul className="mod-package">
            {core.map((tower) => (
              <li key={tower.id}>
                <span>
                  {tower.name}{" "}
                  <span className="mono">
                    L{tower.level}
                  </span>
                </span>
                <span className="mod-package-purpose">
                  {tower.roles.join(" · ") ||
                    tower.purpose}
                </span>
              </li>
            ))}
          </ul>

          <h3>Supporting package</h3>
          <ul className="mod-package">
            {supporting.map((tower) => (
              <li key={tower.id}>
                <span>
                  {tower.name}{" "}
                  <span className="mono">
                    L{tower.level}
                  </span>
                  {tower.developmentStatus ===
                  "underdeveloped"
                    ? " · below max"
                    : ""}
                </span>
                <span className="mod-package-purpose">
                  {tower.purpose}
                </span>
              </li>
            ))}
          </ul>

          <h3>Progression priorities</h3>
          <ul className="mod-package">
            {plan.progression
              .filter(
                (stage) =>
                  stage.primaryAction ||
                  stage.endgameSelections,
              )
              .map((stage) => (
                <li key={stage.stage}>
                  <span className="mono">
                    {stage.stage.replace(
                      "_",
                      " ",
                    )}
                  </span>
                  <span className="mod-package-purpose">
                    {stage.primaryAction
                      ? `${stage.primaryAction.kind === "build" ? "Build" : "Upgrade"} ${stage.primaryAction.towerName} → L${stage.primaryAction.toLevel}`
                      : stage.endgameSelections
                          ?.map(
                            (s) =>
                              `${s.name}${s.quantity > 1 ? ` ×${s.quantity}` : ""}`,
                          )
                          .join(" + ")}
                  </span>
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
              — added{" "}
              {gold(
                plan.endGame.best
                  .minimumAddedCapital,
              )}
            </p>
          ) : (
            <p>
              No legal Essence package for this
              allocation.
            </p>
          )}
        </div>

        <footer className="alt-modal-foot">
          <button
            className="use-build-button"
            onClick={() => activate(plan.id)}
          >
            Use this route
          </button>
        </footer>
      </motion.div>
    </div>
  );
}
