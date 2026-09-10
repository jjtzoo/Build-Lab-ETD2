"use client";

import { useEffect, useRef, useState } from "react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { LabHeader, LabFooter } from "@/components/build-lab/LabChrome";
import { getTower } from "@/lib/domain/towerCatalog";
import {
  decodePortableBuild,
  PENDING_IMPORT_KEY,
  type PortableBuild,
} from "@/lib/domain/portableBuild";
import { KeystoneInput } from "@/components/live/KeystoneInput";
import { PhaseStepper } from "@/components/live/PhaseStepper";
import { BuildablePanel } from "@/components/live/BuildablePanel";
import { FieldPanel } from "@/components/live/FieldPanel";
import { NextMovePanel } from "@/components/live/NextMovePanel";
import { CoreRolePanel } from "@/components/live/CoreRolePanel";
import { UnlockToast } from "@/components/live/UnlockToast";
import { useLiveGame, type LiveSnapshot } from "@/components/live/store";

const STORAGE_KEY = "etd2:live:v1";

type Tab = "next" | "build" | "field";

export function LiveTracker({
  assets,
  initialPlan,
}: {
  assets: BuildLabAssets;
  initialPlan: PortableBuild | null;
}) {
  const plan = useLiveGame((s) => s.plan);
  const setPlan = useLiveGame((s) => s.setPlan);
  const hydrate = useLiveGame((s) => s.hydrate);
  const newGame = useLiveGame((s) => s.newGame);
  const allocation = useLiveGame((s) => s.allocation);
  const pickLog = useLiveGame((s) => s.pickLog);
  const built = useLiveGame((s) => s.built);
  const phase = useLiveGame((s) => s.phase);

  const [tab, setTab] = useState<Tab>("next");
  const hydrated = useRef(false);

  // Hydrate once: a ?b= link (already decoded server-side) wins, then a
  // build handed over from another tool, then the local game in progress.
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
        JSON.stringify({ allocation, pickLog, built, phase }),
      );
    } catch {
      /* storage unavailable */
    }
  }, [allocation, pickLog, built, phase]);

  const anchorName = plan
    ? (() => {
        try {
          return getTower(plan.anchorTowerId).name;
        } catch {
          return plan.anchorTowerId;
        }
      })()
    : null;

  return (
    <main className="lab-shell live-shell">
      <span className="lab-grain" aria-hidden="true" />
      <LabHeader current="live" />

      <div className="live-bar">
        <div className="live-bar-plan">
          {plan ? (
            <>
              <span className="live-bar-label">Plan</span>
              <strong>{anchorName}</strong>
              <span className="live-bar-source">
                from{" "}
                {plan.source === "engine" ? "Build Lab" : "Theory Craft"}
              </span>
              <button
                type="button"
                className="live-bar-btn"
                onClick={() => setPlan(null)}
              >
                Clear plan
              </button>
            </>
          ) : (
            <>
              <span className="live-bar-label">No plan</span>
              <span className="live-bar-source">
                tracking from your picks
              </span>
            </>
          )}
        </div>

        <div className="live-bar-actions">
          <button
            type="button"
            className="live-bar-btn"
            onClick={newGame}
          >
            New game
          </button>
        </div>
      </div>

      <PhaseStepper />
      <KeystoneInput assets={assets} />

      <nav className="live-tabs" aria-label="Tracker sections">
        {(
          [
            ["next", "Next"],
            ["build", "Build"],
            ["field", "Field"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="live-tab"
            data-on={tab === id || undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="live-body" data-tab={tab}>
        <div className="live-col live-col-left">
          <div className="live-slot" data-slot="build">
            <BuildablePanel assets={assets} />
          </div>
          <div className="live-slot" data-slot="field">
            <FieldPanel assets={assets} />
          </div>
        </div>
        <div className="live-col live-col-right">
          <div className="live-slot" data-slot="next">
            {plan?.progression?.length ? (
              <NextMovePanel assets={assets} />
            ) : (
              <CoreRolePanel assets={assets} />
            )}
          </div>
        </div>
      </div>

      <UnlockToast />
      <LabFooter />
    </main>
  );
}
