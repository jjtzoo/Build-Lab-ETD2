"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { ElementIcon, roman } from "@/components/build-lab/primitives";
import { CORE_ROLE_LABEL } from "@/lib/domain/roles";
import {
  coreRoleStatus,
  endGameReadiness,
  nextPickOptions,
} from "@/lib/engine/liveGame";
import { useLiveGame } from "@/components/live/store";

const STATUS_MARK: Record<string, string> = {
  built: "✓",
  buildable: "●",
  unreachable: "✕",
};

/**
 * Standalone mode — no imported plan. Coaches from the picks alone: which
 * mandatory core roles are covered, and which keystone would open the most.
 */
export function CoreRolePanel({ assets }: { assets: BuildLabAssets }) {
  const allocation = useLiveGame((s) => s.allocation);
  const built = useLiveGame((s) => s.built);

  const roles = useMemo(
    () => coreRoleStatus(allocation, built),
    [allocation, built],
  );
  const picks = useMemo(
    () => nextPickOptions(allocation).slice(0, 3),
    [allocation],
  );
  const endGame = useMemo(
    () => endGameReadiness(allocation, null),
    [allocation],
  );

  return (
    <section className="live-panel" aria-label="Core roles">
      <header className="live-panel-head">
        <h3>No plan loaded</h3>
        <Link href="/build-lab" className="live-panel-link">
          Get one →
        </Link>
      </header>
      <p className="live-stage-headline">
        Tracking from your picks alone. Import a build from Build Lab or
        Theory Craft for a staged roadmap.
      </p>

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
          <h4>Suggested next pick</h4>
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
                        ? `deepens ${pick.deepened
                            .slice(0, 3)
                            .join(", ")}`
                        : "no new access"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        className="live-endgame"
        data-unlocked={endGame.unlocked || undefined}
      >
        <h4>End Game</h4>
        {endGame.unlocked ? (
          <p>
            {endGame.access.pureCandidates
              .map((candidate) => candidate.element)
              .join(", ")}
            {endGame.access.periodicCandidate
              ? `${endGame.access.pureCandidates.length ? " · " : ""}Periodic`
              : ""}{" "}
            available · {endGame.access.essenceUsesAvailable} essence
          </p>
        ) : (
          <p className="live-locked-need">{endGame.requirement}</p>
        )}
      </div>
    </section>
  );
}
