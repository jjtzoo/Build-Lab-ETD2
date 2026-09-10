"use client";

import { useEffect, useMemo, useRef } from "react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { LabHeader, LabFooter } from "@/components/build-lab/LabChrome";
import { decodePortableBuild } from "@/lib/domain/portableBuild";
import { SlotRail } from "@/components/theorycraft/SlotRail";
import { TowerDescription } from "@/components/theorycraft/TowerDescription";
import { BuildReadout } from "@/components/theorycraft/BuildReadout";
import { ExportBuild } from "@/components/theorycraft/ExportBuild";
import { AllocationBar } from "@/components/theorycraft/AllocationBar";
import {
  useTheoryCraft,
  selectAllocation,
  selectKeystonesUsed,
} from "@/components/theorycraft/store";

const STORAGE_KEY = "etd2:theorycraft:v1";

export function TheoryCraft({ assets }: { assets: BuildLabAssets }) {
  const slots = useTheoryCraft((s) => s.slots);
  const loadPlaced = useTheoryCraft((s) => s.loadPlaced);
  const hydrated = useRef(false);

  const allocation = useMemo(
    () => selectAllocation({ slots }),
    [slots],
  );
  const used = useMemo(
    () => selectKeystonesUsed({ slots }),
    [slots],
  );

  // Hydrate once — a ?b= link wins over the last local draft.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const params = new URLSearchParams(window.location.search);
      const encoded = params.get("b");
      if (encoded) {
        const build = decodePortableBuild(encoded);
        if (build) {
          loadPlaced(build.towers);
          return;
        }
      }
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          towers?: { towerId: string; level: number }[];
        };
        if (Array.isArray(parsed.towers) && parsed.towers.length) {
          loadPlaced(parsed.towers);
        }
      }
    } catch {
      /* corrupt draft — start fresh */
    }
  }, [loadPlaced]);

  // Persist the draft on every change (after the first hydration pass).
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      const towers = slots
        .filter((slot) => slot.towerId && slot.level)
        .map((slot) => ({
          towerId: slot.towerId as string,
          level: slot.level as number,
        }));
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ towers }),
      );
    } catch {
      /* storage unavailable */
    }
  }, [slots]);

  return (
    <main className="lab-shell tc-shell">
      <span className="lab-grain" aria-hidden="true" />
      <LabHeader current="theorycraft" />

      <div className="intro">
        <p className="eyebrow">Theory Craft</p>
        <h1>Build it your way. See what the engine sees.</h1>
        <p>
          Pick a main DPS anchor, lock in a Slow, then add towers the way a
          real game lets you — every choice spends from the same 11
          element keystones. The read-out grades your build with the same
          evidence the recommendation flow uses.
        </p>
      </div>

      <div className="tc-workspace">
        <SlotRail assets={assets} />
        <TowerDescription assets={assets} />
      </div>

      <BuildReadout assets={assets} />
      <ExportBuild />

      <div className="tc-alloc-dock">
        <AllocationBar
          allocation={allocation}
          used={used}
          assets={assets}
        />
      </div>

      <LabFooter />
    </main>
  );
}
