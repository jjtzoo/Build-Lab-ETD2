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
import { useLiveGame, type LiveSnapshot } from "@/components/live/store";

const STORAGE_KEY = "etd2:live:v1";

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

    if (initialPlan) {
      setPlan(initialPlan);
    } else {
      try {
        const handed = window.localStorage.getItem(PENDING_IMPORT_KEY);
        if (handed) {
          const parsed = JSON.parse(handed) as PortableBuild;
          if (parsed?.anchorTowerId) setPlan(parsed);
        }
      } catch {
        /* ignore a malformed handoff */
      }
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) hydrate(JSON.parse(raw) as Partial<LiveSnapshot>);
    } catch {
      /* corrupt game log — start fresh */
    }
  }, [initialPlan, setPlan, hydrate]);

  // Persist the game in progress on every change.
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ allocation, pickLog, built, holds }),
      );
    } catch {
      /* storage unavailable */
    }
  }, [allocation, pickLog, built, holds]);

  return (
    <main className="lab-shell live-shell">
      <span className="lab-grain" aria-hidden="true" />
      <LabHeader current="live" />

      <StatusStrip assets={assets} />

      {/*
       * One continuous page, deliberately — this tool is read and acted on
       * mid-match, and clicking between tabs to find "what do I do next"
       * while a wave is inbound is exactly the hassle a live tracker
       * shouldn't add. Every section is always mounted; the status strip
       * above is sticky so wave/gold/keystones stay in view while scrolling
       * past whichever section isn't the immediate reason you opened this.
       */}
      <div className="live-focal">
        <div className="live-section">
          {endGame ? (
            <EndGamePanel assets={assets} />
          ) : (
            <SummonPanel assets={assets} />
          )}
        </div>
        <div className="live-section">
          <FieldPanel assets={assets} />
        </div>
        <div className="live-section live-section-wide">
          {mapReady && (
            <Suspense fallback={null}>
              <MapPanel assets={assets} />
            </Suspense>
          )}
        </div>
        <div className="live-section">
          <PlanPanel assets={assets} />
        </div>
      </div>

      <LabFooter />
    </main>
  );
}
