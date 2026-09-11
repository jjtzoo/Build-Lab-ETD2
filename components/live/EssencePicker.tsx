"use client";

import { useMemo } from "react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { ElementIcon } from "@/components/build-lab/primitives";
import { getEndGameTowerFact } from "@/lib/domain/endGameTowerFacts";
import type { EndGameTowerId } from "@/lib/domain/endGameTower";
import { derivedPhase, endGameReadiness } from "@/lib/engine/liveGame";
import { useLiveGame } from "@/components/live/store";

/**
 * Once Essence is granted, the Pure / Periodic options in reach become
 * loggable here — one essence each, capped at what the phase gave you.
 */
export function EssencePicker({ assets }: { assets: BuildLabAssets }) {
  const allocation = useLiveGame((s) => s.allocation);
  const plan = useLiveGame((s) => s.plan);
  const holds = useLiveGame((s) => s.holds);
  const built = useLiveGame((s) => s.built);
  const addBuilt = useLiveGame((s) => s.addBuilt);

  const readiness = useMemo(
    () =>
      endGameReadiness(
        allocation,
        plan,
        derivedPhase(allocation, holds),
        built,
      ),
    [allocation, plan, holds, built],
  );

  if (
    readiness.essenceAvailable === 0 ||
    !readiness.unlocked
  ) {
    return null;
  }

  const remaining =
    readiness.essenceAvailable - readiness.essenceSpent;
  const options = [
    ...readiness.access.pureCandidates,
    ...(readiness.access.periodicCandidate
      ? [readiness.access.periodicCandidate]
      : []),
  ];

  return (
    <div className="live-essence-picker">
      {options.map((option) => {
        const fact = getEndGameTowerFact(
          option.towerId as EndGameTowerId,
        );
        return (
          <button
            key={option.towerId}
            type="button"
            className="live-essence-chip"
            disabled={remaining <= 0}
            onClick={() => addBuilt(option.towerId, 1)}
            title={`Log a ${fact.name} (1 essence)`}
          >
            {option.element !== "Composite" ? (
              <ElementIcon
                element={option.element}
                assets={assets}
                size={16}
              />
            ) : (
              <span aria-hidden="true">◆</span>
            )}
            {fact.name}
          </button>
        );
      })}
      {remaining <= 0 && (
        <span className="live-essence-spent">both essence spent</span>
      )}
    </div>
  );
}
