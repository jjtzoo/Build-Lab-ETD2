"use client";

import { useMemo } from "react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { TowerIcon, roman } from "@/components/build-lab/primitives";
import { getTower } from "@/lib/domain/towerCatalog";
import { maxReachableTowerLevel } from "@/lib/engine/allocation";
import { buildableByRole } from "@/lib/engine/liveGame";
import { useLiveGame } from "@/components/live/store";

/**
 * Everything the current allocation can field, grouped by core role. Towers
 * the imported plan wants are starred and sorted first; plan towers that are
 * still out of reach get their own "not yet" strip so the player can see
 * what they are picking toward.
 */
export function BuildablePanel({ assets }: { assets: BuildLabAssets }) {
  const allocation = useLiveGame((s) => s.allocation);
  const plan = useLiveGame((s) => s.plan);
  const built = useLiveGame((s) => s.built);
  const addBuilt = useLiveGame((s) => s.addBuilt);
  const lastPick = useLiveGame((s) => s.lastPick);

  const planIds = useMemo(
    () => new Set((plan?.towers ?? []).map((entry) => entry.towerId)),
    [plan],
  );
  const builtIds = useMemo(
    () => new Set(built.map((entry) => entry.towerId)),
    [built],
  );
  const justUnlocked = useMemo(() => {
    if (!lastPick) return new Set<string>();
    const before = new Set(
      buildableByRole(lastPick.before).flatMap((group) =>
        group.towers.map((entry) => entry.tower.id),
      ),
    );
    return new Set(
      buildableByRole(lastPick.after)
        .flatMap((group) => group.towers.map((entry) => entry.tower.id))
        .filter((id) => !before.has(id)),
    );
  }, [lastPick]);

  const groups = useMemo(
    () => buildableByRole(allocation),
    [allocation],
  );

  const planNotYet = useMemo(() => {
    if (!plan) return [];
    return plan.towers
      .filter(
        (entry) =>
          maxReachableTowerLevel(getTower(entry.towerId), allocation) <
          entry.level,
      )
      .map((entry) => {
        const tower = getTower(entry.towerId);
        const missing = tower.recipe
          .filter((element) => (allocation[element] ?? 0) < entry.level)
          .map(
            (element) => `${element} ${roman(entry.level)}`,
          );
        return { tower, level: entry.level, missing };
      });
  }, [plan, allocation]);

  return (
    <section className="live-panel" aria-label="Buildable towers">
      <header className="live-panel-head">
        <h3>Buildable now</h3>
        <span className="live-panel-note">tap to log one</span>
      </header>

      {groups.length === 0 && (
        <p className="live-empty">
          Nothing yet — spend your first element pick above.
        </p>
      )}

      {groups.map((group) => {
        const sorted = [...group.towers].sort((a, b) => {
          const planDelta =
            Number(planIds.has(b.tower.id)) -
            Number(planIds.has(a.tower.id));
          return planDelta || a.tower.name.localeCompare(b.tower.name);
        });
        return (
          <div key={group.role} className="live-build-group">
            <h4>{group.label}</h4>
            <div className="live-build-grid">
              {sorted.map(({ tower, maxLevel }) => (
                <button
                  key={tower.id}
                  type="button"
                  className="live-build-chip"
                  data-plan={planIds.has(tower.id) || undefined}
                  data-built={builtIds.has(tower.id) || undefined}
                  data-new={justUnlocked.has(tower.id) || undefined}
                  onClick={() => addBuilt(tower.id)}
                  title={`Log a ${tower.name} (max Lv ${roman(maxLevel)})`}
                >
                  <TowerIcon
                    towerId={tower.id}
                    name={tower.name}
                    assets={assets}
                    size={24}
                  />
                  <span className="live-build-name">{tower.name}</span>
                  <b className="mono">{roman(maxLevel)}</b>
                  {planIds.has(tower.id) && (
                    <span className="live-star" aria-label="in your plan">
                      ★
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {planNotYet.length > 0 && (
        <div className="live-build-group live-locked">
          <h4>Plan towers not yet in reach</h4>
          <ul className="live-locked-list">
            {planNotYet.map(({ tower, level, missing }) => (
              <li key={tower.id}>
                <span>
                  {tower.name} {roman(level)}
                </span>
                <span className="live-locked-need">
                  needs {missing.join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
