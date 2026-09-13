"use client";

import { useState } from "react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { gold } from "@/components/build-lab/primitives";
import {
  deriveGoldSpent,
  derivedPhase,
  liveTowerLevelLabel,
  liveTowerName,
  towerReachGap,
} from "@/lib/engine/liveGame";
import {
  placementDestinations,
  placementKey,
} from "@/lib/engine/livePlacement";
import { calibratedEconomy } from "@/lib/engine/liveEconomy";
import {
  queueNextStep,
  queuePurchaseBlock,
  queueRoots,
  type QueueForm,
} from "@/lib/engine/liveQueue";
import { LiveTowerIcon } from "./LiveTowerIcon";
import { useLiveGame } from "./store";

const label = (form: QueueForm) =>
  `${liveTowerName(form.towerId)} ${liveTowerLevelLabel(form.towerId, form.level)}`;
const formKey = (form: QueueForm) => `${form.towerId}@${form.level}`;

export function EvolutionQueue({ assets }: { assets: BuildLabAssets }) {
  const placements = useLiveGame((s) => s.placements);
  const plannedCopies = useLiveGame((s) => s.plannedCopies);
  const allocation = useLiveGame((s) => s.allocation);
  const built = useLiveGame((s) => s.built);
  const holds = useLiveGame((s) => s.holds);
  const matchLength = useLiveGame((s) => s.matchLength);
  const evolveBuilt = useLiveGame((s) => s.evolveBuilt);
  const setBuiltLevel = useLiveGame((s) => s.setBuiltLevel);
  const setFinalForm = useLiveGame((s) => s.setFinalForm);
  const clearFinalForm = useLiveGame((s) => s.clearFinalForm);
  const reserveCopy = useLiveGame((s) => s.reserveCopy);
  const cancelCopy = useLiveGame((s) => s.cancelCopy);
  const selectPlannedCopy = useLiveGame((s) => s.selectPlannedCopy);
  const [adding, setAdding] = useState<QueueForm | null>(null);
  const [rootKey, setRootKey] = useState("");
  const economy = calibratedEconomy(
    derivedPhase(allocation, holds),
    deriveGoldSpent(built),
    matchLength,
  );
  const reserved = placements.filter((p) => p.finalForm);
  const roots = adding
    ? queueRoots(adding, allocation, holds, built, economy.availableGold)
    : [];
  const root = roots.find((choice) => formKey(choice) === rootKey) ?? roots[0];

  return (
    <section className="live-evolution-queue" aria-label="Evolution queue">
      <header className="live-panel-head">
        <div>
          <h2>Evolution queue</h2>
          <p className="live-panel-note">
            Advance a placed tower, or add another copy of its target.
          </p>
        </div>
        <span className="mono live-queue-count">
          {reserved.length} placed · {plannedCopies.length} planned
        </span>
      </header>
      {adding && (
        <div
          className="live-queue-compose"
          role="group"
          aria-label={`Add copy of ${label(adding)}`}
        >
          <strong>Another {label(adding)}</strong>
          <label>
            Starting tower
            <select
              value={root ? formKey(root) : ""}
              onChange={(event) => setRootKey(event.target.value)}
            >
              {roots.map((choice) => (
                <option
                  key={formKey(choice)}
                  value={formKey(choice)}
                  disabled={!!choice.block}
                >
                  {label(choice)} · {gold(choice.cost)}
                  {choice.block ? ` · ${choice.block}` : ""}
                </option>
              ))}
            </select>
          </label>
          <p>
            Ordered by purchase cost. Choose the starting tower that suits your
            opening. Confirm on the map after buying it in game.
          </p>
          {!roots.length && <p>No compatible starting tower is available.</p>}
          <div className="live-queue-tools">
            <button
              className="secondary-button"
              type="button"
              disabled={!root || !!root.block}
              onClick={() => {
                if (!root || root.block) return;
                reserveCopy(
                  { towerId: root.towerId, level: root.level },
                  adding,
                );
                setAdding(null);
              }}
            >
              Reserve and choose spot
            </button>
            <button
              className="live-queue-clear"
              type="button"
              onClick={() => setAdding(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {reserved.length === 0 && plannedCopies.length === 0 && (
        <p className="live-empty">
          Reserve a placed tower&apos;s final form on the map, then advance its
          path here.
        </p>
      )}
      <ol className="live-queue-list">
        {plannedCopies.map((copy) => {
          const block = queuePurchaseBlock(
            copy,
            allocation,
            holds,
            built,
            economy.availableGold,
          );
          return (
            <li key={copy.id} className="live-queue-row" data-planned="true">
              <LiveTowerIcon towerId={copy.towerId} assets={assets} size={26} />
              <div className="live-queue-route">
                <strong>{label(copy.finalForm)}</strong>
                <small>{label(copy)} → target · Needs placement</small>
              </div>
              <div className="live-queue-tools">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => selectPlannedCopy(copy.id)}
                >
                  Choose spot
                </button>
                <button
                  type="button"
                  className="live-queue-clear"
                  onClick={() => cancelCopy(copy.id)}
                >
                  Cancel copy
                </button>
              </div>
              <p className="live-queue-detail">
                {block ??
                  "Planned only — gold and field update when you confirm placement."}
              </p>
            </li>
          );
        })}
        {reserved.map((placement) => {
          const target = placement.finalForm!;
          const key = placementKey(placement);
          const next = queueNextStep(
            placement,
            target,
            allocation,
            economy.availableGold,
          );
          const ready = next?.reachable && next.affordable;
          const atTarget =
            placement.towerId === target.towerId &&
            placement.level >= target.level;
          const destinations = placementDestinations(
            placement.towerId,
            placement.level,
          );
          const gaps =
            next && !next.reachable
              ? towerReachGap(next.towerId, allocation, next.level)
              : [];
          return (
            <li
              key={key}
              className="live-queue-row"
              data-ready={ready || undefined}
            >
              <LiveTowerIcon
                towerId={placement.towerId}
                assets={assets}
                size={26}
              />
              <div className="live-queue-route">
                <strong>{label(target)}</strong>
                <small>
                  Current: {label(placement)} · {placement.mapId}{" "}
                  {placement.col + 1},{placement.row + 1}
                </small>
              </div>
              <button
                className="live-queue-copy secondary-button"
                type="button"
                aria-label={`Add copy of ${label(target)} at ${key}`}
                onClick={() => {
                  setAdding({ ...target });
                  setRootKey("");
                }}
              >
                + Add copy
              </button>
              <div className="live-queue-action">
                {atTarget ? (
                  <span>Target reached</span>
                ) : next ? (
                  <>
                    <button
                      type="button"
                      disabled={!ready}
                      onClick={() => {
                        if (!ready) return;
                        if (next.towerId === placement.towerId)
                          setBuiltLevel(
                            placement.towerId,
                            placement.level,
                            next.level,
                            key,
                          );
                        else
                          evolveBuilt(
                            placement.towerId,
                            placement.level,
                            next.towerId,
                            key,
                          );
                      }}
                    >
                      Advance → {label(next)}
                    </button>
                    <small>
                      {gold(next.cost)}
                      {!next.reachable
                        ? ` · Needs ${gaps.join(" · ") || "element requirements"}`
                        : !next.affordable
                          ? ` · Save ${gold(next.cost - economy.availableGold)}`
                          : " · log after upgrading in game"}
                    </small>
                  </>
                ) : (
                  <span>No compatible next step</span>
                )}
              </div>
              <details className="live-queue-edit">
                <summary>Edit target</summary>
                <label className="live-queue-target">
                  <span className="sr-only">Final target for {key}</span>
                  <select
                    value={formKey(target)}
                    onChange={(event) => {
                      const [towerId, level] = event.target.value.split("@");
                      setFinalForm(key, { towerId, level: Number(level) });
                    }}
                  >
                    {destinations.map(({ tower, level }) => (
                      <option
                        key={`${tower.id}@${level}`}
                        value={`${tower.id}@${level}`}
                      >
                        {label({ towerId: tower.id, level })}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="live-queue-clear"
                  onClick={() => clearFinalForm(key)}
                >
                  Unassign target
                </button>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
