"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { ElementIcon, gold, roman } from "@/components/build-lab/primitives";
import { ELEMENTS } from "@/lib/domain/elements";
import { MAX_ELEMENT_LEVEL } from "@/lib/engine/allocation";
import {
  deriveGoldSpent,
  derivedPhase,
  liveTowerName,
  liveTowerLevelLabel,
  livePhaseLabel,
  MAX_KEYSTONES,
  recommendedPick,
  totalKeystones,
} from "@/lib/engine/liveGame";
import { calibratedEconomy } from "@/lib/engine/liveEconomy";
import { useLiveGame } from "@/components/live/store";
import { liveCoaching } from "@/lib/engine/liveCoaching";
import { PlanAction } from "./PlanAction";

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
  const stripRef = useRef<HTMLDivElement>(null);
  const allocation = useLiveGame((s) => s.allocation);
  const built = useLiveGame((s) => s.built);
  const holds = useLiveGame((s) => s.holds);
  const matchLength = useLiveGame((s) => s.matchLength);
  const plan = useLiveGame((s) => s.plan);

  /*
   * Publish the strip's real height as --live-strip-h on the shell. The
   * sticky map column, the placement confirm bar and the plan tracker all
   * offset themselves by it, and the strip is not a fixed height: it grows
   * a second row when a strategy is loaded (138px against the 72px CSS
   * fallback), which pushed the map column 148px past the viewport and cut
   * the Confirm button off the bottom of the screen.
   *
   * Measured synchronously on mount and again whenever the strip's content
   * can change, because a ResizeObserver's initial callback is not
   * something to depend on — in the in-app browser it never fired at all,
   * and the variable stayed unset. The observer is kept for anything the
   * deps can't predict (font loading, a wrapped row).
   */
  useEffect(() => {
    const strip = stripRef.current;
    const shell = strip?.closest<HTMLElement>(".live-shell");
    if (!strip || !shell) return;
    const apply = () =>
      shell.style.setProperty(
        "--live-strip-h",
        `${Math.ceil(strip.getBoundingClientRect().height)}px`,
      );
    apply();
    window.addEventListener("resize", apply);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(apply);
    observer?.observe(strip);
    return () => {
      window.removeEventListener("resize", apply);
      observer?.disconnect();
    };
  }, [allocation, built, holds, plan]);
  const setPlan = useLiveGame((s) => s.setPlan);
  const newGame = useLiveGame((s) => s.newGame);
  const spendPick = useLiveGame((s) => s.spendPick);

  const [menuOpen, setMenuOpen] = useState(false);

  const picks = useMemo(() => totalKeystones(allocation), [allocation]);
  const goldSpent = useMemo(() => deriveGoldSpent(built), [built]);
  const phase = derivedPhase(allocation, holds);
  const economy = useMemo(
    () => calibratedEconomy(phase, goldSpent, matchLength),
    [phase, goldSpent, matchLength],
  );
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
      plan
        ? liveCoaching(plan, allocation, built, holds, economy.availableGold)
        : null,
    [plan, allocation, built, holds, economy.availableGold],
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
    <div className="live-strip" ref={stripRef}>
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
              data-recommended={recommended?.element === element || undefined}
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
        <span
          className="mono live-strip-gold"
          title={`Estimated bank from ${economy.checkpoint.label} length calibration, before interest. ${gold(goldSpent)} spent.`}
        >
          ~{gold(economy.availableGold)}
        </span>

        {progress && (
          <span className="live-strip-next">
            <span className="live-strip-stage">Now</span>
            {progress.nextAction ? (
              <PlanAction action={progress.nextAction} />
            ) : progress.blockedAction ? (
              <>
                <b>
                  {progress.blockedAction.towerName}{" "}
                  {liveTowerLevelLabel(
                    progress.blockedAction.towerId,
                    progress.blockedAction.toLevel,
                  )}
                </b>{" "}
                needs {progress.blockedAction.missing.join(" · ")}
              </>
            ) : progress.complete ? (
              "plan complete"
            ) : (
              "finish planned keystones"
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
