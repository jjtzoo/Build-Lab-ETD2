"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { ElementIcon, roman } from "@/components/build-lab/primitives";
import {
  coreRoleStatus,
  planKeystoneProgress,
  planProgress,
  planTargets,
} from "@/lib/engine/liveGame";
import { useLiveGame } from "@/components/live/store";

const STATUS_MARK: Record<string, string> = {
  built: "✓",
  buildable: "●",
  unreachable: "✕",
  "out-of-reach": "✕",
};

/**
 * The plan context, off the summon moment. Engine plans show their staged
 * roadmap and single next move; hand-built plans show the target list and
 * keystone route; with no plan it falls back to core-role coaching.
 */
export function PlanPanel({ assets }: { assets: BuildLabAssets }) {
  const plan = useLiveGame((s) => s.plan);
  const allocation = useLiveGame((s) => s.allocation);
  const built = useLiveGame((s) => s.built);
  const reduce = useReducedMotion();

  const progress = useMemo(
    () =>
      plan?.progression
        ? planProgress(plan.progression, allocation, built)
        : null,
    [plan, allocation, built],
  );
  const targets = useMemo(
    () => planTargets(plan, allocation, built),
    [plan, allocation, built],
  );
  const keystones = useMemo(
    () => planKeystoneProgress(plan, allocation),
    [plan, allocation],
  );
  const roles = useMemo(
    () => coreRoleStatus(allocation, built),
    [allocation, built],
  );
  return (
    <motion.section
      className="live-plan-panel"
      aria-label="Plan"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="live-panel-head">
        <h2>{plan ? "Plan" : "No plan"}</h2>
        {plan ? (
          <span className="mono live-panel-note">
            {progress
              ? `${progress.keystonesDone} / ${progress.keystonesPlanned} picks`
              : `${keystones.heldTotal} / ${keystones.plannedTotal} keystones`}
          </span>
        ) : (
          <Link href="/build-lab" className="live-panel-link">
            Get one →
          </Link>
        )}
      </header>

      {progress && (
        <>
          {/*
            The stage badge and the next build both live in the sticky bar
            now, where they stay in view. What's left here is the part the
            bar can't carry: the whole route, and how far along it you are.
          */}
          <p className="live-stage-headline">{progress.headline}</p>

          <details className="live-roadmap">
            <summary>
              <h4>Roadmap</h4>
              <span className="mono live-roadmap-count">
                {progress.keystonesDone}/{progress.keystonesPlanned}
              </span>
            </summary>
            <ul>
              {progress.roadmap.map((entry, index) => (
                <li key={index} data-done={entry.done || undefined}>
                  <span className="live-roadmap-tick" aria-hidden="true">
                    {entry.done ? "☑" : "☐"}
                  </span>
                  <ElementIcon
                    element={entry.element}
                    assets={assets}
                    size={14}
                  />
                  <span className="live-roadmap-el">
                    {entry.element} {roman(entry.to)}
                  </span>
                  {entry.unlocks.length > 0 && (
                    <span className="live-roadmap-unlocks">
                      → {entry.unlocks.slice(0, 3).join(", ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}

      {plan && !progress && (
        <>
          <p className="live-stage-headline">
            A hand-built plan has no staged roadmap — take the keystones in
            whatever order the game offers.
          </p>
          <div className="live-plan-route">
            <h4>Keystone route</h4>
            <ul>
              {keystones.rows
                .filter((row) => row.planned > 0)
                .map((row) => (
                  <li
                    key={row.element}
                    data-done={row.held >= row.planned || undefined}
                  >
                    <ElementIcon
                      element={row.element}
                      assets={assets}
                      size={16}
                    />
                    <span className="live-plan-route-el">{row.element}</span>
                    <span className="live-plan-route-depth mono">
                      {row.held > 0 ? roman(row.held) : "–"} /{" "}
                      {roman(row.planned)}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
          <div className="live-plan-targets">
            <h4>Plan towers</h4>
            <ul>
              {targets.map((target) => (
                <li key={target.towerId} data-status={target.status}>
                  <span className="live-role-mark" aria-hidden="true">
                    {STATUS_MARK[target.status]}
                  </span>
                  <span className="live-role-name">
                    {target.name} {roman(target.level)}
                  </span>
                  <span className="live-role-detail">
                    {target.status === "built"
                      ? "on the field"
                      : target.status === "buildable"
                        ? "buildable now"
                        : `needs ${target.missing.join(" · ")}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {!plan && (
        <p className="live-stage-headline">
          Tracking from your picks alone. Import a build from Build Lab or
          Theory Craft for a staged roadmap.
        </p>
      )}

      <div className="live-roles">
        <h4>Core roles</h4>
        <ul>
          {roles.map((role) => (
            <li key={role.role} data-status={role.status}>
              <span className="live-role-mark" aria-hidden="true">
                {STATUS_MARK[role.status]}
              </span>
              <span className="live-role-name">{role.label}</span>
              <span className="live-role-detail">
                {role.status === "built"
                  ? role.builtTowerNames.join(", ")
                  : role.status === "buildable"
                    ? `buildable — ${role.candidateNames
                        .slice(0, 3)
                        .join(", ")}`
                    : "out of reach"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/*
        "Next pick" used to be listed here too. The summon card already
        names the recommendation and the key to press for it, so this was
        the same answer in a second place — and the worse of the two,
        since it isn't where you act on it.
      */}
    </motion.section>
  );
}
