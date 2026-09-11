"use client";

import { useEffect, useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { ElementIcon, roman } from "@/components/build-lab/primitives";
import { ELEMENTS } from "@/lib/domain/elements";
import { MAX_ELEMENT_LEVEL, totalKeystones } from "@/lib/engine/allocation";
import {
  coverageGaps,
  MAX_KEYSTONES,
  nextPickOptions,
  pickReveal,
  planKeystoneProgress,
} from "@/lib/engine/liveGame";
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

  const options = useMemo(
    () => nextPickOptions(allocation),
    [allocation],
  );
  const planNeeds = useMemo(
    () =>
      plan
        ? new Set(planKeystoneProgress(plan, allocation).stillNeeded)
        : null,
    [plan, allocation],
  );
  const recommended = useMemo(() => {
    if (options.length === 0) return null;
    if (planNeeds && planNeeds.size > 0) {
      const onPlan = options.find((option) => planNeeds.has(option.element));
      if (onPlan) return onPlan;
    }
    return options[0];
  }, [options, planNeeds]);

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
              {recommended.coreRolesOpened.length > 0
                ? `opens ${recommended.coreRolesOpened.join(", ")}`
                : recommended.newlyUnlocked.length > 0
                  ? `unlocks ${recommended.newlyUnlocked.slice(0, 3).join(", ")}`
                  : recommended.deepened.length > 0
                    ? `deepens ${recommended.deepened.slice(0, 3).join(", ")}`
                    : "no new access — pick for coverage"}
            </span>
          </div>
        </div>
      ) : (
        <p className="live-empty">Every keystone is spent.</p>
      )}

      {gaps.weakAgainst.length > 0 && (
        <p className="live-coverage-warn">
          <span aria-hidden="true">⚠</span> Your damage is halved into{" "}
          <strong>{gaps.weakAgainst.join(", ")}</strong> armour — nothing on
          the field answers it.
        </p>
      )}

      <div className="live-elements" role="group" aria-label="Spend a keystone">
        {ELEMENTS.map((element, index) => {
          const level = allocation[element] ?? 0;
          const maxed = level >= MAX_ELEMENT_LEVEL;
          return (
            <button
              key={element}
              type="button"
              className="live-element"
              data-element={element}
              data-recommended={
                recommended?.element === element || undefined
              }
              data-empty={level === 0 || undefined}
              disabled={maxed || full}
              onClick={() => spendPick(element)}
              aria-label={`Take ${element}. Currently ${
                level > 0 ? `level ${level}` : "unpicked"
              }.`}
              title={`${element} — key ${index + 1}`}
            >
              <ElementIcon element={element} assets={assets} size={28} />
              <span className="live-element-name">{element}</span>
              <b className="mono">{level > 0 ? roman(level) : "·"}</b>
            </button>
          );
        })}
      </div>

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
            {reveal.element} {roman(reveal.toElementLevel)} — tap what you
            built
          </span>
          <div className="live-reveal-chips">
            {revealChips.map((change) => (
              <button
                key={change.towerId}
                type="button"
                className="live-reveal-chip"
                onClick={() =>
                  addBuilt(change.towerId, change.afterLevel)
                }
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
    </motion.section>
  );
}
