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
  benchmarkGoldAtEndWave,
  economyCheckpoint,
  type LiveMatchLength,
} from "@/lib/engine/liveEconomy";
import {
  combatFacts,
  evaluatePhaseSurvival,
  type LevelStep,
} from "@/lib/engine/matchPlanSurvival";
import {
  bountyThroughWave,
  type MatchPlanDifficulty,
  waveBenchmark,
} from "@/lib/engine/waveBenchmarks";
import { sellRefundFraction } from "@/lib/domain/towerEconomics";
import { liveTowerName, resolveLiveTowerCost } from "@/lib/engine/liveGame";
import { coverageForMode, islands } from "@/lib/engine/mapPlacement";
import { rankPlacements } from "@/lib/engine/placementValue";
import earlyRanges from "@/data/earlyTowerRanges.v1.json";

const EARLY_TOWER_RANGES = earlyRanges.ranges as Record<string, number>;

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
  difficulty?: MatchPlanDifficulty;
  reserveGold?: number;
  overrides?: readonly MatchPlanOverride[];
  now?: string;
  id?: string;
  /**
   * Fraction of a tower's gold returned on sale. Defaults to the verified
   * catalog value; null (the catalog default until the owner supplies it)
   * disables retirement entirely rather than assuming a rate.
   */
  sellRefundFraction?: number | null;
};

type Purchase = Omit<PortableTowerAction, "towerId"> & {
  towerId: string;
  reason: string;
  priority: number;
  copyOrdinal: number;
  targetWave?: number;
  /** Insertion order: the progression's own sequencing breaks priority ties. */
  sequence: number;
};

function purchaseKey(
  entry: Pick<Purchase, "towerId" | "toLevel" | "copyOrdinal">,
): string {
  return `${entry.towerId}@${entry.toLevel}#${entry.copyOrdinal}`;
}

function stableId(...parts: readonly (string | number)[]): string {
  return parts
    .join(":")
    .toLowerCase()
    .replace(/[^a-z0-9:-]+/g, "-");
}

function allocationOrder(
  build: PortableBuild,
  overrides: readonly MatchPlanOverride[],
  map: MapConfig,
  mode: WaveMode,
): ElementName[] {
  const manual = overrides.find((entry) => entry.kind === "allocation-order");
  const serialized =
    manual?.kind === "allocation-order"
      ? [...manual.elements]
      : (build.progression?.flatMap((stage) =>
          stage.keystoneSteps.map((step) => step.element),
        ) ?? []);
  const carry = compatibleEarlyCarry(build, map, mode);
  const openingTower = carry ?? { towerId: build.anchorTowerId, level: 1 };
  const openingRecipe = (() => {
    try {
      return [...getTower(openingTower.towerId).recipe];
    } catch {
      return [];
    }
  })();
  const preferredOpeningElement = openingMonoElement(
    build,
    openingTower,
    map,
    mode,
  );
  const orderedOpeningRecipe = preferredOpeningElement
    ? [
        preferredOpeningElement,
        ...openingRecipe.filter(
          (element) => element !== preferredOpeningElement,
        ),
      ]
    : openingRecipe;
  const coverageElement = earlyCoverageElement(build, openingTower);
  const proposed =
    manual?.kind === "allocation-order"
      ? serialized
      : [
          ...orderedOpeningRecipe,
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

function openingMonoElement(
  build: PortableBuild,
  opening: { towerId: string; level: number },
  map: MapConfig,
  mode: WaveMode,
): ElementName | null {
  try {
    const candidates = getTower(opening.towerId).recipe.filter(
      (element) => (build.allocation[element] ?? 0) >= 1,
    );
    return (
      candidates
        .map((element) => {
          const facts = combatFacts(`mono-${element.toLowerCase()}`, 1);
          if (!facts) return { element, score: 0 };
          const routeCoverage = Math.max(
            0,
            ...map.buildableCells.map(
              (cell) =>
                coverageForMode(map, cell, facts.range, mode).coveragePercent,
            ),
          );
          const firstWaves = [1, 2, 3, 4, 5]
            .map((wave) => waveBenchmark(wave, "veryHard"))
            .filter((wave) => wave != null);
          const multipliers = firstWaves.map((wave) =>
            wave.element === "Composite"
              ? 1
              : ELEMENT_MATCHUPS[element][wave.element],
          );
          const floor = Math.min(...multipliers);
          const mean =
            multipliers.reduce((sum, value) => sum + value, 0) /
            Math.max(1, multipliers.length);
          return {
            element,
            score:
              facts.averageDps *
              (0.65 + (routeCoverage / 100) * 0.35) *
              (0.65 + floor * 0.2 + mean * 0.15),
          };
        })
        .sort(
          (a, b) => b.score - a.score || a.element.localeCompare(b.element),
        )[0]?.element ?? null
    );
  } catch {
    return null;
  }
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

function missingKeystones(
  entry: { towerId: string; toLevel: number },
  allocation: ElementAllocation,
): string[] {
  const recipe: ElementName[] = isMonoTowerId(entry.towerId)
    ? ELEMENTS.filter(
        (element) => entry.towerId === `mono-${element.toLowerCase()}`,
      )
    : (() => {
        try {
          return [...getTower(entry.towerId).recipe];
        } catch {
          return [];
        }
      })();
  return recipe
    .filter((element) => allocation[element] < entry.toLevel)
    .map((element) => `${element} ${entry.toLevel}`);
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
  map: MapConfig,
  mode: WaveMode,
): {
  towerId: string;
  level: number;
  temporary: boolean;
  reason: string;
} | null {
  try {
    const anchor = getTower(build.anchorTowerId);
    if (anchor.combination === "Dual") return null;
    const candidates = TOWERS.flatMap((tower) => {
      if (
        tower.combination !== "Dual" ||
        tower.recipe.some((element) => (build.allocation[element] ?? 0) < 1) ||
        !getTowerProfile(tower.id).coreRoles.includes("main-dps") ||
        getTowerPlacementFact(tower.id).targetsTowers
      )
        return [];
      const baseDps = tower.stats.damage[0] * tower.stats.attackSpeed;
      const routeCoverage = Math.max(
        0,
        ...map.buildableCells.map(
          (cell) =>
            coverageForMode(map, cell, tower.stats.range, mode).coveragePercent,
        ),
      );
      const coverageElement = earlyCoverageElement(build, {
        towerId: tower.id,
        level: 1,
      });
      const matchupFloor = Math.min(
        ...ELEMENTS.map((defender) =>
          Math.max(
            ELEMENT_MATCHUPS[tower.damageElement][defender],
            coverageElement ? ELEMENT_MATCHUPS[coverageElement][defender] : 0,
          ),
        ),
      );
      const cost = Math.max(1, actionCost(tower.id, 0, 1));
      const belongsToBuild = build.towers.some(
        (entry) => entry.towerId === tower.id,
      );
      const score =
        (baseDps / cost) *
        (0.7 + (routeCoverage / 100) * 0.3) *
        (0.75 + matchupFloor * 0.25) *
        (belongsToBuild ? 1.08 : 1);
      return [{ tower, score, routeCoverage, matchupFloor, belongsToBuild }];
    }).sort(
      (a, b) =>
        b.score - a.score ||
        b.routeCoverage - a.routeCoverage ||
        a.tower.id.localeCompare(b.tower.id),
    );
    const candidate = candidates[0];
    return candidate
      ? {
          towerId: candidate.tower.id,
          level: 1,
          temporary: !candidate.belongsToBuild,
          reason: `${candidate.tower.name} I wins the legal early-bridge score for damage per gold, route coverage and its level-II mono pairing.`,
        }
      : null;
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
  map: MapConfig,
  mode: WaveMode,
): Purchase[] {
  const list: Omit<Purchase, "sequence">[] = [];
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
    targetWave: 1,
  });
  list.push({
    kind: "build",
    towerId: starterId,
    towerName: liveTowerName(starterId),
    toLevel: 1,
    roles: ["main-dps"],
    temporaryCarry: true,
    reason:
      "Place the third basic before wave 1. The Very Hard route-time benchmark does not credit two copies with enough damage margin.",
    priority: 998,
    copyOrdinal: 3,
    targetWave: 1,
  });
  list.push({
    kind: "build",
    towerId: starterId,
    towerName: liveTowerName(starterId),
    toLevel: 1,
    roles: ["main-dps"],
    temporaryCarry: true,
    reason:
      "Place the second basic before wave 1. The benchmark needs two cheap coverage windows before elemental income arrives.",
    priority: 999,
    copyOrdinal: 2,
    targetWave: 1,
  });
  const openingElement = order[0];
  if (openingElement) {
    const mono = getMonoTowerForElement(openingElement);
    list.push({
      kind: "build",
      towerId: mono.id,
      towerName: mono.name,
      toLevel: 1,
      roles: ["main-dps", "coverage"],
      temporaryCarry: true,
      reason: `${mono.name} I is the best legal opening mono for waves 1-5 after damage, armour matchups and traced route coverage are scored together.`,
      priority: 130,
      copyOrdinal: 1,
      targetWave: 3,
    });
  }
  const carry = compatibleEarlyCarry(build, map, mode);
  if (carry) {
    list.push({
      kind: "build",
      towerId: carry.towerId,
      towerName: liveTowerName(carry.towerId),
      toLevel: 1,
      roles: ["main-dps"],
      temporaryCarry: carry.temporary,
      reason: carry.reason,
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

  // The same step can be listed twice (the progression's unlock and the
  // package's own row). Keep the highest-priority listing so the anchor and
  // main damage never fall behind alphabetical order, and let the
  // progression's sequencing break ties instead of the tower id.
  const best = new Map<string, Purchase>();
  list.forEach((entry, sequence) => {
    const keyed = { ...entry, sequence };
    const key = purchaseKey(keyed);
    const current = best.get(key);
    if (!current || keyed.priority > current.priority) best.set(key, keyed);
  });
  return [...best.values()].sort(
    (a, b) =>
      b.priority - a.priority ||
      a.sequence - b.sequence ||
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
  const combat = combatFacts(towerId, level);
  if (combat)
    return {
      range: combat.range,
      baseDps: combat.averageDps,
      damageElement: combat.damageElement,
    };
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
      return {
        range: EARLY_TOWER_RANGES[towerId] ?? null,
        baseDps: null,
        damageElement: element,
      };
    }
    return {
      range: EARLY_TOWER_RANGES[towerId] ?? null,
      baseDps: null,
      damageElement: null,
    };
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
  if (facts.range) {
    const placedDamage = placed.flatMap((tower) => {
      if (!tower.cell) return [];
      const towerData = towerFacts(tower.towerId, tower.level);
      return towerData.range &&
        (tower.effect === "damage" || tower.effect === "hybrid")
        ? [
            {
              cell: tower.cell,
              towerId: tower.towerId,
              rangeUnits: towerData.range,
              baseDps: towerData.baseDps ?? 1,
            },
          ]
        : [];
    });
    const ranked = rankPlacements({
      map,
      mode,
      towerId,
      rangeUnits: facts.range,
      baseDps: facts.baseDps ?? 1,
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
          multiplier:
            facts.damageElement === "Composite"
              ? 1
              : ELEMENT_MATCHUPS[facts.damageElement][defender],
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
  const difficulty = settings.difficulty ?? "veryHard";
  const overrides = settings.overrides ?? [];
  const overrideReserve = overrides.find((entry) => entry.kind === "reserve");
  const reserveGold =
    overrideReserve?.kind === "reserve"
      ? overrideReserve.value
      : (settings.reserveGold ?? 300);
  const sellRefund =
    settings.sellRefundFraction === undefined
      ? sellRefundFraction()
      : settings.sellRefundFraction;
  const order = allocationOrder(build, overrides, map, mode);
  const queue = purchases(build, order, map, mode);
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
  const purchased = new Set<string>();
  const remainingQueue = () =>
    queue.filter((entry) => !purchased.has(purchaseKey(entry)));
  let actionOrder = 0;
  const phases: MatchPlanPhase[] = [];
  const violations: string[] = [];
  const rescueOrdinalByTower = new Map<string, number>();
  for (const purchase of queue) {
    rescueOrdinalByTower.set(
      purchase.towerId,
      Math.max(
        rescueOrdinalByTower.get(purchase.towerId) ?? 0,
        purchase.copyOrdinal,
      ),
    );
  }
  const earliestAffordableWave = (
    requiredGold: number,
    startWave: number,
    endWave: number | null,
  ) => {
    const lastTarget = (endWave ?? 55) + 1;
    for (
      let targetWave = startWave;
      targetWave <= lastTarget;
      targetWave += 1
    ) {
      const goldBeforeWave = benchmarkGoldAtEndWave(
        targetWave - 1,
        matchLength,
        bountyThroughWave,
      );
      if (goldBeforeWave >= requiredGold) return targetWave;
    }
    return lastTarget;
  };

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
        targetWave: definition.start,
      });
    }

    const checkpoint = economyCheckpoint(matchLength);
    const phaseEndWave = definition.end ?? 55;
    const gross = benchmarkGoldAtEndWave(
      phaseEndWave,
      matchLength,
      bountyThroughWave,
    );
    const previousEndWave = Math.max(
      checkpoint.startWave - 1,
      definition.start - 1,
    );
    const grossAtStart = benchmarkGoldAtEndWave(
      previousEndWave,
      matchLength,
      bountyThroughWave,
    );
    const incomeThisPhase = Math.max(0, gross - grossAtStart);
    const phaseStartGold = Math.max(0, grossAtStart - cumulativeCost);
    const lower = gross;
    let phaseCost = 0;
    let phaseRefund = 0;
    let survivalFirst = false;

    // ---- Survival helpers (shared by both planning passes of this phase) ----
    // Each copy's life inside this window: carried copies start at their
    // opening level; every purchase this window steps the copy to its new
    // level from the wave it lands, so an upgrade keeps its old damage until
    // then rather than vanishing.
    const timelineFor = (
      towers: readonly PlannedTowerState[],
      candidate?: { copyId: string; targetWave: number },
    ) => {
      const timeline = new Map<string, LevelStep[]>();
      const step = (copyId: string, fromWave: number, level: number) => {
        const steps = timeline.get(copyId) ?? [];
        steps.push({ fromWave, level });
        timeline.set(copyId, steps);
      };
      for (const tower of startTowers)
        step(tower.copyId, definition.start, tower.level);
      for (const action of actions)
        if (action.copyId && action.affordable && action.cost > 0)
          step(
            action.copyId,
            action.targetWave ?? definition.start,
            action.toLevel ?? 0,
          );
      if (candidate) {
        const level = towers.find((t) => t.copyId === candidate.copyId)?.level;
        if (level != null) step(candidate.copyId, candidate.targetWave, level);
      }
      for (const steps of timeline.values())
        steps.sort((a, b) => a.fromWave - b.fromWave);
      return timeline;
    };
    const evaluate = (
      towers: readonly PlannedTowerState[],
      candidate?: { copyId: string; targetWave: number },
    ) =>
      evaluatePhaseSurvival({
        map,
        mode,
        difficulty,
        startWave: definition.start,
        endWave: definition.end,
        towers,
        levelTimeline: timelineFor(towers, candidate),
      });
    const verifiedShortfall = (result: MatchPlanPhase["survival"]) =>
      result.waves.reduce(
        (sum, wave) =>
          wave.status === "unverified"
            ? sum
            : sum + Math.max(0, 1 - (wave.margin ?? 0)),
        0,
      );
    const firstFailingWave = (result: MatchPlanPhase["survival"]) =>
      result.waves.find((wave) => wave.status === "fails")?.wave ?? null;

    type RescueCandidate = {
      tower: PlannedTowerState;
      cost: number;
      ordinal: number | null;
      targetWave: number;
      survival: MatchPlanPhase["survival"];
      shortfall: number;
      efficiency: number;
      source: "build-path" | "fleet-copy";
      /** Level the copy is at before this step; > 0 means an upgrade in place. */
      fromLevel: number;
      /** The package's own reason for the step, when it has one. */
      entryReason?: string;
    };
    // Prices and places one prospective step — a new copy, or an upgrade of a
    // copy already on the field — keeping it only if it lifts the verified
    // damage floor. Survival may spend the reserve, never beyond gross.
    const rescueCandidate = (
      source: PlannedTowerState,
      cost: number,
      ordinal: number | null,
      kind: RescueCandidate["source"],
      currentShortfall: number,
      fromLevel = 0,
      entryReason?: string,
    ): RescueCandidate[] => {
      if (cost <= 0 || cumulativeCost + cost > gross) return [];
      const upgrade = fromLevel > 0;
      const placement = upgrade
        ? source.cell
          ? { cell: source.cell, campId: source.campId ?? "uncamped" }
          : null
        : chooseCell(map, mode, camps, source.towerId, source.level, field);
      if (!placement) return [];
      const targetWave = earliestAffordableWave(
        cumulativeCost + cost,
        definition.start,
        definition.end,
      );
      const tower: PlannedTowerState = {
        ...source,
        quantity: 1,
        cell: placement.cell,
        cellLabel: cellLabel(placement.cell, originFor(map)),
        campId: placement.campId,
      };
      const nextField = upgrade
        ? field.map((entry) => (entry.copyId === tower.copyId ? tower : entry))
        : [...field, tower];
      const nextSurvival = evaluate(nextField, {
        copyId: tower.copyId,
        targetWave,
      });
      const nextShortfall = verifiedShortfall(nextSurvival);
      // A step must close the gap or move the floor by at least one percent
      // of a wave: a 75g Arrow against a two-million HP wave is not a rescue,
      // however early it lands.
      const lift = currentShortfall - nextShortfall;
      if (lift < Math.min(0.01, currentShortfall - 0.0001)) return [];
      return [
        {
          tower,
          cost,
          ordinal,
          targetWave,
          survival: nextSurvival,
          shortfall: nextShortfall,
          efficiency: lift / cost,
          source: kind,
          fromLevel,
          entryReason,
        },
      ];
    };
    // Stage 1 — a build tower that is not on the field yet. Buying a copy the
    // package already calls for (at its planned level, or level 1 as an early
    // step toward it) keeps the spend on the build's own path.
    // A planned step for a copy already on the field is an upgrade in place;
    // a step for a copy not yet fielded may be bought at its planned level or
    // at level 1 as an early step toward it.
    const buildPathCandidates = (currentShortfall: number) =>
      remainingQueue().flatMap((entry) => {
        const copyId = stableId(
          planId,
          "copy",
          entry.towerId,
          entry.copyOrdinal,
        );
        const existing = field.find((tower) => tower.copyId === copyId);
        const fromLevel = existing?.level ?? 0;
        if (fromLevel >= entry.toLevel) return [];
        // A bridge is only "in the build" until the anchor is up; after that
        // it is throwaway damage and competes with nothing.
        if (
          entry.temporaryCarry &&
          !existing &&
          field.some((tower) => tower.towerId === build.anchorTowerId)
        )
          return [];
        const levels = existing
          ? [entry.toLevel]
          : entry.toLevel > 1
            ? [entry.toLevel, 1]
            : [entry.toLevel];
        return levels.flatMap((level) => {
          if (!isLegal(entry.towerId, level, allocation)) return [];
          const effect = effectFor(entry.towerId, level);
          if (effect !== "damage" && effect !== "hybrid") return [];
          const placementFact = getTowerPlacementFact(entry.towerId);
          if (placementFact.targetsTowers) return [];
          if (!combatFacts(entry.towerId, level)) return [];
          const source: PlannedTowerState = existing
            ? { ...existing, level, effect }
            : {
                copyId,
                towerId: entry.towerId,
                towerName: entry.towerName,
                level,
                quantity: 1,
                purpose: entry.temporaryCarry
                  ? "Temporary early carry"
                  : purposeFor(build, entry.towerId),
                roles: entry.roles,
                status:
                  entry.temporaryCarry && !retainTemporary(overrides, copyId)
                    ? "temporary"
                    : "permanent",
                effect,
                globalBuff: placementFact.targetsTowers,
                directHitDebuff: placementFact.debuff !== null,
                cell: null,
                cellLabel: null,
                campId: null,
              };
          return rescueCandidate(
            source,
            actionCost(entry.towerId, fromLevel, level),
            null,
            "build-path",
            currentShortfall,
            fromLevel,
            entry.reason,
          );
        });
      });
    // Stage 2 — another copy of a tower the fleet already runs, judged by how
    // much it lifts the whole window's floor per gold.
    const fleetCopyCandidates = (currentShortfall: number) => {
      const damageTowers = field.filter(
        (tower) =>
          (tower.effect === "damage" || tower.effect === "hybrid") &&
          !tower.globalBuff &&
          combatFacts(tower.towerId, tower.level) != null &&
          isLegal(tower.towerId, tower.level, allocation),
      );
      const sourceTowers = [
        ...new Map(
          damageTowers.map((tower) => [
            `${tower.towerId}@${tower.level}`,
            tower,
          ]),
        ).values(),
      ];
      const copies = sourceTowers.flatMap((source) => {
        const ordinal = (rescueOrdinalByTower.get(source.towerId) ?? 0) + 1;
        return rescueCandidate(
          {
            ...source,
            copyId: stableId(planId, "copy", source.towerId, ordinal),
            purpose: "Zero-leak survival repair",
            roles: source.roles.length ? source.roles : ["main-dps"],
            status: "temporary",
          },
          actionCost(source.towerId, 0, source.level),
          ordinal,
          "fleet-copy",
          currentShortfall,
        );
      });
      // A fielded mono's next level is often the strongest legal damage step
      // on the build's own element path (the package never lists it).
      const upgrades = damageTowers.flatMap((source) => {
        if (!isMonoTowerId(source.towerId)) return [];
        const level = source.level + 1;
        if (
          level > 3 ||
          !isLegal(source.towerId, level, allocation) ||
          !combatFacts(source.towerId, level)
        )
          return [];
        return rescueCandidate(
          { ...source, level },
          actionCost(source.towerId, source.level, level),
          null,
          "fleet-copy",
          currentShortfall,
          source.level,
        );
      });
      return [...copies, ...upgrades];
    };
    // Earliest leak first: a step that lands after the first failing wave
    // cannot stop that leak, so any step that lands in time outranks it. Among
    // steps that land in time the doctrine cascade applies — a build-path
    // step before a fleet copy — then floor lift per gold, then the floor
    // reached, then gold.
    const rankRescue =
      (firstLeak: number | null) =>
      (a: RescueCandidate, b: RescueCandidate) => {
        const late = (c: RescueCandidate) =>
          firstLeak == null || c.targetWave <= firstLeak ? 0 : 1;
        const stage = (c: RescueCandidate) =>
          c.source === "build-path" ? 0 : 1;
        return (
          late(a) - late(b) ||
          stage(a) - stage(b) ||
          b.efficiency - a.efficiency ||
          a.shortfall - b.shortfall ||
          a.cost - b.cost
        );
      };

    // A snapshot is not allowed to recommend a field that is known to leak.
    // Spend the reserve when necessary, then add the most efficient legal copy
    // that improves the verified five-wave damage floor. Unknown abilities stay
    // explicitly unverified and never masquerade as a pass. Candidates cascade:
    // an in-build tower not yet fielded first; a fleet copy only once the build
    // is fully established or no build tower helps.
    const applySurvivalRescue = (
      initial: MatchPlanPhase["survival"],
      timing: "before-package" | "after-package",
    ) => {
      let survival = initial;
      for (let rescueStep = 0; rescueStep < 24; rescueStep += 1) {
        const currentShortfall = verifiedShortfall(survival);
        if (currentShortfall <= 0) break;
        const best = [
          ...buildPathCandidates(currentShortfall),
          ...fleetCopyCandidates(currentShortfall),
        ].sort(rankRescue(firstFailingWave(survival)))[0];
        if (!best) break;
        field = best.fromLevel
          ? field.map((tower) =>
              tower.copyId === best.tower.copyId ? best.tower : tower,
            )
          : [...field, best.tower];
        cumulativeCost += best.cost;
        phaseCost += best.cost;
        if (best.ordinal != null)
          rescueOrdinalByTower.set(best.tower.towerId, best.ordinal);
        const repairedWaves = best.survival.waves
          .filter(
            (wave) =>
              wave.status !== "unverified" &&
              (survival.waves.find((before) => before.wave === wave.wave)
                ?.margin ?? 1) < 1,
          )
          .map((wave) => `W${wave.wave}`)
          .join(", ");
        const priority =
          timing === "before-package"
            ? "Survival comes before the next package purchase in this window."
            : "Survival spending takes priority over the reserve.";
        actions.push({
          id: stableId(
            planId,
            definition.id,
            "survival-repair",
            best.tower.copyId,
            best.tower.level,
          ),
          phaseId: definition.id,
          order: actionOrder++,
          type: best.fromLevel ? "upgrade" : "build",
          summary: `${best.fromLevel ? "Upgrade" : best.source === "build-path" ? "Build" : "Add"} ${best.tower.towerName} ${best.tower.level}`,
          reason:
            best.source === "build-path"
              ? `${best.entryReason ? `${best.entryReason} ` : ""}${repairedWaves || "This window"} is below the 100% damage floor. This step is already part of the build, so it is bought now as damage instead of banking. ${priority}`
              : best.fromLevel
                ? `${repairedWaves || "This window"} is below the 100% damage floor. Upgrading this fielded copy is the strongest legal damage step on the build's own elements. ${priority}`
                : `${repairedWaves || "This copy"} is below the 100% damage floor without this placement. ${priority}`,
          towerId: best.tower.towerId,
          towerName: best.tower.towerName,
          copyId: best.tower.copyId,
          fromLevel: best.fromLevel,
          toLevel: best.tower.level,
          cost: best.cost,
          legal: true,
          affordable: true,
          targetWave: best.targetWave,
          cell: best.tower.cell ?? undefined,
          cellLabel: best.tower.cellLabel ?? undefined,
          campId: best.tower.campId ?? undefined,
          temporary: best.tower.status === "temporary",
        });
        survival = best.survival;
      }
      return survival;
    };

    // Phase state that a replan must be able to roll back.
    const snapshot = () => ({
      field: [...field],
      cumulativeCost,
      purchased: new Set(purchased),
      actions: [...actions],
      actionOrder,
      phaseCost,
      phaseRefund,
      rescueOrdinals: new Map(rescueOrdinalByTower),
    });
    const restore = (state: ReturnType<typeof snapshot>) => {
      field = [...state.field];
      cumulativeCost = state.cumulativeCost;
      purchased.clear();
      for (const key of state.purchased) purchased.add(key);
      actions.splice(0, actions.length, ...state.actions);
      actionOrder = state.actionOrder;
      phaseCost = state.phaseCost;
      phaseRefund = state.phaseRefund;
      rescueOrdinalByTower.clear();
      for (const [towerId, ordinal] of state.rescueOrdinals)
        rescueOrdinalByTower.set(towerId, ordinal);
    };

    // Buys the package queue in priority order. A step whose keystones are
    // not held yet is skipped, not a wall: gold flows to the next legal step
    // instead of banking for something no window can buy. A step that is
    // legal but not yet affordable ends the pass — banking for it is the
    // economy plan, and the survival passes decide whether that is allowed.
    // Then the emergency coverage repair, then what is being waited on.
    const runPackagePurchases = () => {
      let blocked: { entry: Purchase; why: "keystone" | "gold" } | null = null;
      const anchorFielded = () =>
        field.some((tower) => tower.towerId === build.anchorTowerId);
      for (const entry of remainingQueue()) {
        const key = purchaseKey(entry);
        const copyId = stableId(
          planId,
          "copy",
          entry.towerId,
          entry.copyOrdinal,
        );
        const existing = field.find((tower) => tower.copyId === copyId);
        const fromLevel = existing?.level ?? 0;
        if (fromLevel >= entry.toLevel) {
          purchased.add(key);
          continue;
        }
        // A bridge is throwaway damage for the waves before the anchor. Once
        // the anchor is fielded the economy pass stops buying bridges; the
        // survival passes may still use one when a wave needs it.
        if (entry.temporaryCarry && anchorFielded() && !existing) continue;
        // The lower level of this same copy is still pending.
        if (fromLevel < entry.toLevel - 1) continue;
        const legal = isLegal(entry.towerId, entry.toLevel, allocation);
        if (!legal) {
          blocked ??= { entry, why: "keystone" };
          continue;
        }
        const cost = actionCost(entry.towerId, fromLevel, entry.toLevel);
        const hasEstablishedDamage = field.some(
          (tower) =>
            !isBasicTowerId(tower.towerId) &&
            (tower.effect === "damage" || tower.effect === "hybrid"),
        );
        const establishedElements = new Set(
          field.flatMap((tower) => {
            const element = towerFacts(
              tower.towerId,
              tower.level,
            ).damageElement;
            return element ? [element] : [];
          }),
        );
        const openingIsSafe =
          hasEstablishedDamage &&
          (!requiresEarlyCoverage || establishedElements.size >= 2);
        const purchaseReserve = openingIsSafe ? reserveGold : 0;
        const spendable = Math.max(0, lower - purchaseReserve);
        if (cumulativeCost + cost > spendable) {
          blocked = { entry, why: "gold" };
          break;
        }
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
            copyId,
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
          targetWave: Math.max(
            entry.targetWave ?? 0,
            earliestAffordableWave(
              cumulativeCost + purchaseReserve,
              definition.start,
              definition.end,
            ),
          ),
          cell: placement?.cell,
          cellLabel: placement ? cellLabel(placement.cell, origin) : undefined,
          campId: placement?.campId,
          temporary: !!entry.temporaryCarry,
        });
        purchased.add(key);
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
            targetWave: earliestAffordableWave(
              cumulativeCost + reserveGold,
              definition.start,
              definition.end,
            ),
            cell: placement?.cell,
            cellLabel: placement
              ? cellLabel(placement.cell, origin)
              : undefined,
            campId: placement?.campId,
            temporary: true,
          });
        }
      }
      // The first step this pass could not take is always shown, so a window
      // that banks gold says what it is banking for — and a window with no
      // legal step says which keystone it is waiting on.
      if (blocked) {
        const pending = blocked.entry;
        const pendingCopyId = stableId(
          planId,
          "copy",
          pending.towerId,
          pending.copyOrdinal,
        );
        const fromLevel =
          field.find((tower) => tower.copyId === pendingCopyId)?.level ?? 0;
        const cost = actionCost(pending.towerId, fromLevel, pending.toLevel);
        const legal = blocked.why === "gold";
        const missing = legal ? [] : missingKeystones(pending, allocation);
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
          summary: legal
            ? `Wait on ${pending.towerName} ${pending.toLevel}`
            : `Wait on ${pending.towerName} ${pending.toLevel} · needs ${missing.join(" + ")} keystone${missing.length > 1 ? "s" : ""}`,
          reason: !legal
            ? `Not legal yet: it needs the ${missing.join(" and ")} keystone${missing.length > 1 ? "s" : ""}. Nothing earlier in the build order can be bought in this window either.`
            : survivalFirst
              ? `Legal now, but it could not be bought before this window's failing wave. Survival purchases come first; this waits for the gold they used.`
              : `Legal now, but buying it would breach the ${reserveGold.toLocaleString()} gold emergency reserve.`,
          towerId: pending.towerId,
          towerName: pending.towerName,
          fromLevel,
          toLevel: pending.toLevel,
          cost,
          legal,
          affordable: false,
          waitForGold: legal
            ? Math.max(0, cumulativeCost + cost + reserveGold - lower)
            : undefined,
          targetWave: Math.max(definition.start, pending.targetWave ?? 0),
          temporary: !!pending.temporaryCarry,
        });
      }
    };

    // Pass A — economy first: the package queue in order, then any rescue.
    const phaseStart = snapshot();
    runPackagePurchases();
    let survival = applySurvivalRescue(evaluate(field), "after-package");

    // Survival over economy. If the window still leaks and a package purchase
    // in this window only lands at or after the first failing wave, that
    // purchase could not be committed in time to matter. Replan the window
    // survival-first: buy in-build damage that lands before the failing wave,
    // then let the package queue take what is left (the big purchase waits).
    // The replan is kept only when it strictly improves the verified floor.
    const failingWave = firstFailingWave(survival);
    const packageSpendWhileLeaking =
      failingWave != null &&
      actions
        .slice(phaseStart.actions.length)
        .some(
          (action) =>
            action.affordable &&
            action.cost > 0 &&
            !action.id.includes(":survival-repair:"),
        );
    if (packageSpendWhileLeaking) {
      const economyFirst = { ...snapshot(), survival };
      restore(phaseStart);
      survivalFirst = true;
      const rescued = applySurvivalRescue(evaluate(field), "before-package");
      runPackagePurchases();
      const replanned =
        verifiedShortfall(rescued) < verifiedShortfall(economyFirst.survival)
          ? applySurvivalRescue(evaluate(field), "after-package")
          : rescued;
      if (
        verifiedShortfall(replanned) <
        verifiedShortfall(economyFirst.survival) - 0.0001
      ) {
        survival = replanned;
      } else {
        restore(economyFirst);
        survivalFirst = false;
        survival = economyFirst.survival;
      }
    }

    // ---- Retirement. A temporary copy carried into this window is sold
    // when the window no longer needs its damage: outright if it no longer
    // moves any wave, otherwise only when its refund (with the others') lets
    // a build-path step that is waiting on gold be bought now. Needs the
    // verified sell rate; without it nothing is sold and the plan says so.
    const retireTemporaries = (): boolean => {
      if (sellRefund == null) return false;
      const baseline = verifiedShortfall(survival);
      const carried = new Set(startTowers.map((tower) => tower.copyId));
      const candidates = field
        .flatMap((tower) => {
          if (
            tower.status !== "temporary" ||
            !carried.has(tower.copyId) ||
            retainTemporary(overrides, tower.copyId) ||
            (tower.effect !== "damage" && tower.effect !== "hybrid")
          )
            return [];
          const without = field.filter((t) => t.copyId !== tower.copyId);
          const result = evaluate(without);
          if (verifiedShortfall(result) > baseline + 0.0001) return [];
          const contribution = Math.max(
            0,
            ...survival.waves.map((wave, index) => {
              const after = result.waves[index]?.modeledDamage ?? 0;
              return wave.effectiveWaveHp > 0
                ? ((wave.modeledDamage ?? 0) - after) / wave.effectiveWaveHp
                : 0;
            }),
          );
          const paid = resolveLiveTowerCost(tower.towerId, tower.level);
          return [
            { tower, contribution, refund: Math.round(paid * sellRefund) },
          ];
        })
        .sort((a, b) => a.contribution - b.contribution || b.refund - a.refund);
      if (!candidates.length) return false;
      const blocked = actions.find(
        (action) =>
          action.id.includes(":wait:") && action.legal && !action.affordable,
      );
      const needed = blocked?.waitForGold ?? 0;
      const negligible = candidates.filter((c) => c.contribution < 0.01);
      const toSell = [...negligible];
      if (blocked && needed > 0) {
        let pool = negligible.reduce((sum, c) => sum + c.refund, 0);
        for (const candidate of candidates) {
          if (pool >= needed) break;
          if (toSell.includes(candidate)) continue;
          toSell.push(candidate);
          pool += candidate.refund;
        }
        // The refunds cannot reach the step: keep the useful copies.
        if (pool < needed) toSell.length = negligible.length;
      }
      if (!toSell.length) return false;
      const funding = toSell.some((c) => !negligible.includes(c));
      for (const { tower, refund, contribution } of toSell) {
        field = field.filter((t) => t.copyId !== tower.copyId);
        cumulativeCost -= refund;
        phaseRefund += refund;
        actions.push({
          id: stableId(planId, definition.id, "sell", tower.copyId),
          phaseId: definition.id,
          order: actionOrder++,
          type: "sell",
          summary: `Sell ${tower.towerName} ${tower.level}`,
          reason:
            contribution < 0.01
              ? `This temporary copy no longer moves any wave in this window (under 1% of a wave). Sell it at the start of the window and recover ${refund.toLocaleString()}g.`
              : `This temporary copy is not needed for this window's 100% damage floor, and its ${refund.toLocaleString()}g refund helps fund ${blocked?.summary.replace(/^Wait on /, "") ?? "the next build-path step"}.`,
          towerId: tower.towerId,
          towerName: tower.towerName,
          copyId: tower.copyId,
          fromLevel: tower.level,
          toLevel: 0,
          cost: 0,
          refund,
          legal: true,
          affordable: true,
          targetWave: definition.start,
          cell: tower.cell ?? undefined,
          cellLabel: tower.cellLabel ?? undefined,
          campId: tower.campId ?? undefined,
          temporary: true,
        });
      }
      if (funding && blocked) {
        const index = actions.findIndex((action) => action.id === blocked.id);
        if (index >= 0) actions.splice(index, 1);
        runPackagePurchases();
      }
      return true;
    };
    if (retireTemporaries())
      survival = applySurvivalRescue(evaluate(field), "after-package");

    // Present the window the way it is played: keystone, then sells (they
    // happen first and free the gold), then purchases in landing order — a
    // survival repair keeps its place ahead of the package step it displaced
    // because it lands earlier — then what is being waited on.
    const rank = (action: MatchPlanAction) =>
      action.type === "allocate-element"
        ? 0
        : action.type === "sell"
          ? 1
          : action.affordable
            ? 2
            : 3;
    const played = [...actions]
      .map((action, index) => ({ action, index }))
      .sort(
        (a, b) =>
          rank(a.action) - rank(b.action) ||
          (rank(a.action) === 2
            ? (a.action.targetWave ?? definition.start) -
              (b.action.targetWave ?? definition.start)
            : 0) ||
          a.index - b.index,
      )
      .map(({ action }) => action);
    const firstOrder = actions[0]?.order ?? actionOrder;
    actions.splice(
      0,
      actions.length,
      ...played.map((action, index) => ({ ...action, order: firstOrder + index })),
    );

    const coverage = coverageRows(field);
    const critical = coverage.filter(
      (row) => row.status === "critical" || row.status === "weak",
    );
    const risks = [
      ...(survival.status === "fails"
        ? [
            `Modeled survival failure on wave ${survival.worstWave ?? definition.start}; repair the field before following later upgrades.`,
          ]
        : survival.status === "borderline"
          ? [
              `Wave ${survival.worstWave ?? definition.start} has less than the 15% modeled safety margin.`,
            ]
          : []),
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
        phaseRefund,
        phaseStartGold,
        incomeThisPhase,
        phaseEndGold: Math.max(0, gross - cumulativeCost),
        goldLowerBound: lower,
        goldUpperBound: gross,
        emergencyReserve: protectedReserve,
        spendableLowerBound,
        affordable: cumulativeCost <= spendableLowerBound,
        assumptions: [
          "Starting gold and per-wave bounty are benchmark inputs.",
          "No interest income is assumed.",
          sellRefund == null
            ? "No sale value is assumed: the sell refund rate is not in the data, so temporary copies are never sold."
            : `Sell refunds are credited at ${Math.round(sellRefund * 100)}% of the gold paid.`,
        ],
      },
      survival,
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
      confidence:
        survival.status === "fails" || critical.length
          ? "low"
          : survival.status === "unverified" ||
              field.some((tower) => tower.cell == null)
            ? "medium"
            : "high",
    });
  }
  const unbought = remainingQueue().filter(
    (entry) =>
      !entry.temporaryCarry ||
      !field.some((tower) => tower.towerId === build.anchorTowerId),
  );
  if (unbought.length)
    violations.push(
      `${unbought.length} planned tower step(s) remain outside the conservative 56+ budget.`,
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
    settings: {
      mapId: map.id,
      mode,
      matchLength,
      difficulty,
      reserveGold,
    },
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
          ...(action.refund != null ? { refund: action.refund } : {}),
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
  if (build && built.length) {
    const merged = new Map(
      build.towers.map((tower) => [tower.towerId, { ...tower }]),
    );
    for (const entry of built) {
      try {
        getTower(entry.towerId);
      } catch {
        continue;
      }
      const existing = merged.get(entry.towerId);
      merged.set(entry.towerId, {
        towerId: entry.towerId,
        level: Math.max(
          existing?.level ?? 0,
          Math.max(1, Math.round(entry.level)),
        ),
      });
    }
    build = { ...build, towers: [...merged.values()] };
  }
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
