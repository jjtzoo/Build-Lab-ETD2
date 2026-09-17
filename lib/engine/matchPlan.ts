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
import { getTowerMechanicFacts } from "@/lib/domain/towerMechanicFacts";
import { getTowerPlacementFact } from "@/lib/domain/towerPlacementFacts";
import { getTowerProfile } from "@/lib/domain/towerProfileCatalog";
import type { EndGameTowerId } from "@/lib/domain/endGameTower";
import {
  END_GAME_TOWER_FACT_CATALOG,
  getEndGameTowerFact,
} from "@/lib/domain/endGameTowerFacts";
import {
  ESSENCE_LEGAL_WAVE,
  evaluateEndGameAccess,
  TRADITIONAL_END_GAME_ESSENCE_USES,
} from "@/lib/engine/endGameAccess";
import { sustainedEngagementDps } from "@/lib/engine/endGamePackageEvaluation";
import {
  benchmarkGoldAtEndWave,
  economyCheckpoint,
  type LiveMatchLength,
} from "@/lib/engine/liveEconomy";
import {
  cellsApart,
  combatFacts,
  evaluatePhaseSurvival,
  isSurvivalBuffProvider,
  type LevelStep,
} from "@/lib/engine/matchPlanSurvival";
import {
  bountyThroughWave,
  DEFAULT_MATCH_PLAN_DIFFICULTY,
  LAST_BENCHMARK_WAVE,
  type MatchPlanDifficulty,
  waveBenchmark,
} from "@/lib/engine/waveBenchmarks";
import { sellRefundFraction } from "@/lib/domain/towerEconomics";
import { evolutionCost, evolutionTargets } from "@/lib/domain/towerEvolution";
import {
  isEndGameTowerId,
  liveTowerName,
  resolveLiveTowerCost,
} from "@/lib/engine/liveGame";
import {
  contactIntervals,
  coverageForMode,
  islands,
} from "@/lib/engine/mapPlacement";
import { rankPlacements } from "@/lib/engine/placementValue";
import earlyRanges from "@/data/earlyTowerRanges.v1.json";

const EARLY_TOWER_RANGES = earlyRanges.ranges as Record<string, number>;

// Distance from a cell to the nearest route point is fixed map geometry.
const ROUTE_DISTANCE_MEMO = new WeakMap<MapConfig, Map<string, number>>();

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
  // The boss stage, from the workbook's rows 56–70: bounded by the table,
  // unverified on damage until a capture measures a boss wave's creep count.
  { id: "56-60", label: "Waves 56–60 · Boss", start: 56, end: 60 },
  { id: "61-70", label: "Waves 61–70 · Boss", start: 61, end: 70 },
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
  // The anchor's own keystones come right after the opening: level 1 of
  // each recipe element, then level 2, up to its planned level. Package
  // unlocks follow. A Trio anchor whose second level waited on the tenth
  // pick was reaching full damage twenty waves after it could have.
  // Level-major and level-capped: every recipe element to 1 before any to
  // 2. A Trio anchor after a Dual opening must not see its opening's two
  // elements stepped to 2 while its third element is still unpicked — that
  // left Impulse unbuildable until the fifth pick.
  const anchorRecipe = (() => {
    try {
      const tower = getTower(build.anchorTowerId);
      const planned =
        build.towers.find((entry) => entry.towerId === build.anchorTowerId)
          ?.level ?? 1;
      return Array.from({ length: Math.max(1, planned) }, (_, index) =>
        tower.recipe.map((element) => ({ element, upTo: index + 1 })),
      ).flat();
    } catch {
      return [];
    }
  })();
  const open = (element: ElementName) => ({
    element,
    upTo: Number.POSITIVE_INFINITY,
  });
  const proposed: { element: ElementName; upTo: number }[] =
    manual?.kind === "allocation-order"
      ? serialized.map(open)
      : [
          ...orderedOpeningRecipe.map(open),
          ...anchorRecipe,
          ...(coverageElement ? [open(coverageElement)] : []),
          ...serialized.map(open),
          ...anchorRecipe.map((step) => open(step.element)),
        ];
  const result: ElementName[] = [];
  const used = EMPTY_ALLOCATION();
  for (const { element, upTo } of proposed) {
    if (
      !ELEMENTS.includes(element) ||
      used[element] >= upTo ||
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
            .map((wave) => waveBenchmark(wave, DEFAULT_MATCH_PLAN_DIFFICULTY))
            .filter((wave) => wave != null);
          const multipliers = firstWaves.map((wave) =>
            wave.element === "Composite" || wave.element === "Boss"
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

/**
 * The next level a fielded copy could legally step to, or null once it is
 * maxed. A basic (Arrow/Cannon) has no next level — its own upgrade path is
 * replacing it with a real tower, already handled by the package queue.
 */
function nextTowerLevel(towerId: string, currentLevel: number): number | null {
  if (isBasicTowerId(towerId)) return null;
  if (isMonoTowerId(towerId)) return currentLevel < 3 ? currentLevel + 1 : null;
  try {
    return currentLevel < getTower(towerId).maxLevel ? currentLevel + 1 : null;
  } catch {
    return null;
  }
}

/**
 * Risk lines for creep-displacing towers (Archdruid) fielded alongside
 * contact-dependent damage towers, from the verified mechanic fact and the
 * owner's live observation attached to it.
 */
function displacementRisks(field: readonly PlannedTowerState[]): string[] {
  const throwers = field.filter((tower) =>
    getTowerMechanicFacts(tower.towerId).some(
      (effect) => effect.signal === "enemy-displacement",
    ),
  );
  if (!throwers.length) return [];
  const others = field.filter(
    (tower) =>
      (tower.effect === "damage" || tower.effect === "hybrid") &&
      !throwers.some((thrower) => thrower.towerId === tower.towerId),
  );
  if (!others.length) return [];
  const names = [...new Set(throwers.map((tower) => tower.towerName))];
  return [
    `${names.join(" and ")} throws each hit creep forward to the front of the wave; the ${others.length} other damage ${others.length === 1 ? "copy" : "copies"} lose contact on the skipped stretch. This model still credits their full route and train time, so this window's survival figures overstate the field — the owner saw it nullify the damage towers in live play. Not modeled until the lost contact is measured.`,
  ];
}

/**
 * Tesla Tree links with copies of itself within its own range, but that
 * range is not measured (data/mechanics.json: "chain": "UNKNOWN"), so
 * combatFacts credits every copy at its own single-tower DPS only. Say so
 * whenever 2+ copies are fielded, the same way an unquantified ability or
 * an End Game tower's open factor is named rather than left silent.
 */
function teslaTreeRisks(field: readonly PlannedTowerState[]): string[] {
  const copies = field.filter((tower) => tower.towerId === "tesla-tree");
  if (copies.length < 2) return [];
  return [
    `${copies.length} Tesla Trees are fielded; each is credited at its own single-tower DPS only, since the range at which they link is not measured — the real field may be doing more.`,
  ];
}

/**
 * Risk lines for fielded buff providers whose final allocation cannot take
 * them to their top level — the magnitude the survival model will credit
 * is the one the allocation allows, not the one the tower is known for.
 */
function buffCapRisks(
  field: readonly PlannedTowerState[],
  allocation: Readonly<Record<ElementName, number>>,
): string[] {
  const seen = new Set<string>();
  return field.flatMap((tower) => {
    if (seen.has(tower.towerId)) return [];
    const facts = getTowerMechanicFacts(tower.towerId).filter(
      (effect) =>
        (effect.signal === "attack-damage-buff" ||
          effect.signal === "attack-speed-buff") &&
        effect.activationRequirement !== "active-cast" &&
        effect.magnitude,
    );
    if (!facts.length) return [];
    seen.add(tower.towerId);
    let recipe: readonly ElementName[];
    let maxLevel: number;
    try {
      const catalog = getTower(tower.towerId);
      recipe = catalog.recipe;
      maxLevel = catalog.maxLevel;
    } catch {
      return [];
    }
    const reachable = Math.min(
      maxLevel,
      ...recipe.map((element) => allocation[element] ?? 0),
    );
    if (reachable >= maxLevel) return [];
    const magnitudes = facts[0].magnitude!.byLevel;
    const held = magnitudes[reachable - 1] ?? magnitudes[0];
    const top = magnitudes[maxLevel - 1] ?? magnitudes.at(-1) ?? held;
    const missing = recipe
      .filter((element) => (allocation[element] ?? 0) < maxLevel)
      .map((element) => `${element} ${maxLevel}`);
    return [
      `${tower.towerName} is capped at level ${reachable} by this build's allocation: its buff stays at +${held}%, not the +${top}% of level ${maxLevel}. Reaching it needs ${missing.join(" and ")}.`,
    ];
  });
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
    // The bridge must sit inside the anchor's own recipe (the progression's
    // rule): a carry on other elements spends the opening picks off the
    // anchor's path and delays the anchor by whole windows. Only if no Dual
    // in the recipe deals damage does any legal Dual qualify.
    const legalDuals = TOWERS.filter(
      (tower) =>
        tower.combination === "Dual" &&
        tower.recipe.every(
          (element) => (build.allocation[element] ?? 0) >= 1,
        ) &&
        getTowerProfile(tower.id).coreRoles.includes("main-dps") &&
        !getTowerPlacementFact(tower.id).targetsTowers,
    );
    const onPath = legalDuals.filter((tower) =>
      tower.recipe.every((element) => anchor.recipe.includes(element)),
    );
    const pool = new Set(
      (onPath.length ? onPath : legalDuals).map((t) => t.id),
    );
    const candidates = TOWERS.flatMap((tower) => {
      if (!pool.has(tower.id)) return [];
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
          reason: `${candidate.tower.name} I wins the legal early-bridge score for damage per gold, route coverage and its level-II mono pairing${onPath.length ? ` inside ${anchor.name}'s own elements` : ""}.`,
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

const CAMP_QUARTER_NAMES = ["Entry", "Mid", "Late", "Exit"] as const;

/**
 * Route moments a cell engages: the sorted set of route quarters the
 * midpoints of its passes fall in. Quarters are the coarsest split that
 * still tells Forest's entry block (passes at ~6s and ~46s) from the column
 * between the middle loop and the final climb (~13s and ~40s).
 */
function passSignature(
  map: MapConfig,
  cell: GridPoint,
  mode: WaveMode,
): number[] {
  const duration = Math.max(1, map.pathDurationSeconds ?? 1);
  const quarters = new Set<number>();
  for (const pass of contactIntervals(map, cell, 1000, mode)) {
    const mid = (pass.enterSeconds + pass.exitSeconds) / 2;
    quarters.add(Math.max(0, Math.min(3, Math.floor((mid / duration) * 4))));
  }
  return [...quarters].sort((a, b) => a - b);
}

/**
 * Camps split connected terrain again when cells engage clearly different
 * route moments. The moments are the *passes* the route makes through a
 * cell's reach, not just its first contact: on Forest the column between
 * the middle loop and the final climb to the exit is crossed twice, at
 * ~15s and ~40s, and one tower there covers two route moments — which is
 * exactly what spreading copies across camps is trying to buy. Grouping by
 * first contact alone folded that column into the entry camp and left it
 * under-used. Small signature groups are merged into the most similar
 * larger camp on the same island so the map does not shatter into slivers.
 */
export function deriveMatchPlanCamps(
  map: MapConfig,
  mode: WaveMode,
): MatchPlanCamp[] {
  const origin = originFor(map);
  const raw: MatchPlanCamp[] = [];
  for (const [islandIndex, island] of islands(map).entries()) {
    const groups = new Map<
      string,
      { signature: number[]; cells: GridPoint[] }
    >();
    for (const cell of island) {
      const signature = passSignature(map, cell, mode);
      const key = signature.join(",") || "none";
      const group = groups.get(key) ?? { signature, cells: [] };
      group.cells.push(cell);
      groups.set(key, group);
    }
    // Fold slivers (fewer than three cells) into the most similar larger
    // group — the one sharing the most sixths — so every camp is a place a
    // player can actually put several towers.
    const large = [...groups.values()].filter((g) => g.cells.length >= 3);
    for (const group of groups.values()) {
      if (group.cells.length >= 3 || !large.length) continue;
      const host = large
        .map((candidate) => ({
          candidate,
          shared: candidate.signature.filter((x) => group.signature.includes(x))
            .length,
        }))
        .sort(
          (a, b) =>
            b.shared - a.shared ||
            b.candidate.cells.length - a.candidate.cells.length,
        )[0].candidate;
      host.cells.push(...group.cells);
    }
    const kept = large.length ? large : [...groups.values()];
    for (const [groupIndex, group] of kept.entries()) {
      const ranked = group.cells
        .map((cell) => ({
          cell,
          coverage: coverageForMode(map, cell, 1000, mode),
        }))
        .sort(
          (a, b) => b.coverage.coveragePercent - a.coverage.coveragePercent,
        );
      const lead = ranked[0];
      if (!lead) continue;
      const quarters = group.signature;
      const moment = !quarters.length
        ? "Utility"
        : quarters.length === 1
          ? CAMP_QUARTER_NAMES[quarters[0]]
          : `${quarters.map((quarter) => CAMP_QUARTER_NAMES[quarter]).join(" + ")} double pass`;
      raw.push({
        id: `camp-${islandIndex + 1}-${groupIndex + 1}`,
        name: `${moment} camp ${islandIndex + 1}`,
        cells: ranked.map((entry) => entry.cell),
        capacity: group.cells.length,
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
    // A support that targets towers, not creeps, gains nothing from route
    // line-of-sight — but it gains nothing at all if its radius holds no
    // damage tower either. Rank candidate cells by how much fielded damage
    // (dps x quantity) actually falls inside this tower's own radius, so a
    // Blacksmith or Well lands where it does real work; among cells tied on
    // that (most often: no damage towers exist to reach yet), fall back to
    // the lowest route coverage so it still keeps out of a real tower's way.
    const rangeCells = (facts.range ?? 0) / Math.max(1, map.rangeUnitsPerCell);
    const damagePlaced = placed.flatMap((tower) => {
      if (!tower.cell) return [];
      const towerData = towerFacts(tower.towerId, tower.level);
      return towerData.baseDps &&
        (tower.effect === "damage" || tower.effect === "hybrid")
        ? [{ cell: tower.cell, dps: towerData.baseDps * tower.quantity }]
        : [];
    });
    const choices = map.buildableCells
      .filter((cell) => !taken.has(`${cell.col},${cell.row}`))
      .map((cell) => ({
        cell,
        coveredDps: damagePlaced.reduce(
          (sum, entry) =>
            cellsApart(cell, entry.cell) <= rangeCells
              ? sum + entry.dps
              : sum,
          0,
        ),
        coverage: coverageForMode(map, cell, 1000, mode).coveragePercent,
      }))
      .sort((a, b) => b.coveredDps - a.coveredDps || a.coverage - b.coverage);
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
    const campByCell = new Map<string, MatchPlanCamp>();
    for (const camp of camps)
      for (const candidate of camp.cells)
        campByCell.set(`${candidate.col},${candidate.row}`, camp);
    const campFor = (cell: GridPoint) =>
      campByCell.get(`${cell.col},${cell.row}`);
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
    const distanceToRoute = (cell: GridPoint) => {
      let table = ROUTE_DISTANCE_MEMO.get(map);
      if (!table) {
        table = new Map();
        ROUTE_DISTANCE_MEMO.set(map, table);
      }
      const key = `${mode}|${cell.col},${cell.row}`;
      const hit = table.get(key);
      if (hit != null) return hit;
      const value = Math.min(
        ...map.paths
          .filter((path) => path.modes.includes(mode))
          .flatMap((path) =>
            path.points.map((point) =>
              Math.hypot(cell.col - point.col, cell.row - point.row),
            ),
          ),
      );
      table.set(key, value);
      return value;
    };
    const longRange = facts.range >= 1_125;
    // Tesla Tree is the one tower the dev sheet documents as linking to
    // copies of itself within its own (unmeasured) range: "Tesla Trees in
    // range of each other link, combining damage, attack speed, range,
    // buffs and debuffs" (data/mechanics.json). The camp-load spread below
    // exists to scatter ordinary damage towers across camps for route
    // coverage; for this one tower it does the opposite of what its own
    // mechanic wants. Since the real chain radius is not measured, the same
    // camp is used as the closest available proxy for "in range" rather
    // than inventing a distance — narrowly scoped to this tower, since no
    // other tower's mechanic is documented this way.
    const clustersWithSelf = towerId === "tesla-tree";
    const sameTowerCamps = new Set(
      clustersWithSelf
        ? placed
            .filter((tower) => tower.towerId === towerId && tower.campId)
            .map((tower) => tower.campId as string)
        : [],
    );
    const chosen = fact.debuff
      ? (viableRanked[0] ?? ranked[0])
      : ([...(competitive.length ? competitive : viableRanked)].sort((a, b) => {
          // The build's first copy of a real tower takes the best cell
          // outright; spreading across camps is for the copies that follow,
          // and even then only among cells within a tenth of the best — a
          // camp is not opened at the price of a clearly weaker position.
          // Starters and monos are not "real" here: they are placed before
          // the anchor exists and must not sit in the cell it will want.
          const firstCopy =
            !isBasicTowerId(towerId) &&
            !isMonoTowerId(towerId) &&
            !placed.some((tower) => tower.towerId === towerId);
          const tier = (entry: (typeof ranked)[number]) =>
            entry.value.score >= bestScore * 0.9 ? 0 : 1;
          if (!firstCopy && tier(a) !== tier(b)) return tier(a) - tier(b);
          const campA = campFor(a.cell);
          const campB = campFor(b.cell);
          if (!firstCopy && clustersWithSelf && sameTowerCamps.size) {
            const aSame = campA && sameTowerCamps.has(campA.id) ? 0 : 1;
            const bSame = campB && sameTowerCamps.has(campB.id) ? 0 : 1;
            if (aSame !== bSame) return aSame - bSame;
          }
          const loadA = campA ? (damageLoad.get(campA.id) ?? 0) : 99;
          const loadB = campB ? (damageLoad.get(campB.id) ?? 0) : 99;
          if (
            !firstCopy &&
            !clustersWithSelf &&
            placedDamage.length > 0 &&
            loadA !== loadB
          )
            return loadA - loadB;
          const passes = b.value.coverage.passes - a.value.coverage.passes;
          if (!firstCopy && passes !== 0) return passes;
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

/**
 * The two End Game essence picks this build would make, in order — never
 * more than `TRADITIONAL_END_GAME_ESSENCE_USES`. When the build already
 * carries a real, ranked selection (`PortableBuild.endGame`, populated for
 * every Build-Lab-recommended plan by `evaluateEndGamePackage`/
 * `rankEndGamePackages`), that selection is used as-is — it already weighs
 * anchor-weakness coverage, AoE/Composite breadth and range, which this
 * function does not have the search state to reproduce. Only when a build
 * carries no `endGame` at all (a hand-built Theory Craft plan) does this
 * fall back to a deliberately simplified stand-in: rank the legal
 * candidates by raw sustained damage, preferring the anchor's own element
 * on a tie.
 */
function buildEssenceQueue(build: PortableBuild): readonly EndGameTowerId[] {
  const fromBuild = (build.endGame ?? []).flatMap((choice) => {
    const fact = END_GAME_TOWER_FACT_CATALOG.facts.find(
      (entry) => entry.name === choice.name,
    );
    return fact
      ? Array<EndGameTowerId>(Math.max(0, choice.quantity)).fill(fact.towerId)
      : [];
  });
  if (fromBuild.length)
    return fromBuild.slice(0, TRADITIONAL_END_GAME_ESSENCE_USES);
  const access = evaluateEndGameAccess(build.allocation);
  if (!access.candidates.length) return [];
  const anchorElement = (() => {
    try {
      return getTower(build.anchorTowerId).damageElement;
    } catch {
      return null;
    }
  })();
  const best = [...access.candidates].sort((a, b) => {
    const dpsDiff =
      sustainedEngagementDps(getEndGameTowerFact(b.towerId)).sustainedDps -
      sustainedEngagementDps(getEndGameTowerFact(a.towerId)).sustainedDps;
    if (dpsDiff) return dpsDiff;
    const aMatch = a.element === anchorElement ? 0 : 1;
    const bMatch = b.element === anchorElement ? 0 : 1;
    return aMatch - bMatch || a.towerId.localeCompare(b.towerId);
  })[0];
  return best
    ? Array<EndGameTowerId>(TRADITIONAL_END_GAME_ESSENCE_USES).fill(
        best.towerId,
      )
    : [];
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
  const difficulty = settings.difficulty ?? DEFAULT_MATCH_PLAN_DIFFICULTY;
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
  const essenceQueue = buildEssenceQueue(build);
  const requiresEarlyCoverage = queue.some(
    (entry) => entry.priority === 115 && isMonoTowerId(entry.towerId),
  );
  const camps = deriveMatchPlanCamps(map, mode);
  // How many copies of any one tower the rescue cascade will ever add. The
  // anchor may stand in every viable camp (a winning Wisp field ran six);
  // any other tower in half of them, floor 2. A real player does not fill
  // every buildable cell with the cheapest legal tower to nibble a failing
  // wave's margin by another percent — they place a few strong copies and
  // stop. Camps are route moments, so a map with more of them earns more
  // copies, but not one per moment for every cheap mono.
  const viableCampCount = camps.filter((camp) => camp.viable).length;
  const fleetCopySaturationFor = (towerId: string) =>
    Math.max(
      2,
      towerId === build.anchorTowerId
        ? viableCampCount
        : Math.floor(viableCampCount / 2),
    );
  const now = settings.now ?? new Date().toISOString();
  const planId =
    settings.id ??
    stableId("plan", build.anchorTowerId || "custom", build.createdAt);
  const allocation = EMPTY_ALLOCATION();
  let field: PlannedTowerState[] = [];
  let cumulativeCost = 0;
  // Not per-tower — the match grants exactly this many essence uses total,
  // shared across whichever Pure/Periodic towers get picked.
  let essenceUsesRemaining = TRADITIONAL_END_GAME_ESSENCE_USES;
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
    // A flat 300g reserve is a rounding error once a window pays 20,000g.
    // From wave 21 the reserve is one wave's bounty of the window's first
    // wave — enough to answer a leak with a real purchase — and survival
    // spending still overrides it, as it always did.
    const windowReserve =
      definition.start >= 21
        ? Math.max(
            reserveGold,
            waveBenchmark(definition.start, difficulty)?.waveBounty ?? 0,
          )
        : reserveGold;
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
    // Why the last rescue pass stopped with a wave still short: no legal
    // step at all (every copy at its cap or max level), or steps that exist
    // but cannot be paid for inside this window.
    let rescueExhausted: null | "cap" | "gold" = null;
    let rescueUnaffordable = 0;

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
    // Planning looks one wave past the window: the first wave of the next
    // window can only be met by gold and copies committed here, so rescue
    // choices are ranked against it too (a copy that counters its armour
    // beats one that does not). The verdict shown stays the window's own.
    const evaluate = (
      towers: readonly PlannedTowerState[],
      candidate?: { copyId: string; targetWave: number },
      horizon = 1,
    ) =>
      evaluatePhaseSurvival({
        map,
        mode,
        difficulty,
        startWave: definition.start,
        endWave:
          definition.end == null
            ? null
            : Math.min(LAST_BENCHMARK_WAVE, definition.end + horizon),
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
    // Uncapped companion to verifiedShortfall: credits every point of a
    // verified wave's margin, not just enough to clear it. verifiedShortfall
    // floors each wave's term at zero, so once a candidate closes the gap on
    // every wave in the window, two candidates that both "pass" score
    // identically no matter how much headroom either leaves — which is
    // exactly why a cheap fresh copy that barely clears a window used to
    // outrank an upgrade that clears it with room to spare. This sum has no
    // such floor, so the extra headroom an upgrade leaves on the waves it
    // touches (real safety margin against the next window's HP growth)
    // shows up as real value instead of vanishing at 100%.
    const marginSum = (result: MatchPlanPhase["survival"]) =>
      result.waves.reduce(
        (sum, wave) =>
          wave.status === "unverified" ? sum : sum + (wave.margin ?? 0),
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
      source: "build-path" | "fleet-copy" | "essence";
      /** Level the copy is at before this step; > 0 means an upgrade in place. */
      fromLevel: number;
      /** The package's own reason for the step, when it has one. */
      entryReason?: string;
    };
    // Prices and places one prospective step — a new copy, or an upgrade of a
    // copy already on the field — keeping it only if it lifts the verified
    // damage floor. Survival may spend the reserve, never beyond gross.
    // When set, candidates are judged as if gold were no object and landed
    // at the window's first wave — the "what would have lifted this" view
    // used only to name the next lever once the real rescue is exhausted.
    let leverMode = false;
    const rescueCandidate = (
      source: PlannedTowerState,
      cost: number,
      ordinal: number | null,
      kind: RescueCandidate["source"],
      currentSurvival: MatchPlanPhase["survival"],
      fromLevel = 0,
      entryReason?: string,
    ): RescueCandidate[] => {
      const currentShortfall = verifiedShortfall(currentSurvival);
      if (cost <= 0) return [];
      if (!leverMode && cumulativeCost + cost > gross) {
        rescueUnaffordable += 1;
        return [];
      }
      const upgrade = fromLevel > 0;
      const placement = upgrade
        ? source.cell
          ? { cell: source.cell, campId: source.campId ?? "uncamped" }
          : null
        : chooseCell(map, mode, camps, source.towerId, source.level, field);
      if (!placement) return [];
      const targetWave = leverMode
        ? definition.start
        : earliestAffordableWave(
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
      // however early it lands. This gate stays on the clipped shortfall —
      // it exists to keep the rescue loop making real progress on a genuine
      // deficit each step, not to rank candidates that already clear it.
      const shortfallLift = currentShortfall - nextShortfall;
      if (shortfallLift < Math.min(0.01, currentShortfall - 0.0001))
        return [];
      // Ranking uses the uncapped margin sum instead: two candidates that
      // both close the gap can still differ in how much headroom they leave
      // on the waves they touch, and that headroom — not just "passes or
      // doesn't" — is what a real player (and the next window's rescue) gets
      // to start from. No arbitrary bonus for being an upgrade; the level's
      // real modeled damage is the only thing being compared.
      const headroomLift = marginSum(nextSurvival) - marginSum(currentSurvival);
      return [
        {
          tower,
          cost,
          ordinal,
          targetWave,
          survival: nextSurvival,
          shortfall: nextShortfall,
          efficiency: headroomLift / cost,
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
    const buildPathCandidates = (currentSurvival: MatchPlanPhase["survival"]) =>
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
            currentSurvival,
            fromLevel,
            entry.reason,
          );
        });
      });
    // Stage 2 — another copy of a tower the fleet already runs, judged by how
    // much it lifts the whole window's floor per gold. A starter (Arrow /
    // Cannon) stops being offered once the anchor is up: it is wave-one
    // survival shell, not a tower a real player keeps re-buying at 75g once
    // real damage exists.
    const anchorEstablished = field.some(
      (tower) => tower.towerId === build.anchorTowerId,
    );
    const fleetCopyCandidates = (currentSurvival: MatchPlanPhase["survival"]) => {
      const damageTowers = field.filter(
        (tower) =>
          (tower.effect === "damage" || tower.effect === "hybrid") &&
          combatFacts(tower.towerId, tower.level) != null &&
          isLegal(tower.towerId, tower.level, allocation) &&
          !(anchorEstablished && isBasicTowerId(tower.towerId)) &&
          // End Game towers copy and upgrade through essenceCandidates only
          // — its own essence-use budget, not the camp-based fleet cap.
          !isEndGameTowerId(tower.towerId),
      );
      // A tower already at the plan's saturation cap for this build may
      // still be upgraded (no new cell), but never copied again.
      const copyCountByTower = new Map<string, number>();
      for (const tower of field)
        copyCountByTower.set(
          tower.towerId,
          (copyCountByTower.get(tower.towerId) ?? 0) + 1,
        );
      // A buff provider only earns another copy while there are damage
      // copies left for it to buff: Blacksmith and Well each hold four
      // targets, so ceil(damage copies / 4) of them saturate the field, and
      // a Trickery clone always has a target, so one is the cap. A fourth
      // Blacksmith with nothing left to buff is not a purchase.
      const damageCopies = field.filter(
        (tower) =>
          (tower.effect === "damage" || tower.effect === "hybrid") &&
          !isSurvivalBuffProvider(tower.towerId),
      ).length;
      const buffCap = (towerId: string) => {
        const facts = getTowerMechanicFacts(towerId);
        if (facts.some((effect) => effect.signal === "tower-replication"))
          return 1;
        const targets = Math.max(
          1,
          ...facts
            .filter(
              (effect) =>
                effect.signal === "attack-damage-buff" ||
                effect.signal === "attack-speed-buff",
            )
            .map((effect) => effect.maxTargets ?? 1),
        );
        return Math.max(1, Math.ceil(damageCopies / targets));
      };
      // A tower whose ability spends lives (Life Altar) is built once: its
      // attack is real, but a second copy is a second drain on the pool
      // the plan never spends, and no measured field carried two.
      const spendsLives = (towerId: string) =>
        getTowerMechanicFacts(towerId).some(
          (effect) => effect.resourceBurden?.resource === "lives",
        );
      const belowSaturation = (towerId: string) =>
        (copyCountByTower.get(towerId) ?? 0) <
        (spendsLives(towerId)
          ? 1
          : isSurvivalBuffProvider(towerId)
            ? Math.min(fleetCopySaturationFor(towerId), buffCap(towerId))
            : fleetCopySaturationFor(towerId));
      // A fielded tower can be copied at its current level or any lower
      // one: a fresh level-1 copy of the anchor is often the best damage per
      // gold on the field once the original has been upgraded.
      const sourceTowers = [
        ...new Map(
          damageTowers
            .filter((tower) => belowSaturation(tower.towerId))
            .flatMap((tower) =>
              Array.from({ length: tower.level }, (_, index) => index + 1)
                .filter(
                  (level) =>
                    isLegal(tower.towerId, level, allocation) &&
                    combatFacts(tower.towerId, level) != null,
                )
                .map((level): [string, PlannedTowerState] => [
                  `${tower.towerId}@${level}`,
                  { ...tower, level },
                ]),
            ),
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
          currentSurvival,
        );
      });
      // A fielded copy's next level is often the strongest legal damage step
      // once it has hit the copy-saturation cap above — no new cell, no new
      // saturation, just more damage. This is how a saturated build spends a
      // growing bank instead of stalling once every camp is full of copies.
      const upgrades = damageTowers.flatMap((source) => {
        const level = nextTowerLevel(source.towerId, source.level);
        if (
          level == null ||
          !isLegal(source.towerId, level, allocation) ||
          !combatFacts(source.towerId, level)
        )
          return [];
        return rescueCandidate(
          { ...source, level },
          actionCost(source.towerId, source.level, level),
          null,
          "fleet-copy",
          currentSurvival,
          source.level,
        );
      });
      return [...copies, ...upgrades];
    };
    // Stage 3 — the next End Game essence pick, once the normal-tier field
    // is saturated. Confirmed by the owner: wave 50 grants the first
    // Pure/Periodic essence, wave 55 the second (ESSENCE_LEGAL_WAVE) — not
    // both at the boss stage's own start (wave 56), which was only a
    // stated, unmeasured floor before this was confirmed. Legality is
    // re-checked against the plan's own live allocation (not the build's
    // final target), so an essence tower is never offered before its
    // keystones are actually held in-game.
    const essenceCandidates = (currentSurvival: MatchPlanPhase["survival"]) => {
      if (essenceUsesRemaining <= 0) return [];
      const pickIndex =
        TRADITIONAL_END_GAME_ESSENCE_USES - essenceUsesRemaining;
      if (definition.start < ESSENCE_LEGAL_WAVE[pickIndex]) return [];
      const towerId = essenceQueue[pickIndex];
      if (!towerId) return [];
      const access = evaluateEndGameAccess(allocation);
      if (!access.candidates.some((entry) => entry.towerId === towerId))
        return [];
      const fact = getEndGameTowerFact(towerId);
      const source: PlannedTowerState = {
        copyId: stableId(planId, "copy", towerId, pickIndex + 1),
        towerId,
        towerName: fact.name,
        level: 1,
        quantity: 1,
        purpose: "End Game essence pick",
        roles: ["main-dps"],
        status: "permanent",
        effect: "damage",
        globalBuff: false,
        directHitDebuff: false,
        cell: null,
        cellLabel: null,
        campId: null,
      };
      return rescueCandidate(
        source,
        resolveLiveTowerCost(towerId, 1),
        null,
        "essence",
        currentSurvival,
        0,
        `Essence pick ${pickIndex + 1} of ${TRADITIONAL_END_GAME_ESSENCE_USES}: ${fact.name}, ${fact.minimumFieldCost.toLocaleString()}g flat, no keystone. Legal from wave ${ESSENCE_LEGAL_WAVE[pickIndex]}.`,
      );
    };
    // Earliest leak first: a step that lands after the first failing wave
    // cannot stop that leak, so any step that lands in time outranks it. Among
    // steps that land in time the doctrine cascade applies — a build-path
    // step before a fleet copy — then floor lift per gold, then the floor
    // reached, then gold.
    type RescuePolicy = "timing-first" | "build-path-first";
    const rankRescue =
      (firstLeak: number | null, policy: RescuePolicy) =>
      (a: RescueCandidate, b: RescueCandidate) => {
        const late = (c: RescueCandidate) =>
          firstLeak == null || c.targetWave <= firstLeak ? 0 : 1;
        const stage = (c: RescueCandidate) =>
          c.source === "build-path" ? 0 : c.source === "fleet-copy" ? 1 : 2;
        const upgradeFirst = (c: RescueCandidate) => (c.fromLevel ? 0 : 1);
        // The anchor's first copy outranks efficiency: it is the build's
        // damage backbone and lifts every window after this one, which a
        // per-window lift-per-gold figure cannot see. A cheaper support
        // tower that happens to score better here must not delay it —
        // only a step that lands before the first leaking wave may.
        const anchorFirst = (c: RescueCandidate) =>
          c.source === "build-path" &&
          c.tower.towerId === build.anchorTowerId &&
          !c.fromLevel &&
          !field.some((tower) => tower.towerId === build.anchorTowerId)
            ? 0
            : 1;
        return (
          (policy === "timing-first"
            ? late(a) - late(b) ||
              anchorFirst(a) - anchorFirst(b) ||
              stage(a) - stage(b)
            : anchorFirst(a) - anchorFirst(b) ||
              stage(a) - stage(b) ||
              late(a) - late(b)) ||
          b.efficiency - a.efficiency ||
          a.shortfall - b.shortfall ||
          upgradeFirst(a) - upgradeFirst(b) ||
          a.cost - b.cost
        );
      };

    // A snapshot is not allowed to recommend a field that is known to leak.
    // Spend the reserve when necessary, then add the most efficient legal copy
    // that improves the verified five-wave damage floor. Unknown abilities stay
    // explicitly unverified and never masquerade as a pass. Candidates cascade:
    // an in-build tower not yet fielded first; a fleet copy only once the build
    // is fully established or no build tower helps.
    const runRescuePolicy = (
      initial: MatchPlanPhase["survival"],
      timing: "before-package" | "after-package",
      policy: RescuePolicy,
    ) => {
      let survival = initial;
      for (let rescueStep = 0; rescueStep < 24; rescueStep += 1) {
        const currentShortfall = verifiedShortfall(survival);
        if (currentShortfall <= 0) break;
        rescueUnaffordable = 0;
        const best = [
          ...buildPathCandidates(survival),
          ...fleetCopyCandidates(survival),
          ...essenceCandidates(survival),
        ].sort(rankRescue(firstFailingWave(survival), policy))[0];
        if (!best) {
          rescueExhausted = rescueUnaffordable > 0 ? "gold" : "cap";
          break;
        }
        field = best.fromLevel
          ? field.map((tower) =>
              tower.copyId === best.tower.copyId ? best.tower : tower,
            )
          : [...field, best.tower];
        cumulativeCost += best.cost;
        phaseCost += best.cost;
        if (best.source === "essence") essenceUsesRemaining -= 1;
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
              : best.source === "essence"
                ? (best.entryReason ?? "")
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
    // Greedy timing-first spending can fill a window with cheap in-time
    // copies and leave nothing for the build's own big step that would have
    // fixed the later waves. Run both policies from the same state and keep
    // the one that reaches the better floor; on a tie, the cheaper one.
    const applySurvivalRescue = (
      initial: MatchPlanPhase["survival"],
      timing: "before-package" | "after-package",
    ) => {
      const start = snapshot();
      const timingFirst = runRescuePolicy(initial, timing, "timing-first");
      // The window's own floor decides first — a wave left short here is
      // never traded for lift later. Only between equal windows does the
      // longer look (this window plus the next) break the tie, so a fleet
      // of cheap in-time copies that patches this window and leaves the
      // next bare loses to the build's own step that lifts both.
      const timingWindow = verifiedShortfall(timingFirst);
      const timingAhead = verifiedShortfall(evaluate(field, undefined, 5));
      const timingState = { ...snapshot(), survival: timingFirst };
      restore(start);
      const buildFirst = runRescuePolicy(initial, timing, "build-path-first");
      const buildWindow = verifiedShortfall(buildFirst);
      const buildAhead = verifiedShortfall(evaluate(field, undefined, 5));
      const close = (a: number, b: number) => Math.abs(a - b) <= 0.0001;
      const buildWins =
        buildWindow < timingWindow - 0.0001 ||
        (close(buildWindow, timingWindow) &&
          (buildAhead < timingAhead - 0.0001 ||
            (close(buildAhead, timingAhead) &&
              cumulativeCost <= timingState.cumulativeCost)));
      if (buildWins) return buildFirst;
      restore(timingState);
      return timingFirst;
    };

    // Phase state that a replan must be able to roll back.
    const snapshot = () => ({
      field: [...field],
      cumulativeCost,
      essenceUsesRemaining,
      purchased: new Set(purchased),
      actions: [...actions],
      actionOrder,
      phaseCost,
      phaseRefund,
      rescueExhausted,
      rescueOrdinals: new Map(rescueOrdinalByTower),
    });
    const restore = (state: ReturnType<typeof snapshot>) => {
      field = [...state.field];
      cumulativeCost = state.cumulativeCost;
      essenceUsesRemaining = state.essenceUsesRemaining;
      purchased.clear();
      for (const key of state.purchased) purchased.add(key);
      actions.splice(0, actions.length, ...state.actions);
      actionOrder = state.actionOrder;
      phaseCost = state.phaseCost;
      phaseRefund = state.phaseRefund;
      rescueExhausted = state.rescueExhausted;
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
        const purchaseReserve = openingIsSafe ? windowReserve : 0;
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
        }).sort((a, b) => b.score - a.score || b.cost - a.cost)[0];
        const spendable = Math.max(0, lower - windowReserve);
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
              cumulativeCost + windowReserve,
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
              : `Legal now, but buying it would breach the ${windowReserve.toLocaleString()} gold emergency reserve.`,
          towerId: pending.towerId,
          towerName: pending.towerName,
          // The copy this wait resolves into — the same id its later-window
          // placement carries, so the UI can point at where it will stand.
          copyId: pendingCopyId,
          fromLevel,
          toLevel: pending.toLevel,
          cost,
          legal,
          affordable: false,
          waitForGold: legal
            ? Math.max(0, cumulativeCost + cost + windowReserve - lower)
            : undefined,
          targetWave: Math.max(definition.start, pending.targetWave ?? 0),
          temporary: !!pending.temporaryCarry,
        });
      }
    };

    // A real player builds what they already committed to before reaching
    // for a stranger tower: if the queue still holds a copy that is legal
    // right now (no extra keystone) and does not itself sit weak against a
    // defender this field is weak or critical against, pull it forward
    // ahead of its normal turn. Ranked by the matchup it actually carries
    // first, then by cost — a real tower usually outguns a bare mono, so
    // more investment wins a tie instead of losing to it, and a neutral
    // (1x) tower with real damage can be the better repair than a nominal
    // counter that is too cheap to help (Earth 1 vs Darkness 2 against
    // Earth armour, both 1x: Darkness 2 is the buy once nothing actually
    // counters the armour yet). Runs only after survival rescue has already
    // settled for the window (called below, not from inside
    // runPackagePurchases): discovered on Quake (Very Hard) that running it
    // earlier changed what the rescue ranking judged the field still
    // needed and delayed the anchor's own construction by a full window,
    // costing three windows that used to clear. Transactional like
    // retireTemporaries below for the same reason: a repair that makes the
    // wider stretch worse is not a repair.
    const runSamePathCoverageRepair = () => {
      const weakOrCritical = coverageRows(field).filter(
        (row) => row.status === "critical" || row.status === "weak",
      );
      if (!weakOrCritical.length) return;
      const spendable = Math.max(0, lower - windowReserve);
      const samePath = remainingQueue()
        .filter((entry) => !purchased.has(purchaseKey(entry)))
        .flatMap((entry) => {
          if (!isLegal(entry.towerId, entry.toLevel, allocation)) return [];
          const copyId = stableId(
            planId,
            "copy",
            entry.towerId,
            entry.copyOrdinal,
          );
          const existing = field.find((tower) => tower.copyId === copyId);
          const fromLevel = existing?.level ?? 0;
          if (fromLevel >= entry.toLevel) return [];
          if (fromLevel < entry.toLevel - 1) return [];
          // A buff/debuff provider's own hit barely moves the weighted
          // coverage average next to its buff value — Blacksmith/Well/
          // Trickery still classify as "hybrid" (their own damage is
          // nonzero), so the effect check alone does not catch them.
          const effect = effectFor(entry.towerId, entry.toLevel);
          if (effect !== "damage" && effect !== "hybrid") return [];
          if (isSurvivalBuffProvider(entry.towerId)) return [];
          const facts = towerFacts(entry.towerId, entry.toLevel);
          const element = facts.damageElement;
          if (!element || element === "Composite") return [];
          if (!facts.baseDps) return [];
          if (
            weakOrCritical.some(
              (row) => ELEMENT_MATCHUPS[element][row.defender] < 1,
            )
          )
            return [];
          const cost = actionCost(entry.towerId, fromLevel, entry.toLevel);
          if (cumulativeCost + cost > spendable) return [];
          // Bounded to a modest slice of this window's own income: a repair
          // that costs more than half of what this window brings in is not
          // a nudge, it is redirecting money later windows were counting on.
          if (cost > incomeThisPhase * 0.5) return [];
          const matchupScore = weakOrCritical.reduce(
            (sum, row) => sum + ELEMENT_MATCHUPS[element][row.defender],
            0,
          );
          // A real counter (2x) always outranks a merely-neutral tower
          // (1x), but among ties — Earth 1 and Darkness 2 are both neutral
          // against Earth armour — the one with more actual damage moves
          // the weighted average further, so it wins.
          const score = matchupScore * facts.baseDps;
          return [{ entry, fromLevel, cost, score }];
        })
        .sort((a, b) => b.score - a.score || b.cost - a.cost)[0];
      if (!samePath) return;
      const before = snapshot();
      const beforeWideShortfall = verifiedShortfall(
        evaluate(field, undefined, 20),
      );
      const { entry, fromLevel, cost } = samePath;
      const copyId = stableId(planId, "copy", entry.towerId, entry.copyOrdinal);
      const existing = field.find((tower) => tower.copyId === copyId);
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
          "coverage-repair-same-path",
          entry.towerId,
          entry.toLevel,
          copyId,
        ),
        phaseId: definition.id,
        order: actionOrder++,
        type: entry.kind,
        summary: `${fromLevel ? "Upgrade" : "Build"} ${entry.towerName} ${entry.toLevel}`,
        reason: `Pulled forward from later in the build: it is already legal and already on this plan's own path, and it does not sit weak against ${weakOrCritical.map((row) => `${row.defender} armour`).join(" and ")} — do this before another package upgrade.`,
        towerId: entry.towerId,
        towerName: entry.towerName,
        copyId,
        fromLevel,
        toLevel: entry.toLevel,
        cost,
        legal: true,
        affordable: true,
        targetWave: earliestAffordableWave(
          cumulativeCost + windowReserve,
          definition.start,
          definition.end,
        ),
        cell: placement?.cell,
        cellLabel: placement ? cellLabel(placement.cell, origin) : undefined,
        campId: placement?.campId,
        temporary: !!entry.temporaryCarry,
      });
      purchased.add(purchaseKey(entry));
      const afterWideShortfall = verifiedShortfall(
        evaluate(field, undefined, 20),
      );
      if (afterWideShortfall > beforeWideShortfall + 0.0001) restore(before);
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

    // Same-path coverage repair runs after both survival passes above have
    // settled the window's own real damage/rescue decisions — see the
    // function's own comment for why running it any earlier is unsafe.
    runSamePathCoverageRepair();
    survival = applySurvivalRescue(evaluate(field), "after-package");

    // A starter (Arrow/Cannon) or Level 1 mono that is about to be sold for
    // no longer moving any wave is, in the real game, never actually sold —
    // it is upgraded in place into whatever the build's own queue calls for
    // next, keeping the gold already sunk into it (lib/domain/towerEvolution.ts).
    // Tried once per candidate, right where a sale would otherwise happen: if
    // the queue's own next build for a reachable tower is still legal and
    // affordable at the net evolution price, this exact copy becomes that
    // tower on its own cell instead of being discarded for an unmeasured
    // refund and rebuilt from nothing elsewhere.
    const tryEvolve = (tower: PlannedTowerState): boolean => {
      if (!isBasicTowerId(tower.towerId) && !isMonoTowerId(tower.towerId))
        return false;
      // Only a tower's very first step evolves cleanly into another's very
      // first step — evolutionTargets carries the level across unchanged, so
      // a Level 2+ mono would land its target at a level the queue's own
      // first build for that tower never asks for.
      if (tower.level !== 1) return false;
      const targets = new Set(
        evolutionTargets(tower.towerId, tower.level).map(
          (step) => step.towerId,
        ),
      );
      const spendable = Math.max(0, lower - windowReserve);
      const entry = remainingQueue().find(
        (candidate) =>
          targets.has(candidate.towerId) &&
          candidate.toLevel === 1 &&
          !purchased.has(purchaseKey(candidate)) &&
          isLegal(candidate.towerId, candidate.toLevel, allocation) &&
          !field.some(
            (t) =>
              t.copyId ===
              stableId(planId, "copy", candidate.towerId, candidate.copyOrdinal),
          ),
      );
      if (entry) {
        const cost = evolutionCost(
          { towerId: tower.towerId, level: tower.level },
          { towerId: entry.towerId, level: entry.toLevel },
        );
        if (cumulativeCost + cost > spendable) return false;
        const officialCopyId = stableId(
          planId,
          "copy",
          entry.towerId,
          entry.copyOrdinal,
        );
        const evolved: PlannedTowerState = {
          copyId: officialCopyId,
          towerId: entry.towerId,
          towerName: entry.towerName,
          level: entry.toLevel,
          quantity: 1,
          purpose: entry.temporaryCarry
            ? "Temporary early carry"
            : purposeFor(build, entry.towerId),
          roles: entry.roles,
          status:
            entry.temporaryCarry && !retainTemporary(overrides, officialCopyId)
              ? "temporary"
              : "permanent",
          effect: effectFor(entry.towerId, entry.toLevel),
          globalBuff: getTowerPlacementFact(entry.towerId).targetsTowers,
          directHitDebuff:
            getTowerPlacementFact(entry.towerId).debuff !== null,
          cell: tower.cell,
          cellLabel: tower.cellLabel,
          campId: tower.campId,
        };
        field = [...field.filter((t) => t.copyId !== tower.copyId), evolved];
        cumulativeCost += cost;
        phaseCost += cost;
        actions.push({
          id: stableId(
            planId,
            definition.id,
            "evolve",
            tower.copyId,
            entry.towerId,
          ),
          phaseId: definition.id,
          order: actionOrder++,
          type: "evolve",
          summary: `Evolve ${tower.towerName} into ${entry.towerName} ${entry.toLevel}`,
          reason: `${tower.towerName} no longer moves a wave here, but the build's own queue calls for ${entry.towerName} next and this exact tower can become it — ${cost.toLocaleString()}g net of the gold already spent on it, cheaper than selling for an unmeasured refund and building fresh elsewhere.`,
          towerId: entry.towerId,
          towerName: entry.towerName,
          fromTowerId: tower.towerId,
          fromTowerName: tower.towerName,
          copyId: officialCopyId,
          fromLevel: tower.level,
          toLevel: entry.toLevel,
          cost,
          legal: true,
          affordable: true,
          targetWave: definition.start,
          cell: tower.cell ?? undefined,
          cellLabel: tower.cellLabel ?? undefined,
          campId: tower.campId ?? undefined,
          temporary: evolved.status === "temporary",
        });
        purchased.add(purchaseKey(entry));
        return true;
      }
      // Nothing on the build's own queue can still absorb it — the early
      // monos it lists were already built elsewhere. That does not mean
      // there is nothing to evolve into: any element this build's own
      // allocation already holds legally supports its mono, and a real
      // player facing "sell for nothing" or "spend a little more and keep
      // a working tower" takes the tower. Scored the same way the
      // emergency coverage repair already picks a mono — by how much it
      // moves the field's own weighted armour coverage — and capped by the
      // same fleet saturation every other rescue copy respects, so this
      // never opportunistically overbuilds.
      const coverage = coverageRows(field);
      const opportunistic = evolutionTargets(tower.towerId, tower.level)
        .filter((step) => isLegal(step.towerId, step.level, allocation))
        .flatMap((step) => {
          const existingCopies = field.filter(
            (t) => t.towerId === step.towerId,
          ).length;
          if (existingCopies >= fleetCopySaturationFor(step.towerId))
            return [];
          const facts = towerFacts(step.towerId, step.level);
          const element = facts.damageElement;
          if (!element || element === "Composite" || !facts.baseDps)
            return [];
          const cost = evolutionCost(
            { towerId: tower.towerId, level: tower.level },
            step,
          );
          if (cumulativeCost + cost > spendable) return [];
          const score = coverage.reduce(
            (sum, row) =>
              sum +
              ELEMENT_MATCHUPS[element][row.defender] *
                (row.status === "critical" || row.status === "weak" ? 2 : 1),
            0,
          );
          return [{ step, cost, score, existingCopies }];
        })
        .sort((a, b) => b.score - a.score || a.cost - b.cost)[0];
      if (!opportunistic) return false;
      const { step, cost, existingCopies } = opportunistic;
      const towerName = liveTowerName(step.towerId);
      const copyId = stableId(planId, "copy", step.towerId, existingCopies + 1);
      const evolved: PlannedTowerState = {
        copyId,
        towerId: step.towerId,
        towerName,
        level: step.level,
        quantity: 1,
        purpose: purposeFor(build, step.towerId),
        roles: ["coverage"],
        status: "permanent",
        effect: effectFor(step.towerId, step.level),
        globalBuff: getTowerPlacementFact(step.towerId).targetsTowers,
        directHitDebuff: getTowerPlacementFact(step.towerId).debuff !== null,
        cell: tower.cell,
        cellLabel: tower.cellLabel,
        campId: tower.campId,
      };
      field = [...field.filter((t) => t.copyId !== tower.copyId), evolved];
      cumulativeCost += cost;
      phaseCost += cost;
      actions.push({
        id: stableId(planId, definition.id, "evolve", tower.copyId, step.towerId),
        phaseId: definition.id,
        order: actionOrder++,
        type: "evolve",
        summary: `Evolve ${tower.towerName} into ${towerName} ${step.level}`,
        reason: `${tower.towerName} no longer moves a wave here, and nothing later in the build's own queue can still use it, but ${towerName} is legal on this allocation and helps this field's own armour coverage — ${cost.toLocaleString()}g net of the gold already spent on it, cheaper than selling for an unmeasured refund and building fresh elsewhere.`,
        towerId: step.towerId,
        towerName,
        fromTowerId: tower.towerId,
        fromTowerName: tower.towerName,
        copyId,
        fromLevel: tower.level,
        toLevel: step.level,
        cost,
        legal: true,
        affordable: true,
        targetWave: definition.start,
        cell: tower.cell ?? undefined,
        cellLabel: tower.cellLabel ?? undefined,
        campId: tower.campId ?? undefined,
        temporary: false,
      });
      return true;
    };

    // ---- Retirement. A temporary copy carried into this window is sold
    // when the window no longer needs its damage: outright if it no longer
    // moves any wave, otherwise only when its refund (with the others') lets
    // a build-path step that is waiting on gold be bought now. Needs the
    // verified sell rate; without it nothing is sold and the plan says so.
    const retireTemporaries = (): boolean => {
      // Without a verified sell rate no refund is credited, but a temporary
      // copy that no longer moves any wave (an un-upgraded Arrow left over
      // from the opening) is still retired: a real player does not keep it,
      // and carrying it forward only clutters the field and the cell map.
      const refundRate = sellRefund ?? 0;
      // A window with no scored wave (the open boss window today) cannot
      // tell a dead copy from a live one: everything looks negligible.
      if (!survival.waves.some((wave) => wave.margin != null)) return false;
      const baseline = verifiedShortfall(survival);
      const carried = new Set(startTowers.map((tower) => tower.copyId));
      const anchorUp = field.some(
        (tower) => tower.towerId === build.anchorTowerId,
      );
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
          // Losing more than one percent of a wave is not negligible; a
          // hair less is, and the rescue pass that follows a sale can put a
          // real step in its place.
          if (verifiedShortfall(result) > baseline + 0.01) return [];
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
          // An un-upgraded starter (Arrow / Cannon) is wave-one shell: once
          // the anchor is up a real player sells it whatever hair of damage
          // it still adds, rather than leaving it forgotten on the field.
          const starterPastItsTime = anchorUp && isBasicTowerId(tower.towerId);
          return [
            {
              tower,
              contribution: starterPastItsTime ? 0 : contribution,
              refund: Math.round(paid * refundRate),
            },
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
      // Selling a still-useful copy to fund a step is only honest when the
      // refund it would bring is a verified number.
      if (blocked && needed > 0 && sellRefund != null) {
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
      for (const candidate of toSell) {
        const { tower, refund, contribution } = candidate;
        // A negligible copy is tried as an evolution before it is sold — a
        // copy kept specifically to fund another step (below) never is,
        // since evolving spends net gold rather than freeing it.
        if (negligible.includes(candidate) && tryEvolve(tower)) continue;
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
              ? `${isBasicTowerId(tower.towerId) ? "An un-upgraded starter has no place once the anchor is up: it adds under 1% of any wave here." : "This temporary copy no longer moves any wave in this window (under 1% of a wave)."} Sell it at the start of the window${sellRefund == null ? "; no refund is credited because the sell rate is not in the data yet." : ` and recover ${refund.toLocaleString()}g.`}`
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
    // Retirement is a transaction: sell, let the rescue pass spend what the
    // sale frees, and keep the result only if the window's verified floor
    // did not drop. Each copy is negligible on its own; three starters sold
    // together can still cost a wave its last percent, and a window that
    // was clearing must never be traded down for a tidier field.
    {
      const beforeSales = snapshot();
      const floorBefore = verifiedShortfall(survival);
      const clearingBefore = survival.waves
        .filter((wave) => wave.margin != null && wave.margin >= 1)
        .map((wave) => wave.wave);
      const fieldBefore = field.length;
      if (retireTemporaries()) {
        const after = applySurvivalRescue(evaluate(field), "after-package");
        const lostAWave = after.waves.some(
          (wave) =>
            clearingBefore.includes(wave.wave) &&
            wave.margin != null &&
            wave.margin < 1,
        );
        // A sold shell may cost up to one percent of a wave each — that is
        // the definition of negligible — but never a wave that was clearing.
        const sold = Math.max(0, fieldBefore - field.length);
        if (
          verifiedShortfall(after) > floorBefore + 0.01 * sold + 0.0001 ||
          lostAWave
        )
          restore(beforeSales);
        else survival = after;
      }
    }

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
      ...played.map((action, index) => ({
        ...action,
        order: firstOrder + index,
      })),
    );

    const reported = evaluate(field, undefined, 0);
    const lookaheadLeak =
      definition.end != null
        ? survival.waves.find(
            (wave) =>
              wave.wave === definition.end! + 1 && wave.status === "fails",
          )
        : undefined;
    const coverage = coverageRows(field);
    const critical = coverage.filter(
      (row) => row.status === "critical" || row.status === "weak",
    );
    const risks = [
      ...(reported.status === "fails"
        ? [
            `Modeled survival failure on wave ${reported.worstWave ?? definition.start}; repair the field before following later upgrades.`,
          ]
        : reported.status === "borderline"
          ? [
              `Wave ${reported.worstWave ?? definition.start} has less than the 15% modeled safety margin.`,
            ]
          : []),
      ...(reported.status === "fails" && rescueExhausted
        ? [
            (() => {
              // The lever is the single step that would lift the leaking
              // wave most if gold allowed — judged against this window's
              // own waves, with its real landing wave at this income.
              const shortfall = verifiedShortfall(reported);
              leverMode = true;
              const best = [
                ...buildPathCandidates(reported),
                ...fleetCopyCandidates(reported),
                ...essenceCandidates(reported),
              ].sort((a, b) => a.shortfall - b.shortfall || a.cost - b.cost)[0];
              leverMode = false;
              const next = remainingQueue().find(
                (entry) =>
                  !entry.temporaryCarry ||
                  !field.some((t) => t.towerId === build.anchorTowerId),
              );
              const needs = next ? missingKeystones(next, allocation) : [];
              const lever = best
                ? (() => {
                    const lands = earliestAffordableWave(
                      cumulativeCost + best.cost,
                      definition.start,
                      (definition.end ?? definition.start) + 5,
                    );
                    const lift = Math.round((shortfall - best.shortfall) * 100);
                    return `${best.fromLevel ? "upgrading" : "adding"} ${best.tower.towerName} ${best.tower.level} (${best.cost.toLocaleString()}g, +${lift}% of a wave across this window; at this income it lands at wave ${lands})`;
                  })()
                : next
                  ? needs.length
                    ? `${next.towerName} ${next.toLevel} (needs the ${needs.join(" and ")} keystone${needs.length > 1 ? "s" : ""})`
                    : `${next.towerName} ${next.toLevel} (${actionCost(next.towerId, 0, next.toLevel).toLocaleString()}g)`
                  : essenceUsesRemaining <= 0
                    ? "nothing — both End Game essence uses are already on the field"
                    : definition.start <
                        ESSENCE_LEGAL_WAVE[
                          TRADITIONAL_END_GAME_ESSENCE_USES -
                            essenceUsesRemaining
                        ]
                      ? `the End Game essence layer, not legal before wave ${ESSENCE_LEGAL_WAVE[TRADITIONAL_END_GAME_ESSENCE_USES - essenceUsesRemaining]}`
                      : "the End Game essence layer, once this build's allocation reaches a legal Pure or Periodic pick";
              const leak = reported.worstWave ?? definition.start;
              return rescueExhausted === "gold"
                ? `Out of gold in time: every step that would lift wave ${leak} lands after it, because the window's remaining income arrives later. The next lever is ${lever}.`
                : `Nothing more can be bought that lifts this window: every fielded tower is at its copy cap or maximum level for the elements held. The next lever is ${lever}.`;
            })(),
          ]
        : []),
      ...(lookaheadLeak
        ? [
            `Wave ${lookaheadLeak.wave} (first of the next window) is at ${Math.round((lookaheadLeak.margin ?? 0) * 100)}% of its HP on this field; nothing bought after wave ${definition.end} can land before it.`,
          ]
        : []),
      ...(reported.status === "unverified"
        ? (() => {
            const boss = reported.waves.filter(
              (wave) => wave.element === "Boss",
            );
            const ability = reported.waves.filter(
              (wave) =>
                wave.status === "unverified" &&
                wave.ability &&
                wave.count != null &&
                wave.element !== "Boss",
            );
            const lines: string[] = [];
            if (boss.length) {
              const first = boss[0];
              const last = boss[boss.length - 1];
              const income = bountyThroughWave(
                definition.start,
                definition.end ?? definition.start,
              );
              const essenceOnField = field.filter((tower) =>
                isEndGameTowerId(tower.towerId),
              );
              const essenceNote = essenceOnField.length
                ? `This field carries ${essenceOnField.map((t) => t.towerName).join(" and ")} (End Game essence — the first use is legal from wave ${ESSENCE_LEGAL_WAVE[0]}, the second from wave ${ESSENCE_LEGAL_WAVE[1]}).`
                : essenceUsesRemaining <= 0
                  ? "Both End Game essence uses are already spent elsewhere on the field."
                  : "No End Game tower is legal yet for this build's allocation; the essence layer is the outlet once one is.";
              lines.push(
                `Boss waves ${first.wave}–${last.wave} carry ${Math.round(first.hpPerCreep).toLocaleString()}–${Math.round(last.hpPerCreep).toLocaleString()} HP per creep at ${first.count} creeps a wave (workbook, confirmed constant across the match); the ${first.ability ?? "Mixed"} ability composition is not quantified, so a clear here is a floor, not a guarantee. This window pays ${income.toLocaleString()}g. ${essenceNote}`,
              );
            }
            if (ability.length)
              lines.push(
                `${ability
                  .map((wave) => `W${wave.wave} ${wave.ability}`)
                  .join(
                    ", ",
                  )} clear base HP only; the ability is not quantified, so do not read this window as safe.`,
              );
            return lines;
          })()
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
      // A tower that throws creeps forward takes contact time away from
      // every other tower on the skipped stretch. The survival model still
      // credits the full route and the full train, so its numbers overstate
      // such a field until the loss is measured.
      ...displacementRisks(field),
      ...teslaTreeRisks(field),
      // Blacksmith and Well pay +10/30/90% by level, and level 3 needs both
      // recipe elements at 3. A build whose allocation stops them at 2 is
      // buying a +30% tower and calling it the +90% one.
      ...buffCapRisks(field, build.allocation),
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
    const protectedReserve = Math.min(windowReserve, bankAtLowerBound);
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
            ? "No sale value is assumed: the sell refund rate is not in the data. Temporary copies that no longer move any wave are still sold, at 0g credited."
            : `Sell refunds are credited at ${Math.round(sellRefund * 100)}% of the gold paid.`,
        ],
      },
      survival: reported,
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
        reported.status === "fails" || critical.length
          ? "low"
          : reported.status === "unverified" ||
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
      `${unbought.length} planned tower step(s) remain unbought after wave 70, the last wave the workbook describes.`,
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
                ...(action.fromTowerId && action.fromTowerName
                  ? {
                      fromTowerId: action.fromTowerId,
                      fromTowerName: action.fromTowerName,
                    }
                  : {}),
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
