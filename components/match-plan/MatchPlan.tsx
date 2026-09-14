"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { LabFooter, LabHeader } from "@/components/build-lab/LabChrome";
import { ELEMENTS } from "@/lib/domain/elements";
import {
  LIVE_PLAN_KEY,
  LIVE_STORAGE_KEY,
  consumeLiveImport,
  getLiveStorage,
  parseStoredPlan,
} from "@/lib/domain/liveImport";
import {
  MATCH_PLAN_STORAGE_KEY,
  parseMatchPlan,
  type MatchPlan,
  type MatchPlanCamp,
  type PlannedTowerState,
} from "@/lib/domain/matchPlan";
import { getMap, tracedMaps } from "@/lib/domain/mapCatalog";
import { cellLabel, type GridPoint } from "@/lib/domain/mapConfig";
import { getTower } from "@/lib/domain/towerCatalog";
import {
  PENDING_IMPORT_KEY,
  type PortableBuild,
} from "@/lib/domain/portableBuild";
import {
  generateMatchPlan,
  migrateLegacyLiveState,
  serializeCopilotActions,
} from "@/lib/engine/matchPlan";
import {
  LIVE_ECONOMY_CHECKPOINTS,
  type LiveMatchLength,
} from "@/lib/engine/liveEconomy";

const LEGACY_MIGRATION_BACKUP_KEY = "etd2:live:migration-backup";

function towerRange(towerId: string): number | null {
  try {
    return getTower(towerId).stats.range;
  } catch {
    return null;
  }
}

function towerMark(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.length > 1
    ? words
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function campCode(camp: MatchPlanCamp): string {
  return camp.name.match(/^Camp [A-Z]+/)?.[0] ?? camp.name;
}

function campMoment(camp: MatchPlanCamp): string {
  if (camp.name.includes("Early")) return "first contact";
  if (camp.name.includes("Late")) return "cleanup";
  if (camp.name.includes("Mid")) return "mid-route";
  return "utility";
}

function distanceToRoute(
  cell: GridPoint,
  paths: readonly { points: readonly GridPoint[] }[],
): number {
  return Math.min(
    ...paths.flatMap((path) =>
      path.points.map((point) =>
        Math.hypot(cell.col - point.col, cell.row - point.row),
      ),
    ),
  );
}

function campPolygon(cells: readonly GridPoint[]): string {
  const points = cells.flatMap((cell) => [
    { col: cell.col - 0.48, row: cell.row - 0.48 },
    { col: cell.col + 0.48, row: cell.row - 0.48 },
    { col: cell.col + 0.48, row: cell.row + 0.48 },
    { col: cell.col - 0.48, row: cell.row + 0.48 },
  ]);
  const unique = [
    ...new Map(points.map((p) => [`${p.col}:${p.row}`, p])).values(),
  ].sort((a, b) => a.col - b.col || a.row - b.row);
  if (unique.length <= 2)
    return unique.map((point) => `${point.col},${point.row}`).join(" ");
  const cross = (o: GridPoint, a: GridPoint, b: GridPoint) =>
    (a.col - o.col) * (b.row - o.row) - (a.row - o.row) * (b.col - o.col);
  const lower: GridPoint[] = [];
  for (const point of unique) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    )
      lower.pop();
    lower.push(point);
  }
  const upper: GridPoint[] = [];
  for (const point of [...unique].reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    )
      upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
    .map((point) => `${point.col},${point.row}`)
    .join(" ");
}

function routeArrows(points: readonly GridPoint[]) {
  const arrows: { col: number; row: number; angle: number }[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const length = Math.hypot(b.col - a.col, b.row - a.row);
    if (length < 1.4) continue;
    arrows.push({
      col: a.col + (b.col - a.col) * 0.5,
      row: a.row + (b.row - a.row) * 0.5,
      angle: (Math.atan2(b.row - a.row, b.col - a.col) * 180) / Math.PI,
    });
  }
  return arrows;
}

function readSeed(initialPlan: PortableBuild | null): {
  build: PortableBuild | null;
  saved: MatchPlan | null;
  legacyRaw: string | null;
} {
  const storage = getLiveStorage();
  const saved = parseMatchPlan(
    storage?.getItem(MATCH_PLAN_STORAGE_KEY) ?? null,
  );
  const pending = parseStoredPlan(storage?.getItem(PENDING_IMPORT_KEY) ?? null);
  const legacyBuild = parseStoredPlan(storage?.getItem(LIVE_PLAN_KEY) ?? null);
  const legacyRaw = storage?.getItem(LIVE_STORAGE_KEY) ?? null;
  return { build: initialPlan ?? pending ?? legacyBuild, saved, legacyRaw };
}

export function MatchPlanView({
  initialPlan,
}: {
  initialPlan: PortableBuild | null;
}) {
  const hydrated = useRef(false);
  const [plan, setPlan] = useState<MatchPlan | null>(null);
  const [source, setSource] = useState<PortableBuild | null>(initialPlan);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<MatchPlan[]>([]);
  const [selectedCopyId, setSelectedCopyId] = useState<string | null>(null);
  const [allocationDraft, setAllocationDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const seed = readSeed(initialPlan);
    if (seed.build) {
      const shouldMigrate = !initialPlan && !seed.saved && !!seed.legacyRaw;
      if (shouldMigrate) {
        try {
          getLiveStorage()?.setItem(
            LEGACY_MIGRATION_BACKUP_KEY,
            seed.legacyRaw!,
          );
        } catch {
          /* best effort backup */
        }
      }
      const migrated = shouldMigrate
        ? migrateLegacyLiveState(seed.build, seed.legacyRaw, {
            mapId: seed.saved?.settings.mapId,
            mode: seed.saved?.settings.mode,
            matchLength: seed.saved?.settings.matchLength,
            reserveGold: seed.saved?.settings.reserveGold,
            overrides: seed.saved?.overrides,
            id: seed.saved?.id,
            now: seed.saved?.createdAt,
          })
        : null;
      const next =
        migrated?.plan ??
        generateMatchPlan(seed.build, {
          mapId: seed.saved?.settings.mapId,
          mode: seed.saved?.settings.mode,
          matchLength: seed.saved?.settings.matchLength,
          reserveGold: seed.saved?.settings.reserveGold,
          overrides: seed.saved?.overrides,
          id: seed.saved?.id,
          now: seed.saved?.createdAt,
        });
      setSource(seed.build);
      setPlan(next);
      try {
        getLiveStorage()?.setItem(MATCH_PLAN_STORAGE_KEY, JSON.stringify(next));
        if (shouldMigrate)
          getLiveStorage()?.removeItem(LEGACY_MIGRATION_BACKUP_KEY);
        const clean = consumeLiveImport(getLiveStorage(), window.location.href);
        window.history.replaceState(
          window.history.state,
          "",
          clean.replace(/^\/live/, "/match-plan"),
        );
      } catch {
        /* storage and history may be unavailable */
      }
    } else if (seed.saved) {
      setPlan(seed.saved);
      setSource(seed.saved.sourceBuild as PortableBuild);
    }
  }, [initialPlan]);

  useEffect(() => {
    if (!plan) return;
    try {
      getLiveStorage()?.setItem(MATCH_PLAN_STORAGE_KEY, JSON.stringify(plan));
    } catch {
      /* optional persistence */
    }
  }, [plan]);

  function regenerate(change: Partial<MatchPlan["settings"]>) {
    if (!source || !plan) return;
    setHistory((entries) => [...entries.slice(-9), plan]);
    const nextSettings = { ...plan.settings, ...change };
    setPlan(
      generateMatchPlan(source, {
        ...nextSettings,
        overrides: plan.overrides,
        id: plan.id,
        now: plan.createdAt,
      }),
    );
  }

  function applyOverrides(overrides: MatchPlan["overrides"]) {
    if (!source || !plan) return;
    setHistory((entries) => [...entries.slice(-9), plan]);
    setPlan(
      generateMatchPlan(source, {
        ...plan.settings,
        overrides,
        id: plan.id,
        now: plan.createdAt,
      }),
    );
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setPlan(previous);
    setHistory((entries) => entries.slice(0, -1));
    setNotice("Restored the previous plan state.");
  }

  async function copyActions() {
    if (!plan) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(serializeCopilotActions(plan), null, 2),
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function downloadActions() {
    if (!plan) return;
    const blob = new Blob(
      [JSON.stringify(serializeCopilotActions(plan), null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${plan.id}-copilot-actions.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!plan) {
    return (
      <main className="lab-shell match-shell">
        <span className="lab-grain" aria-hidden="true" />
        <LabHeader current="match-plan" />
        <section className="match-empty">
          <p className="eyebrow">PRE-GAME STRATEGY</p>
          <h1>Start with a build, then turn it into a match plan.</h1>
          <p>
            Match Plan lays out every five-wave field snapshot, camp assignment,
            coverage repair and safe purchase before the game starts.
          </p>
          <div className="match-empty-actions">
            <a className="primary-button" href="/build-lab">
              Generate a build
            </a>
            <Link className="secondary-button" href="/theorycraft">
              Use Theory Craft
            </Link>
          </div>
        </section>
        <LabFooter />
      </main>
    );
  }

  const phase = plan.phases[Math.min(phaseIndex, plan.phases.length - 1)];
  const map = getMap(plan.settings.mapId);
  const actions = serializeCopilotActions(plan);
  const selectedTower =
    phase.endTowers.find((tower) => tower.copyId === selectedCopyId) ?? null;

  function selectPhase(index: number) {
    setPhaseIndex(index);
    setSelectedCopyId(null);
    setNotice(null);
  }

  function applyAllocationOrder() {
    const elements = allocationDraft
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .flatMap((value) =>
        ELEMENTS.filter((element) => element.toLowerCase() === value),
      );
    if (!elements.length) return;
    applyOverrides([
      ...plan!.overrides.filter((entry) => entry.kind !== "allocation-order"),
      { id: "manual-allocation-order", kind: "allocation-order", elements },
    ]);
  }

  function assignCell(cell: { col: number; row: number }, campId?: string) {
    if (!selectedTower) return;
    const occupant = phase.endTowers.find(
      (tower) =>
        tower.copyId !== selectedTower.copyId &&
        tower.cell?.col === cell.col &&
        tower.cell?.row === cell.row,
    );
    if (occupant) {
      setNotice(
        `${occupant.towerName} already uses that cell. Choose an open cell.`,
      );
      return;
    }
    applyOverrides([
      ...plan!.overrides.filter(
        (entry) =>
          !(entry.kind === "cell" && entry.copyId === selectedTower.copyId),
      ),
      {
        id: `manual-cell-${selectedTower.copyId}`,
        kind: "cell",
        copyId: selectedTower.copyId,
        cell,
        campId,
      },
    ]);
    setNotice(
      `${selectedTower.towerName} is now reserved at ${cell.col}, ${cell.row}; later snapshots were recalculated.`,
    );
  }

  function toggleTemporaryRetention() {
    if (!selectedTower || selectedTower.status !== "temporary") return;
    applyOverrides([
      ...plan!.overrides.filter(
        (entry) =>
          !(
            entry.kind === "retain-temporary" &&
            entry.copyId === selectedTower.copyId
          ),
      ),
      {
        id: `retain-${selectedTower.copyId}`,
        kind: "retain-temporary",
        copyId: selectedTower.copyId,
        retain: true,
      },
    ]);
    setNotice(
      `${selectedTower.towerName} is retained; later snapshots were recalculated.`,
    );
  }

  return (
    <main className="lab-shell match-shell">
      <span className="lab-grain" aria-hidden="true" />
      <LabHeader current="match-plan" />

      <header className="match-hero">
        <div>
          <p className="eyebrow">MATCH PLAN · PRE-GAME</p>
          <h1>{plan.name}</h1>
          <p>
            Lock the strategy now. During the match, follow the short action
            list for the active phase.
          </p>
        </div>
        <div className="match-export-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={copyActions}
          >
            {copied ? "Copied" : "Copy Co-pilot JSON"}
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={downloadActions}
          >
            Export {actions.length} actions
          </button>
        </div>
      </header>

      <section className="match-controls" aria-label="Plan constraints">
        <label>
          Map
          <select
            value={plan.settings.mapId}
            onChange={(event) => regenerate({ mapId: event.target.value })}
          >
            {tracedMaps().map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mode
          <select
            value={plan.settings.mode}
            onChange={(event) =>
              regenerate({ mode: event.target.value as "standard" | "advance" })
            }
          >
            <option value="standard">Standard</option>
            <option value="advance">Advance</option>
          </select>
        </label>
        <label>
          Match length
          <select
            value={plan.settings.matchLength}
            onChange={(event) =>
              regenerate({ matchLength: event.target.value as LiveMatchLength })
            }
          >
            {LIVE_ECONOMY_CHECKPOINTS.map((entry) => (
              <option key={entry.length} value={entry.length}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Emergency reserve
          <input
            type="number"
            min="0"
            step="50"
            value={plan.settings.reserveGold}
            onChange={(event) =>
              regenerate({
                reserveGold: Math.max(0, Number(event.target.value) || 0),
              })
            }
          />
        </label>
        <button
          className="match-undo"
          type="button"
          disabled={!history.length}
          onClick={undo}
        >
          Undo change
        </button>
      </section>
      <details className="match-overrides">
        <summary>Manual overrides</summary>
        <div>
          <label>
            Allocation order
            <input
              aria-label="Allocation order"
              placeholder="Light, Earth, Light, Darkness"
              value={allocationDraft}
              onChange={(event) => setAllocationDraft(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="secondary-button"
            onClick={applyAllocationOrder}
          >
            Apply order
          </button>
          <span>
            {selectedTower
              ? `Selected: ${selectedTower.towerName} ${selectedTower.level}. Choose a map cell to reserve it.`
              : "Select a lineup tower, then choose a map cell to reserve it."}
          </span>
          {selectedTower?.status === "temporary" && (
            <button
              type="button"
              className="secondary-button"
              onClick={toggleTemporaryRetention}
            >
              Keep temporary carry
            </button>
          )}
        </div>
      </details>

      <nav className="match-timeline" aria-label="Match phases">
        {plan.phases.map((entry, index) => {
          const danger = entry.coverage.some(
            (row) => row.status === "critical" || row.status === "weak",
          );
          return (
            <button
              key={entry.id}
              type="button"
              className={index === phaseIndex ? "is-active" : ""}
              aria-current={index === phaseIndex ? "step" : undefined}
              onClick={() => selectPhase(index)}
            >
              <span>{entry.id}</span>
              <small>
                {danger
                  ? "coverage risk"
                  : `${entry.endTowers.length} tower field`}
              </small>
            </button>
          );
        })}
      </nav>

      <section className="match-phase-heading">
        <div>
          <p className="eyebrow">PHASE {phase.index + 1} OF 12</p>
          <h2>{phase.label}</h2>
        </div>
        <div className={`match-confidence is-${phase.confidence}`}>
          {phase.confidence} confidence
        </div>
      </section>

      <PhaseSnapshot
        phase={phase}
        selectedCopyId={selectedCopyId}
        onSelectTower={setSelectedCopyId}
      />

      <div className="match-storyboard">
        <section className="match-map-panel" aria-labelledby="map-title">
          <div className="match-panel-title">
            <div>
              <p className="eyebrow">FIELD ALLOCATION</p>
              <h3 id="map-title">
                {map.name} · {plan.settings.mode}
              </h3>
              <p className="match-panel-deck">
                Camps mark different route moments. Coverage comes from using
                more than one of them—not filling the nearest cluster.
              </p>
            </div>
            <span>End of wave {phase.endWave ?? "56+"}</span>
          </div>
          <PlanMap
            plan={plan}
            phase={phase}
            selectedCopyId={selectedCopyId}
            onAssignCell={assignCell}
          />
          <output className="match-notice" aria-live="polite">
            {notice ??
              (selectedTower
                ? `Placement mode: choose an open cell for ${selectedTower.towerName} ${selectedTower.level}.`
                : "Select a tower in the strategy snapshot to place or reserve it on the map.")}
          </output>
          <div className="match-map-legend" aria-label="Map legend">
            <span>
              <i className="is-route" /> creep route
            </span>
            <span>
              <i className="is-camp" /> viable camp
            </span>
            <span>
              <i className="is-tower" /> planned tower
            </span>
            <span>
              <i className="is-temp" /> temporary carry
            </span>
          </div>
        </section>

        <aside className="match-brief" aria-label={`${phase.label} brief`}>
          <section>
            <p className="eyebrow">DO THIS</p>
            <ol className="match-action-list">
              {phase.actions.length ? (
                phase.actions.map((action) => (
                  <li
                    key={action.id}
                    className={!action.affordable ? "is-wait" : ""}
                  >
                    <span>{action.summary}</span>
                    <small>
                      {action.reason}
                      {action.cost ? ` · ${action.cost.toLocaleString()}g` : ""}
                    </small>
                  </li>
                ))
              ) : (
                <li>
                  <span>Hold the line</span>
                  <small>
                    No forced purchase in this window. Keep the reserve intact.
                  </small>
                </li>
              )}
            </ol>
          </section>
          <section className="match-economy-strip">
            <div>
              <small>Conservative gold</small>
              <strong>
                {phase.economy.goldLowerBound.toLocaleString()}–
                {phase.economy.goldUpperBound.toLocaleString()}
              </strong>
            </div>
            <div>
              <small>Plan spent</small>
              <strong>{phase.economy.cumulativeCost.toLocaleString()}</strong>
            </div>
            <div>
              <small>Reserve</small>
              <strong>{phase.economy.emergencyReserve.toLocaleString()}</strong>
            </div>
          </section>
          <details open>
            <summary>Lineup snapshot</summary>
            <ul className="match-lineup">
              {phase.endTowers.map((tower) => (
                <li key={tower.copyId}>
                  <button
                    type="button"
                    className={
                      tower.copyId === selectedCopyId ? "is-selected" : ""
                    }
                    aria-pressed={tower.copyId === selectedCopyId}
                    onClick={() => setSelectedCopyId(tower.copyId)}
                  >
                    <span>
                      {tower.towerName} {tower.level} <em>{tower.status}</em>
                    </span>
                    <small>
                      {tower.cellLabel ?? "unplaced"} ·{" "}
                      {tower.campId ?? "no camp"} ·{" "}
                      {tower.globalBuff
                        ? "global buff; proximity irrelevant"
                        : tower.directHitDebuff
                          ? "direct-hit debuff; route contact required"
                          : tower.effect.replace("-", " ")}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          </details>
          <details>
            <summary>Keystones</summary>
            <div className="match-keystones">
              {ELEMENTS.map((element) => (
                <span key={element}>
                  {element.slice(0, 1)}
                  <b>{phase.endAllocation[element]}</b>
                </span>
              ))}
            </div>
          </details>
        </aside>
      </div>

      <section className="match-lower-grid">
        <div className="match-coverage">
          <div className="match-panel-title">
            <div>
              <p className="eyebrow">SIX-ELEMENT CHECK</p>
              <h3>Armour coverage</h3>
            </div>
            <span>DPS-weighted</span>
          </div>
          <div className="match-coverage-grid">
            {phase.coverage.map((row) => (
              <div key={row.defender} className={`is-${row.status}`}>
                <span>{row.defender}</span>
                <strong>
                  {row.weightedMultiplier == null
                    ? "unknown"
                    : `${row.weightedMultiplier.toFixed(2)}×`}
                </strong>
                <small>
                  {row.status}
                  {row.repair ? ` · ${row.repair}` : ""}
                </small>
              </div>
            ))}
          </div>
        </div>
        <div className="match-risks">
          <div>
            <p className="eyebrow">FAILURE POINTS</p>
            <h3>Risks & recovery</h3>
          </div>
          {phase.risks.length ? (
            phase.risks.map((risk) => (
              <p key={risk} className="match-risk">
                {risk}
              </p>
            ))
          ) : (
            <p className="match-safe">
              No critical constraint breach in this snapshot.
            </p>
          )}
          {phase.recoveries.map((recovery) => (
            <p key={recovery} className="match-recovery">
              ↳ {recovery}
            </p>
          ))}
          {plan.violations.map((violation) => (
            <p key={violation} className="match-risk">
              Plan warning: {violation}
            </p>
          ))}
        </div>
      </section>
      <LabFooter />
    </main>
  );
}

function PhaseSnapshot({
  phase,
  selectedCopyId,
  onSelectTower,
}: {
  phase: MatchPlan["phases"][number];
  selectedCopyId: string | null;
  onSelectTower: (copyId: string) => void;
}) {
  const startByCopy = new Map(
    phase.startTowers.map((tower) => [tower.copyId, tower]),
  );
  const changes = phase.endTowers.map((tower) => {
    const before = startByCopy.get(tower.copyId);
    const kind = !before
      ? "new"
      : before.level !== tower.level
        ? "upgraded"
        : before.cellLabel !== tower.cellLabel
          ? "moved"
          : "carried";
    return { tower, kind };
  });

  return (
    <section
      className="phase-snapshot"
      aria-label={`${phase.label} strategy snapshot`}
    >
      <header>
        <div>
          <p className="eyebrow">STRATEGY SNAPSHOT</p>
          <h3>
            What the field should look like by wave {phase.endWave ?? "56+"}
          </h3>
        </div>
        <p>
          {phase.startTowers.length} → {phase.endTowers.length} placed copies ·{" "}
          {phase.actions.filter((action) => action.affordable).length} planned
          actions
        </p>
      </header>
      <div className="snapshot-flow">
        <section className="snapshot-start">
          <p>Start of phase</p>
          {phase.startTowers.length ? (
            <ul>
              {phase.startTowers.map((tower) => (
                <li key={tower.copyId}>
                  {tower.towerName} {tower.level}
                </li>
              ))}
            </ul>
          ) : (
            <span>Open field</span>
          )}
        </section>
        <section className="snapshot-commitments">
          <p>Commit in this window</p>
          <ol>
            {phase.actions.length ? (
              phase.actions.map((action) => (
                <li
                  key={action.id}
                  className={!action.affordable ? "is-wait" : ""}
                >
                  <button
                    type="button"
                    disabled={!action.copyId}
                    onClick={() =>
                      action.copyId && onSelectTower(action.copyId)
                    }
                  >
                    <b>{action.affordable ? "Do" : "Wait"}</b>
                    {action.summary}
                    <small>
                      {action.cost
                        ? `${action.cost.toLocaleString()}g`
                        : "keystone"}
                    </small>
                  </button>
                </li>
              ))
            ) : (
              <li>
                <span>Hold the reserve</span>
              </li>
            )}
          </ol>
        </section>
        <section className="snapshot-end">
          <p>End-of-phase field</p>
          <div className="snapshot-towers">
            {changes.length ? (
              changes.map(({ tower, kind }) => (
                <button
                  key={tower.copyId}
                  type="button"
                  aria-pressed={tower.copyId === selectedCopyId}
                  className={`is-${kind} ${tower.copyId === selectedCopyId ? "is-selected" : ""}`}
                  onClick={() => onSelectTower(tower.copyId)}
                >
                  <i>{tower.towerName.slice(0, 1)}</i>
                  <span>
                    {tower.towerName} {tower.level}
                  </span>
                  <small>
                    {kind}
                    {tower.status === "temporary" ? " · temporary" : ""}
                    {tower.campId ? ` · ${tower.campId}` : ""}
                  </small>
                </button>
              ))
            ) : (
              <span>Nothing should be placed yet.</span>
            )}
          </div>
        </section>
      </div>
      <footer>
        <span>
          <b>Keystones</b>{" "}
          {ELEMENTS.map(
            (element) =>
              `${element.slice(0, 1)}${phase.endAllocation[element]}`,
          ).join(" · ")}
        </span>
        <span>
          <b>Safe spend</b> {phase.economy.spendableLowerBound.toLocaleString()}
          g after reserve
        </span>
        <span>
          <b>Coverage</b>{" "}
          {phase.coverage
            .filter((row) => row.status === "critical" || row.status === "weak")
            .map((row) => row.defender)
            .join(", ") || "no critical gap"}
        </span>
      </footer>
    </section>
  );
}

function PlanMap({
  plan,
  phase,
  selectedCopyId,
  onAssignCell,
}: {
  plan: MatchPlan;
  phase: MatchPlan["phases"][number];
  selectedCopyId: string | null;
  onAssignCell: (cell: { col: number; row: number }, campId?: string) => void;
}) {
  const [hoveredCampId, setHoveredCampId] = useState<string | null>(null);
  const map = getMap(plan.settings.mapId);
  const activePaths = map.paths.filter((path) =>
    path.modes.includes(plan.settings.mode),
  );
  const points = [
    ...map.buildableCells,
    ...activePaths.flatMap((path) => path.points),
  ];
  const minCol = Math.min(...points.map((point) => point.col)) - 1;
  const maxCol = Math.max(...points.map((point) => point.col)) + 1;
  const minRow = Math.min(...points.map((point) => point.row)) - 1;
  const maxRow = Math.max(...points.map((point) => point.row)) + 1;
  const prior = new Map(
    phase.startTowers.map((tower) => [tower.copyId, tower]),
  );
  const selectedTower =
    phase.endTowers.find((tower) => tower.copyId === selectedCopyId) ?? null;
  const focusTower = selectedTower ?? phase.endTowers.at(-1) ?? null;
  const selectedRange = focusTower ? towerRange(focusTower.towerId) : null;
  const selectedIsLongRange = (selectedRange ?? 0) >= 1_125;
  const viableCamps = plan.camps.filter((camp) => camp.viable);
  const occupiedByCell = new Map<string, PlannedTowerState>(
    phase.endTowers.flatMap((tower) =>
      tower.cell
        ? [[`${tower.cell.col}:${tower.cell.row}`, tower] as const]
        : [],
    ),
  );
  const campLabelById = new Map(
    plan.camps.map((camp) => [camp.id, campCode(camp)]),
  );
  const campLoad = (camp: MatchPlanCamp) =>
    phase.endTowers.filter(
      (tower) =>
        tower.copyId !== selectedCopyId &&
        tower.campId === camp.id &&
        (tower.effect === "damage" || tower.effect === "hybrid"),
    ).length;
  const damageInCamp = (camp: MatchPlanCamp) =>
    phase.endTowers.filter(
      (tower) =>
        tower.campId === camp.id &&
        (tower.effect === "damage" || tower.effect === "hybrid"),
    ).length;
  const preferredCamp = selectedTower
    ? [...viableCamps].sort((a, b) => {
        if (selectedTower.globalBuff)
          return a.coveragePercent - b.coveragePercent;
        if (selectedTower.directHitDebuff) {
          const damageDifference = damageInCamp(b) - damageInCamp(a);
          if (damageDifference) return damageDifference;
        } else {
          const loadDifference = campLoad(a) - campLoad(b);
          if (loadDifference) return loadDifference;
        }
        return b.coveragePercent - a.coveragePercent;
      })[0]
    : (viableCamps.find((camp) => camp.id === focusTower?.campId) ?? null);
  const doctrine = focusTower
    ? focusTower.globalBuff
      ? "Global buff: use a low-opportunity cell. Ally proximity and route contact do not improve the effect."
      : focusTower.directHitDebuff
        ? "Direct-hit debuff: share a firing window with damage towers so affected creeps are actually punished."
        : selectedIsLongRange
          ? "Long range: work from the backline and preserve scarce route-edge cells for short-range towers."
          : "Damage: open a distinct route-time camp before adding another copy to an occupied camp."
    : "Spread damage across distinct route moments. Keep route-edge cells for effects that must make contact.";
  const labelOrigin = {
    col: Math.min(...map.buildableCells.map((cell) => cell.col)),
    row: Math.min(...map.buildableCells.map((cell) => cell.row)),
  };

  const openCellForCamp = (camp: MatchPlanCamp) => {
    const open = camp.cells.filter((cell) => {
      const occupant = occupiedByCell.get(`${cell.col}:${cell.row}`);
      return !occupant || occupant.copyId === selectedCopyId;
    });
    if (!open.length) return null;
    if (focusTower?.globalBuff) return open.at(-1) ?? null;
    if (selectedIsLongRange)
      return [...open].sort(
        (a, b) =>
          distanceToRoute(b, activePaths) - distanceToRoute(a, activePaths),
      )[0];
    return open[0];
  };

  return (
    <div className="match-map-board">
      <div className="match-map-wrap">
        <svg
          viewBox={`${minCol} ${minRow} ${maxCol - minCol} ${maxRow - minRow}`}
          role="img"
          aria-label={`${map.name} placement snapshot for ${phase.label}`}
        >
          <defs>
            <pattern
              id="match-map-grid"
              width="1"
              height="1"
              patternUnits="userSpaceOnUse"
            >
              <path d="M 1 0 L 0 0 0 1" className="match-grid-line" />
            </pattern>
          </defs>
          <rect
            x={minCol}
            y={minRow}
            width={maxCol - minCol}
            height={maxRow - minRow}
            className="match-map-ground"
          />
          <rect
            x={minCol}
            y={minRow}
            width={maxCol - minCol}
            height={maxRow - minRow}
            fill="url(#match-map-grid)"
          />

          {viableCamps.map((camp) => {
            const center = {
              col:
                camp.cells.reduce((sum, cell) => sum + cell.col, 0) /
                camp.cells.length,
              row:
                camp.cells.reduce((sum, cell) => sum + cell.row, 0) /
                camp.cells.length,
            };
            const active =
              hoveredCampId === camp.id || preferredCamp?.id === camp.id;
            return (
              <g
                key={camp.id}
                className="match-camp-zone"
                data-active={active || undefined}
                data-preferred={preferredCamp?.id === camp.id || undefined}
              >
                <polygon points={campPolygon(camp.cells)} />
                <g transform={`translate(${center.col} ${center.row})`}>
                  <rect x="-.68" y="-.28" width="1.36" height=".56" rx=".12" />
                  <text y=".09" textAnchor="middle">
                    {campCode(camp)}
                  </text>
                </g>
              </g>
            );
          })}

          {activePaths.map((path) => (
            <g key={path.id}>
              <polyline
                points={path.points
                  .map((point) => `${point.col},${point.row}`)
                  .join(" ")}
                className="match-route-bed"
              />
              <polyline
                points={path.points
                  .map((point) => `${point.col},${point.row}`)
                  .join(" ")}
                className="match-route"
              />
              {routeArrows(path.points).map((arrow, index) => (
                <path
                  key={index}
                  d="M -.12,-.13 L .14,0 L -.12,.13 Z"
                  transform={`translate(${arrow.col} ${arrow.row}) rotate(${arrow.angle})`}
                  className="match-route-arrow"
                />
              ))}
              {path.points.length > 1 && (
                <>
                  <g
                    className="match-route-terminal"
                    transform={`translate(${path.points[0].col} ${path.points[0].row})`}
                  >
                    <circle r=".28" />
                    <text y="-.47" textAnchor="middle">
                      IN
                    </text>
                  </g>
                  <g
                    className="match-route-terminal is-out"
                    transform={`translate(${path.points.at(-1)!.col} ${path.points.at(-1)!.row})`}
                  >
                    <circle r=".28" />
                    <text y="-.47" textAnchor="middle">
                      OUT
                    </text>
                  </g>
                </>
              )}
            </g>
          ))}

          {map.buildableCells.map((cell) => {
            const key = `${cell.col}:${cell.row}`;
            const camp = plan.camps.find((entry) =>
              entry.cells.some(
                (candidate) =>
                  candidate.col === cell.col && candidate.row === cell.row,
              ),
            );
            const occupied = occupiedByCell.has(key);
            const assign = () => {
              if (selectedCopyId) onAssignCell(cell, camp?.id);
            };
            return (
              <g key={key} className="match-cell-slot">
                <rect
                  x={cell.col - 0.34}
                  y={cell.row - 0.34}
                  width=".68"
                  height=".68"
                  rx=".1"
                  className={`match-cell ${selectedCopyId ? "is-selectable" : ""} ${occupied ? "is-occupied" : ""}`}
                  role={selectedCopyId ? "button" : undefined}
                  tabIndex={selectedCopyId ? 0 : undefined}
                  aria-label={
                    selectedCopyId
                      ? `Reserve selected tower at ${cellLabel(cell, labelOrigin)}`
                      : undefined
                  }
                  onClick={assign}
                  onKeyDown={(event) => {
                    if (
                      selectedCopyId &&
                      (event.key === "Enter" || event.key === " ")
                    ) {
                      event.preventDefault();
                      assign();
                    }
                  }}
                >
                  <title>{cellLabel(cell, labelOrigin)}</title>
                </rect>
              </g>
            );
          })}

          {phase.endTowers.flatMap((tower, index) =>
            tower.cell
              ? [
                  <g
                    key={tower.copyId}
                    transform={`translate(${tower.cell.col} ${tower.cell.row})`}
                    className={`match-tower ${prior.has(tower.copyId) ? "is-carried" : "is-new"} is-${tower.status} is-${tower.effect} ${tower.globalBuff ? "has-global-buff" : ""} ${tower.directHitDebuff ? "has-debuff" : ""} ${tower.copyId === selectedCopyId ? "is-selected" : ""}`}
                  >
                    <circle r=".42" />
                    <text
                      className="match-tower-mark"
                      y=".1"
                      textAnchor="middle"
                    >
                      {towerMark(tower.towerName)}
                    </text>
                    <g
                      className="match-tower-callout"
                      transform="translate(.55 -.32)"
                    >
                      <rect width="2.45" height=".64" rx=".1" />
                      <text x=".16" y=".25">
                        {tower.towerName} {tower.level}
                      </text>
                      <text x=".16" y=".49" className="match-tower-meta">
                        {tower.globalBuff
                          ? "global · flexible"
                          : tower.directHitDebuff
                            ? "debuff · contact"
                            : (towerRange(tower.towerId) ?? 0) >= 1_125
                              ? "long range · backline"
                              : tower.campId
                                ? (campLabelById.get(tower.campId) ??
                                  tower.campId)
                                : `copy ${index + 1}`}
                      </text>
                    </g>
                  </g>,
                ]
              : [],
          )}
        </svg>
        <div className="match-map-readout">
          <span>{activePaths.length} active route</span>
          <span>{viableCamps.length} viable camps</span>
          <span>{phase.endTowers.length} planned towers</span>
        </div>
      </div>

      <aside className="match-camp-rail" aria-label="Camp allocation">
        <header>
          <p className="eyebrow">PLACEMENT LOGIC</p>
          <h4>Camp allocation</h4>
          <p>{doctrine}</p>
        </header>
        <div className="match-camp-list">
          {viableCamps.map((camp) => {
            const openCell = openCellForCamp(camp);
            const assigned = phase.endTowers.filter(
              (tower) => tower.campId === camp.id,
            ).length;
            const isPreferred = preferredCamp?.id === camp.id;
            return (
              <article
                key={camp.id}
                className="match-camp-row"
                data-preferred={isPreferred || undefined}
                onMouseEnter={() => setHoveredCampId(camp.id)}
                onMouseLeave={() => setHoveredCampId(null)}
              >
                <div>
                  <strong>{campCode(camp)}</strong>
                  <span>{campMoment(camp)}</span>
                  {isPreferred && <em>recommended</em>}
                </div>
                <dl>
                  <div>
                    <dt>route</dt>
                    <dd>{Math.round(camp.coveragePercent)}%</dd>
                  </div>
                  <div>
                    <dt>contact</dt>
                    <dd>
                      {camp.firstContactSeconds == null
                        ? "—"
                        : `${Math.round(camp.firstContactSeconds)}s`}
                    </dd>
                  </div>
                  <div>
                    <dt>field</dt>
                    <dd>
                      {assigned}/{camp.capacity}
                    </dd>
                  </div>
                </dl>
                <button
                  type="button"
                  disabled={!selectedTower || !openCell}
                  onClick={() => openCell && onAssignCell(openCell, camp.id)}
                >
                  {selectedTower
                    ? openCell
                      ? `Assign ${selectedTower.towerName}`
                      : "Camp full"
                    : "Select a tower"}
                </button>
              </article>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
