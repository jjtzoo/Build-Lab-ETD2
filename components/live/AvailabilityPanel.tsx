"use client";

import { useMemo, useState } from "react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { roman } from "@/components/build-lab/primitives";
import { liveAvailability } from "@/lib/engine/liveAvailability";
import { LiveTowerIcon } from "./LiveTowerIcon";
import { useLiveGame } from "./store";
import { liveCoaching } from "@/lib/engine/liveCoaching";

const GROUPS = [
  ["basic", "Arrow & Cannon"],
  ["mono", "Mono · I–III"],
  ["element", "Dual / Trio / Quad"],
  ["end-game", "End Game · Pure IV & Periodic"],
] as const;

export function AvailabilityPanel({ assets }: { assets: BuildLabAssets }) {
  const allocation = useLiveGame((s) => s.allocation);
  const built = useLiveGame((s) => s.built);
  const holds = useLiveGame((s) => s.holds);
  const addBuilt = useLiveGame((s) => s.addBuilt);
  const plan = useLiveGame((s) => s.plan);
  const priority = plan
    ? liveCoaching(plan, allocation, built, holds).actions.map((t) => t.towerId)
    : [];
  const [query, setQuery] = useState("");
  const towers = useMemo(
    () => liveAvailability(allocation, holds, built),
    [allocation, holds, built],
  );
  return (
    <div className="live-availability">
      <h3>Available towers</h3>
      <p className="live-panel-note">Log one copy at the level you built.</p>
      <input
        className="live-log-input"
        aria-label="Filter available towers"
        placeholder="Find a tower"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {GROUPS.map(([group, label]) => {
        const options = towers
          .filter(
            (t) =>
              t.group === group &&
              t.name.toLowerCase().includes(query.toLowerCase()),
          )
          .sort(
            (a, b) =>
              Number(priority.includes(b.id)) - Number(priority.includes(a.id)),
          );
        if (!options.length) return null;
        return (
          <section
            key={group}
            className="live-availability-group"
            aria-label={label}
          >
            <h4>{label}</h4>
            <div className="live-available-grid">
              {options.map((tower) => (
                <div
                  key={tower.id}
                  className="live-available-tower"
                  data-on-plan={priority.includes(tower.id) || undefined}
                >
                  <span className="live-available-name">
                    <LiveTowerIcon
                      towerId={tower.id}
                      assets={assets}
                      size={22}
                    />
                    {tower.name}
                    {priority.includes(tower.id) && (
                      <small className="live-on-plan">On plan</small>
                    )}
                  </span>
                  <div className="live-available-levels">
                    {Array.from(
                      { length: tower.maxLevel },
                      (_, index) => index + 1,
                    ).map((level) => (
                      <button
                        key={level}
                        type="button"
                        className="live-reveal-chip"
                        disabled={!!tower.blockedReason}
                        title={
                          tower.blockedReason ??
                          `Log one ${tower.name} ${roman(level)}`
                        }
                        aria-label={`Log ${tower.name} ${tower.group === "end-game" ? "" : roman(level)}`.trim()}
                        onClick={() => addBuilt(tower.id, level)}
                      >
                        +{" "}
                        {tower.group === "end-game"
                          ? tower.id === "periodic"
                            ? "Periodic"
                            : "IV"
                          : roman(level)}
                      </button>
                    ))}
                  </div>
                  {tower.blockedReason && <small>{tower.blockedReason}</small>}
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {!towers.some((t) =>
        t.name.toLowerCase().includes(query.toLowerCase()),
      ) && <p className="live-empty">No available tower matches.</p>}
    </div>
  );
}
