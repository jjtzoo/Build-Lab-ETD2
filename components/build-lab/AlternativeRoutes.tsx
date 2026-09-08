"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { PlanDto } from "@/lib/engine/buildRecommendationDto";
import { useBuildLab } from "@/components/build-lab/store";
import { gold } from "@/components/build-lab/primitives";

function AlternativeCard({
  plan,
  offset,
}: {
  plan: PlanDto;
  offset: number;
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
  const cmp = plan.comparisonToRecommended;
  const labels = cmp?.labels ?? [];
  const isPreviewed = previewPlanId === plan.id;

  return (
    <motion.button
      className="alt-card"
      data-previewed={isPreviewed || undefined}
      style={{ "--fan": offset } as React.CSSProperties}
      initial={
        reduce
          ? false
          : { opacity: 0, y: 16 }
      }
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{
        duration: 0.4,
        delay: offset * 0.06,
        ease: [0.16, 1, 0.3, 1],
      }}
      onMouseEnter={() => previewPlan(plan.id)}
      onMouseLeave={() => previewPlan(null)}
      onFocus={() => previewPlan(plan.id)}
      onBlur={() => previewPlan(null)}
      onClick={() => openDetail(plan.id)}
    >
      <div className="alt-card-top">
        <span className="alt-card-rank mono">
          #{plan.rank}
        </span>
        <span className="alt-card-alloc mono">
          {Object.values(plan.allocation).join(
            "-",
          )}
        </span>
      </div>

      <div className="alt-card-metrics mono">
        <span>{plan.package.length} towers</span>
        <span>
          {gold(
            plan.minimumCapital.complete ??
              plan.minimumCapital.normal,
          )}
        </span>
      </div>

      {cmp && cmp.substitutions.added.length > 0 ? (
        <p className="alt-card-change">
          Swaps in{" "}
          <strong>
            {cmp.substitutions.added.join(", ")}
          </strong>
        </p>
      ) : cmp && cmp.allocationDelta.length > 0 ? (
        <p className="alt-card-change">
          {cmp.allocationDelta
            .map(
              (d) =>
                `${d.element} ${d.from}→${d.to}`,
            )
            .join(", ")}
        </p>
      ) : (
        <p className="alt-card-change muted">
          Same towers, different keystone order
        </p>
      )}

      <div className="alt-card-labels">
        {labels.length > 0 ? (
          labels.map((label) => (
            <span
              className="derived-label"
              key={label}
            >
              {label}
            </span>
          ))
        ) : (
          <span className="derived-label subtle">
            Route variant
          </span>
        )}
      </div>
    </motion.button>
  );
}

function DetailModal({
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
      if (event.key === "Escape") close();
      if (event.key === "Tab" && dialogRef.current) {
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(
        "keydown",
        onKey,
      );
      previouslyFocused?.focus?.();
    };
  }, [isOpen, close]);

  if (!isOpen || !plan) return null;
  const cmp = plan.comparisonToRecommended;

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
        aria-label={`Alternative build ${plan.rank}`}
        ref={dialogRef}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          duration: 0.24,
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
            <h2>Build #{plan.rank}</h2>
          </div>
          <button
            className="modal-close"
            onClick={close}
            aria-label="Close"
            ref={closeRef}
          >
            ✕
          </button>
        </header>

        <div className="alt-modal-body">
          <p className="mono alt-modal-fingerprint">
            {Object.values(plan.allocation).join(
              "-",
            )}{" "}
            · {plan.package.length} towers ·{" "}
            {gold(
              plan.minimumCapital.complete ??
                plan.minimumCapital.normal,
            )}
          </p>

          {cmp && (
            <>
              <h3>Why different</h3>
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
              <dl className="mod-deltas mono">
                <div>
                  <dt>Capital</dt>
                  <dd>
                    {cmp.completeCapitalDelta >= 0
                      ? "+"
                      : ""}
                    {cmp.completeCapitalDelta.toLocaleString()}{" "}
                    g
                  </dd>
                </div>
                <div>
                  <dt>Package</dt>
                  <dd>
                    {cmp.packageSizeDelta >= 0
                      ? "+"
                      : ""}
                    {cmp.packageSizeDelta}
                  </dd>
                </div>
                {cmp.allocationDelta.length >
                  0 && (
                  <div>
                    <dt>Allocation</dt>
                    <dd>
                      {cmp.allocationDelta
                        .map(
                          (d) =>
                            `${d.element} ${d.from}→${d.to}`,
                        )
                        .join(", ")}
                    </dd>
                  </div>
                )}
              </dl>
              {(cmp.substitutions.added.length >
                0 ||
                cmp.substitutions.removed.length >
                  0) && (
                <p className="mod-subs">
                  −
                  {cmp.substitutions.removed.join(
                    ", ",
                  ) || "nothing"}{" "}
                  · +
                  {cmp.substitutions.added.join(
                    ", ",
                  ) || "nothing"}
                </p>
              )}
            </>
          )}

          <h3>Tower package</h3>
          <ul className="mod-package">
            {plan.package.map((tower) => (
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
            Use this build
          </button>
        </footer>
      </motion.div>
    </div>
  );
}

export function AlternativeRoutes({
  alternatives,
  allPlans,
}: {
  alternatives: readonly PlanDto[];
  allPlans: readonly PlanDto[];
}) {
  if (alternatives.length === 0) {
    return (
      <DetailModal plans={allPlans} />
    );
  }

  return (
    <section className="lab-section alt-section">
      <div className="section-rail">
        <span className="section-index mono">03</span>
        <div>
          <h3 className="alt-heading">
            Alternative routes
          </h3>
          <p>
            Distinct non-dominated plans from the same engine run. Hover
            to preview the whole page; open one for the full comparison.
          </p>
        </div>
      </div>

      <div className="alt-deck">
        {alternatives.map((plan, i) => (
          <AlternativeCard
            key={plan.id}
            plan={plan}
            offset={i}
          />
        ))}
      </div>

      <DetailModal plans={allPlans} />
    </section>
  );
}
