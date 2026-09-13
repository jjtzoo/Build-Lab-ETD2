"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { LabHeader, LabFooter } from "@/components/build-lab/LabChrome";
import {
  PENDING_IMPORT_KEY,
  type PortableBuild,
} from "@/lib/domain/portableBuild";
import { isEndGame } from "@/lib/engine/liveGame";
import { StatusStrip } from "@/components/live/StatusStrip";
import { SummonPanel } from "@/components/live/SummonPanel";
import { EndGamePanel } from "@/components/live/EndGamePanel";
import { FieldPanel } from "@/components/live/FieldPanel";
import { MapPanel } from "@/components/live/MapPanel";
import { PlanPanel } from "@/components/live/PlanPanel";
import { BuildLabTracker } from "@/components/live/BuildLabTracker";
import { useLiveGame, type LiveSnapshot } from "@/components/live/store";
import {
  consumeLiveImport,
  getLiveStorage,
  LIVE_PLAN_KEY,
  LIVE_STORAGE_KEY as STORAGE_KEY,
  parseStoredPlan,
  resolveLiveImport,
} from "@/lib/domain/liveImport";
import { LiveDialog } from "./LiveDialog";

export function LiveTracker({
  assets,
  initialPlan,
}: {
  assets: BuildLabAssets;
  initialPlan: PortableBuild | null;
}) {
  const setPlan = useLiveGame((s) => s.setPlan);
  const hydrate = useLiveGame((s) => s.hydrate);
  const allocation = useLiveGame((s) => s.allocation);
  const pickLog = useLiveGame((s) => s.pickLog);
  const built = useLiveGame((s) => s.built);
  const holds = useLiveGame((s) => s.holds);
  const placements = useLiveGame((s) => s.placements);
  const plan = useLiveGame((s) => s.plan);
  const newGame = useLiveGame((s) => s.newGame);
  const [ready, setReady] = useState(false);
  const [incoming, setIncoming] = useState<PortableBuild | null>(null);
  const saved = useRef<Partial<LiveSnapshot> | null>(null);

  const hydrated = useRef(false);

  /**
   * The map is client-only on purpose.
   *
   * It used to live behind a tab, so it never server-rendered at all.
   * Always mounting it put a large, purely interactive surface into SSR,
   * where it hydrated with mismatched attributes — and a mismatch React
   * "won't patch up" is a real rendering bug, not just console noise.
   * Nothing about the schematic is useful before the client is live, so
   * it waits for mount rather than being reconciled.
   */
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => setMapReady(true), []);

  const endGame = useMemo(() => isEndGame(allocation), [allocation]);

  // Hydrate once: a ?b= link (decoded server-side) wins, then a build
  // handed over from another tool, then the local game in progress.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;

    let imported = initialPlan;
    let savedPlan: PortableBuild | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) saved.current = JSON.parse(raw) as Partial<LiveSnapshot>;
    } catch {
      /* A corrupt saved match must not hide a new import. */
    }
    try {
      imported ??= parseStoredPlan(
        window.localStorage.getItem(PENDING_IMPORT_KEY),
      );
      savedPlan = parseStoredPlan(window.localStorage.getItem(LIVE_PLAN_KEY));
    } catch {
      /* corrupt game log — start fresh */
    }
    if (imported) {
      setIncoming(imported);
      return;
    }
    newGame();
    try {
      if (saved.current) hydrate(saved.current);
    } catch {
      newGame();
    }
    setPlan(savedPlan);
    setReady(true);
  }, [initialPlan, setPlan, hydrate, newGame]);

  function acceptImport(choice: "fresh" | "keep") {
    if (!incoming) return;
    const resolved = resolveLiveImport(choice, incoming, saved.current);
    newGame();
    try {
      if (resolved.snapshot) hydrate(resolved.snapshot);
    } catch {
      newGame();
    }
    setPlan(resolved.plan);
    const cleanUrl = consumeLiveImport(getLiveStorage(), window.location.href);
    window.history.replaceState(window.history.state, "", cleanUrl);
    setIncoming(null);
    setReady(true);
  }

  // Persist the game in progress on every change.
  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ allocation, pickLog, built, holds, placements }),
      );
      if (plan)
        window.localStorage.setItem(LIVE_PLAN_KEY, JSON.stringify(plan));
      else window.localStorage.removeItem(LIVE_PLAN_KEY);
    } catch {
      /* storage unavailable */
    }
  }, [ready, allocation, pickLog, built, holds, placements, plan]);

  if (!ready)
    return (
      <main className="lab-shell live-shell">
        <LabHeader current="live" />
        {incoming ? (
          <LiveDialog title="Import into Live Tracker">
            <p>
              Load the incoming{" "}
              {incoming.source === "engine" ? "Build Lab" : "Theory Craft"} plan
              into a fresh match, or keep your current picks, towers and map
              placements?
            </p>
            <div className="live-dialog-actions">
              <button
                type="button"
                className="secondary-button"
                autoFocus
                onClick={() => acceptImport("keep")}
              >
                Keep current match
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => acceptImport("fresh")}
              >
                Start fresh
              </button>
            </div>
          </LiveDialog>
        ) : (
          <p className="live-empty">Loading your tracker…</p>
        )}
      </main>
    );

  return (
    <main className="lab-shell live-shell">
      <span className="lab-grain" aria-hidden="true" />
      <LabHeader current="live" />

      <StatusStrip assets={assets} />
      <BuildLabTracker assets={assets} />

      {/*
       * One continuous page, deliberately — this tool is read and acted on
       * mid-match, and clicking between tabs to find "what do I do next"
       * while a wave is inbound is exactly the hassle a live tracker
       * shouldn't add. Every section is always mounted; the status strip
       * above is sticky so wave/gold/keystones stay in view while scrolling
       * past whichever section isn't the immediate reason you opened this.
       */}
      {/*
       * Two columns once there's room for them. The decision stack
       * (what to summon, what I'm aiming at, what I hold) is a narrow
       * reading column; the map is a wide diagram. Side by side, the map
       * can stay pinned while the left column scrolls — which is the
       * only way "keep the plan visible while I work the map" works on
       * one page. Below the breakpoint this collapses back to the single
       * column, in the same order.
       */}
      <div className="live-focal">
        <div className="live-col live-col-main">
          <div className="live-section">
            {endGame ? (
              <EndGamePanel assets={assets} />
            ) : (
              <SummonPanel assets={assets} />
            )}
          </div>
          {/*
            Plan sits second, not last. It answers "what am I aiming at",
            which belongs next to the summon decision it informs — and at
            the bottom of a page this long it was effectively unreachable.
            Field follows because it's execution: what you actually have.
          */}
          <div className="live-section">
            <PlanPanel assets={assets} />
          </div>
          <div className="live-section">
            <FieldPanel assets={assets} />
          </div>
        </div>

        <div className="live-col live-col-map">
          {mapReady && (
            <Suspense fallback={null}>
              <MapPanel assets={assets} />
            </Suspense>
          )}
        </div>
      </div>

      <LabFooter />
    </main>
  );
}
