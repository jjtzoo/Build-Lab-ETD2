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

type View = "summon" | "field" | "map" | "plan";

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

  const [view, setView] = useState<View>("summon");
  const hydrated = useRef(false);

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

  const tabs: readonly { id: View; label: string }[] = [
    { id: "summon", label: endGame ? "End Game" : "Summon" },
    { id: "field", label: "Field" },
    { id: "map", label: "Map" },
    { id: "plan", label: "Plan" },
  ];

  return (
    <main className="lab-shell live-shell">
      <span className="lab-grain" aria-hidden="true" />
      <LabHeader current="live" />

      <StatusStrip assets={assets} />

      <nav className="live-views" aria-label="Tracker view">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="live-view-tab"
            data-on={view === tab.id || undefined}
            data-alert={
              (tab.id === "summon" && endGame) || undefined
            }
            onClick={() => setView(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="live-focal" data-wide={view === "map" || undefined}>
        {view === "summon" &&
          (endGame ? (
            <EndGamePanel assets={assets} />
          ) : (
            <SummonPanel assets={assets} />
          ))}
        {view === "field" && <FieldPanel assets={assets} />}
        {view === "map" && (
          <Suspense fallback={null}>
            <MapPanel assets={assets} />
          </Suspense>
        )}
        {view === "plan" && <PlanPanel assets={assets} />}
      </div>

      <LabFooter />
    </main>
  );
}
