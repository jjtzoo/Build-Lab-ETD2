"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { ElementIcon, gold, roman } from "@/components/build-lab/primitives";
import { CORE_ROLE_LABEL } from "@/lib/domain/roles";
import { resolveNormalTowerCost } from "@/lib/domain/towerEconomics";
import {
  coreRoleStatus,
  nextPickOptions,
  planKeystoneProgress,
  planProgress,
  planTargets,
} from "@/lib/engine/liveGame";
import { LiveTowerIcon } from "@/components/live/LiveTowerIcon";
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
  const addBuilt = useLiveGame((s) => s.addBuilt);
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
  const picks = useMemo(() => {
    const options = nextPickOptions(allocation);
    if (!plan) return options.slice(0, 3);
    const needed = new Set(keystones.stillNeeded);
    const onPlan = options.filter((option) => needed.has(option.element));
    return (onPlan.length > 0 ? onPlan : options).slice(0, 3);
  }, [allocation, plan, keystones]);

  const nextAction = progress?.nextAction ?? null;
  const actionCost =
    nextAction && !nextAction.towerId.startsWith("pure-")
      ? resolveNormalTowerCost(nextAction.towerId, nextAction.toLevel)
          .minimumFieldCost
      : null;

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
          <p className="live-stage-headline">
            Stage <span className="live-stage">{progress.stage}</span> ·{" "}
            {progress.headline}
          </p>
          {nextAction ? (
            <button
              type="button"
              className="live-next-card"
              onClick={() =>
                addBuilt(nextAction.towerId, nextAction.toLevel)
              }
            >
              <LiveTowerIcon
                towerId={nextAction.towerId}
                assets={assets}
                size={30}
              />
              <span className="live-next-body">
                <strong>
                  {nextAction.kind === "upgrade" ? "Upgrade" : "Build"}{" "}
                  {nextAction.towerName} → {roman(nextAction.toLevel)}
                </strong>
                <span className="live-next-sub">
                  {nextAction.roles.length > 0
                    ? nextAction.roles.join(" · ")
                    : "Package"}
                  {actionCost != null ? ` · ≈ ${gold(actionCost)}` : ""}
                </span>
              </span>
              <span className="live-next-tick" aria-hidden="true">
                ☐
              </span>
            </button>
          ) : progress.blockedAction ? (
            <p className="live-next-blocked">
              Next planned:{" "}
              <strong>
                {progress.blockedAction.action.towerName}{" "}
                {roman(progress.blockedAction.action.toLevel)}
              </strong>{" "}
              — needs {progress.blockedAction.missing.join(" · ")}
            </p>
          ) : (
            <p className="live-empty">
              Every planned build is on the field.
            </p>
          )}

          <div className="live-roadmap">
            <h4>Roadmap</h4>
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
          </div>
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

      {picks.length > 0 && (
        <div className="live-suggest">
          <h4>
            {plan && keystones.stillNeeded.length > 0
              ? "Next pick — on plan"
              : "Suggested next pick"}
          </h4>
          <ul>
            {picks.map((pick) => (
              <li key={pick.element}>
                <ElementIcon
                  element={pick.element}
                  assets={assets}
                  size={16}
                />
                <span className="live-suggest-el">
                  {pick.element} → {roman(pick.to)}
                </span>
                <span className="live-suggest-why">
                  {pick.coreRolesOpened.length > 0
                    ? `opens ${pick.coreRolesOpened
                        .map((role) => CORE_ROLE_LABEL[role])
                        .join(", ")}`
                    : pick.newlyUnlocked.length > 0
                      ? `unlocks ${pick.newlyUnlocked
                          .slice(0, 3)
                          .join(", ")}`
                      : pick.deepened.length > 0
                        ? `deepens ${pick.deepened.slice(0, 3).join(", ")}`
                        : "no new access"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.section>
  );
}
