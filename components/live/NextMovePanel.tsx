"use client";

import { useMemo } from "react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import {
  ElementIcon,
  TowerIcon,
  gold,
  roman,
} from "@/components/build-lab/primitives";
import { resolveNormalTowerCost } from "@/lib/domain/towerEconomics";
import { endGameReadiness, planProgress } from "@/lib/engine/liveGame";
import { useLiveGame } from "@/components/live/store";

/**
 * Plan mode. Where the player is against the imported engine roadmap, the
 * single next move, and what to watch. Ticking the next move logs that
 * tower for them — following the plan should cost one tap, not two.
 */
export function NextMovePanel({ assets }: { assets: BuildLabAssets }) {
  const plan = useLiveGame((s) => s.plan);
  const allocation = useLiveGame((s) => s.allocation);
  const built = useLiveGame((s) => s.built);
  const addBuilt = useLiveGame((s) => s.addBuilt);

  const progress = useMemo(
    () =>
      plan?.progression
        ? planProgress(plan.progression, allocation, built)
        : null,
    [plan, allocation, built],
  );
  const endGame = useMemo(
    () => endGameReadiness(allocation, plan),
    [allocation, plan],
  );

  if (!progress) return null;

  const action = progress.nextAction;
  const actionCost =
    action && !action.towerId.startsWith("pure-")
      ? resolveNormalTowerCost(action.towerId, action.toLevel)
          .minimumFieldCost
      : null;

  return (
    <section className="live-panel" aria-label="Next move">
      <header className="live-panel-head">
        <h3>
          Stage · <span className="live-stage">{progress.stage}</span>
        </h3>
        <span className="mono live-panel-note">
          {progress.keystonesDone} / {progress.keystonesPlanned} picks
        </span>
      </header>
      <p className="live-stage-headline">{progress.headline}</p>

      {action ? (
        <div className="live-next">
          <span className="live-next-label">Next move</span>
          <button
            type="button"
            className="live-next-card"
            onClick={() => addBuilt(action.towerId, action.toLevel)}
          >
            <TowerIcon
              towerId={action.towerId}
              name={action.towerName}
              assets={assets}
              size={34}
            />
            <span className="live-next-body">
              <strong>
                {action.kind === "upgrade" ? "Upgrade" : "Build"}{" "}
                {action.towerName} → {roman(action.toLevel)}
              </strong>
              <span className="live-next-sub">
                {action.roles.length > 0
                  ? action.roles.join(" · ")
                  : "Package"}
                {actionCost != null ? ` · ≈ ${gold(actionCost)}` : ""}
              </span>
            </span>
            <span className="live-next-tick" aria-hidden="true">
              ☐
            </span>
          </button>
          <span className="live-next-hint">
            Tap when you build it — it logs to your field.
          </span>
        </div>
      ) : (
        <p className="live-empty">
          Every planned build is on the field. Ride it out.
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

      {(plan?.coverageWeaknesses?.length ?? 0) > 0 && (
        <div className="live-watch">
          <h4>Watch</h4>
          <p>
            {plan!.coverageWeaknesses!.join(", ")} armour still uncovered by
            this package.
          </p>
        </div>
      )}

      <div className="live-endgame" data-unlocked={endGame.unlocked || undefined}>
        <h4>End Game</h4>
        {endGame.unlocked ? (
          <>
            <p>
              {[
                endGame.access.pureCandidates.length > 0
                  ? `${endGame.access.pureCandidates.length} Pure option${
                      endGame.access.pureCandidates.length === 1 ? "" : "s"
                    }`
                  : null,
                endGame.access.periodicCandidate ? "Periodic" : null,
              ]
                .filter(Boolean)
                .join(" + ")}{" "}
              available · {endGame.access.essenceUsesAvailable} essence
            </p>
            {endGame.planSelections.length > 0 && (
              <p className="live-endgame-plan">
                Plan:{" "}
                {endGame.planSelections
                  .map((entry) => `${entry.quantity}× ${entry.name}`)
                  .join(", ")}
              </p>
            )}
          </>
        ) : (
          <p className="live-locked-need">{endGame.requirement}</p>
        )}
      </div>
    </section>
  );
}
