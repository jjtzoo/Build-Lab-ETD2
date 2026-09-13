"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { ElementIcon, roman } from "@/components/build-lab/primitives";
import { ELEMENT_MATCHUPS } from "@/lib/domain/elementMatchupCatalog";
import { getTower } from "@/lib/domain/towerCatalog";
import {
  coverageGaps,
  coreRoleStatus,
  liveTowerLevelLabel,
  planProgress,
} from "@/lib/engine/liveGame";
import { liveCoaching } from "@/lib/engine/liveCoaching";
import { PlanAction } from "./PlanAction";
import { useLiveGame } from "./store";

export function PlanPanel({ assets }: { assets: BuildLabAssets }) {
  const plan = useLiveGame((s) => s.plan);
  const allocation = useLiveGame((s) => s.allocation);
  const built = useLiveGame((s) => s.built);
  const holds = useLiveGame((s) => s.holds);
  const coaching = useMemo(
    () => liveCoaching(plan, allocation, built, holds),
    [plan, allocation, built, holds],
  );
  const roadmap = useMemo(
    () =>
      plan?.progression
        ? planProgress(plan.progression, allocation, built)?.roadmap
        : null,
    [plan, allocation, built],
  );
  const roles = useMemo(
    () => coreRoleStatus(allocation, built),
    [allocation, built],
  );
  const coverage = useMemo(() => coverageGaps(built), [built]);
  const { nextAction, blockedAction, nextPick, complete } = coaching;
  const coverageAdvice = useMemo(
    () =>
      // A missing 2× counter is normal in the opening and does not mean the
      // player is losing the matchup. Escalate only when the whole field is
      // actually taking a penalty on average, then keep the advice focused.
      coverage.weakAgainst.slice(0, 2).map((armour) => {
        const counter = coaching.actions.find((action) => {
          try {
            const damage = getTower(action.towerId).damageElement;
            return ELEMENT_MATCHUPS[damage][armour] >= 1.5;
          } catch {
            // Basic, mono, and End Game forms are intentionally skipped here:
            // this advice only promotes a precursor when its planned final
            // normal form can actually solve the current coverage hole.
            return false;
          }
        });
        return { armour, counter };
      }),
    [coaching.actions, coverage.weakAgainst],
  );
  return (
    <section id="live-plan" className="live-plan-panel" aria-label="Plan">
      <header className="live-panel-head">
        <h2>{plan ? "Plan" : "Your next steps"}</h2>
        {!plan && (
          <Link href="/build-lab" className="live-panel-link">
            Import a plan →
          </Link>
        )}
      </header>
      <div className="live-plan-now">
        <h3>Now</h3>
        {nextAction ? (
          <PlanAction action={nextAction} />
        ) : (
          <p>
            {complete
              ? "Plan complete — all targets are on your field."
              : blockedAction
                ? `Prepare for ${blockedAction.towerName} ${liveTowerLevelLabel(blockedAction.towerId, blockedAction.toLevel)}.`
                : plan
                  ? "Finish the plan’s remaining keystones."
                  : "Log your clearing towers and track your picks."}
          </p>
        )}
        {nextAction && (
          <p className="live-panel-note">
            Available at your current picks. Log this after building it in game.
          </p>
        )}
      </div>
      {!complete && (
        <div className="live-plan-next">
          <h3>Next</h3>
          {nextPick && (
            <p className="live-plan-pick">
              <ElementIcon
                element={nextPick.element}
                assets={assets}
                size={20}
              />{" "}
              Take {nextPick.element} {roman(nextPick.to)}
              {nextPick.planPriority?.kind === "anchor-first" && (
                <small>
                  {" "}
                  · Anchor first: {nextPick.planPriority.towerName}
                </small>
              )}
            </p>
          )}
          {blockedAction && (
            <p>
              {blockedAction.towerName}{" "}
              {liveTowerLevelLabel(
                blockedAction.towerId,
                blockedAction.toLevel,
              )}{" "}
              needs {blockedAction.missing.join(" · ")}.
            </p>
          )}
          {!nextPick && !blockedAction && (
            <p>Continue logging the remaining plan towers.</p>
          )}
        </div>
      )}
      {plan && (
        <section className="live-plan-coverage" aria-label="Coverage advice">
          <div>
            <h3>Coverage</h3>
            <p>Fielded damage versus the armour types you may meet next.</p>
          </div>
          {coverageAdvice.length > 0 ? (
            <ul>
              {coverageAdvice.map(({ armour, counter }) => (
                <li key={armour}>
                  <b>{armour} armour</b>
                  {counter ? (
                    <span>
                      is a low-damage matchup. Build toward {counter.towerName}{" "}
                      {liveTowerLevelLabel(counter.towerId, counter.toLevel)};
                      its compatible precursors are promoted in Your field.
                    </span>
                  ) : (
                    <span>
                      is a low-damage matchup. This plan has no remaining
                      direct counter ready to recommend.
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="live-plan-coverage-clear">
              No active coverage risk. This only calls out armour when your
              field averages below 0.85× damage against it.
            </p>
          )}
        </section>
      )}
      <details className="live-plan-later">
        <summary>Later · roadmap and checklist</summary>
        {roadmap && (
          <ol className="live-roadmap">
            {roadmap.map((step, index) => (
              <li key={index} data-done={step.done || undefined}>
                {step.done ? "✓" : "○"} {step.element} {roman(step.to)}{" "}
                {step.unlocks.length > 0 && `→ ${step.unlocks.join(", ")}`}
              </li>
            ))}
          </ol>
        )}
        {plan && (
          <>
            <ul className="live-plan-route">
              {coaching.keystones.rows
                .filter((r) => r.planned > 0)
                .map((r) => (
                  <li key={r.element}>
                    {r.element}: {r.held} / {r.planned}
                  </li>
                ))}
            </ul>
            <ul className="live-plan-checklist">
              {coaching.actions.map((a, i) => (
                <li key={`${a.towerId}-${a.toLevel}-${i}`}>
                  <span>
                    {a.done ? "✓" : "○"} {a.towerName}{" "}
                    {liveTowerLevelLabel(a.towerId, a.toLevel)}
                  </span>
                  <small>
                    {a.done
                      ? "On the field"
                      : a.missing.length
                        ? `Needs ${a.missing.join(" · ")}`
                        : "Buildable now"}
                  </small>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="live-roles">
          <h4>Core roles</h4>
          <ul>
            {roles.map((role) => (
              <li key={role.role}>
                <span>{role.status === "built" ? "✓" : "○"}</span>
                <span>{role.label}</span>
                <span>
                  {role.status === "built"
                    ? role.builtTowerNames.join(", ")
                    : role.status === "buildable"
                      ? `Buildable: ${role.candidateNames.slice(0, 3).join(", ")}`
                      : "Out of reach"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}
