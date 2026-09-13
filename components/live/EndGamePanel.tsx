"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import {
  coverageGaps,
  derivedPhase,
  endGameReadiness,
} from "@/lib/engine/liveGame";
import { useLiveGame } from "@/components/live/store";
import { AvailabilityPanel } from "./AvailabilityPanel";

/**
 * Replaces the Summon view once all eleven keystones are spent. The game
 * runs on to the boss — no more picks, so the decisions left are Essence
 * and holding the line.
 */
export function EndGamePanel({ assets }: { assets: BuildLabAssets }) {
  const allocation = useLiveGame((s) => s.allocation);
  const plan = useLiveGame((s) => s.plan);
  const holds = useLiveGame((s) => s.holds);
  const built = useLiveGame((s) => s.built);
  const reduce = useReducedMotion();

  const phase = derivedPhase(allocation, holds);
  const readiness = useMemo(
    () => endGameReadiness(allocation, plan, phase, built),
    [allocation, plan, phase, built],
  );
  const gaps = useMemo(() => coverageGaps(built), [built]);

  const pure = readiness.access.pureCandidates.map(
    (candidate) => candidate.element,
  );
  const remaining = readiness.essenceAvailable - readiness.essenceSpent;

  return (
    <motion.section
      className="live-summon"
      aria-label="End game"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="live-summon-head">
        <h2>End Game</h2>
        <span className="mono live-summon-count">all 11 picks spent</span>
      </header>

      <p className="live-stage-headline">
        No more keystones. Spend Essence on your finish and hold to the boss.
      </p>

      <div
        className="live-endgame-block"
        data-live={remaining > 0 || undefined}
      >
        <h4>Essence</h4>
        {readiness.essenceAvailable > 0 ? (
          <>
            <p>
              {readiness.essenceSpent} / {readiness.essenceAvailable} used
              {" · "}
              {readiness.unlocked
                ? [
                    pure.length > 0 ? `Pure ${pure.join(", ")}` : null,
                    readiness.access.periodicCandidate ? "Periodic" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "no Pure or Periodic in reach — need an element at III, or all six at I"}
            </p>
            {readiness.planSelections.length > 0 && (
              <p className="live-endgame-plan">
                Plan wants{" "}
                {readiness.planSelections
                  .map((entry) => `${entry.quantity}× ${entry.name}`)
                  .join(", ")}
              </p>
            )}
          </>
        ) : (
          <p className="live-locked-need">Essence arrives around wave 50–55.</p>
        )}
      </div>

      {gaps.weakAgainst.length > 0 && (
        <p className="live-coverage-warn">
          <span aria-hidden="true">⚠</span> Still halved into{" "}
          <strong>{gaps.weakAgainst.join(", ")}</strong> armour.
        </p>
      )}

      {readiness.planSelections.length === 0 &&
      plan?.coverageWeaknesses?.length ? (
        <p className="live-coverage-warn live-coverage-soft">
          Plan flagged {plan.coverageWeaknesses.join(", ")} armour as uncovered.
        </p>
      ) : null}
      <AvailabilityPanel assets={assets} />
    </motion.section>
  );
}
