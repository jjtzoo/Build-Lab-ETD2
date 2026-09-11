"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { gold, roman } from "@/components/build-lab/primitives";
import {
  builtRowKey,
  deriveGoldSpent,
  liveTowerName,
  liveTowerReachableLevel,
  loggableTowers,
  resolveLiveTowerCost,
  staleFieldRows,
} from "@/lib/engine/liveGame";
import { LiveTowerIcon } from "@/components/live/LiveTowerIcon";
import { useLiveGame } from "@/components/live/store";

function rowCost(towerId: string, level: number, quantity: number): number {
  return resolveLiveTowerCost(towerId, level) * quantity;
}

/**
 * What the player has on the field. Rows are per tower **and** level, so a
 * pair of Light I sits beside a Light II. Gold is derived, never typed.
 * Logging a tower off the summon moment happens through the search here —
 * no wall of chips.
 */
export function FieldPanel({ assets }: { assets: BuildLabAssets }) {
  const built = useLiveGame((s) => s.built);
  const allocation = useLiveGame((s) => s.allocation);
  const addBuilt = useLiveGame((s) => s.addBuilt);
  const setBuiltLevel = useLiveGame((s) => s.setBuiltLevel);
  const setBuiltQuantity = useLiveGame((s) => s.setBuiltQuantity);
  const removeBuilt = useLiveGame((s) => s.removeBuilt);
  const reduce = useReducedMotion();

  const [query, setQuery] = useState("");

  const goldSpent = useMemo(() => deriveGoldSpent(built), [built]);
  const towerCount = built.reduce(
    (total, entry) => total + entry.quantity,
    0,
  );
  const staleKeys = useMemo(
    () =>
      new Set(
        staleFieldRows(allocation, built).map((entry) =>
          builtRowKey(entry.towerId, entry.level),
        ),
      ),
    [allocation, built],
  );

  const catalog = useMemo(
    () => loggableTowers(allocation),
    [allocation],
  );
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return catalog
      .filter((tower) => tower.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [catalog, query]);

  return (
    <motion.section
      className="live-field"
      aria-label="Your field"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="live-panel-head">
        <h2>Your field</h2>
        <span className="live-panel-note">
          {towerCount} tower{towerCount === 1 ? "" : "s"} ·{" "}
          <b className="mono">{gold(goldSpent)}</b>
        </span>
      </header>

      <div className="live-log">
        <input
          type="text"
          className="live-log-input"
          placeholder="＋ log a tower — type a name"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search for a tower to log"
        />
        {matches.length > 0 && (
          <ul className="live-log-results">
            {matches.map((tower) => (
              <li key={tower.id}>
                <button
                  type="button"
                  onClick={() => {
                    addBuilt(tower.id, 1);
                    setQuery("");
                  }}
                >
                  <LiveTowerIcon
                    towerId={tower.id}
                    assets={assets}
                    size={20}
                  />
                  <span>{tower.name}</span>
                  {tower.maxLevel > 1 && (
                    <span className="live-log-max mono">
                      to {roman(tower.maxLevel)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {built.length === 0 ? (
        <p className="live-empty">
          Nothing logged yet — use the summon chips or the search above.
        </p>
      ) : (
        <ul className="live-field-list">
          {built.map((entry) => {
            const key = builtRowKey(entry.towerId, entry.level);
            const stale = staleKeys.has(key);
            // Cap the level buttons at what the picks support — but never
            // below this row's own level, so a stale row can still be
            // corrected downward.
            const max = Math.max(
              entry.level,
              liveTowerReachableLevel(entry.towerId, allocation),
            );
            const name = liveTowerName(entry.towerId);
            return (
              <li
                key={key}
                className="live-field-row"
                data-stale={stale || undefined}
              >
                <LiveTowerIcon
                  towerId={entry.towerId}
                  assets={assets}
                  size={26}
                />
                <span className="live-field-name">
                  {name}
                  {stale && (
                    <span className="live-field-stale" title="Not reachable at your current picks">
                      out of reach
                    </span>
                  )}
                </span>

                {max > 1 ? (
                  <span
                    className="live-level-group"
                    role="group"
                    aria-label={`${name} level`}
                  >
                    {Array.from({ length: max }, (_, i) => i + 1).map(
                      (level) => (
                        <button
                          key={level}
                          type="button"
                          className="live-level"
                          data-on={entry.level === level || undefined}
                          onClick={() =>
                            setBuiltLevel(
                              entry.towerId,
                              entry.level,
                              level,
                            )
                          }
                          aria-pressed={entry.level === level}
                        >
                          {roman(level)}
                        </button>
                      ),
                    )}
                  </span>
                ) : (
                  <span className="live-level-fixed mono">
                    {roman(entry.level)}
                  </span>
                )}

                <span className="live-qty">
                  <button
                    type="button"
                    onClick={() =>
                      setBuiltQuantity(
                        entry.towerId,
                        entry.level,
                        entry.quantity - 1,
                      )
                    }
                    aria-label={`One fewer ${name}`}
                  >
                    −
                  </button>
                  <b className="mono">{entry.quantity}</b>
                  <button
                    type="button"
                    onClick={() =>
                      setBuiltQuantity(
                        entry.towerId,
                        entry.level,
                        entry.quantity + 1,
                      )
                    }
                    aria-label={`One more ${name}`}
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
                  onClick={() =>
                    removeBuilt(entry.towerId, entry.level)
                  }
                  aria-label={`Remove ${name} ${roman(entry.level)}`}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </motion.section>
  );
}
