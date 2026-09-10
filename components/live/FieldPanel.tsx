"use client";

import { useMemo } from "react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { TowerIcon, gold, roman } from "@/components/build-lab/primitives";
import { getTower } from "@/lib/domain/towerCatalog";
import { getEndGameTowerFact } from "@/lib/domain/endGameTowerFacts";
import type { EndGameTowerId } from "@/lib/domain/endGameTower";
import { resolveNormalTowerCost } from "@/lib/domain/towerEconomics";
import { deriveGoldSpent, isEndGameTowerId } from "@/lib/engine/liveGame";
import { useLiveGame } from "@/components/live/store";

function towerName(towerId: string): string {
  return isEndGameTowerId(towerId)
    ? getEndGameTowerFact(towerId as EndGameTowerId).name
    : getTower(towerId).name;
}

function maxLevelFor(towerId: string): number {
  return isEndGameTowerId(towerId) ? 1 : getTower(towerId).maxLevel;
}

function rowCost(towerId: string, level: number, quantity: number): number {
  if (isEndGameTowerId(towerId)) {
    return (
      getEndGameTowerFact(towerId as EndGameTowerId).minimumFieldCost *
      quantity
    );
  }
  return (
    resolveNormalTowerCost(towerId, level).minimumFieldCost * quantity
  );
}

/**
 * What the player actually has on the field. Levels and counts are theirs to
 * set; gold is derived, never typed — catalog costs are cumulative, so a
 * tower counts once at its current level.
 */
export function FieldPanel({ assets }: { assets: BuildLabAssets }) {
  const built = useLiveGame((s) => s.built);
  const setBuiltLevel = useLiveGame((s) => s.setBuiltLevel);
  const setBuiltQuantity = useLiveGame((s) => s.setBuiltQuantity);
  const removeBuilt = useLiveGame((s) => s.removeBuilt);

  const goldSpent = useMemo(() => deriveGoldSpent(built), [built]);
  const towerCount = built.reduce(
    (total, entry) => total + entry.quantity,
    0,
  );

  return (
    <section className="live-panel" aria-label="Your field">
      <header className="live-panel-head">
        <h3>Your field</h3>
        <span className="live-panel-note">
          {towerCount} tower{towerCount === 1 ? "" : "s"}
        </span>
      </header>

      {built.length === 0 ? (
        <p className="live-empty">
          Nothing logged yet. Tap a tower above as you build it.
        </p>
      ) : (
        <ul className="live-field-list">
          {built.map((entry) => {
            const max = maxLevelFor(entry.towerId);
            const levels = Array.from(
              { length: max },
              (_, index) => index + 1,
            );
            return (
              <li key={entry.towerId} className="live-field-row">
                <TowerIcon
                  towerId={entry.towerId}
                  name={towerName(entry.towerId)}
                  assets={assets}
                  size={28}
                />
                <span className="live-field-name">
                  {towerName(entry.towerId)}
                </span>

                <span
                  className="live-level-group"
                  role="group"
                  aria-label={`${towerName(entry.towerId)} level`}
                >
                  {levels.map((level) => (
                    <button
                      key={level}
                      type="button"
                      className="live-level"
                      data-on={entry.level === level || undefined}
                      onClick={() =>
                        setBuiltLevel(entry.towerId, level)
                      }
                      aria-pressed={entry.level === level}
                    >
                      {roman(level)}
                    </button>
                  ))}
                </span>

                <span className="live-qty">
                  <button
                    type="button"
                    onClick={() =>
                      setBuiltQuantity(
                        entry.towerId,
                        entry.quantity - 1,
                      )
                    }
                    aria-label={`One fewer ${towerName(entry.towerId)}`}
                  >
                    −
                  </button>
                  <b className="mono">{entry.quantity}</b>
                  <button
                    type="button"
                    onClick={() =>
                      setBuiltQuantity(
                        entry.towerId,
                        entry.quantity + 1,
                      )
                    }
                    aria-label={`One more ${towerName(entry.towerId)}`}
                  >
                    +
                  </button>
                </span>

                <span className="mono live-field-cost">
                  {gold(
                    rowCost(entry.towerId, entry.level, entry.quantity),
                  )}
                </span>

                <button
                  type="button"
                  className="live-field-remove"
                  onClick={() => removeBuilt(entry.towerId)}
                  aria-label={`Remove ${towerName(entry.towerId)}`}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="live-field-total">
        <span>Gold spent</span>
        <b className="mono">{gold(goldSpent)}</b>
      </footer>
    </section>
  );
}
