import {
  ELEMENTS,
  type ElementAllocation,
  type ElementName,
} from "@/lib/domain/elements";
import { ELEMENT_MATCHUPS } from "@/lib/domain/elementMatchupCatalog";
import { getMap, tracedMaps } from "@/lib/domain/mapCatalog";
import {
  cellLabel,
  type GridPoint,
  type MapConfig,
  type WaveMode,
} from "@/lib/domain/mapConfig";
import {
  MATCH_PLAN_SCHEMA,
  type CopilotAction,
  type ElementCoverageRow,
  type MatchPlan,
  type MatchPlanAction,
  type MatchPlanCamp,
  type MatchPlanOverride,
  type MatchPlanPhase,
  type MatchPlanPhaseId,
  type PlannedTowerState,
} from "@/lib/domain/matchPlan";
import type {
  PortableBuild,
  PortableTowerAction,
} from "@/lib/domain/portableBuild";
import {
  getMonoTowerForElement,
  isBasicTowerId,
  isMonoTowerId,
} from "@/lib/domain/auxiliaryTowers";
import { getTower, TOWERS } from "@/lib/domain/towerCatalog";
import { getTowerPlacementFact } from "@/lib/domain/towerPlacementFacts";
import { getTowerProfile } from "@/lib/domain/towerProfileCatalog";
import {
  calibratedGrossGold,
  type LiveMatchLength,
} from "@/lib/engine/liveEconomy";
import { liveTowerName, resolveLiveTowerCost } from "@/lib/engine/liveGame";
import { coverageForMode, islands } from "@/lib/engine/mapPlacement";
import { rankPlacements } from "@/lib/engine/placementValue";

const PHASES: readonly {
  id: MatchPlanPhaseId;
  label: string;
  start: number;
  end: number | null;
}[] = [
  { id: "1-5", label: "Waves 1–5", start: 1, end: 5 },
  { id: "6-10", label: "Waves 6–10", start: 6, end: 10 },
  { id: "11-15", label: "Waves 11–15", start: 11, end: 15 },
  { id: "16-20", label: "Waves 16–20", start: 16, end: 20 },
  { id: "21-25", label: "Waves 21–25", start: 21, end: 25 },
  { id: "26-30", label: "Waves 26–30", start: 26, end: 30 },
  { id: "31-35", label: "Waves 31–35", start: 31, end: 35 },
  { id: "36-40", label: "Waves 36–40", start: 36, end: 40 },
  { id: "41-45", label: "Waves 41–45", start: 41, end: 45 },
  { id: "46-50", label: "Waves 46–50", start: 46, end: 50 },
  { id: "51-55", label: "Waves 51–55", start: 51, end: 55 },
  { id: "56+", label: "Waves 56+ · Boss", start: 56, end: null },
];

const EMPTY_ALLOCATION = (): ElementAllocation => ({
  Light: 0,
  Darkness: 0,
  Water: 0,
  Fire: 0,
  Nature: 0,
  Earth: 0,
});

export type MatchPlanSettings = {
  mapId?: string;
  mode?: WaveMode;
  matchLength?: LiveMatchLength;
  reserveGold?: number;
  overrides?: readonly MatchPlanOverride[];
  now?: string;
  id?: string;
};

type Purchase = Omit<PortableTowerAction, "towerId"> & {
  towerId: string;
  reason: string;
  priority: number;
  copyOrdinal: number;
};

function stableId(...parts: readonly (string | number)[]): string {
  return parts
    .join(":")
    .toLowerCase()
    .replace(/[^a-z0-9:-]+/g, "-");
}

function allocationOrder(
  build: PortableBuild,
  overrides: readonly MatchPlanOverride[],
): ElementName[] {
  const manual = overrides.find((entry) => entry.kind === "allocation-order");
  const serialized =
    manual?.kind === "allocation-order"
      ? [...manual.elements]
      : (build.progression?.flatMap((stage) =>
          stage.keystoneSteps.map((step) => step.element),
        ) ?? []);
  const carry = compatibleEarlyCarry(build);
  const openingTower = carry ?? { towerId: build.anchorTowerId, level: 1 };
  const openingRecipe = (() => {
    try {
      return [...getTower(openingTower.towerId).recipe];
    } catch {
      return [];
    }
  })();
  const coverageElement = earlyCoverageElement(build, openingTower);
  const proposed =
    manual?.kind === "allocation-order"
      ? serialized
      : [
          ...openingRecipe,
          ...(coverageElement ? [coverageElement] : []),
          ...serialized,
          ...getTower(build.anchorTowerId).recipe,
        ];
  const result: ElementName[] = [];
  const used = EMPTY_ALLOCATION();
  for (const element of proposed) {
    if (
      !ELEMENTS.includes(element) ||
      used[element] >= (build.allocation[element] ?? 0)
    )
      continue;
    used[element] += 1;
    result.push(element);
  }
  while (
    ELEMENTS.some((element) => used[element] < (build.allocation[element] ?? 0))
  ) {
    const next = ELEMENTS.find(
      (element) => used[element] < (build.allocation[element] ?? 0),
    );
    if (!next) break;
    used[next] += 1;
    result.push(next);
  }
  return result.slice(0, 11);
}

function rolesFor(build: PortableBuild, towerId: string): readonly string[] {
  const fromPlan = build.strategy?.towers.find(
    (tower) => tower.towerId === towerId,
  )?.roles;
  if (fromPlan?.length) return fromPlan;
  if (towerId === build.anchorTowerId) return ["main-dps"];
  try {
    return getTowerProfile(towerId).coreRoles;
  } catch {
    return [];
  }
}

function purposeFor(build: PortableBuild, towerId: string): string {
  return (
    build.strategy?.towers.find((tower) => tower.towerId === towerId)
      ?.purpose ??
    (towerId === build.anchorTowerId ? "Main damage anchor" : "Build package")
  );
}

function isLegal(
  towerId: string,
  level: number,
  allocation: ElementAllocation,
): boolean {
  if (isMonoTowerId(towerId)) {
    const element = towerId.slice("mono-".length);
    const name = ELEMENTS.find((entry) => entry.toLowerCase() === element);
    return !!name && allocation[name] >= level;
  }
  try {
    return getTower(towerId).recipe.every(
      (element) => allocation[element] >= level,
    );
  } catch {
    return true;
  }
}

function actionCost(
  towerId: string,
  fromLevel: number,
  toLevel: number,
): number {
  try {
    return Math.max(
      0,
      resolveLiveTowerCost(towerId, toLevel) -
        (fromLevel ? resolveLiveTowerCost(towerId, fromLevel) : 0),
    );
  } catch {
    return 0;
  }
}

function compatibleEarlyCarry(
  build: PortableBuild,
): { towerId: string; level: number } | null {
  try {
    const anchor = getTower(build.anchorTowerId);
    if (anchor.combination === "Dual") return null;
    const candidate = TOWERS.filter(
      (tower) =>
        tower.combination === "Dual" &&
        tower.id !== "trickery" &&
        !build.towers.some((entry) => entry.towerId === tower.id) &&
        tower.recipe.every((element) => anchor.recipe.includes(element)) &&
        getTowerProfile(tower.id).coreRoles.includes("main-dps"),
    ).sort(
      (a, b) =>
        b.stats.damage[0] * b.stats.attackSpeed -
        a.stats.damage[0] * a.stats.attackSpeed,
    )[0];
    return candidate ? { towerId: candidate.id, level: 1 } : null;
  } catch {
    return null;
  }
}

function earlyCoverageElement(
  build: PortableBuild,
  opening: { towerId: string; level: number },
): ElementName | null {
  try {
    const openingTower = getTower(opening.towerId);
    const candidates = openingTower.recipe.filter(
      (element) =>
        element !== openingTower.damageElement &&
        (build.allocation[element] ?? 0) >= 2,
    );
    return (
      [...candidates].sort((a, b) => {
        const floor = (element: ElementName) =>
          Math.min(
            ...ELEMENTS.map((defender) =>
              Math.max(
                ELEMENT_MATCHUPS[openingTower.damageElement as ElementName][
                  defender
                ],
                ELEMENT_MATCHUPS[element][defender],
              ),
            ),
          );
        return floor(b) - floor(a);
      })[0] ?? null
    );
  } catch {
    return null;
  }
}

function purchases(
  build: PortableBuild,
  order: readonly ElementName[],
): Purchase[] {
  const list: Purchase[] = [];
  const anchor = (() => {
    try {
      return getTower(build.anchorTowerId);
    } catch {
      return null;
    }
  })();
  const starterId =
    anchor &&
    getTowerProfile(anchor.id).offense?.damageShape !== "single-target"
      ? "cannon"
      : "arrow";
  list.push({
    kind: "build",
    towerId: starterId,
    towerName: liveTowerName(starterId),
    toLevel: 1,
    roles: ["main-dps"],
    temporaryCarry: true,
    reason:
      "Place this before wave 1. Opening survival spending takes priority over the emergency reserve.",
    priority: 1_000,
    copyOrdinal: 1,
  });
  const carry = compatibleEarlyCarry(build);
  if (carry) {
    list.push({
      kind: "build",
      towerId: carry.towerId,
      towerName: liveTowerName(carry.towerId),
      toLevel: 1,
      roles: ["main-dps"],
      temporaryCarry: true,
      reason: `Use ${liveTowerName(carry.towerId)} I as the 500-gold bridge; it deals damage before the Trio anchor is affordable.`,
      priority: 120,
      copyOrdinal: 1,
    });
    const coverageElement = earlyCoverageElement(build, carry);
    if (coverageElement) {
      const mono = getMonoTowerForElement(coverageElement);
      list.push({
        kind: "build",
        towerId: mono.id,
        towerName: mono.name,
        toLevel: 2,
        roles: ["coverage"],
        temporaryCarry: true,
        reason: `Add ${mono.name} II as the early armour-coverage bridge.`,
        priority: 115,
        copyOrdinal: 1,
      });
    }
  } else if (anchor?.combination === "Dual") {
    const coverageElement = earlyCoverageElement(build, {
      towerId: anchor.id,
      level: 1,
    });
    if (coverageElement) {
      const mono = getMonoTowerForElement(coverageElement);
      list.push({
        kind: "build",
        towerId: mono.id,
        towerName: mono.name,
        toLevel: 2,
        roles: ["coverage"],
        temporaryCarry: true,
        reason: `Add ${mono.name} II before greed upgrades; it covers the level-I dual tower's resisted armour matchup.`,
        priority: 115,
        copyOrdinal: 1,
      });
    }
  }

  const serialized =
    build.progression?.flatMap((stage) => [
      ...stage.keystoneSteps.flatMap((step) => step.unlocks),
      ...(stage.primaryAction ? [stage.primaryAction] : []),
    ]) ?? [];
  for (const action of serialized) {
    if (action.towerId === "trickery" && action.roles.includes("main-dps"))
      continue;
    list.push({
      ...action,
      reason:
        action.reason ??
        `Advance ${action.towerName} when its elements and reserve are ready.`,
      priority: 80,
      copyOrdinal: 1,
    });
  }

  const ordinalByTower = new Map<string, number>();
  for (const target of build.towers) {
    const copyOrdinal = (ordinalByTower.get(target.towerId) ?? 0) + 1;
    ordinalByTower.set(target.towerId, copyOrdinal);
    const roles = rolesFor(build, target.towerId);
    for (let level = 1; level <= target.level; level += 1) {
      list.push({
        kind: level === 1 ? "build" : "upgrade",
        towerId: target.towerId,
        towerName: liveTowerName(target.towerId),
        toLevel: level,
        roles,
        reason:
          target.towerId === build.anchorTowerId
            ? `Establish the planned damage anchor after the early field is safe.`
            : `Add the planned ${roles.join("/") || "package"} role.`,
        priority:
          target.towerId === build.anchorTowerId
            ? 100
            : roles.includes("main-dps")
              ? 90
              : roles.includes("damage-amp")
                ? 55
                : roles.includes("buff")
                  ? 25
                  : 65,
        copyOrdinal,
      });
    }
  }

  const seen = new Set<string>();
  return list
    .filter((entry) => {
      const key = `${entry.towerId}@${entry.toLevel}#${entry.copyOrdinal}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        a.towerId.localeCompare(b.towerId) ||
        a.toLevel - b.toLevel,
    );
}

function originFor(map: MapConfig): GridPoint {
  return {
    col: Math.min(...map.buildableCells.map((cell) => cell.col)),
    row: Math.min(...map.buildableCells.map((cell) => cell.row)),
  };
}

/** Camps split connected terrain again when cells engage clearly different route moments. */
export function deriveMatchPlanCamps(
  map: MapConfig,
  mode: WaveMode,
): MatchPlanCamp[] {
  const origin = originFor(map);
  const raw: MatchPlanCamp[] = [];
  for (const [islandIndex, island] of islands(map).entries()) {
    const buckets = new Map<number, GridPoint[]>();
    for (const cell of island) {
      const coverage = coverageForMode(map, cell, 1000, mode);
      const duration = Math.max(1, map.pathDurationSeconds ?? 1);
      const bucket =
        coverage.firstContactSeconds == null
          ? 3
          : Math.min(
              2,
              Math.floor((coverage.firstContactSeconds / duration) * 3),
            );
      buckets.set(bucket, [...(buckets.get(bucket) ?? []), cell]);
    }
    for (const [bucket, cells] of buckets) {
      const ranked = cells
        .map((cell) => ({
          cell,
          coverage: coverageForMode(map, cell, 1000, mode),
        }))
        .sort(
          (a, b) => b.coverage.coveragePercent - a.coverage.coveragePercent,
        );
      const lead = ranked[0];
      if (!lead) continue;
      raw.push({
        id: `camp-${islandIndex + 1}-${bucket + 1}`,
        name: `${["Early", "Mid", "Late", "Utility"][bucket]} camp ${islandIndex + 1}`,
        cells: ranked.map((entry) => entry.cell),
        capacity: cells.length,
        viable: false,
        coveragePercent: lead.coverage.coveragePercent,
        firstContactSeconds: lead.coverage.firstContactSeconds,
        lastContactSeconds: lead.coverage.lastContactSeconds,
        routeRemainingSeconds: lead.coverage.routeRemainingSeconds,
        laneCoverage: lead.coverage.perPath.map((entry) => ({
          pathId: entry.pathId,
          coveragePercent: entry.coverage.coveragePercent,
        })),
      });
    }
  }
  const best = Math.max(0, ...raw.map((camp) => camp.coveragePercent));
  return raw
    .map((camp) => ({
      ...camp,
      viable:
        camp.capacity >= 1 &&
        camp.coveragePercent > 0 &&
        camp.coveragePercent >= best * 0.55,
    }))
    .sort(
      (a, b) =>
        Number(b.viable) - Number(a.viable) ||
        b.coveragePercent - a.coveragePercent,
    )
    .map((camp, index) => ({
      ...camp,
      name: camp.viable
        ? `Camp ${String.fromCharCode(65 + index)} · ${camp.name}`
        : camp.name,
      cells: camp.cells.map(
        (cell) => ({ ...cell, label: cellLabel(cell, origin) }) as GridPoint,
      ),
    }));
}

function towerFacts(towerId: string, level: number) {
  try {
    const tower = getTower(towerId);
    const baseDps =
      (tower.stats.damage[level - 1] ?? 0) * tower.stats.attackSpeed;
    return {
      range: tower.stats.range,
      baseDps,
      damageElement: tower.damageElement as ElementName,
    };
  } catch {
    if (isMonoTowerId(towerId)) {
      const element =
        ELEMENTS.find((entry) => towerId === `mono-${entry.toLowerCase()}`) ??
        null;
      return { range: null, baseDps: null, damageElement: element };
    }
    return { range: null, baseDps: null, damageElement: null };
  }
}

function effectFor(
  towerId: string,
  level: number,
): PlannedTowerState["effect"] {
  const fact = getTowerPlacementFact(towerId);
  const ownDps = towerFacts(towerId, level).baseDps ?? 0;
  if (fact.targetsTowers) return ownDps > 0 ? "hybrid" : "global-buff";
  if (fact.debuff) return ownDps > 0 ? "hybrid" : "debuff";
  return "damage";
}

function chooseCell(
  map: MapConfig,
  mode: WaveMode,
  camps: readonly MatchPlanCamp[],
  towerId: string,
  level: number,
  placed: readonly PlannedTowerState[],
): { cell: GridPoint; campId: string } | null {
  const occupied = placed.flatMap((tower) => (tower.cell ? [tower.cell] : []));
  const taken = new Set(occupied.map((cell) => `${cell.col},${cell.row}`));
  const fact = getTowerPlacementFact(towerId);
  const facts = towerFacts(towerId, level);
  if (fact.targetsTowers && (facts.baseDps ?? 0) <= 0) {
    const choices = map.buildableCells
      .filter((cell) => !taken.has(`${cell.col},${cell.row}`))
      .map((cell) => ({
        cell,
        coverage: coverageForMode(map, cell, 1000, mode).coveragePercent,
      }))
      .sort((a, b) => a.coverage - b.coverage);
    const cell = choices[0]?.cell;
    const camp =
      cell &&
      camps.find((entry) =>
        entry.cells.some((c) => c.col === cell.col && c.row === cell.row),
      );
    return cell ? { cell, campId: camp?.id ?? "utility" } : null;
  }
  if (facts.range && facts.baseDps != null) {
    const placedDamage = placed.flatMap((tower) => {
      if (!tower.cell) return [];
      const towerData = towerFacts(tower.towerId, tower.level);
      return towerData.range && towerData.baseDps != null
        ? [
            {
              cell: tower.cell,
              towerId: tower.towerId,
              rangeUnits: towerData.range,
              baseDps: towerData.baseDps,
            },
          ]
        : [];
    });
    const ranked = rankPlacements({
      map,
      mode,
      towerId,
      rangeUnits: facts.range,
      baseDps: facts.baseDps,
      placed: placedDamage,
      occupied,
      topN: map.buildableCells.length,
    });
    const viable = camps.filter((camp) => camp.viable);
    const campFor = (cell: GridPoint) =>
      camps.find((camp) =>
        camp.cells.some(
          (candidate) =>
            candidate.col === cell.col && candidate.row === cell.row,
        ),
      );
    const viableRanked = ranked.filter((entry) => campFor(entry.cell)?.viable);
    const bestScore =
      viableRanked[0]?.value.score ?? ranked[0]?.value.score ?? 0;
    const competitive = viableRanked.filter(
      (entry) => bestScore <= 0 || entry.value.score >= bestScore * 0.65,
    );
    const damageLoad = new Map<string, number>();
    for (const tower of placed) {
      if (
        !tower.campId ||
        (tower.effect !== "damage" && tower.effect !== "hybrid")
      )
        continue;
      damageLoad.set(tower.campId, (damageLoad.get(tower.campId) ?? 0) + 1);
    }
    const distanceToRoute = (cell: GridPoint) =>
      Math.min(
        ...map.paths
          .filter((path) => path.modes.includes(mode))
          .flatMap((path) =>
            path.points.map((point) =>
              Math.hypot(cell.col - point.col, cell.row - point.row),
            ),
          ),
      );
    const longRange = facts.range >= 1_125;
    const chosen = fact.debuff
      ? (viableRanked[0] ?? ranked[0])
      : ([...(competitive.length ? competitive : viableRanked)].sort((a, b) => {
          const campA = campFor(a.cell);
          const campB = campFor(b.cell);
          const loadA = campA ? (damageLoad.get(campA.id) ?? 0) : 99;
          const loadB = campB ? (damageLoad.get(campB.id) ?? 0) : 99;
          if (placedDamage.length > 0 && loadA !== loadB) return loadA - loadB;
          if (longRange) {
            const routeDistance =
              distanceToRoute(b.cell) - distanceToRoute(a.cell);
            if (Math.abs(routeDistance) > 0.01) return routeDistance;
          }
          return b.value.score - a.value.score;
        })[0] ?? ranked[0]);
    const camp = chosen && campFor(chosen.cell);
    return chosen
      ? { cell: chosen.cell, campId: camp?.id ?? "uncamped" }
      : null;
  }
  const camp = camps.find(
    (entry) =>
      entry.viable &&
      entry.cells.some((cell) => !taken.has(`${cell.col},${cell.row}`)),
  );
  const cell = camp?.cells.find(
    (entry) => !taken.has(`${entry.col},${entry.row}`),
  );
  return camp && cell ? { cell, campId: camp.id } : null;
}

function overriddenPlacement(
  overrides: readonly MatchPlanOverride[],
  copyId: string,
  map: MapConfig,
  camps: readonly MatchPlanCamp[],
  occupied: readonly GridPoint[],
): { cell: GridPoint; campId: string } | null {
  const override = overrides.find(
    (entry) => entry.kind === "cell" && entry.copyId === copyId,
  );
  if (!override || override.kind !== "cell") return null;
  const cell = override.cell;
  if (
    !map.buildableCells.some(
      (candidate) => candidate.col === cell.col && candidate.row === cell.row,
    ) ||
    occupied.some(
      (candidate) => candidate.col === cell.col && candidate.row === cell.row,
    )
  )
    return null;
  const camp = camps.find((entry) =>
    entry.cells.some(
      (candidate) => candidate.col === cell.col && candidate.row === cell.row,
    ),
  );
  return { cell, campId: override.campId ?? camp?.id ?? "manual" };
}

function retainTemporary(
  overrides: readonly MatchPlanOverride[],
  copyId: string,
): boolean {
  const override = overrides.find(
    (entry) => entry.kind === "retain-temporary" && entry.copyId === copyId,
  );
  return override?.kind === "retain-temporary" && override.retain;
}

function coverageRows(
  towers: readonly PlannedTowerState[],
): ElementCoverageRow[] {
  return ELEMENTS.map((defender) => {
    const contributors = towers.flatMap((tower) => {
      const facts = towerFacts(tower.towerId, tower.level);
      if (!facts.damageElement) return [];
      return [
        {
          towerId: tower.towerId,
          towerName: tower.towerName,
          quantity: tower.quantity,
          baseDps: facts.baseDps,
          multiplier: ELEMENT_MATCHUPS[facts.damageElement][defender],
        },
      ];
    });
    const quantified = contributors.filter((entry) => entry.baseDps != null);
    const totalDps = quantified.reduce(
      (sum, entry) => sum + (entry.baseDps ?? 0) * entry.quantity,
      0,
    );
    const weightedMultiplier =
      totalDps > 0
        ? quantified.reduce(
            (sum, entry) =>
              sum + (entry.baseDps ?? 0) * entry.quantity * entry.multiplier,
            0,
          ) / totalDps
        : null;
    const bestMultiplier = contributors.length
      ? Math.max(...contributors.map((entry) => entry.multiplier))
      : null;
    const status: ElementCoverageRow["status"] =
      bestMultiplier == null
        ? "unknown"
        : bestMultiplier < 1
          ? "critical"
          : weightedMultiplier == null
            ? "unknown"
            : weightedMultiplier < 0.85
              ? "weak"
              : bestMultiplier >= 2
                ? "strong"
                : "covered";
    return {
      defender,
      bestMultiplier,
      weightedMultiplier,
      status,
      contributors,
      repair:
        status === "critical" || status === "weak"
          ? `Before the next ${defender}-armour wave, add damage that is not resisted by ${defender}.`
          : null,
    };
  });
}

export function generateMatchPlan(
  build: PortableBuild,
  settings: MatchPlanSettings = {},
): MatchPlan {
  const map = (() => {
    try {
      return getMap(settings.mapId ?? tracedMaps()[0]?.id ?? "");
    } catch {
      return tracedMaps()[0];
    }
  })();
  if (!map) throw new Error("Match Plan requires at least one traced map.");
  const mode = settings.mode ?? "standard";
  const matchLength = settings.matchLength ?? "full";
  const overrides = settings.overrides ?? [];
  const overrideReserve = overrides.find((entry) => entry.kind === "reserve");
  const reserveGold =
    overrideReserve?.kind === "reserve"
      ? overrideReserve.value
      : (settings.reserveGold ?? 300);
  const order = allocationOrder(build, overrides);
  const queue = purchases(build, order);
  const requiresEarlyCoverage = queue.some(
    (entry) => entry.priority === 115 && isMonoTowerId(entry.towerId),
  );
  const camps = deriveMatchPlanCamps(map, mode);
  const now = settings.now ?? new Date().toISOString();
  const planId =
    settings.id ??
    stableId("plan", build.anchorTowerId || "custom", build.createdAt);
  const allocation = EMPTY_ALLOCATION();
  let field: PlannedTowerState[] = [];
  let cumulativeCost = 0;
  let purchaseIndex = 0;
  let actionOrder = 0;
  const phases: MatchPlanPhase[] = [];
  const violations: string[] = [];

  for (let phaseIndex = 0; phaseIndex < PHASES.length; phaseIndex += 1) {
    const definition = PHASES[phaseIndex];
    const startAllocation = { ...allocation };
    const startTowers = field.map((tower) => ({ ...tower }));
    const actions: MatchPlanAction[] = [];
    if (phaseIndex < 11 && order[phaseIndex]) {
      const element = order[phaseIndex];
      allocation[element] += 1;
      actions.push({
        id: stableId(planId, definition.id, "allocate", element),
        phaseId: definition.id,
        order: actionOrder++,
        type: "allocate-element",
        summary: `Allocate ${element} ${allocation[element]}`,
        reason: `This unlocks the next legal part of the planned line.`,
        element,
        elementLevel: allocation[element],
        cost: 0,
        legal: true,
        affordable: true,
      });
    }

    const phaseNumber = phaseIndex + 1;
    const gross = calibratedGrossGold(phaseNumber);
    const lower = phaseNumber === 1 ? gross : Math.round(gross * 0.85);
    let phaseCost = 0;
    let madeProgress = true;
    while (purchaseIndex < queue.length && madeProgress) {
      madeProgress = false;
      const entry = queue[purchaseIndex];
      const copyId = stableId(planId, "copy", entry.towerId, entry.copyOrdinal);
      const existing = field.find((tower) => tower.copyId === copyId);
      const fromLevel = existing?.level ?? 0;
      if (fromLevel >= entry.toLevel) {
        purchaseIndex += 1;
        madeProgress = true;
        continue;
      }
      const legal = isLegal(entry.towerId, entry.toLevel, allocation);
      if (!legal) break;
      const cost = actionCost(entry.towerId, fromLevel, entry.toLevel);
      const hasEstablishedDamage = field.some(
        (tower) =>
          !isBasicTowerId(tower.towerId) &&
          (tower.effect === "damage" || tower.effect === "hybrid"),
      );
      const establishedElements = new Set(
        field.flatMap((tower) => {
          const element = towerFacts(tower.towerId, tower.level).damageElement;
          return element ? [element] : [];
        }),
      );
      const openingIsSafe =
        hasEstablishedDamage &&
        (!requiresEarlyCoverage || establishedElements.size >= 2);
      const purchaseReserve = openingIsSafe ? reserveGold : 0;
      const spendable = Math.max(0, lower - purchaseReserve);
      if (cumulativeCost + cost > spendable) break;
      const placement = existing?.cell
        ? { cell: existing.cell, campId: existing.campId ?? "uncamped" }
        : (overriddenPlacement(
            overrides,
            copyId,
            map,
            camps,
            field.flatMap((tower) => (tower.cell ? [tower.cell] : [])),
          ) ??
          chooseCell(map, mode, camps, entry.towerId, entry.toLevel, field));
      const origin = originFor(map);
      const nextTower: PlannedTowerState = {
        copyId,
        towerId: entry.towerId,
        towerName: entry.towerName,
        level: entry.toLevel,
        quantity: 1,
        purpose: entry.temporaryCarry
          ? "Temporary early carry"
          : purposeFor(build, entry.towerId),
        roles: entry.roles,
        status:
          entry.temporaryCarry && !retainTemporary(overrides, copyId)
            ? "temporary"
            : "permanent",
        effect: effectFor(entry.towerId, entry.toLevel),
        globalBuff: getTowerPlacementFact(entry.towerId).targetsTowers,
        directHitDebuff: getTowerPlacementFact(entry.towerId).debuff !== null,
        cell: placement?.cell ?? null,
        cellLabel: placement ? cellLabel(placement.cell, origin) : null,
        campId: placement?.campId ?? null,
      };
      field = existing
        ? field.map((tower) => (tower.copyId === copyId ? nextTower : tower))
        : [...field, nextTower];
      cumulativeCost += cost;
      phaseCost += cost;
      actions.push({
        id: stableId(
          planId,
          definition.id,
          entry.kind,
          entry.towerId,
          entry.toLevel,
        ),
        phaseId: definition.id,
        order: actionOrder++,
        type: entry.kind,
        summary: `${entry.kind === "upgrade" || fromLevel ? "Upgrade" : "Build"} ${entry.towerName} ${entry.toLevel}`,
        reason: entry.reason,
        towerId: entry.towerId,
        towerName: entry.towerName,
        copyId,
        fromLevel,
        toLevel: entry.toLevel,
        cost,
        legal,
        affordable: true,
        cell: placement?.cell,
        cellLabel: placement ? cellLabel(placement.cell, origin) : undefined,
        campId: placement?.campId,
        temporary: !!entry.temporaryCarry,
      });
      purchaseIndex += 1;
      madeProgress = true;
    }
    // If the factual matchup table exposes a catastrophic armour hole, a
    // cheap legal mono repair outranks another package purchase. This is a
    // real field action, so the snapshot and budget change with the advice.
    const beforeRepair = coverageRows(field);
    const criticalBeforeRepair = beforeRepair.filter(
      (row) => row.status === "critical",
    );
    if (criticalBeforeRepair.length) {
      const repair = ELEMENTS.flatMap((element) => {
        const level = Math.min(2, allocation[element]);
        if (level < 1) return [];
        const mono = getMonoTowerForElement(element);
        if (field.some((tower) => tower.towerId === mono.id)) return [];
        const score = criticalBeforeRepair.reduce(
          (sum, row) => sum + ELEMENT_MATCHUPS[element][row.defender],
          0,
        );
        const cost = actionCost(mono.id, 0, level);
        return [{ mono, level, score, cost }];
      }).sort((a, b) => b.score - a.score || a.cost - b.cost)[0];
      const spendable = Math.max(0, lower - reserveGold);
      if (repair && cumulativeCost + repair.cost <= spendable) {
        const copyId = stableId(planId, "copy", repair.mono.id, 1);
        const placement = chooseCell(
          map,
          mode,
          camps,
          repair.mono.id,
          repair.level,
          field,
        );
        const origin = originFor(map);
        field = [
          ...field,
          {
            copyId,
            towerId: repair.mono.id,
            towerName: repair.mono.name,
            level: repair.level,
            quantity: 1,
            purpose: "Emergency elemental coverage",
            roles: ["coverage"],
            status: "temporary",
            effect: "damage",
            globalBuff: false,
            directHitDebuff: false,
            cell: placement?.cell ?? null,
            cellLabel: placement ? cellLabel(placement.cell, origin) : null,
            campId: placement?.campId ?? null,
          },
        ];
        cumulativeCost += repair.cost;
        phaseCost += repair.cost;
        actions.push({
          id: stableId(
            planId,
            definition.id,
            "coverage-repair",
            repair.mono.id,
            repair.level,
          ),
          phaseId: definition.id,
          order: actionOrder++,
          type: "build",
          summary: `Build ${repair.mono.name} ${repair.level}`,
          reason: `Affordable emergency repair for ${criticalBeforeRepair.map((row) => `${row.defender} armour`).join(" and ")}; do this before another package upgrade.`,
          towerId: repair.mono.id,
          towerName: repair.mono.name,
          copyId,
          fromLevel: 0,
          toLevel: repair.level,
          cost: repair.cost,
          legal: true,
          affordable: true,
          cell: placement?.cell,
          cellLabel: placement ? cellLabel(placement.cell, origin) : undefined,
          campId: placement?.campId,
          temporary: true,
        });
      }
    }
    const pending = queue[purchaseIndex];
    if (pending && isLegal(pending.towerId, pending.toLevel, allocation)) {
      const pendingCopyId = stableId(
        planId,
        "copy",
        pending.towerId,
        pending.copyOrdinal,
      );
      const fromLevel =
        field.find((tower) => tower.copyId === pendingCopyId)?.level ?? 0;
      const cost = actionCost(pending.towerId, fromLevel, pending.toLevel);
      actions.push({
        id: stableId(
          planId,
          definition.id,
          "wait",
          pending.towerId,
          pending.toLevel,
        ),
        phaseId: definition.id,
        order: actionOrder++,
        type: pending.kind,
        summary: `Wait on ${pending.towerName} ${pending.toLevel}`,
        reason: `Legal now, but buying it would breach the ${reserveGold.toLocaleString()} gold emergency reserve.`,
        towerId: pending.towerId,
        towerName: pending.towerName,
        fromLevel,
        toLevel: pending.toLevel,
        cost,
        legal: true,
        affordable: false,
        waitForGold: Math.max(0, cumulativeCost + cost + reserveGold - lower),
        temporary: !!pending.temporaryCarry,
      });
    }
    const coverage = coverageRows(field);
    const critical = coverage.filter(
      (row) => row.status === "critical" || row.status === "weak",
    );
    const risks = [
      ...(critical.length
        ? [
            `Coverage danger: ${critical.map((row) => row.defender).join(", ")}. Do not treat the average as safe.`,
          ]
        : []),
      ...(actions.some((action) => action.legal && !action.affordable)
        ? [
            "The next tower is unlocked but not affordable at the conservative lower bound.",
          ]
        : []),
      ...(field.filter(
        (tower) => tower.effect === "damage" || tower.effect === "hybrid",
      ).length < 2 && phaseIndex > 0
        ? [
            "Damage is concentrated in one copy; a leak or bad armour matchup can end the run.",
          ]
        : []),
    ];
    const recoveries = [
      ...critical.flatMap((row) => (row.repair ? [row.repair] : [])),
      ...(actions.some((action) => !action.affordable)
        ? [
            "Hold the purchase. Preserve reserve; do not assume interest or sale value.",
          ]
        : []),
    ];
    const bankAtLowerBound = Math.max(0, lower - cumulativeCost);
    const protectedReserve = Math.min(reserveGold, bankAtLowerBound);
    const spendableLowerBound = Math.max(0, lower - protectedReserve);
    phases.push({
      id: definition.id,
      index: phaseIndex,
      label: definition.label,
      startWave: definition.start,
      endWave: definition.end,
      startAllocation,
      endAllocation: { ...allocation },
      startTowers,
      endTowers: field.map((tower) => ({ ...tower })),
      actions,
      economy: {
        cumulativeCost,
        phaseCost,
        goldLowerBound: lower,
        goldUpperBound: gross,
        emergencyReserve: protectedReserve,
        spendableLowerBound,
        affordable: cumulativeCost <= spendableLowerBound,
        assumptions: [
          "Gold is a conservative checkpoint range, not a wave-income simulation.",
          "No interest income or sale value is assumed.",
        ],
      },
      coverage,
      reservedCells: field.flatMap((tower) =>
        tower.cell && tower.status === "temporary"
          ? [
              {
                copyId: tower.copyId,
                cell: tower.cell,
                label: tower.cellLabel ?? "",
              },
            ]
          : [],
      ),
      risks,
      recoveries,
      confidence: critical.length
        ? "low"
        : field.some((tower) => tower.cell == null)
          ? "medium"
          : "high",
    });
  }
  if (queue.slice(purchaseIndex).length)
    violations.push(
      `${queue.length - purchaseIndex} planned tower step(s) remain outside the conservative 56+ budget.`,
    );
  if (!camps.some((camp) => camp.viable))
    violations.push(
      "The selected map has no viable camp under the current route trace.",
    );
  return {
    schema: MATCH_PLAN_SCHEMA,
    id: planId,
    name: `${build.anchorTowerId ? liveTowerName(build.anchorTowerId) : "Custom"} match plan`,
    createdAt: now,
    updatedAt: now,
    sourceBuildSchema: build.schema,
    sourceBuild: build,
    settings: { mapId: map.id, mode, matchLength, reserveGold },
    camps,
    phases,
    overrides,
    violations,
  };
}

export function serializeCopilotActions(
  plan: MatchPlan,
): readonly CopilotAction[] {
  return plan.phases.flatMap((phase) =>
    phase.actions
      .filter((action) => action.affordable)
      .map((action) => ({
        schema: "etd2-copilot-action/1" as const,
        planId: plan.id,
        actionId: action.id,
        phaseId: phase.id,
        waveWindow: { start: phase.startWave, end: phase.endWave },
        sequence: action.order,
        command: action.type,
        ...(action.towerId && action.towerName
          ? {
              tower: {
                id: action.towerId,
                name: action.towerName,
                copyId: action.copyId,
                fromLevel: action.fromLevel,
                toLevel: action.toLevel,
              },
            }
          : {}),
        ...(action.element && action.elementLevel
          ? { element: { name: action.element, level: action.elementLevel } }
          : {}),
        ...(action.cell || action.campId
          ? {
              placement: {
                mapId: plan.settings.mapId,
                mode: plan.settings.mode,
                campId: action.campId,
                cell: action.cell,
                label: action.cellLabel,
              },
            }
          : {}),
        economy: {
          cost: action.cost,
          legal: action.legal,
          affordableAtLowerBound: action.affordable,
          waitForGold: action.waitForGold,
        },
        temporary: !!action.temporary,
        reason: action.reason,
      })),
  );
}

export type LegacyMatchPlanMigration = {
  plan: MatchPlan | null;
  sourceBuild: PortableBuild | null;
  warnings: readonly string[];
};

/**
 * Converts the useful, factual parts of the retired manual tracker into a
 * pre-game plan. Unknown rows are reported, never guessed or allowed to make
 * migration fail. The caller owns the recoverable storage backup.
 */
export function migrateLegacyLiveState(
  sourceBuild: PortableBuild | null,
  rawSnapshot: string | null,
  settings: MatchPlanSettings = {},
): LegacyMatchPlanMigration {
  if (!rawSnapshot)
    return {
      plan: sourceBuild ? generateMatchPlan(sourceBuild, settings) : null,
      sourceBuild,
      warnings: [],
    };
  let value: unknown;
  try {
    value = JSON.parse(rawSnapshot);
  } catch {
    const warning =
      "The old Live Tracker save was malformed and was not applied.";
    const generated = sourceBuild
      ? generateMatchPlan(sourceBuild, settings)
      : null;
    return {
      plan: generated
        ? { ...generated, violations: [...generated.violations, warning] }
        : null,
      sourceBuild,
      warnings: [warning],
    };
  }
  if (!value || typeof value !== "object") {
    const warning = "The old Live Tracker save had no usable state.";
    const generated = sourceBuild
      ? generateMatchPlan(sourceBuild, settings)
      : null;
    return {
      plan: generated
        ? { ...generated, violations: [...generated.violations, warning] }
        : null,
      sourceBuild,
      warnings: [warning],
    };
  }
  const snapshot = value as {
    allocation?: Partial<ElementAllocation>;
    pickLog?: unknown;
    built?: unknown;
    placements?: unknown;
    matchLength?: unknown;
  };
  const allocation = EMPTY_ALLOCATION();
  for (const element of ELEMENTS) {
    const amount = snapshot.allocation?.[element];
    allocation[element] =
      typeof amount === "number" && Number.isFinite(amount)
        ? Math.max(0, Math.min(3, Math.round(amount)))
        : 0;
  }
  const built = Array.isArray(snapshot.built)
    ? snapshot.built.filter(
        (
          entry,
        ): entry is { towerId: string; level: number; quantity?: number } =>
          !!entry &&
          typeof entry === "object" &&
          typeof (entry as { towerId?: unknown }).towerId === "string" &&
          typeof (entry as { level?: unknown }).level === "number",
      )
    : [];
  let build = sourceBuild;
  const warnings: string[] = [];
  if (!build && built.length) {
    const normal = built.filter((entry) => {
      try {
        getTower(entry.towerId);
        return true;
      } catch {
        return false;
      }
    });
    if (normal.length) {
      build = {
        schema: "etd2-build/2",
        source: "theorycraft",
        anchorTowerId: normal[0].towerId,
        towers: normal.map((entry) => ({
          towerId: entry.towerId,
          level: Math.max(1, Math.round(entry.level)),
        })),
        allocation,
        createdAt: new Date().toISOString(),
      };
    }
  }
  if (!build)
    return {
      plan: null,
      sourceBuild: null,
      warnings: [
        "The old save did not contain a compatible imported build or normal tower row.",
      ],
    };
  const pickLog = Array.isArray(snapshot.pickLog)
    ? snapshot.pickLog.filter(
        (entry): entry is ElementName =>
          typeof entry === "string" && ELEMENTS.includes(entry as ElementName),
      )
    : [];
  const migrationOverrides: MatchPlanOverride[] = pickLog.length
    ? [
        {
          id: "legacy-allocation-order",
          kind: "allocation-order",
          elements: pickLog,
        },
      ]
    : [];
  const matchLength = isLiveMatchLengthValue(snapshot.matchLength)
    ? snapshot.matchLength
    : settings.matchLength;
  let plan = generateMatchPlan(build, {
    ...settings,
    matchLength,
    overrides: [...(settings.overrides ?? []), ...migrationOverrides],
  });
  const placements = Array.isArray(snapshot.placements)
    ? snapshot.placements
    : [];
  const map = getMap(plan.settings.mapId);
  const origin = originFor(map);
  const used = new Set<string>();
  let unmapped = 0;
  for (const raw of placements) {
    if (!raw || typeof raw !== "object") {
      unmapped += 1;
      continue;
    }
    const placement = raw as {
      towerId?: unknown;
      level?: unknown;
      col?: unknown;
      row?: unknown;
      finalForm?: unknown;
    };
    if (
      typeof placement.towerId !== "string" ||
      typeof placement.col !== "number" ||
      typeof placement.row !== "number"
    ) {
      unmapped += 1;
      continue;
    }
    const cell = {
      col: Math.round(placement.col),
      row: Math.round(placement.row),
    };
    const key = `${cell.col},${cell.row}`;
    if (
      used.has(key) ||
      !map.buildableCells.some(
        (entry) => entry.col === cell.col && entry.row === cell.row,
      )
    ) {
      unmapped += 1;
      continue;
    }
    const appears = plan.phases.some((phase) =>
      phase.endTowers.some((tower) => tower.towerId === placement.towerId),
    );
    if (!appears) {
      unmapped += 1;
      continue;
    }
    used.add(key);
    const camp = plan.camps.find((entry) =>
      entry.cells.some(
        (candidate) => candidate.col === cell.col && candidate.row === cell.row,
      ),
    );
    const finalForm =
      placement.finalForm &&
      typeof placement.finalForm === "object" &&
      typeof (placement.finalForm as { towerId?: unknown }).towerId ===
        "string" &&
      typeof (placement.finalForm as { level?: unknown }).level === "number"
        ? (placement.finalForm as { towerId: string; level: number })
        : undefined;
    plan = {
      ...plan,
      phases: plan.phases.map((phase) => ({
        ...phase,
        startTowers: phase.startTowers.map((tower) =>
          tower.towerId === placement.towerId
            ? {
                ...tower,
                cell,
                cellLabel: cellLabel(cell, origin),
                campId: camp?.id ?? null,
                ...(finalForm ? { finalForm } : {}),
              }
            : tower,
        ),
        endTowers: phase.endTowers.map((tower) =>
          tower.towerId === placement.towerId
            ? {
                ...tower,
                cell,
                cellLabel: cellLabel(cell, origin),
                campId: camp?.id ?? null,
                ...(finalForm ? { finalForm } : {}),
              }
            : tower,
        ),
      })),
    };
  }
  if (unmapped)
    warnings.push(
      `${unmapped} old live placement row(s) could not safely seed this pre-game plan.`,
    );
  if (warnings.length)
    plan = { ...plan, violations: [...plan.violations, ...warnings] };
  return { plan, sourceBuild: build, warnings };
}

function isLiveMatchLengthValue(value: unknown): value is LiveMatchLength {
  return (
    value === "full" ||
    value === "short" ||
    value === "extra-short" ||
    value === "boss-hunt"
  );
}
