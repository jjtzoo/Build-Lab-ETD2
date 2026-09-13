"use client";

import { useMemo } from "react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { gold } from "@/components/build-lab/primitives";
import {
  deriveGoldSpent,
  derivedPhase,
  isTowerLoggable,
  liveTowerLevelLabel,
  liveTowerName,
  liveTowerReachableLevel,
} from "@/lib/engine/liveGame";
import { evolutionCost, evolutionTargets } from "@/lib/domain/towerEvolution";
import {
  LIVE_MAP_TOWERS,
  followsFinalForm,
  placementDestinations,
  placementKey,
} from "@/lib/engine/livePlacement";
import { calibratedEconomy } from "@/lib/engine/liveEconomy";
import { LiveTowerIcon } from "./LiveTowerIcon";
import { useLiveGame } from "./store";

/**
 * A placed copy with a final-form intent is the real unit of a pre-emptive
 * evolution strategy. The queue makes that state actionable without asking
 * the player to keep reopening a map picker or mentally reconstruct a tree.
 */
export function EvolutionQueue({ assets }: { assets: BuildLabAssets }) {
  const placements = useLiveGame((s) => s.placements);
  const allocation = useLiveGame((s) => s.allocation);
  const built = useLiveGame((s) => s.built);
  const holds = useLiveGame((s) => s.holds);
  const matchLength = useLiveGame((s) => s.matchLength);
  const evolveBuilt = useLiveGame((s) => s.evolveBuilt);
  const setFinalForm = useLiveGame((s) => s.setFinalForm);
  const clearFinalForm = useLiveGame((s) => s.clearFinalForm);

  const economy = useMemo(
    () =>
      calibratedEconomy(
        derivedPhase(allocation, holds),
        deriveGoldSpent(built),
        matchLength,
      ),
    [allocation, holds, built, matchLength],
  );
  const reserved = placements.filter((placement) => placement.finalForm);

  return (
    <section className="live-evolution-queue" aria-label="Evolution queue">
      <header className="live-panel-head">
        <div>
          <h2>Evolution queue</h2>
          <p className="live-panel-note">
            Reserved placed copies. Start from any Arrow, Cannon, Mono, or
            element tower; the target stays with its map cell.
          </p>
        </div>
        <span className="mono live-queue-count">
          {reserved.length} reserved
        </span>
      </header>
      {reserved.length === 0 ? (
        <p className="live-empty">
          Reserve a placed tower&apos;s final form on the map, then advance its
          path here.
        </p>
      ) : (
        <ol className="live-queue-list">
          {reserved.map((placement) => {
            const target = placement.finalForm!;
            const copyKey = placementKey(placement);
            const destinations = placementDestinations(
              placement.towerId,
              placement.level,
            );
            const next = evolutionTargets(placement.towerId, placement.level)
              .filter((step) =>
                followsFinalForm(step.towerId, step.level, target),
              )
              .find(
                (step) =>
                  isTowerLoggable(step.towerId, allocation) &&
                  liveTowerReachableLevel(step.towerId, allocation) >=
                    step.level,
              );
            const stepCost = next
              ? evolutionCost(
                  { towerId: placement.towerId, level: placement.level },
                  next,
                )
              : null;
            const affordable =
              stepCost !== null && stepCost <= economy.availableGold;
            const atTarget =
              placement.towerId === target.towerId &&
              placement.level >= target.level;

            return (
              <li
                key={copyKey}
                className="live-queue-row"
                data-ready={affordable || undefined}
              >
                <span className="live-queue-icon">
                  <LiveTowerIcon
                    towerId={placement.towerId}
                    assets={assets}
                    size={26}
                  />
                </span>
                <div className="live-queue-route">
                  <strong>
                    {liveTowerName(placement.towerId)}{" "}
                    {liveTowerLevelLabel(placement.towerId, placement.level)}
                    <span aria-hidden="true"> → </span>
                    {liveTowerName(target.towerId)}{" "}
                    {liveTowerLevelLabel(target.towerId, target.level)}
                  </strong>
                  <small>
                    {placement.mapId} · {placement.col + 1},{placement.row + 1}
                  </small>
                </div>
                <label className="live-queue-target">
                  <span className="sr-only">Final target</span>
                  <select
                    value={`${target.towerId}@${target.level}`}
                    onChange={(event) => {
                      const [towerId, rawLevel] = event.target.value.split("@");
                      setFinalForm(copyKey, {
                        towerId,
                        level: Number(rawLevel),
                      });
                    }}
                  >
                    {destinations.map(({ tower, level }) => (
                      <option
                        key={`${tower.id}@${level}`}
                        value={`${tower.id}@${level}`}
                      >
                        {tower.name} {liveTowerLevelLabel(tower.id, level)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="live-queue-action">
                  {atTarget ? (
                    <span>Target reached</span>
                  ) : next && stepCost !== null ? (
                    <>
                      <button
                        type="button"
                        disabled={!affordable}
                        onClick={() =>
                          evolveBuilt(
                            placement.towerId,
                            placement.level,
                            next.towerId,
                            copyKey,
                          )
                        }
                      >
                        {affordable
                          ? `Advance → ${liveTowerName(next.towerId)}`
                          : `Save ${gold(stepCost - economy.availableGold)}`}
                      </button>
                      <small>{gold(stepCost)} · next legal step</small>
                    </>
                  ) : (
                    <span>Await required elements</span>
                  )}
                </div>
                <button
                  type="button"
                  className="live-queue-clear"
                  onClick={() => clearFinalForm(copyKey)}
                >
                  Unassign
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
