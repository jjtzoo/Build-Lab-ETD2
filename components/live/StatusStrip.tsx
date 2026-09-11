"use client";

import { useMemo, useState } from "react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { ElementIcon, gold, roman } from "@/components/build-lab/primitives";
import { ELEMENTS } from "@/lib/domain/elements";
import {
  deriveGoldSpent,
  derivedPhase,
  liveTowerName,
  livePhaseLabel,
  MAX_KEYSTONES,
  totalKeystones,
} from "@/lib/engine/liveGame";
import { useLiveGame } from "@/components/live/store";

/**
 * The always-on band above the focal stage: keystones held, wave bracket,
 * gold spent, and the loaded plan. Everything here is derived — nothing to
 * maintain by hand.
 */
export function StatusStrip({ assets }: { assets: BuildLabAssets }) {
  const allocation = useLiveGame((s) => s.allocation);
  const built = useLiveGame((s) => s.built);
  const holds = useLiveGame((s) => s.holds);
  const plan = useLiveGame((s) => s.plan);
  const setPlan = useLiveGame((s) => s.setPlan);
  const newGame = useLiveGame((s) => s.newGame);

  const [menuOpen, setMenuOpen] = useState(false);

  const picks = useMemo(() => totalKeystones(allocation), [allocation]);
  const goldSpent = useMemo(() => deriveGoldSpent(built), [built]);
  const phase = derivedPhase(allocation, holds);

  const planName = plan
    ? (() => {
        try {
          return liveTowerName(plan.anchorTowerId);
        } catch {
          return plan.anchorTowerId;
        }
      })()
    : null;

  return (
    <div className="live-strip">
      <div className="live-strip-elements" role="group" aria-label="Keystones held">
        {ELEMENTS.map((element) => {
          const level = allocation[element] ?? 0;
          return (
            <span
              key={element}
              className="live-pip"
              data-empty={level === 0 || undefined}
              title={`${element} ${level > 0 ? roman(level) : "—"}`}
            >
              <ElementIcon element={element} assets={assets} size={18} />
              <b className="mono">{level > 0 ? roman(level) : "·"}</b>
            </span>
          );
        })}
      </div>

      <div className="live-strip-meta">
        <span
          className="mono live-strip-keys"
          data-full={picks >= MAX_KEYSTONES || undefined}
          title="Keystones spent"
        >
          {picks}/{MAX_KEYSTONES}
        </span>
        <span className="live-strip-wave" title="Estimated wave">
          {livePhaseLabel(phase)}
        </span>
        <span className="mono live-strip-gold" title="Gold spent (derived)">
          {gold(goldSpent)}
        </span>

        {plan && (
          <span className="live-strip-plan">
            <b>{planName}</b>
            <span className="live-strip-plan-src">
              {plan.source === "engine" ? "Build Lab" : "Theory Craft"}
            </span>
            <button
              type="button"
              className="live-strip-x"
              onClick={() => setPlan(null)}
              aria-label="Clear the loaded plan"
            >
              ✕
            </button>
          </span>
        )}

        <div className="live-strip-more">
          <button
            type="button"
            className="live-strip-x"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="More"
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="live-strip-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  newGame();
                  setMenuOpen(false);
                }}
              >
                New game
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
