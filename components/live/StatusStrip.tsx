"use client";

import { useMemo, useState } from "react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { ElementIcon, gold, roman } from "@/components/build-lab/primitives";
import { ELEMENTS } from "@/lib/domain/elements";
import { MAX_ELEMENT_LEVEL } from "@/lib/engine/allocation";
import {
  deriveGoldSpent,
  derivedPhase,
  liveTowerName,
  livePhaseLabel,
  MAX_KEYSTONES,
  planProgress,
  recommendedPick,
  totalKeystones,
} from "@/lib/engine/liveGame";
import { useLiveGame } from "@/components/live/store";

/**
 * The always-on band: keystones, wave bracket, gold, the loaded plan —
 * and, because it is the one thing on screen no matter how far down the
 * page you are, the two controls you actually reach for mid-match.
 *
 * The pips spend picks. They used to be a read-only copy of the six
 * element buttons sitting right below them in the summon card, which
 * meant the same six elements and levels were drawn twice and the only
 * place you could act on them scrolled away. Now the bar is where you
 * pick and the summon card is where the choice is explained.
 */
export function StatusStrip({ assets }: { assets: BuildLabAssets }) {
  const allocation = useLiveGame((s) => s.allocation);
  const built = useLiveGame((s) => s.built);
  const holds = useLiveGame((s) => s.holds);
  const plan = useLiveGame((s) => s.plan);
  const setPlan = useLiveGame((s) => s.setPlan);
  const newGame = useLiveGame((s) => s.newGame);
  const spendPick = useLiveGame((s) => s.spendPick);
  const addBuilt = useLiveGame((s) => s.addBuilt);

  const [menuOpen, setMenuOpen] = useState(false);

  const picks = useMemo(() => totalKeystones(allocation), [allocation]);
  const goldSpent = useMemo(() => deriveGoldSpent(built), [built]);
  const phase = derivedPhase(allocation, holds);
  const full = picks >= MAX_KEYSTONES;

  const recommended = useMemo(
    () => recommendedPick(allocation, plan),
    [allocation, plan],
  );

  /**
   * The plan's next concrete move, carried here so it stays on screen
   * while you're reading the map — the roadmap itself is a long way down
   * the page by then.
   */
  const progress = useMemo(
    () =>
      plan?.progression
        ? planProgress(plan.progression, allocation, built)
        : null,
    [plan, allocation, built],
  );

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
      <div
        className="live-strip-elements"
        role="group"
        aria-label="Spend a keystone"
      >
        {ELEMENTS.map((element, index) => {
          const level = allocation[element] ?? 0;
          const maxed = level >= MAX_ELEMENT_LEVEL;
          return (
            <button
              key={element}
              type="button"
              className="live-pip"
              data-empty={level === 0 || undefined}
              data-recommended={
                recommended?.element === element || undefined
              }
              disabled={maxed || full}
              onClick={() => spendPick(element)}
              aria-label={`Take ${element}. Currently ${
                level > 0 ? `level ${level}` : "unpicked"
              }.`}
              title={
                maxed
                  ? `${element} is maxed`
                  : full
                    ? "Every keystone is spent"
                    : `Take ${element} ${roman(level + 1)} — key ${index + 1}`
              }
            >
              <ElementIcon element={element} assets={assets} size={18} />
              <b className="mono">{level > 0 ? roman(level) : "·"}</b>
            </button>
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

        {progress && (
          <span className="live-strip-next">
            <span className="live-strip-stage">{progress.stage}</span>
            {progress.nextAction ? (
              // Actionable, so it's the button — the plan card used to own
              // this and sat at the bottom of the page, which is nowhere
              // near where you are when you finish building the thing.
              <button
                type="button"
                className="live-strip-do"
                title={`Log ${progress.nextAction.towerName} ${roman(
                  progress.nextAction.toLevel,
                )} as built`}
                onClick={() =>
                  addBuilt(
                    progress.nextAction!.towerId,
                    progress.nextAction!.toLevel,
                  )
                }
              >
                <span aria-hidden="true">☐</span>
                {progress.nextAction.kind === "upgrade"
                  ? "upgrade"
                  : "build"}{" "}
                <b>
                  {progress.nextAction.towerName}{" "}
                  {roman(progress.nextAction.toLevel)}
                </b>
              </button>
            ) : progress.blockedAction ? (
              <>
                <b>
                  {progress.blockedAction.action.towerName}{" "}
                  {roman(progress.blockedAction.action.toLevel)}
                </b>{" "}
                needs {progress.blockedAction.missing.join(" · ")}
              </>
            ) : (
              "plan complete"
            )}
          </span>
        )}

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
