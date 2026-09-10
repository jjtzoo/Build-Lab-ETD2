"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { roman } from "@/components/build-lab/primitives";
import { pickReveal } from "@/lib/engine/liveGame";
import { useLiveGame } from "@/components/live/store";

const DWELL_MS = 4000;

/**
 * The payoff for spending a keystone: exactly which towers that one pick
 * just put in reach, straight from `evaluateKeystoneTransition`.
 */
export function UnlockToast() {
  const lastPick = useLiveGame((s) => s.lastPick);
  const clearReveal = useLiveGame((s) => s.clearReveal);
  const [visible, setVisible] = useState(false);

  const reveal = useMemo(() => {
    if (!lastPick) return null;
    try {
      return pickReveal(lastPick.before, lastPick.after);
    } catch {
      return null;
    }
  }, [lastPick]);

  useEffect(() => {
    if (!reveal) return;
    setVisible(true);
    const id = window.setTimeout(() => {
      setVisible(false);
      clearReveal();
    }, DWELL_MS);
    return () => window.clearTimeout(id);
  }, [reveal, clearReveal]);

  const unlocked = reveal
    ? reveal.towerAccessChanges
        .filter((change) => change.change === "newly-unlocked")
        .map((change) => change.towerName)
    : [];
  const deepened = reveal
    ? reveal.towerAccessChanges
        .filter((change) => change.change === "deepened")
        .map((change) => change.towerName)
    : [];

  return (
    <AnimatePresence>
      {visible && reveal && (
        <motion.div
          className="live-toast"
          role="status"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.22 }}
        >
          <strong>
            {reveal.element} {roman(reveal.toElementLevel)}
          </strong>
          {unlocked.length > 0 && (
            <span>
              unlocks {unlocked.slice(0, 4).join(", ")}
              {unlocked.length > 4 ? ` +${unlocked.length - 4}` : ""}
            </span>
          )}
          {deepened.length > 0 && (
            <span className="live-toast-deep">
              deepens {deepened.slice(0, 3).join(", ")}
              {deepened.length > 3 ? ` +${deepened.length - 3}` : ""}
            </span>
          )}
          {unlocked.length === 0 && deepened.length === 0 && (
            <span>no new tower access</span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
