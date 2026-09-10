"use client";

import { useMemo } from "react";
import {
  expectedPicksForPhase,
  LIVE_PHASE_COUNT,
  livePhaseLabel,
} from "@/lib/engine/liveGame";
import { totalKeystones } from "@/lib/engine/allocation";
import { useLiveGame } from "@/components/live/store";

/**
 * Element TD 2 offers a pick roughly once per 5-wave phase, to wave 55.
 * Rather than a free wave number, the tracker walks discrete phases: the
 * player taps "Next phase" as the game moves them along. The last phase
 * auto-grants the two Pure Essence uses.
 */
export function PhaseStepper() {
  const phase = useLiveGame((s) => s.phase);
  const allocation = useLiveGame((s) => s.allocation);
  const nextPhase = useLiveGame((s) => s.nextPhase);
  const prevPhase = useLiveGame((s) => s.prevPhase);

  const picks = useMemo(
    () => totalKeystones(allocation),
    [allocation],
  );
  const expected = expectedPicksForPhase(phase);
  const behind = expected - picks;

  return (
    <div className="live-phase">
      <button
        type="button"
        className="live-phase-nav"
        onClick={prevPhase}
        disabled={phase <= 1}
        aria-label="Previous phase"
      >
        ◀
      </button>

      <div className="live-phase-body">
        <span className="live-phase-num mono">
          Phase {phase} / {LIVE_PHASE_COUNT}
        </span>
        <span className="live-phase-label">{livePhaseLabel(phase)}</span>
        {behind > 0 && picks < 11 && (
          <span className="live-phase-behind">
            {behind} pick{behind === 1 ? "" : "s"} behind — the game
            usually offers one per phase
          </span>
        )}
      </div>

      <button
        type="button"
        className="live-phase-nav live-phase-next"
        onClick={nextPhase}
        disabled={phase >= LIVE_PHASE_COUNT}
      >
        Next phase →
      </button>
    </div>
  );
}
