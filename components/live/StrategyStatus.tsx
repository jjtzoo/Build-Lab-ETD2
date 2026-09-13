"use client";

import { ELEMENTS } from "@/lib/domain/elements";
import {
  coreRoleStatus,
  coverageGaps,
  liveTowerName,
  liveTowerLevelLabel,
  staleFieldRows,
} from "@/lib/engine/liveGame";
import { useLiveGame } from "./store";

/** Field composition checks; a green synergy check is not a spatial-overlap guarantee. */
export function StrategyStatus() {
  const plan = useLiveGame((s) => s.plan);
  const built = useLiveGame((s) => s.built);
  const allocation = useLiveGame((s) => s.allocation);
  if (!plan) return null;
  const stale = staleFieldRows(allocation, built);
  const valid = built.filter(
    (b) =>
      b.quantity > 0 &&
      !stale.some((s) => s.towerId === b.towerId && s.level === b.level),
  );
  const roles = coreRoleStatus(allocation, valid);
  const coverage = coverageGaps(valid);
  const done = (
    id: string,
    level = plan.towers.find((t) => t.towerId === id)?.level ?? 1,
  ) => valid.some((b) => b.towerId === id && b.level >= level);
  const complete = plan.towers.filter((t) => done(t.towerId, t.level)).length;
  return (
    <div className="live-strategy" aria-label="Live strategy status">
      <div className="live-strategy-summary">
        <b>
          Strategy · {complete}/{plan.towers.length}
        </b>
        {roles.map((r) => (
          <span
            key={r.role}
            data-met={r.status === "built"}
            title={r.builtTowerNames.join(", ") || `Missing ${r.label}`}
          >
            {r.status === "built" ? "✓" : "✕"} {r.label}
          </span>
        ))}
      </div>
      <details>
        <summary>Build Lab strategy, coverage & synergy</summary>
        <div className="live-strategy-details">
          <section aria-label="Planned tower checklist">
            {plan.towers.map((t, index) => {
              const info = plan.strategy?.towers.find(
                (s) => s.towerId === t.towerId,
              );
              return (
                <p
                  key={`${t.towerId}:${index}`}
                  data-met={done(t.towerId, t.level)}
                >
                  {done(t.towerId, t.level) ? "✓" : "✕"}{" "}
                  <b>
                    {liveTowerName(t.towerId)}{" "}
                    {liveTowerLevelLabel(t.towerId, t.level)}
                  </b>
                  {info && (
                    <>
                      {" "}
                      · {info.purpose} {info.roles.join(" · ")}
                      {info.synergyTags.length > 0 &&
                        ` · ${info.synergyTags.join(" · ")}`}
                    </>
                  )}
                </p>
              );
            })}
          </section>
          <section aria-label="Element coverage status">
            <b>Direct counters on field</b>
            {ELEMENTS.map((e) => {
              const met =
                valid.length > 0 &&
                !coverage.unanswered.includes(e) &&
                valid.some(
                  (b) =>
                    b.towerId !== "arrow" &&
                    b.towerId !== "cannon" &&
                    b.towerId !== "periodic",
                );
              return (
                <span key={e} data-met={met}>
                  {met ? "✓" : "✕"} {e}
                </span>
              );
            })}
            <small>
              Composition check, not a damage or range-overlap guarantee.
            </small>
          </section>
          <section aria-label="Synergy tower status">
            <b>Synergy partners at planned levels</b>
            {plan.strategy?.relations.length ? (
              plan.strategy.relations.map((r, i) => {
                const met = done(r.providerId) && done(r.consumerId);
                return (
                  <p key={i} data-met={met}>
                    {met ? "✓" : "✕"} {r.text}
                  </p>
                );
              })
            ) : (
              <p>
                Detailed synergy notes were not included in this plan. Re-import
                from Build Lab to bring them over.
              </p>
            )}
          </section>
        </div>
      </details>
    </div>
  );
}
