"use client";

import { useEffect, useMemo } from "react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { ElementIcon, roman } from "@/components/build-lab/primitives";
import { ELEMENTS } from "@/lib/domain/elements";
import {
  MAX_ELEMENT_LEVEL,
  totalKeystones,
} from "@/lib/engine/allocation";
import { MAX_KEYSTONES } from "@/lib/engine/liveGame";
import { useLiveGame } from "@/components/live/store";

/**
 * The player's held keystones, and the only input the tracker truly needs.
 * Tap an element to spend a pick; ⌫ / the undo button walks the pick log
 * back. Number keys 1–6 map to the six elements.
 */
export function KeystoneInput({ assets }: { assets: BuildLabAssets }) {
  const allocation = useLiveGame((s) => s.allocation);
  const pickLog = useLiveGame((s) => s.pickLog);
  const spendPick = useLiveGame((s) => s.spendPick);
  const undoPick = useLiveGame((s) => s.undoPick);

  const used = useMemo(() => totalKeystones(allocation), [allocation]);
  const full = used >= MAX_KEYSTONES;

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
    <section className="live-keystones" aria-label="Element keystones">
      <div className="live-keystone-row">
        {ELEMENTS.map((element, index) => {
          const level = allocation[element] ?? 0;
          const maxed = level >= MAX_ELEMENT_LEVEL;
          return (
            <button
              key={element}
              type="button"
              className="live-keystone"
              data-element={element}
              data-empty={level === 0 || undefined}
              disabled={maxed || full}
              onClick={() => spendPick(element)}
              aria-label={`Spend a pick on ${element}. Currently level ${level} of ${MAX_ELEMENT_LEVEL}.`}
              title={`${element} — press ${index + 1}`}
            >
              <ElementIcon element={element} assets={assets} size={26} />
              <b className="mono">{level > 0 ? roman(level) : "·"}</b>
            </button>
          );
        })}
      </div>

      <div className="live-keystone-meta">
        <span className="mono live-keystone-count" data-full={full || undefined}>
          {used} / {MAX_KEYSTONES}
        </span>
        <button
          type="button"
          className="live-undo"
          onClick={undoPick}
          disabled={pickLog.length === 0}
        >
          Undo pick
        </button>
        <span className="live-keystone-hint">
          Tap an element as the game gives it — or press 1–6.
        </span>
      </div>
    </section>
  );
}
