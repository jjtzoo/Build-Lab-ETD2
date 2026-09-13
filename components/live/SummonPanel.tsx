"use client";

import { useEffect, useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { ElementIcon, roman } from "@/components/build-lab/primitives";
import { ELEMENTS } from "@/lib/domain/elements";
import { totalKeystones } from "@/lib/engine/allocation";
import {
  coverageGaps,
  deriveGoldSpent,
  MAX_KEYSTONES,
  pickReveal,
  planKeystoneProgress,
  recommendedPick,
} from "@/lib/engine/liveGame";
import {
  calibratedEconomy,
  LIVE_ECONOMY_CHECKPOINTS,
} from "@/lib/engine/liveEconomy";
import { LiveTowerIcon } from "@/components/live/LiveTowerIcon";
import { useLiveGame } from "@/components/live/store";

/**
 * The one screen the player looks at during a summon: what to pick, what
 * their field can't yet answer, the six element buttons, and — right after
 * a pick — one-tap chips for whatever just came into reach.
 */
export function SummonPanel({ assets }: { assets: BuildLabAssets }) {
  const allocation = useLiveGame((s) => s.allocation);
  const built = useLiveGame((s) => s.built);
  const holds = useLiveGame((s) => s.holds);
  const matchLength = useLiveGame((s) => s.matchLength);
  const setMatchLength = useLiveGame((s) => s.setMatchLength);
  const plan = useLiveGame((s) => s.plan);
  const lastPick = useLiveGame((s) => s.lastPick);
  const spendPick = useLiveGame((s) => s.spendPick);
  const undoPick = useLiveGame((s) => s.undoPick);
  const hold = useLiveGame((s) => s.hold);
  const unhold = useLiveGame((s) => s.unhold);
  const addBuilt = useLiveGame((s) => s.addBuilt);
  const reduce = useReducedMotion();

  const picks = useMemo(() => totalKeystones(allocation), [allocation]);
  const full = picks >= MAX_KEYSTONES;
  const economy = useMemo(
    () => calibratedEconomy(picks + holds, deriveGoldSpent(built), matchLength),
    [picks, holds, built, matchLength],
  );

  const planNeeds = useMemo(
    () =>
      plan ? new Set(planKeystoneProgress(plan, allocation).stillNeeded) : null,
    [plan, allocation],
  );
  // Shared with the status bar's pips so the two can't disagree about
  // which element is being recommended.
  const recommended = useMemo(
    () => recommendedPick(allocation, plan),
    [allocation, plan],
  );

  const gaps = useMemo(() => coverageGaps(built), [built]);

  const reveal = useMemo(() => {
    if (!lastPick) return null;
    try {
      return pickReveal(lastPick.before, lastPick.after);
    } catch {
      return null;
    }
  }, [lastPick]);

  const revealChips = reveal
    ? reveal.towerAccessChanges
        .filter((change) => change.change === "newly-unlocked")
        .slice(0, 6)
    : [];
  const deepened = reveal
    ? reveal.towerAccessChanges
        .filter((change) => change.change === "deepened")
        .map((change) => change.towerName)
    : [];

  // Global 1–6 / Backspace shortcuts (skip while typing in a field).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA" ||
          target.closest("dialog") ||
          target.isContentEditable)
      ) {
        return;
      }
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < 6) {
        event.preventDefault();
        spendPick(ELEMENTS[index]);
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        undoPick();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spendPick, undoPick]);

  return (
    <motion.section
      className="live-summon"
      aria-label="Summon"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="live-summon-head">
        <h2>Summon</h2>
        <span className="mono live-summon-count">
          pick {Math.min(picks + 1, MAX_KEYSTONES)} of {MAX_KEYSTONES}
          {holds > 0 && (
            <button
              type="button"
              className="live-summon-holds"
              onClick={unhold}
              title="Undo a hold"
            >
              +{holds} held
            </button>
          )}
        </span>
      </header>

      {recommended ? (
        <div className="live-rec">
          <ElementIcon
            element={recommended.element}
            assets={assets}
            size={30}
          />
          <div className="live-rec-body">
            <strong>
              Take {recommended.element} {roman(recommended.to)}
              {planNeeds?.has(recommended.element) && (
                <span className="live-rec-plan">on plan</span>
              )}
            </strong>
            <span className="live-rec-why">
              {recommended.planPriority?.kind === "anchor-first"
                ? `anchor first: bring ${recommended.planPriority.towerName} online`
                : recommended.coreRolesOpened.length > 0
                  ? `opens ${recommended.coreRolesOpened.join(", ")}`
                  : recommended.newlyUnlocked.length > 0
                    ? `unlocks ${recommended.newlyUnlocked.slice(0, 3).join(", ")}`
                    : recommended.deepened.length > 0
                      ? `deepens ${recommended.deepened.slice(0, 3).join(", ")}`
                      : "no new access — pick for coverage"}
            </span>
          </div>
          <span className="live-rec-key">
            press{" "}
            <kbd className="mono">
              {ELEMENTS.indexOf(recommended.element) + 1}
            </kbd>
          </span>
        </div>
      ) : (
        <p className="live-empty">Every keystone is spent.</p>
      )}

      {gaps.weakAgainst.length > 0 && (
        <p className="live-coverage-warn">
          <span aria-hidden="true">⚠</span> Your damage is halved into{" "}
          <strong>{gaps.weakAgainst.join(", ")}</strong> armour — nothing on the
          field answers it.
        </p>
      )}

      {recommended && (
        <p className="live-summon-where">
          Spend it on the bar above, or press its key.
        </p>
      )}

      <div className="live-summon-actions">
        <button
          type="button"
          className="live-hold"
          onClick={hold}
          disabled={full}
        >
          Hold this summon
        </button>
        <button
          type="button"
          className="live-undo"
          onClick={undoPick}
          disabled={picks === 0}
        >
          Undo pick
        </button>
      </div>

      {reveal && (revealChips.length > 0 || deepened.length > 0) && (
        <div className="live-reveal">
          <span className="live-reveal-label">
            {reveal.element} {roman(reveal.toElementLevel)} — tap what you built
          </span>
          <div className="live-reveal-chips">
            {revealChips.map((change) => (
              <button
                key={change.towerId}
                type="button"
                className="live-reveal-chip"
                onClick={() => addBuilt(change.towerId, change.afterLevel)}
              >
                <LiveTowerIcon
                  towerId={change.towerId}
                  assets={assets}
                  size={20}
                />
                + {change.towerName} {roman(change.afterLevel)}
              </button>
            ))}
          </div>
          {deepened.length > 0 && (
            <span className="live-reveal-deep">
              deepens {deepened.slice(0, 4).join(", ")}
            </span>
          )}
        </div>
      )}
      <section className="live-economy" aria-label="Economy calibration">
        <div>
          <h3>Economy</h3>
          <p>
            Estimated bank <b>{economy.availableGold.toLocaleString()} gold</b>
            <small> · before interest</small>
          </p>
        </div>
        <label>
          Match length
          <select
            value={matchLength}
            onChange={(event) =>
              setMatchLength(event.target.value as typeof matchLength)
            }
          >
            {LIVE_ECONOMY_CHECKPOINTS.map((checkpoint) => (
              <option key={checkpoint.length} value={checkpoint.length}>
                {checkpoint.label} · W{checkpoint.startWave} ·{" "}
                {checkpoint.startingGold.toLocaleString()} gold
              </option>
            ))}
          </select>
        </label>
      </section>
    </motion.section>
  );
}
