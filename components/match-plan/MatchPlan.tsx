"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { LabFooter, LabHeader } from "@/components/build-lab/LabChrome";
import {
  getMonoTower,
  isBasicTowerId,
  isMonoTowerId,
} from "@/lib/domain/auxiliaryTowers";
import { ELEMENTS, type ElementName } from "@/lib/domain/elements";
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
  type MatchPlanAction,
  type MatchPlanCamp,
  type MatchPlanPhase,
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
import {
  DEFAULT_MATCH_PLAN_DIFFICULTY,
  MATCH_PLAN_DIFFICULTIES,
  MATCH_PLAN_DIFFICULTY_LABELS,
  type MatchPlanDifficulty,
  waveBenchmark,
} from "@/lib/engine/waveBenchmarks";
import calibration from "@/data/waveObservations.v1.json";

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

type MeasuredGame = {
  difficulty: string;
  result: "win" | "loss";
  wavesCleared: number | null;
  totalDamageDealt: number | null;
  leaks: number | null;
};

/**
 * Whether the wave model has been shown to agree with measured play, and
 * the sentence to show while it has not. A zero-leak win dealt every point
 * of HP its waves carried, so its total damage bounds the HP the model may
 * put on those waves; while the model is over that bound, every "fails" is
 * unproven and the page says so. Disappears on its own the day the
 * calibration test (tests/engine/matchPlanCalibration.test.ts) passes.
 */
function calibrationNotice(difficulty: MatchPlanDifficulty): string | null {
  const games = (calibration.games as MeasuredGame[]).filter(
    (game) => game.difficulty === "hard",
  );
  const wins = games.filter(
    (game) =>
      game.result === "win" &&
      game.leaks === 0 &&
      game.totalDamageDealt != null,
  );
  if (!wins.length) return null;
  let modeled = 0;
  for (let wave = 1; wave <= 55; wave += 1) {
    const benchmark = waveBenchmark(wave, "hard");
    if (benchmark?.count != null)
      modeled += benchmark.effectiveHpPerCreep * benchmark.count;
  }
  const tightest = Math.min(...wins.map((game) => game.totalDamageDealt!));
  if (modeled <= tightest) return null;
  const losses = (calibration.games as MeasuredGame[]).filter(
    (game) => game.result === "loss",
  );
  const millions = (value: number) => `${Math.round(value / 1_000_000)}M`;
  const scaled =
    difficulty === "hard"
      ? ""
      : ` ${MATCH_PLAN_DIFFICULTY_LABELS[difficulty].split(" · ")[0]} is scaled from that same table.`;
  return `Wave HP is taken from the developer sheet and has not matched live play yet: a zero-leak Hard win dealt ${millions(tightest)} against this model's ${millions(modeled)} for waves 1–55.${scaled} Read "fails" as "unproven", not "lost"${losses.length ? ` — and ${losses.length === 1 ? "a game" : `${losses.length} games`} played straight from this guide ended before wave 55, so follow the field, not the verdicts` : ""}.`;
}

/** Tower level as the game shows it on the tower itself: I, II, III. */
function romanLevel(level: number): string {
  return ["I", "II", "III", "IV", "V"][level - 1] ?? String(level);
}

/**
 * How a copy on this window's field relates to the previous window: bought
 * here, upgraded here, or held over unchanged. Drives the map token stroke
 * and the lineup's "where am I" grouping.
 */
type TowerChange = "new" | "upgraded" | "carried";

function towerChange(
  phase: MatchPlanPhase,
  tower: PlannedTowerState,
): TowerChange {
  const before = phase.startTowers.find(
    (entry) => entry.copyId === tower.copyId,
  );
  if (!before) return "new";
  return before.level < tower.level ? "upgraded" : "carried";
}

function TowerToken({
  icon,
  name,
  level,
}: {
  icon: string | null | undefined;
  name: string;
  level: number;
}) {
  const numeral = romanLevel(level);
  // A small pip at the token's lower-right corner, the way the game marks a
  // tower's level on its model. Width follows the numeral so "III" fits.
  const pipWidth = 0.14 + numeral.length * 0.13;
  return (
    <>
      {icon ? (
        <image
          className="match-tower-icon"
          href={icon}
          x={-0.36}
          y={-0.36}
          width={0.72}
          height={0.72}
          clipPath="url(#match-tower-clip)"
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <text className="match-tower-mark" y=".1" textAnchor="middle">
          {towerMark(name)}
        </text>
      )}
      <g
        className="match-tower-level"
        transform={`translate(${0.42 - pipWidth / 2} .36)`}
        aria-hidden="true"
      >
        <rect
          x={-pipWidth / 2}
          y="-.15"
          width={pipWidth}
          height=".3"
          rx=".06"
        />
        <text y=".075" textAnchor="middle">
          {numeral}
        </text>
      </g>
    </>
  );
}

function campCode(camp: MatchPlanCamp): string {
  return camp.name.match(/^Camp [A-Z]+/)?.[0] ?? camp.name;
}

/**
 * Why the window's verdict is as trustworthy as it is — the pill says
 * "low" or "high", this says what made it so, in the engine's own terms.
 */
function confidenceReason(phase: MatchPlanPhase): string {
  // The engine counts weak coverage as critical for this verdict.
  const critical = phase.coverage.filter(
    (row) => row.status === "critical" || row.status === "weak",
  );
  if (phase.survival.status === "fails")
    return `modeled failure on W${phase.survival.worstWave ?? phase.startWave}`;
  if (critical.length)
    return `${critical.map((row) => row.defender).join(", ")} armour ${critical.length === 1 ? "is" : "are"} weakly covered`;
  if (phase.survival.status === "unverified") {
    const abilities = [
      ...new Set(
        phase.survival.waves
          .filter((wave) => wave.status === "unverified" && wave.ability)
          .map((wave) => wave.ability),
      ),
    ];
    return abilities.length
      ? `${abilities.join(", ")} not modeled`
      : "a fielded tower has no combat data";
  }
  if (phase.endTowers.some((tower) => tower.cell == null))
    return "a tower has no cell yet";
  return "every wave clears on modeled data";
}

/**
 * The route moment(s) a camp engages, in a player's words. Camp names come
 * from the engine as "<Entry|Mid|Late|Exit>[ + …][ double pass] camp N".
 */
function campMoment(camp: MatchPlanCamp): string {
  const moment = camp.name
    .replace(/^Camp [A-Z]+ · /, "")
    .replace(/ camp [0-9]+$/, "");
  const word = (part: string) =>
    ({
      Entry: "first contact",
      Mid: "mid-route",
      Late: "late route",
      Exit: "exit run",
    })[part.trim()] ?? part.trim().toLowerCase();
  if (moment.endsWith(" double pass"))
    return `double pass · ${moment
      .replace(/ double pass$/, "")
      .split("+")
      .map(word)
      .join(" + ")}`;
  return word(moment);
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

/**
 * Synchronous, deterministic first plan for a build handed in via the URL.
 * Pinned to the build's own `createdAt` (not "now") so the server-rendered
 * HTML and the client's first hydrated paint compute byte-identical output —
 * the effect after mount still runs once to layer in any saved settings.
 */
function generateInitialPlan(build: PortableBuild): MatchPlan | null {
  try {
    return generateMatchPlan(build, { now: build.createdAt });
  } catch {
    return null;
  }
}

export function MatchPlanView({
  initialPlan,
  assets,
}: {
  initialPlan: PortableBuild | null;
  assets?: BuildLabAssets;
}) {
  const towerIcons = assets?.towerIcons ?? {};
  const elementTowerIcons =
    assets?.elementTowerIcons ?? ({} as Record<ElementName, string | null>);
  const basicTowerIcons =
    assets?.basicTowerIcons ?? ({} as Record<string, string | null>);
  const iconForTower = (towerId: string): string | null | undefined => {
    const direct = towerIcons[towerId];
    if (direct) return direct;
    if (isMonoTowerId(towerId))
      return elementTowerIcons[getMonoTower(towerId).element] ?? null;
    if (isBasicTowerId(towerId)) return basicTowerIcons[towerId] ?? null;
    return direct;
  };
  const hydrated = useRef(false);
  // A build handed in via the URL (`?b=`) is already resolved before the
  // first paint — server and client both have it, so the plan can be built
  // synchronously here instead of waiting for a post-mount effect. That is
  // what stops "Open in Match Plan" from flashing the empty landing hero
  // before showing the real plan.
  const [plan, setPlan] = useState<MatchPlan | null>(() =>
    initialPlan ? generateInitialPlan(initialPlan) : null,
  );
  const [source, setSource] = useState<PortableBuild | null>(initialPlan);
  // True once we know for certain whether a build exists anywhere (URL,
  // localStorage pending-import, saved plan, legacy tracker). Starts true
  // whenever the URL already answered that question synchronously; only the
  // localStorage-only path needs the post-mount effect to find out.
  const [checkedForBuild, setCheckedForBuild] = useState(!!initialPlan);
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
    setCheckedForBuild(true);
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
            difficulty: seed.saved?.settings.difficulty,
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
          difficulty: seed.saved?.settings.difficulty,
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
      const savedSource = parseStoredPlan(
        JSON.stringify(seed.saved.sourceBuild),
      );
      if (savedSource) {
        const refreshed = generateMatchPlan(savedSource, {
          ...seed.saved.settings,
          overrides: seed.saved.overrides,
          id: seed.saved.id,
          now: seed.saved.createdAt,
        });
        setPlan(refreshed);
        setSource(savedSource);
      } else {
        setPlan(seed.saved);
      }
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
    // Still checking localStorage for a pending import, a saved plan or a
    // legacy live-tracker snapshot — do not claim "you have no build yet"
    // until that comes back empty.
    if (!checkedForBuild) {
      return (
        <main className="lab-shell match-shell">
          <span className="lab-grain" aria-hidden="true" />
          <LabHeader current="match-plan" />
          <section className="match-empty match-empty-loading">
            <p className="eyebrow">PRE-GAME STRATEGY</p>
            <h1>Loading your match plan…</h1>
          </section>
          <LabFooter />
        </main>
      );
    }
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
  // A selection that is not on this window's field yet (a "Wait on" action
  // clicked as a reference) resolves to its first later-window appearance.
  const selectedLater = (() => {
    if (!plan || selectedTower || !selectedCopyId) return null;
    for (const later of plan.phases.slice(phaseIndex + 1)) {
      const tower = later.endTowers.find(
        (entry) => entry.copyId === selectedCopyId,
      );
      if (tower) return { tower, phase: later };
    }
    return null;
  })();

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
            This is the strategy skeleton. The Co-pilot follows these field,
            coverage and budget targets, then intervenes only when the match
            moves off plan.
          </p>
        </div>
        <div
          className="match-export-actions"
          aria-label="Co-pilot action stream"
        >
          <span className="match-export-meta">
            <b>{actions.length}</b> Co-pilot actions
          </span>
          <div className="match-export-group" role="group">
            <button type="button" onClick={copyActions} aria-live="polite">
              {copied ? "Copied" : "Copy JSON"}
            </button>
            <button type="button" onClick={downloadActions}>
              Download
            </button>
          </div>
        </div>
      </header>

      {(() => {
        const notice = calibrationNotice(
          plan.settings.difficulty ?? DEFAULT_MATCH_PLAN_DIFFICULTY,
        );
        return notice ? (
          <aside className="match-calibration" role="note">
            <b>Unverified against live play.</b> {notice}
          </aside>
        ) : null;
      })()}

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
          Difficulty baseline
          <select
            value={plan.settings.difficulty ?? DEFAULT_MATCH_PLAN_DIFFICULTY}
            onChange={(event) =>
              regenerate({
                difficulty: event.target.value as MatchPlanDifficulty,
              })
            }
          >
            {MATCH_PLAN_DIFFICULTIES.map((difficulty) => (
              <option key={difficulty} value={difficulty}>
                {MATCH_PLAN_DIFFICULTY_LABELS[difficulty]}
              </option>
            ))}
          </select>
        </label>
        <div className="match-auto-budget" aria-label="Automatic budget model">
          <span>Budget model</span>
          <strong>Automatic allocation</strong>
          <small>Checkpoint floor + safety bank</small>
        </div>
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
        <summary>Adjust generated plan</summary>
        <div>
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
              : "Optional: select a lineup tower only when you want to replace the engine's placement."}
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

      <section className="match-decision-model" aria-label="Planner workflow">
        <div>
          <span>Plan skeleton</span>
          <strong>Five-wave field target</strong>
          <small>
            Towers, camps, elements and spend are generated together.
          </small>
        </div>
        <i aria-hidden="true">→</i>
        <div>
          <span>Co-pilot check</span>
          <strong>Compare the match to plan</strong>
          <small>Gold, coverage and field state are the decision inputs.</small>
        </div>
        <i aria-hidden="true">→</i>
        <div>
          <span>Decision</span>
          <strong>Stay, delay, repair or reposition</strong>
          <small>No alert means keep following the active snapshot.</small>
        </div>
      </section>

      <nav className="match-timeline" aria-label="Match phases">
        {plan.phases.map((entry, index) => {
          // Each chip carries the window's tightest verified wave and its
          // share of the wave HP, coloured by the engine's own verdict —
          // fails, borderline (under the 15% safety margin), survives — so
          // the row never looks better than the verdict. A window with no
          // verified wave (a boss window today) is hollow; a coverage
          // problem is named only when there is no tighter fact to show.
          const boss = entry.survival.waves.some(
            (wave) => wave.element === "Boss",
          );
          const margin = entry.survival.margin;
          const severity =
            margin == null
              ? "hollow"
              : entry.survival.status === "fails"
                ? "short"
                : entry.survival.status === "unverified"
                  ? "hollow"
                  : entry.survival.status === "borderline" || margin < 1.15
                    ? "thin"
                    : "clear";
          const critical = entry.coverage.some(
            (row) => row.status === "critical",
          );
          const readout =
            margin != null && entry.survival.worstWave != null
              ? `W${entry.survival.worstWave} · ${Math.floor(margin * 100)}%`
              : boss
                ? "boss · ability unknown"
                : critical
                  ? "coverage risk"
                  : "unverified";
          const firstBoss =
            boss &&
            !plan.phases
              .slice(0, index)
              .some((earlier) =>
                earlier.survival.waves.some((wave) => wave.element === "Boss"),
              );
          return (
            <Fragment key={entry.id}>
              {firstBoss && (
                <i className="match-timeline-divider" aria-hidden="true" />
              )}
              <button
                type="button"
                className={index === phaseIndex ? "is-active" : ""}
                data-severity={severity}
                aria-current={index === phaseIndex ? "step" : undefined}
                onClick={() => selectPhase(index)}
              >
                <span>{entry.id}</span>
                <small>{readout}</small>
              </button>
            </Fragment>
          );
        })}
      </nav>

      <section className="match-phase-heading">
        <div>
          <p className="eyebrow">
            PHASE {phase.index + 1} OF {plan.phases.length}
          </p>
          <h2>{phase.label}</h2>
        </div>
        <div
          className={`match-confidence is-${phase.confidence}`}
          title="How far this window's verdict can be trusted: low when a wave fails on modeled data or an armour is uncovered, medium when an ability or a placement is not modeled, high when every wave clears on modeled data."
        >
          <b>{phase.confidence} confidence</b>
          <span>{confidenceReason(phase)}</span>
        </div>
      </section>

      <PhaseSnapshot
        phase={phase}
        anchorTowerId={
          source?.anchorTowerId ??
          (plan.sourceBuild as { anchorTowerId?: string }).anchorTowerId ??
          ""
        }
        campNames={new Map(plan.camps.map((camp) => [camp.id, campCode(camp)]))}
        selectedCopyId={selectedCopyId}
        onSelectTower={setSelectedCopyId}
        iconFor={iconForTower}
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
            <div
              className="match-phase-stepper"
              role="group"
              aria-label="Step between windows"
            >
              <button
                type="button"
                disabled={phaseIndex === 0}
                aria-label={
                  plan.phases[phaseIndex - 1]
                    ? `Previous window: ${plan.phases[phaseIndex - 1].label}`
                    : "No earlier window"
                }
                onClick={() => selectPhase(phaseIndex - 1)}
              >
                <svg viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M6.4 1.6 3 5l3.4 3.4" />
                </svg>
              </button>
              <span>End of wave {phase.endWave ?? "70+"}</span>
              <button
                type="button"
                disabled={phaseIndex === plan.phases.length - 1}
                aria-label={
                  plan.phases[phaseIndex + 1]
                    ? `Next window: ${plan.phases[phaseIndex + 1].label}`
                    : "No later window"
                }
                onClick={() => selectPhase(phaseIndex + 1)}
              >
                <svg viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M3.6 1.6 7 5 3.6 8.4" />
                </svg>
              </button>
            </div>
          </div>
          <PlanMap
            plan={plan}
            phase={phase}
            selectedCopyId={selectedCopyId}
            placing={selectedTower != null}
            onAssignCell={assignCell}
            iconFor={iconForTower}
          />
          <output className="match-notice" aria-live="polite">
            {notice ??
              (selectedTower
                ? `Placement mode: choose an open cell for ${selectedTower.towerName} ${selectedTower.level}.`
                : selectedLater
                  ? `${selectedLater.tower.towerName} ${selectedLater.tower.level} is not on the field yet — it lands in ${selectedLater.phase.label}${selectedLater.tower.cellLabel ? ` at ${selectedLater.tower.cellLabel}` : ""}, shown faint on the board.`
                  : "The engine assigned every tower shown. Select a lineup tower only to override its placement.")}
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
              <i className="is-future" /> later placement
            </span>
            <span>
              <i className="is-temp" /> temporary carry
            </span>
            <span>
              <i className="is-level">II</i> tower level
            </span>
          </div>
        </section>

        <aside className="match-brief" aria-label={`${phase.label} brief`}>
          <CopilotDecision
            phase={phase}
            selectedCopyId={selectedCopyId}
            onSelectTower={setSelectedCopyId}
          />
          <details open>
            <summary>Lineup snapshot</summary>
            <LineupSnapshot
              phase={phase}
              selectedCopyId={selectedCopyId}
              onSelectTower={setSelectedCopyId}
            />
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

type RosterRow = {
  key: string;
  towerId: string;
  towerName: string;
  level: number;
  count: number;
  status: PlannedTowerState["status"];
  change: TowerChange | null;
  camps: string[];
  copyIds: string[];
};

/**
 * A field as a player counts it: one row per tower and level, the anchor
 * first, then the package, with every temporary copy folded into one
 * collapsed line. Thirty identical cards say less than "Laser 2 · ×3".
 */
function rosterRows(
  towers: readonly PlannedTowerState[],
  anchorTowerId: string,
  campNames: ReadonlyMap<string, string>,
  changeOf?: (tower: PlannedTowerState) => TowerChange,
): { main: RosterRow[]; temporary: RosterRow[] } {
  // Only starters and monos fold into the "temporary" line: the engine
  // also flags rescue copies of real towers as temporary (it may sell
  // them), but a fourth Laser is the field, not a shell.
  const shell = (tower: PlannedTowerState) =>
    tower.status === "temporary" &&
    (isBasicTowerId(tower.towerId) || isMonoTowerId(tower.towerId));
  const rows = new Map<string, RosterRow>();
  for (const tower of towers) {
    const change = changeOf ? changeOf(tower) : null;
    const key = `${tower.towerId}:${tower.level}:${shell(tower) ? "shell" : "main"}:${change ?? ""}`;
    const row = rows.get(key) ?? {
      key,
      towerId: tower.towerId,
      towerName: tower.towerName,
      level: tower.level,
      count: 0,
      status: shell(tower) ? "temporary" : "permanent",
      change,
      camps: [],
      copyIds: [],
    };
    row.count += tower.quantity || 1;
    row.copyIds.push(tower.copyId);
    const camp = tower.campId
      ? (campNames.get(tower.campId) ?? tower.campId)
      : null;
    if (camp && !row.camps.includes(camp)) row.camps.push(camp);
    rows.set(key, row);
  }
  const order = (a: RosterRow, b: RosterRow) =>
    Number(b.towerId === anchorTowerId) - Number(a.towerId === anchorTowerId) ||
    b.level - a.level ||
    b.count - a.count ||
    a.towerName.localeCompare(b.towerName);
  const all = [...rows.values()];
  return {
    main: all.filter((row) => row.status !== "temporary").sort(order),
    temporary: all.filter((row) => row.status === "temporary").sort(order),
  };
}

const CHANGE_WORD: Record<TowerChange, string> = {
  new: "new here",
  upgraded: "upgraded here",
  carried: "held",
};

function Roster({
  towers,
  anchorTowerId,
  campNames,
  iconFor,
  changeOf,
  selectedCopyId,
  onSelectTower,
}: {
  towers: readonly PlannedTowerState[];
  anchorTowerId: string;
  campNames: ReadonlyMap<string, string>;
  iconFor: (towerId: string) => string | null | undefined;
  changeOf?: (tower: PlannedTowerState) => TowerChange;
  selectedCopyId?: string | null;
  onSelectTower?: (copyId: string) => void;
}) {
  const { main, temporary } = rosterRows(
    towers,
    anchorTowerId,
    campNames,
    changeOf,
  );
  const temporaryCount = temporary.reduce((sum, row) => sum + row.count, 0);
  const renderRow = (row: RosterRow) => {
    const icon = iconFor(row.towerId);
    const selected =
      selectedCopyId != null && row.copyIds.includes(selectedCopyId);
    const body = (
      <>
        <i>
          {icon ? (
            <Image
              className="snapshot-tower-icon"
              src={icon}
              alt=""
              width={20}
              height={20}
            />
          ) : (
            row.towerName.slice(0, 1)
          )}
        </i>
        <span>
          {row.towerName} {row.level}
        </span>
        <b>×{row.count}</b>
        <small>
          {[
            row.camps.length ? row.camps.join(", ") : null,
            row.change ? CHANGE_WORD[row.change] : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </small>
      </>
    );
    return (
      <li
        key={row.key}
        data-change={row.change ?? undefined}
        data-anchor={row.towerId === anchorTowerId || undefined}
      >
        {onSelectTower ? (
          <button
            type="button"
            className={selected ? "is-selected" : ""}
            aria-pressed={selected}
            aria-label={`${row.towerName} ${row.level} ×${row.count} — show on the map`}
            onClick={() => onSelectTower(row.copyIds[0])}
          >
            {body}
          </button>
        ) : (
          <div>{body}</div>
        )}
      </li>
    );
  };
  return (
    <div className="snapshot-roster">
      {main.length > 0 && <ul>{main.map(renderRow)}</ul>}
      {temporary.length > 0 && (
        <details className="snapshot-roster-temp">
          <summary>
            {temporaryCount} temporary{" "}
            {temporaryCount === 1 ? "copy" : "copies"}
            <small>
              {temporary
                .map((row) => `${row.count} ${row.towerName} ${row.level}`)
                .join(", ")}
            </small>
          </summary>
          <ul>{temporary.map(renderRow)}</ul>
        </details>
      )}
    </div>
  );
}

type ActionRow = {
  key: string;
  tier: "keystone" | "package" | "repair" | "sell" | "wait";
  verb: string;
  subject: string;
  count: number;
  cost: number;
  refund: number;
  waves: number[];
  cells: string[];
  copyIds: string[];
  reason: string;
};

/**
 * The window's actions grouped the way a player reads them: "Upgrade
 * Blacksmith 2 ×3 · 2,400g · W46–49". Three tiers — the build's own steps,
 * survival repairs, sells — then what is being waited on.
 */
function actionRows(actions: readonly MatchPlanAction[]): ActionRow[] {
  const rows = new Map<string, ActionRow>();
  for (const action of actions) {
    const tier: ActionRow["tier"] =
      action.type === "allocate-element"
        ? "keystone"
        : action.type === "sell"
          ? "sell"
          : !action.affordable
            ? "wait"
            : /:(survival|coverage)-repair:/.test(action.id)
              ? "repair"
              : "package";
    const verb =
      tier === "keystone"
        ? "Allocate"
        : tier === "sell"
          ? "Sell"
          : tier === "wait"
            ? "Wait on"
            : action.fromLevel
              ? "Upgrade"
              : "Build";
    const level =
      tier === "sell" ? action.fromLevel : action.toLevel || action.fromLevel;
    const subject =
      tier === "keystone"
        ? `${action.element} ${action.elementLevel}`
        : `${action.towerName ?? action.summary} ${level ?? ""}`.trim();
    const key = `${tier}:${verb}:${subject}`;
    const row = rows.get(key) ?? {
      key,
      tier,
      verb,
      subject,
      count: 0,
      cost: 0,
      refund: 0,
      waves: [],
      cells: [],
      copyIds: [],
      reason: action.reason,
    };
    row.count += 1;
    row.cost += action.cost;
    row.refund += action.refund ?? 0;
    if (action.targetWave) row.waves.push(action.targetWave);
    if (action.cellLabel) row.cells.push(action.cellLabel);
    if (action.copyId) row.copyIds.push(action.copyId);
    rows.set(key, row);
  }
  const tierOrder = { keystone: 0, package: 1, repair: 2, sell: 3, wait: 4 };
  return [...rows.values()].sort(
    (a, b) =>
      tierOrder[a.tier] - tierOrder[b.tier] ||
      Math.min(...a.waves, 99) - Math.min(...b.waves, 99),
  );
}

function ActionRows({
  actions,
  selectedCopyId,
  onSelectTower,
}: {
  actions: readonly MatchPlanAction[];
  selectedCopyId: string | null;
  onSelectTower: (copyId: string) => void;
}) {
  const rows = actionRows(actions);
  const shown = rows.slice(0, 8);
  const rest = rows.slice(8);
  const renderRow = (row: ActionRow) => {
    const first = row.waves.length ? Math.min(...row.waves) : null;
    const last = row.waves.length ? Math.max(...row.waves) : null;
    const waves =
      first == null ? null : first === last ? `W${first}` : `W${first}–${last}`;
    const money =
      row.tier === "sell"
        ? `+${row.refund.toLocaleString()}g back`
        : row.tier === "keystone"
          ? "keystone"
          : `${row.cost.toLocaleString()}g`;
    const meta = [
      money,
      row.cells.length && row.cells.length <= 3 ? row.cells.join(", ") : null,
      waves
        ? row.tier === "wait"
          ? `wanted by ${waves}`
          : `before ${waves}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const selected =
      selectedCopyId != null && row.copyIds.includes(selectedCopyId);
    const locatable = row.copyIds.length > 0 && row.tier !== "sell";
    const body = (
      <>
        <span>
          {row.verb} {row.subject}
          {row.count > 1 && <b> ×{row.count}</b>}
        </span>
        <small>{meta}</small>
      </>
    );
    return (
      <li key={row.key} data-tier={row.tier}>
        {locatable ? (
          <button
            type="button"
            className={selected ? "is-selected" : ""}
            aria-pressed={selected}
            aria-label={`${row.verb} ${row.subject} — show on the map`}
            onClick={() => onSelectTower(row.copyIds[0])}
          >
            {body}
          </button>
        ) : (
          <div>{body}</div>
        )}
      </li>
    );
  };
  if (!rows.length)
    return (
      <p className="snapshot-action-empty">
        Nothing to buy or sell in this window.
      </p>
    );
  return (
    <>
      <ol className="snapshot-actions">{shown.map(renderRow)}</ol>
      {rest.length > 0 && (
        <details className="snapshot-actions-more">
          <summary>and {rest.length} more</summary>
          <ol className="snapshot-actions">{rest.map(renderRow)}</ol>
        </details>
      )}
    </>
  );
}

function PhaseSnapshot({
  phase,
  anchorTowerId,
  campNames,
  selectedCopyId,
  onSelectTower,
  iconFor,
}: {
  phase: MatchPlan["phases"][number];
  anchorTowerId: string;
  campNames: ReadonlyMap<string, string>;
  selectedCopyId: string | null;
  onSelectTower: (copyId: string) => void;
  iconFor: (towerId: string) => string | null | undefined;
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
  const unmodeledAbilityWaves = phase.survival.waves
    .filter(
      (wave) =>
        wave.status === "unverified" &&
        wave.ability &&
        wave.count != null &&
        wave.element !== "Boss",
    )
    .map((wave) => `W${wave.wave}`);
  const bossWaves = phase.survival.waves.filter(
    (wave) => wave.element === "Boss",
  );
  const missingStatWaves = phase.survival.waves.filter(
    (wave) =>
      wave.status === "unverified" &&
      wave.limitingFactor?.includes("no combat stat"),
  );
  const verdict =
    phase.survival.status === "survives"
      ? `Clears every wave · +${Math.round((phase.survival.margin ?? 1) * 100 - 100)}% on the tightest`
      : phase.survival.status === "borderline"
        ? `Thin margin · wave ${phase.survival.worstWave}`
        : phase.survival.status === "fails"
          ? `Leaks at wave ${phase.survival.worstWave} · ${Math.floor((phase.survival.margin ?? 0) * 100)}% of its HP`
          : bossWaves.length
            ? `Boss stage · ${Math.round(bossWaves[0].hpPerCreep).toLocaleString()}–${Math.round(bossWaves[bossWaves.length - 1].hpPerCreep).toLocaleString()} HP per creep, ${bossWaves[0].ability ?? "Mixed"} ability composition not modeled`
            : missingStatWaves.length
              ? "Cannot verify · a placed tower has no combat stat at this level"
              : `Clears base HP · ${unmodeledAbilityWaves.join(", ")} abilit${unmodeledAbilityWaves.length === 1 ? "y" : "ies"} not modeled`;

  return (
    <section
      className="phase-snapshot"
      aria-label={`${phase.label} strategy snapshot`}
    >
      <header>
        <div>
          <p className="eyebrow">STRATEGY SNAPSHOT</p>
          <h3>Start here. Spend this. Reach this field.</h3>
        </div>
        <strong className="snapshot-verdict" data-state={phase.survival.status}>
          {verdict}
        </strong>
      </header>
      <div className="snapshot-flow">
        <section className="snapshot-start">
          <p>01 · Starting state</p>
          <strong className="snapshot-gold">
            {phase.economy.phaseStartGold.toLocaleString()}g
          </strong>
          <small>bank at wave {phase.startWave}</small>
          {phase.startTowers.length ? (
            <Roster
              towers={phase.startTowers}
              anchorTowerId={anchorTowerId}
              campNames={campNames}
              iconFor={iconFor}
            />
          ) : (
            <span>Open field</span>
          )}
        </section>
        <section className="snapshot-commitments">
          <p>02 · Gold allocation</p>
          <div className="snapshot-ledger" aria-label="Gold allocation">
            <span>
              <small>Start</small>
              <b>{phase.economy.phaseStartGold.toLocaleString()}g</b>
            </span>
            <i>+</i>
            <span>
              <small>Wave income</small>
              <b>{phase.economy.incomeThisPhase.toLocaleString()}g</b>
            </span>
            <i>−</i>
            <span>
              <small>Plan spend</small>
              <b>{phase.economy.phaseCost.toLocaleString()}g</b>
            </span>
            {phase.economy.phaseRefund > 0 && (
              <>
                <i>+</i>
                <span>
                  <small>Sell refunds</small>
                  <b>{phase.economy.phaseRefund.toLocaleString()}g</b>
                </span>
              </>
            )}
            <i>=</i>
            <span>
              <small>Left after wave {phase.endWave ?? "70"}</small>
              <b>{phase.economy.phaseEndGold.toLocaleString()}g</b>
            </span>
          </div>
          <p className="snapshot-action-label">Do in this window</p>
          <ActionRows
            actions={phase.actions}
            selectedCopyId={selectedCopyId}
            onSelectTower={onSelectTower}
          />
        </section>
        <section className="snapshot-end">
          <p>03 · End target · after wave {phase.endWave ?? "70"}</p>
          {phase.endTowers.length ? (
            <Roster
              towers={phase.endTowers}
              anchorTowerId={anchorTowerId}
              campNames={campNames}
              iconFor={iconFor}
              changeOf={(tower) => towerChange(phase, tower)}
              selectedCopyId={selectedCopyId}
              onSelectTower={onSelectTower}
            />
          ) : (
            <span>Nothing should be placed yet.</span>
          )}
        </section>
      </div>
      <section className="snapshot-survival" aria-label="Survival check">
        <div className="snapshot-survival-title">
          <div>
            <p>Survival check</p>
            <strong>
              {phase.survival.status === "fails"
                ? "This field leaks: modeled damage is short of the wave HP"
                : phase.survival.status === "unverified"
                  ? phase.survival.waves.every(
                      (wave) => wave.element === "Boss",
                    )
                    ? "Boss waves: HP per creep and creep count are known; the ability composition is not, so a clear here is not proven safe"
                    : missingStatWaves.length
                      ? "A placed tower has no combat stat at this level, so the damage shown is only a floor"
                      : "Base HP clears; wave abilities are not modeled yet, so these waves are not proven safe"
                  : "Modeled field damage against each wave's HP"}
            </strong>
          </div>
          <small>
            HP × count · armour · speed · spawn spacing · traced time in range
          </small>
        </div>
        {phase.survival.waves.length ? (
          <div className="snapshot-wave-grid">
            {phase.survival.waves.map((wave) => (
              <article key={wave.wave} data-state={wave.status}>
                <header>
                  <b>W{wave.wave}</b>
                  <span>{wave.element}</span>
                </header>
                <dl>
                  <div>
                    <dt>{wave.count == null ? "HP per creep" : "Wave HP"}</dt>
                    <dd>{Math.round(wave.effectiveWaveHp).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Units</dt>
                    <dd>{wave.count ?? "unmeasured"}</dd>
                  </div>
                  <div>
                    <dt>Damage</dt>
                    <dd>
                      {wave.modeledDamage == null
                        ? "—"
                        : Math.round(wave.modeledDamage).toLocaleString()}
                    </dd>
                  </div>
                </dl>
                <strong>
                  {wave.margin == null
                    ? wave.count == null
                      ? "Count unmeasured"
                      : "No benchmark"
                    : `${Math.round(wave.margin * 100)}% of wave HP`}
                </strong>
                {wave.status === "unverified" && (
                  <small>
                    {wave.element === "Boss"
                      ? `boss wave · ${wave.ability ?? "ability"} composition not modeled`
                      : wave.limitingFactor?.includes("no combat stat")
                        ? "stat missing"
                        : `${wave.ability} not modeled`}
                  </small>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="snapshot-unverified">
            No bounded wave benchmark is available for this phase.
          </p>
        )}
        <details>
          <summary>How the verdict is calculated</summary>
          <ul>
            {phase.survival.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </details>
      </section>
      <footer>
        <span>
          <b>Keystones</b>{" "}
          {ELEMENTS.map(
            (element) =>
              `${element.slice(0, 1)}${phase.endAllocation[element]}`,
          ).join(" · ")}
        </span>
        <span>
          <b>Safety bank</b> {phase.economy.emergencyReserve.toLocaleString()}g
          protected
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

const TOWER_CHANGE_LABEL: Record<TowerChange, string> = {
  new: "new this window",
  upgraded: "upgraded here",
  carried: "held",
};

/**
 * The field at the end of this window, read as "where am I": what was bought
 * or upgraded inside the window comes first, what was already standing is
 * grouped under it, and anything sold on the way is listed last so the
 * player can reconcile the list against the game screen in one pass.
 */
function LineupSnapshot({
  phase,
  selectedCopyId,
  onSelectTower,
}: {
  phase: MatchPlanPhase;
  selectedCopyId: string | null;
  onSelectTower: (copyId: string) => void;
}) {
  const rows = phase.endTowers.map((tower) => ({
    tower,
    change: towerChange(phase, tower),
  }));
  const changed = rows.filter((row) => row.change !== "carried");
  const held = rows.filter((row) => row.change === "carried");
  const endIds = new Set(phase.endTowers.map((tower) => tower.copyId));
  const sold = phase.startTowers.filter((tower) => !endIds.has(tower.copyId));
  const counts = {
    new: changed.filter((row) => row.change === "new").length,
    upgraded: changed.filter((row) => row.change === "upgraded").length,
  };
  const summary = [
    `${phase.endTowers.length} tower${phase.endTowers.length === 1 ? "" : "s"} standing`,
    counts.new ? `${counts.new} new` : null,
    counts.upgraded ? `${counts.upgraded} upgraded` : null,
    sold.length ? `${sold.length} sold` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const renderRow = ({
    tower,
    change,
  }: {
    tower: PlannedTowerState;
    change: TowerChange;
  }) => (
    <li key={tower.copyId} data-change={change}>
      <button
        type="button"
        className={tower.copyId === selectedCopyId ? "is-selected" : ""}
        aria-pressed={tower.copyId === selectedCopyId}
        onClick={() => onSelectTower(tower.copyId)}
      >
        <span>
          {tower.towerName} {tower.level} <em>{tower.status}</em>
          <i>{TOWER_CHANGE_LABEL[change]}</i>
        </span>
        <small>
          {tower.cellLabel ?? "unplaced"} · {tower.campId ?? "no camp"} ·{" "}
          {tower.globalBuff
            ? "global buff; proximity irrelevant"
            : tower.directHitDebuff
              ? "direct-hit debuff; route contact required"
              : tower.effect.replace("-", " ")}
        </small>
      </button>
    </li>
  );

  return (
    <>
      <p className="match-lineup-state" aria-label="Field state">
        <b>End of wave {phase.endWave ?? "70+"}</b> · {summary}
      </p>
      {changed.length > 0 && (
        <ul className="match-lineup">{changed.map(renderRow)}</ul>
      )}
      {held.length > 0 && (
        // Towers that were already standing are done work: folded away by
        // default so the list reads as "what to do in this window", but one
        // click brings the full field back. When nothing changed in the
        // window the fold is all there is, so it opens.
        <details
          key={phase.id}
          className="match-lineup-held"
          open={changed.length === 0 || undefined}
        >
          <summary>
            {held.length} already on the field
            {changed.length === 0 ? " · nothing changes this window" : ""}
          </summary>
          <ul className="match-lineup">{held.map(renderRow)}</ul>
        </details>
      )}
      {sold.length > 0 && (
        <ul className="match-lineup" aria-label="Sold this window">
          <li className="match-lineup-divider" aria-hidden="true">
            Sold this window
          </li>
          {sold.map((tower) => (
            <li key={`sold-${tower.copyId}`} data-change="sold">
              <span>
                {tower.towerName} {tower.level}
              </span>
              <small>{tower.cellLabel ?? "unplaced"} · gone</small>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function CopilotDecision({
  phase,
  selectedCopyId,
  onSelectTower,
}: {
  phase: MatchPlan["phases"][number];
  selectedCopyId: string | null;
  onSelectTower: (copyId: string) => void;
}) {
  const affordable = phase.actions.filter((action) => action.affordable);
  const blocked = phase.actions.find((action) => !action.affordable);
  const decision =
    phase.survival.status === "fails"
      ? {
          state: "repair",
          title: `Repair before wave ${phase.survival.worstWave ?? phase.startWave}`,
          command:
            phase.survival.waves.find((wave) => wave.status === "fails")
              ?.limitingFactor ??
            "The modeled field does not clear this window.",
          reason:
            phase.risks.find(
              (risk) =>
                risk.startsWith("Out of gold in time") ||
                risk.startsWith("Nothing more can be bought"),
            ) ??
            (phase.actions.some(
              (action) => action.affordable && action.cost > 0,
            )
              ? "Every purchase in this window is already the strongest legal step for the failing wave; the shortfall that remains is what the field cannot buy its way out of here."
              : "Nothing this window can buy lifts the failing wave in time."),
        }
      : blocked
        ? blocked.legal
          ? {
              state: "delay",
              title: "Bank gold; do not force the next purchase",
              command: `${blocked.summary} needs ${blocked.waitForGold?.toLocaleString() ?? 0}g more above the safety floor.`,
              reason: blocked.reason,
            }
          : {
              state: "delay",
              title: "Nothing on the build path is legal yet",
              command: `${blocked.summary}. Bank until that keystone lands; every wave here already clears its base HP.`,
              reason: blocked.reason,
            }
        : affordable.length
          ? {
              state: "on-plan",
              title: "Follow the planned window",
              command: affordable.map((action) => action.summary).join(" → "),
              reason:
                affordable.at(-1)?.reason ??
                "These commitments reach the phase target within the benchmark budget.",
            }
          : {
              state: "hold",
              title: "Hold this field and preserve the bank",
              command: "No purchase is required in this five-wave window.",
              reason:
                "The current field already matches the plan skeleton for this phase.",
            };

  return (
    <section className="match-copilot-decision" data-state={decision.state}>
      <div className="match-decision-kicker">
        <p className="eyebrow">COPILOT DECISION</p>
        <span>{decision.state.replace("-", " ")}</span>
      </div>
      <h3>{decision.title}</h3>
      <p className="match-decision-command">{decision.command}</p>
      <small>{decision.reason}</small>
      <p className="match-decision-trigger">
        <b>Decision gate</b>{" "}
        {phase.survival.status === "survives"
          ? "Proceed while live gold and the field match this snapshot."
          : phase.survival.status === "fails"
            ? "Buy the repairs above before anything else in this window; if the wave still leaks, the next lever is named in the reason."
            : "Nothing here is verified against live play; follow the field and watch the wave the model cannot see."}
      </p>
      {phase.actions.length > 0 && (
        <details>
          <summary>Exact action sequence</summary>
          <ol className="match-action-list">
            {phase.actions.map((action) => {
              const meta = [
                action.type === "sell"
                  ? `+${(action.refund ?? 0).toLocaleString()}g back`
                  : action.cost
                    ? `${action.cost.toLocaleString()}g`
                    : "keystone",
                action.cellLabel ?? null,
                action.targetWave ? `before W${action.targetWave}` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              const locatable = action.copyId != null && action.type !== "sell";
              return (
                <li
                  key={action.id}
                  className={
                    action.type === "sell"
                      ? "is-sell"
                      : !action.affordable
                        ? "is-wait"
                        : ""
                  }
                >
                  {locatable ? (
                    <button
                      type="button"
                      className={
                        action.copyId === selectedCopyId ? "is-selected" : ""
                      }
                      aria-pressed={action.copyId === selectedCopyId}
                      aria-label={`${action.summary} — show on the map`}
                      onClick={() => onSelectTower(action.copyId!)}
                    >
                      <span>{action.summary}</span>
                      <small>{meta}</small>
                    </button>
                  ) : (
                    <>
                      <span>{action.summary}</span>
                      <small>{meta}</small>
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </details>
      )}
    </section>
  );
}

function PlanMap({
  plan,
  phase,
  selectedCopyId,
  placing,
  onAssignCell,
  iconFor,
}: {
  plan: MatchPlan;
  phase: MatchPlan["phases"][number];
  selectedCopyId: string | null;
  /** True only while a fielded copy is selected and cells may be reassigned. */
  placing: boolean;
  onAssignCell: (cell: { col: number; row: number }, campId?: string) => void;
  iconFor: (towerId: string) => string | null | undefined;
}) {
  const [hoveredCampId, setHoveredCampId] = useState<string | null>(null);
  const [hoveredCopyId, setHoveredCopyId] = useState<string | null>(null);
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
  const currentCopyIds = new Set(phase.endTowers.map((tower) => tower.copyId));
  const futureByCopy = new Map<
    string,
    { tower: PlannedTowerState; phaseId: string }
  >();
  for (const laterPhase of plan.phases.slice(phase.index + 1)) {
    for (const tower of laterPhase.endTowers) {
      if (
        tower.cell &&
        !currentCopyIds.has(tower.copyId) &&
        !futureByCopy.has(tower.copyId)
      ) {
        futureByCopy.set(tower.copyId, {
          tower,
          phaseId: laterPhase.id,
        });
      }
    }
  }
  const futurePlacements = [...futureByCopy.values()];
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
  const towerMetaLine = (tower: PlannedTowerState, index: number) =>
    tower.globalBuff
      ? "global · flexible"
      : tower.directHitDebuff
        ? "debuff · contact"
        : (towerRange(tower.towerId) ?? 0) >= 1_125
          ? "long range · backline"
          : tower.campId
            ? (campLabelById.get(tower.campId) ?? tower.campId)
            : `copy ${index + 1}`;
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
      ? "This tower buffs the others, so put it on a cell nobody else wants — being near the route does nothing for it."
      : focusTower.directHitDebuff
        ? "This tower weakens creeps on hit, so it belongs where your damage towers are already shooting."
        : selectedIsLongRange
          ? "Long range: place it a row back and keep the cells beside the route for towers that need to be close."
          : "Damage: put the next copy in a camp the creeps reach at a different moment before doubling up in one."
    : "Each camp meets the creeps at a different moment of the route. Spread damage across them; keep the cells beside the route for towers that must be close.";
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
      <div className="match-map-column">
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
              <clipPath id="match-tower-clip">
                <circle r=".36" />
              </clipPath>
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
              // Anchor the label just above the top edge of the camp zone so it
              // never sits under a tower token placed inside the camp.
              const labelCol =
                camp.cells.reduce((sum, cell) => sum + cell.col, 0) /
                camp.cells.length;
              const labelRow =
                Math.min(...camp.cells.map((cell) => cell.row)) - 0.62;
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
                  <g transform={`translate(${labelCol} ${labelRow})`}>
                    <rect
                      x="-.68"
                      y="-.28"
                      width="1.36"
                      height=".56"
                      rx=".12"
                    />
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
                if (placing) onAssignCell(cell, camp?.id);
              };
              return (
                <g key={key} className="match-cell-slot">
                  <rect
                    x={cell.col - 0.34}
                    y={cell.row - 0.34}
                    width=".68"
                    height=".68"
                    rx=".1"
                    className={`match-cell ${placing ? "is-selectable" : ""} ${occupied ? "is-occupied" : ""}`}
                    role={placing ? "button" : undefined}
                    tabIndex={placing ? 0 : undefined}
                    aria-label={
                      placing
                        ? `Reserve selected tower at ${cellLabel(cell, labelOrigin)}`
                        : undefined
                    }
                    onClick={assign}
                    onKeyDown={(event) => {
                      if (
                        placing &&
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

            {phase.endTowers.flatMap((tower, index) => {
              const changeState = `is-${towerChange(phase, tower)}`;
              return tower.cell
                ? [
                    <g
                      key={tower.copyId}
                      transform={`translate(${tower.cell.col} ${tower.cell.row})`}
                      className={`match-tower ${changeState} is-${tower.status} is-${tower.effect} ${tower.globalBuff ? "has-global-buff" : ""} ${tower.directHitDebuff ? "has-debuff" : ""} ${tower.copyId === selectedCopyId ? "is-selected" : ""} ${tower.copyId === hoveredCopyId ? "is-hovered" : ""}`}
                      onMouseEnter={() => setHoveredCopyId(tower.copyId)}
                      onMouseLeave={() =>
                        setHoveredCopyId((current) =>
                          current === tower.copyId ? null : current,
                        )
                      }
                    >
                      <title>
                        {tower.towerName} {romanLevel(tower.level)} ·{" "}
                        {towerMetaLine(tower, index)}
                      </title>
                      <circle r=".42" />
                      <TowerToken
                        icon={iconFor(tower.towerId)}
                        name={tower.towerName}
                        level={tower.level}
                      />
                    </g>,
                  ]
                : [];
            })}

            {futurePlacements.map(({ tower, phaseId }) => (
              <g
                key={`future-${tower.copyId}`}
                transform={`translate(${tower.cell!.col} ${tower.cell!.row})`}
                className={`match-tower is-future ${tower.copyId === selectedCopyId ? "is-selected" : ""}`}
                data-future-placement={tower.copyId}
              >
                <title>
                  {tower.towerName} {romanLevel(tower.level)} · waves {phaseId}{" "}
                  ·{" "}
                  {tower.campId
                    ? (campLabelById.get(tower.campId) ?? tower.campId)
                    : "planned"}
                </title>
                <circle r=".42" />
                <TowerToken
                  icon={iconFor(tower.towerId)}
                  name={tower.towerName}
                  level={tower.level}
                />
                <text className="match-future-wave" y=".76" textAnchor="middle">
                  {phaseId}
                </text>
              </g>
            ))}

            {/* Detail callout for the active tower only — drawn last so it paints
              above every token and can never clip a neighbouring label. */}
            {(() => {
              const activeCopyId = hoveredCopyId ?? selectedCopyId;
              if (!activeCopyId) return null;
              const activeIndex = phase.endTowers.findIndex(
                (tower) => tower.copyId === activeCopyId && tower.cell,
              );
              if (activeIndex === -1) return null;
              const tower = phase.endTowers[activeIndex];
              const cell = tower.cell!;
              // Flip the callout to the left of the token near the right edge so
              // it stays inside the board.
              const flip = cell.col + 3.2 > maxCol;
              const boxX = flip ? -3.0 : 0.55;
              const textX = boxX + 0.16;
              return (
                <g
                  className="match-tower-callout"
                  transform={`translate(${cell.col} ${cell.row})`}
                  pointerEvents="none"
                >
                  <rect x={boxX} y="-.32" width="2.45" height=".64" rx=".1" />
                  <text x={textX} y="-.07">
                    {tower.towerName} {romanLevel(tower.level)}
                  </text>
                  <text x={textX} y=".17" className="match-tower-meta">
                    {towerMetaLine(tower, activeIndex)}
                  </text>
                  <path
                    className="match-tower-pointer"
                    d="M -.22,-1.35 L .22,-1.35 L 0,-.68 Z"
                  />
                </g>
              );
            })()}

            {/* Same pointer for a tower selected from a reference row that has
              not landed on the field yet — it sits over the faint future
              token so "which one is that" stays answered while placing. */}
            {(() => {
              if (!selectedCopyId) return null;
              const entry = futureByCopy.get(selectedCopyId);
              const cell = entry?.tower.cell;
              if (!cell) return null;
              return (
                <path
                  className="match-tower-pointer"
                  transform={`translate(${cell.col} ${cell.row})`}
                  pointerEvents="none"
                  d="M -.22,-1.35 L .22,-1.35 L 0,-.68 Z"
                />
              );
            })()}
          </svg>
        </div>
        <div className="match-map-readout">
          <span>
            {activePaths.length} active route
            {activePaths.length === 1 ? "" : "s"}
          </span>
          <span>{viableCamps.length} viable camps</span>
          <span>{phase.endTowers.length} towers on the field</span>
          <span>{futurePlacements.length} queued for later</span>
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
            const queued = futurePlacements.filter(
              ({ tower }) => tower.campId === camp.id,
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
                    <dt>plan</dt>
                    <dd>{assigned + queued}</dd>
                  </div>
                </dl>
                {selectedTower ? (
                  <button
                    type="button"
                    disabled={!openCell}
                    onClick={() => openCell && onAssignCell(openCell, camp.id)}
                  >
                    {openCell
                      ? `Assign ${selectedTower.towerName}`
                      : "Camp full"}
                  </button>
                ) : (
                  <p className="match-camp-auto">
                    {assigned
                      ? `${assigned} tower${assigned === 1 ? "" : "s"} here`
                      : "Empty this window"}
                    {queued
                      ? ` · ${queued} more planned later`
                      : assigned
                        ? " · none planned later"
                        : ""}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
