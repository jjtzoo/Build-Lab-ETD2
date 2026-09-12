import {
  ELEMENTS,
  type ElementAllocation,
  type ElementName,
} from "@/lib/domain/elements";
import type { Tower, TowerId } from "@/lib/domain/tower";
import { getTower } from "@/lib/domain/towerCatalog";
import { ELEMENT_MATCHUPS } from "@/lib/domain/elementMatchupCatalog";
import { getTowerProfile } from "@/lib/domain/towerProfileCatalog";
import {
  CORE_ROLE_LABEL,
  CORE_ROLE_PRIORITY,
  SUPPORT_ROLE_LABEL,
  type CoreRole,
} from "@/lib/domain/roles";
import { resolveNormalTowerCost } from "@/lib/domain/towerEconomics";
import {
  getEndGameTowerFact,
  END_GAME_TOWER_FACT_CATALOG,
} from "@/lib/domain/endGameTowerFacts";
import type { EndGameTowerId } from "@/lib/domain/endGameTower";
import {
  BASIC_TOWERS,
  MONO_TOWERS,
  MONO_MAX_LEVEL,
  getBasicTower,
  getMonoTower,
  isBasicTowerId,
  isMonoTowerId,
  monoTowerCost,
} from "@/lib/domain/auxiliaryTowers";
import type {
  BasicTowerId,
  MonoTowerId,
} from "@/lib/domain/auxiliaryTowers";
import type {
  PortableBuild,
  PortableProgressionStage,
  PortableStage,
  PortableTowerAction,
} from "@/lib/domain/portableBuild";

import {
  availableTowers,
  isTowerAvailable,
  legalNextAllocations,
  maxReachableTowerLevel,
  totalKeystones,
  MAX_KEYSTONES,
} from "@/lib/engine/allocation";
import {
  evaluateKeystoneTransition,
  type KeystoneTransitionEvaluation,
} from "@/lib/engine/keystoneTransitions";
import { getCoreRoleFeasibility } from "@/lib/engine/coreRoleDetection";
import {
  evaluateEndGameAccess,
  type EndGameAccessResult,
} from "@/lib/engine/endGameAccess";

/**
 * Live Game Tracking glue.
 *
 * The player manually mirrors a real Element TD 2 game: every element
 * keystone they spend, and every tower they actually fielded. Nothing here
 * decides anything new — it composes the existing reachability, role, cost
 * and end-game primitives into the shapes the tracker UI renders.
 */

/**
 * One row of the field log. Rows are identified by tower **and level**: a
 * player really does hold, say, two Light I alongside one Light II, and
 * keying on the tower alone made that unrepresentable.
 */
export type BuiltTower = {
  towerId: string;
  level: number;
  quantity: number;
};

/** Stable identity for a field row — also the React key. */
export function builtRowKey(
  towerId: string,
  level: number,
): string {
  return `${towerId}@${level}`;
}

export function isSameBuiltRow(
  entry: BuiltTower,
  towerId: string,
  level: number,
): boolean {
  return entry.towerId === towerId && entry.level === level;
}

const END_GAME_TOWER_IDS: ReadonlySet<string> = new Set(
  END_GAME_TOWER_FACT_CATALOG.facts.map((fact) => fact.towerId),
);

export function isEndGameTowerId(towerId: string): boolean {
  return END_GAME_TOWER_IDS.has(towerId);
}

/** True for a tower the recommendation catalog (`towers.v2.json`) does not carry. */
export function isAuxiliaryTowerId(towerId: string): boolean {
  return (
    isEndGameTowerId(towerId) ||
    isBasicTowerId(towerId) ||
    isMonoTowerId(towerId)
  );
}

// ---------------------------------------------------------------- gold

/**
 * Cumulative gold to field one copy of any loggable tower at `level` —
 * end-game, basic (Arrow/Cannon), mono, or a normal Dual/Trio/Quad.
 * Costs are cumulative per level, so a tower counts once at its level;
 * upgrades are not summed on top.
 */
export function resolveLiveTowerCost(
  towerId: string,
  level: number,
): number {
  if (isEndGameTowerId(towerId)) {
    return getEndGameTowerFact(towerId as EndGameTowerId)
      .minimumFieldCost;
  }
  if (isBasicTowerId(towerId)) {
    return getBasicTower(towerId).cost;
  }
  if (isMonoTowerId(towerId)) {
    return monoTowerCost(level);
  }
  const tower = getTower(towerId);
  const clamped = Math.max(
    1,
    Math.min(tower.maxLevel, Math.round(level)),
  );
  return resolveNormalTowerCost(towerId, clamped).minimumFieldCost;
}

/** Display name for any loggable tower id — normal, basic, mono or end-game. */
export function liveTowerName(towerId: string): string {
  if (isEndGameTowerId(towerId)) {
    return getEndGameTowerFact(towerId as EndGameTowerId).name;
  }
  if (isBasicTowerId(towerId)) {
    return getBasicTower(towerId as BasicTowerId).name;
  }
  if (isMonoTowerId(towerId)) {
    return getMonoTower(towerId as MonoTowerId).name;
  }
  return getTower(towerId).name;
}

/** Highest level a loggable tower can reach at all (ignores allocation). */
export function liveTowerMaxLevel(towerId: string): number {
  if (isMonoTowerId(towerId)) return MONO_MAX_LEVEL;
  if (isEndGameTowerId(towerId) || isBasicTowerId(towerId)) return 1;
  return getTower(towerId).maxLevel;
}

/** Highest level a loggable tower can reach *at this allocation*. */
export function liveTowerReachableLevel(
  towerId: string,
  allocation: ElementAllocation,
): number {
  if (isBasicTowerId(towerId)) return 1;
  if (isMonoTowerId(towerId)) {
    return Math.min(
      MONO_MAX_LEVEL,
      allocation[getMonoTower(towerId).element] ?? 0,
    );
  }
  if (isEndGameTowerId(towerId)) return 1;
  try {
    return maxReachableTowerLevel(getTower(towerId), allocation);
  } catch {
    return 0;
  }
}

const ROMAN_LABEL = ["", "I", "II", "III"] as const;

/**
 * True when this tower could legitimately be on the field at the current
 * allocation. Arrow/Cannon are always loggable; a mono tower needs its
 * element at ≥ I; an end-game tower needs its Pure/Periodic access; a
 * normal Dual/Trio/Quad needs its recipe satisfied. The field log and the
 * plan's next-move card both gate on this so a player is never allowed to
 * log — or told to build — a tower they cannot reach.
 */
export function isTowerLoggable(
  towerId: string,
  allocation: ElementAllocation,
): boolean {
  if (isBasicTowerId(towerId)) return true;
  if (isMonoTowerId(towerId)) {
    return (allocation[getMonoTower(towerId).element] ?? 0) >= 1;
  }
  if (isEndGameTowerId(towerId)) {
    return evaluateEndGameAccess(allocation).candidates.some(
      (candidate) => candidate.towerId === towerId,
    );
  }
  try {
    return isTowerAvailable(getTower(towerId), allocation);
  } catch {
    return false;
  }
}

/** Keystones still missing before `towerId` reaches `level`, e.g. ["Darkness II"]. */
export function towerReachGap(
  towerId: string,
  allocation: ElementAllocation,
  level = 1,
): readonly string[] {
  let recipe: readonly ElementName[];
  try {
    recipe = getTower(towerId).recipe;
  } catch {
    return [];
  }
  return recipe
    .filter((element) => (allocation[element] ?? 0) < level)
    .map((element) => `${element} ${ROMAN_LABEL[level] ?? level}`);
}

/**
 * Field rows that no longer fit the allocation — normal towers logged at a
 * level (or at all) the current picks can't support, e.g. after undoing a
 * keystone. The tracker flags these rather than silently keeping a lie.
 */
export function staleFieldRows(
  allocation: ElementAllocation,
  built: readonly BuiltTower[],
): readonly BuiltTower[] {
  return built.filter((entry) => {
    if (entry.quantity <= 0) return false;
    if (isAuxiliaryTowerId(entry.towerId)) {
      return (
        isMonoTowerId(entry.towerId) &&
        (allocation[getMonoTower(entry.towerId).element] ?? 0) <
          entry.level
      );
    }
    try {
      return (
        maxReachableTowerLevel(getTower(entry.towerId), allocation) <
        entry.level
      );
    } catch {
      return false;
    }
  });
}

/** Gold the player has committed, summed from what they logged. */
export function deriveGoldSpent(
  built: readonly BuiltTower[],
): number {
  return built.reduce((total, entry) => {
    if (entry.quantity <= 0) return total;
    return (
      total +
      resolveLiveTowerCost(entry.towerId, entry.level) *
        entry.quantity
    );
  }, 0);
}

// ----------------------------------------------------------- buildable

export type BuildableGroup = {
  role: CoreRole | "support";
  label: string;
  towers: readonly { tower: Tower; maxLevel: number }[];
};

const ROLE_ORDER: readonly (CoreRole | "support")[] = [
  ...CORE_ROLE_PRIORITY,
  "support",
];

function primaryRole(towerId: TowerId): CoreRole | "support" {
  return getTowerProfile(towerId).coreRoles[0] ?? "support";
}

function roleLabel(role: CoreRole | "support"): string {
  return role === "support"
    ? SUPPORT_ROLE_LABEL
    : CORE_ROLE_LABEL[role];
}

/** Every tower the current allocation can field, grouped by core role. */
export function buildableByRole(
  allocation: ElementAllocation,
): readonly BuildableGroup[] {
  const available = availableTowers(allocation);

  return ROLE_ORDER.flatMap((role) => {
    const towers = available
      .filter((entry) => primaryRole(entry.tower.id) === role)
      .sort((a, b) => a.tower.name.localeCompare(b.tower.name));
    if (towers.length === 0) return [];
    return [{ role, label: roleLabel(role), towers }];
  });
}

// --------------------------------------------------- basic / mono towers

export type BasicBuildable = {
  id: string;
  name: string;
  /** Highest level currently fieldable. Arrow/Cannon are flat at 1. */
  maxLevel: number;
  /** The element a mono tower belongs to; null for Arrow / Cannon. */
  element: ElementName | null;
};

/**
 * The starter towers and mono towers a player can log. Arrow and Cannon
 * are always available; a mono tower opens at Level N once its element is
 * held at allocation level N (1–3).
 */
export function basicBuildables(
  allocation: ElementAllocation,
): readonly BasicBuildable[] {
  const out: BasicBuildable[] = BASIC_TOWERS.map((tower) => ({
    id: tower.id,
    name: tower.name,
    maxLevel: 1,
    element: null,
  }));

  for (const mono of MONO_TOWERS) {
    const level = Math.min(
      MONO_MAX_LEVEL,
      allocation[mono.element] ?? 0,
    );
    if (level >= 1) {
      out.push({
        id: mono.id,
        name: mono.name,
        maxLevel: level,
        element: mono.element,
      });
    }
  }

  return out;
}

// ---------------------------------------------------- loggable towers

export type LoggableTower = {
  id: string;
  name: string;
  /** Highest level fieldable at the current allocation. */
  maxLevel: number;
  group: "basic" | "element" | "end-game";
  role: CoreRole | "support" | null;
  element: ElementName | null;
};

/**
 * One flat, searchable list of everything the player could log right now —
 * the buildable element towers, Arrow/Cannon + in-reach mono towers, and
 * any Pure/Periodic already unlocked. Powers the Field view's "log a
 * tower" search, so logging off the summon moment costs one search + tap.
 */
export function loggableTowers(
  allocation: ElementAllocation,
): readonly LoggableTower[] {
  const out: LoggableTower[] = [];

  for (const basic of basicBuildables(allocation)) {
    out.push({
      id: basic.id,
      name: basic.name,
      maxLevel: basic.maxLevel,
      group: "basic",
      role: null,
      element: basic.element,
    });
  }

  for (const group of buildableByRole(allocation)) {
    for (const { tower, maxLevel } of group.towers) {
      out.push({
        id: tower.id,
        name: tower.name,
        maxLevel,
        group: "element",
        role: group.role,
        element: tower.damageElement,
      });
    }
  }

  const endGame = evaluateEndGameAccess(allocation);
  for (const candidate of endGame.candidates) {
    out.push({
      id: candidate.towerId,
      name: getEndGameTowerFact(candidate.towerId as EndGameTowerId).name,
      maxLevel: 1,
      group: "end-game",
      role: null,
      element:
        candidate.element === "Composite" ? null : candidate.element,
    });
  }

  return out;
}

// --------------------------------------------------------- game phases

/** Element picks are offered roughly one per 5-wave phase, to wave 55. */
export const LIVE_PHASE_COUNT = 11;

/**
 * The wave bracket the player is in, inferred rather than hand-stepped.
 *
 * Element TD 2 offers a pick roughly once per 5-wave phase. Normally
 * `phase === picks spent`. But holding a summon (declining the offered
 * pick because your field can't yet kill that creep) is common play, so
 * the two legitimately diverge: `phase = picks + holds`. There is no
 * upper cap — after the 11th pick the game runs on to the boss.
 */
export function derivedPhase(
  allocation: ElementAllocation,
  holds: number,
): number {
  return totalKeystones(allocation) + Math.max(0, holds);
}

/** True once every keystone is spent — the tracker's End Game view. */
export function isEndGame(allocation: ElementAllocation): boolean {
  return totalKeystones(allocation) >= MAX_KEYSTONES;
}

export function livePhaseLabel(phase: number): string {
  const p = Math.max(1, phase);
  if (p > LIVE_PHASE_COUNT) return "Waves 56+ · Boss";
  const lo = (p - 1) * 5 + 1;
  const hi = p * 5;
  return p === LIVE_PHASE_COUNT
    ? `Waves ${lo}–${hi} · Essence`
    : `Waves ${lo}–${hi}`;
}

/** Pure Essence uses the player holds by this phase (auto, 0 → 2 at the last). */
export function essenceForPhase(phase: number): number {
  return phase >= LIVE_PHASE_COUNT ? 2 : 0;
}

// ---------------------------------------------------- coverage gaps

export type CoverageGaps = {
  /**
   * Armour types most of your fielded damage is resisted by — a
   * quantity-weighted average multiplier below ~0.85. A single minor
   * off-element tower does not paper over a hole here.
   */
  weakAgainst: readonly ElementName[];
  /** Armour types nothing on the field hits for ≥ 2×. */
  unanswered: readonly ElementName[];
};

/** The damage element a logged tower actually deals, or null if it has none. */
function damageElementOf(towerId: string): ElementName | null {
  if (isMonoTowerId(towerId)) return getMonoTower(towerId).element;
  if (isEndGameTowerId(towerId)) {
    const fact = getEndGameTowerFact(towerId as EndGameTowerId);
    return fact.element === "Composite" ? null : fact.element;
  }
  if (isBasicTowerId(towerId)) return null; // Arrow / Cannon are Composite
  try {
    return getTower(towerId).damageElement;
  } catch {
    return null;
  }
}

/**
 * Which armour types the player's fielded damage can't handle — the
 * Nature-into-Fire-armour hole that costs games. Computed from the
 * `damageElement` of everything on the field against `ELEMENT_MATCHUPS`.
 */
export function coverageGaps(
  built: readonly BuiltTower[],
): CoverageGaps {
  const weightByElement = new Map<ElementName, number>();
  for (const entry of built) {
    if (entry.quantity <= 0) continue;
    const element = damageElementOf(entry.towerId);
    if (!element) continue;
    weightByElement.set(
      element,
      (weightByElement.get(element) ?? 0) + entry.quantity,
    );
  }
  const totalWeight = [...weightByElement.values()].reduce(
    (sum, weight) => sum + weight,
    0,
  );
  if (totalWeight === 0) {
    return { weakAgainst: [], unanswered: [] };
  }

  const weakAgainst: ElementName[] = [];
  const unanswered: ElementName[] = [];
  for (const defender of ELEMENTS) {
    let weighted = 0;
    let best = 0;
    for (const [attacker, weight] of weightByElement) {
      const mult = ELEMENT_MATCHUPS[attacker][defender];
      weighted += mult * weight;
      best = Math.max(best, mult);
    }
    weighted /= totalWeight;
    if (weighted < 0.85) weakAgainst.push(defender);
    if (best < 2) unanswered.push(defender);
  }
  return { weakAgainst, unanswered };
}

// ------------------------------------------------------------ reveal

/** What one keystone just changed. Drives the unlock toast. */
export function pickReveal(
  before: ElementAllocation,
  after: ElementAllocation,
): KeystoneTransitionEvaluation {
  return evaluateKeystoneTransition(before, after);
}

// --------------------------------------------------------- next picks

export type NextPickOption = {
  element: ElementName;
  from: number;
  to: number;
  newlyUnlocked: readonly string[];
  deepened: readonly string[];
  coreRolesOpened: readonly CoreRole[];
  /** Derived rank: core roles opened dominate, then breadth of access. */
  score: number;
};

/**
 * The keystones the player could legally spend next, each annotated with
 * what it would open. Ranked by whether it makes a still-missing core role
 * reachable first, then by how much tower access it adds.
 */
export function nextPickOptions(
  allocation: ElementAllocation,
): readonly NextPickOption[] {
  const beforeRoles = getCoreRoleFeasibility(allocation);
  const beforeAvailable = new Set(
    beforeRoles
      .filter((entry) => entry.available)
      .map((entry) => entry.role),
  );

  return legalNextAllocations(allocation)
    .map((after) => {
      const transition = evaluateKeystoneTransition(allocation, after);
      const coreRolesOpened = getCoreRoleFeasibility(after)
        .filter(
          (entry) =>
            entry.available && !beforeAvailable.has(entry.role),
        )
        .map((entry) => entry.role);

      return {
        element: transition.element,
        from: transition.fromElementLevel,
        to: transition.toElementLevel,
        newlyUnlocked: transition.towerAccessChanges
          .filter((change) => change.change === "newly-unlocked")
          .map((change) => change.towerName),
        deepened: transition.towerAccessChanges
          .filter((change) => change.change === "deepened")
          .map((change) => change.towerName),
        coreRolesOpened,
        score:
          coreRolesOpened.length * 100 +
          transition.newlyUnlockedTowerIds.length * 10 +
          transition.deepenedTowerIds.length,
      } satisfies NextPickOption;
    })
    .sort(
      (a, b) => b.score - a.score || a.element.localeCompare(b.element),
    );
}

/**
 * The single keystone to take next: the highest-ranked legal option,
 * unless the loaded plan still needs one of them, in which case the plan
 * wins. Shared so the summon card and the status bar's pips can never
 * disagree about which element is being recommended.
 */
export function recommendedPick(
  allocation: ElementAllocation,
  plan: PortableBuild | null,
): NextPickOption | null {
  const options = nextPickOptions(allocation);
  if (options.length === 0) return null;

  if (plan) {
    const stillNeeded = new Set(
      planKeystoneProgress(plan, allocation).stillNeeded,
    );
    if (stillNeeded.size > 0) {
      const onPlan = options.find((option) =>
        stillNeeded.has(option.element),
      );
      if (onPlan) return onPlan;
    }
  }

  return options[0];
}

// --------------------------------------------------------- core roles

export type CoreRoleLiveStatus = {
  role: CoreRole;
  label: string;
  status: "built" | "buildable" | "unreachable";
  /** Towers already on the field satisfying this role. */
  builtTowerNames: readonly string[];
  /** Towers that could satisfy it at the current allocation. */
  candidateNames: readonly string[];
};

/** Per core role: already fielded, merely buildable, or out of reach. */
export function coreRoleStatus(
  allocation: ElementAllocation,
  built: readonly BuiltTower[],
): readonly CoreRoleLiveStatus[] {
  const feasibility = getCoreRoleFeasibility(allocation);
  // A row stranded by an undone keystone no longer counts as "built" — it's
  // flagged out-of-reach in the field view instead of silently satisfying a
  // role it can no longer back up.
  const staleKeys = new Set(
    staleFieldRows(allocation, built).map((entry) =>
      builtRowKey(entry.towerId, entry.level),
    ),
  );
  const fielded = built.filter(
    (entry) =>
      entry.quantity > 0 &&
      !staleKeys.has(builtRowKey(entry.towerId, entry.level)),
  );

  return feasibility.map((entry) => {
    const builtTowerNames = fielded
      .filter(
        (placed) =>
          !isAuxiliaryTowerId(placed.towerId) &&
          getTowerProfile(placed.towerId).coreRoles.includes(
            entry.role,
          ),
      )
      .map((placed) => getTower(placed.towerId).name);

    const status: CoreRoleLiveStatus["status"] =
      builtTowerNames.length > 0
        ? "built"
        : entry.available
          ? "buildable"
          : "unreachable";

    return {
      role: entry.role,
      label: CORE_ROLE_LABEL[entry.role],
      status,
      builtTowerNames,
      candidateNames: entry.candidates
        .map((candidate) => candidate.towerName)
        .sort((a, b) => a.localeCompare(b)),
    };
  });
}

// ----------------------------------------------------------- end game

export type EndGameReadiness = {
  access: EndGameAccessResult;
  /** Allocation opens at least one Pure/Periodic option. */
  unlocked: boolean;
  /** Plain-language requirement when still locked. */
  requirement: string;
  /** Pure Essence uses granted by the current phase (0 or 2). */
  essenceAvailable: number;
  /** Essence already committed — one per end-game tower copy logged. */
  essenceSpent: number;
  /** The imported plan's End Game picks, when one is loaded. */
  planSelections: readonly { name: string; quantity: number }[];
};

export function endGameReadiness(
  allocation: ElementAllocation,
  plan: PortableBuild | null,
  phase: number,
  built: readonly BuiltTower[] = [],
): EndGameReadiness {
  const access = evaluateEndGameAccess(allocation);
  const unlocked = access.candidates.length > 0;
  const essenceSpent = built
    .filter((entry) => isEndGameTowerId(entry.towerId))
    .reduce((total, entry) => total + Math.max(0, entry.quantity), 0);

  return {
    access,
    unlocked,
    requirement: unlocked
      ? ""
      : "Take an element to III for a Pure tower, or all six to I for Periodic.",
    essenceAvailable: essenceForPhase(phase),
    essenceSpent,
    planSelections: plan?.endGame ?? [],
  };
}

// ------------------------------------------- plan without a roadmap

export type PlanTarget = {
  towerId: TowerId;
  name: string;
  level: number;
  status: "built" | "buildable" | "out-of-reach";
  /** Keystones still missing, e.g. ["Light III", "Nature III"]. */
  missing: readonly string[];
};

const ROMAN = ["", "I", "II", "III"] as const;

/**
 * Every tower an imported build is aiming for, against what is on the
 * field now. A Theory Craft build carries its towers and target
 * allocation but no staged roadmap, so this is what the tracker coaches
 * from: the target list itself, plus what each one is still waiting on.
 */
export function planTargets(
  plan: PortableBuild | null,
  allocation: ElementAllocation,
  built: readonly BuiltTower[],
): readonly PlanTarget[] {
  if (!plan) return [];
  const staleKeys = new Set(
    staleFieldRows(allocation, built).map((entry) =>
      builtRowKey(entry.towerId, entry.level),
    ),
  );
  const fielded = built.filter(
    (entry) =>
      entry.quantity > 0 &&
      !staleKeys.has(builtRowKey(entry.towerId, entry.level)),
  );

  return plan.towers.map((entry) => {
    const tower = getTower(entry.towerId);
    const missing = tower.recipe
      .filter(
        (element) => (allocation[element] ?? 0) < entry.level,
      )
      .map(
        (element) =>
          `${element} ${ROMAN[entry.level] ?? entry.level}`,
      );
    const onField = fielded.some(
      (placed) =>
        placed.towerId === entry.towerId &&
        placed.level >= entry.level,
    );

    return {
      towerId: entry.towerId,
      name: tower.name,
      level: entry.level,
      status: onField
        ? "built"
        : missing.length === 0
          ? "buildable"
          : "out-of-reach",
      missing,
    };
  });
}

export type PlanKeystoneRow = {
  element: ElementName;
  held: number;
  planned: number;
};

export type PlanKeystoneProgress = {
  rows: readonly PlanKeystoneRow[];
  heldTotal: number;
  plannedTotal: number;
  /** Elements the plan still wants more of, deepest shortfall first. */
  stillNeeded: readonly ElementName[];
};

/**
 * The plan's target allocation measured against the picks actually spent.
 * Order-independent: the game hands out keystones in its own sequence, so
 * only the depth held per element matters.
 */
export function planKeystoneProgress(
  plan: PortableBuild | null,
  allocation: ElementAllocation,
): PlanKeystoneProgress {
  const rows = ELEMENTS.map((element) => ({
    element,
    held: allocation[element] ?? 0,
    planned: plan?.allocation?.[element] ?? 0,
  }));

  return {
    rows,
    heldTotal: rows.reduce((sum, row) => sum + row.held, 0),
    plannedTotal: rows.reduce(
      (sum, row) => sum + row.planned,
      0,
    ),
    stillNeeded: rows
      .filter((row) => row.held < row.planned)
      .sort(
        (a, b) =>
          b.planned - b.held - (a.planned - a.held),
      )
      .map((row) => row.element),
  };
}

// -------------------------------------------------------- plan mode

export type RoadmapEntry = {
  stage: PortableStage;
  element: ElementName;
  from: number;
  to: number;
  unlocks: readonly string[];
  done: boolean;
};

export type PlanProgress = {
  stage: PortableStage;
  headline: string;
  reason: string;
  /** The next planned build the player can actually make right now. */
  nextAction: PortableTowerAction | null;
  nextActionDone: boolean;
  /**
   * The next planned build that is still out of reach — shown as a
   * non-tappable "needs X" hint so the plan never invites an illegal log.
   */
  blockedAction:
    | { action: PortableTowerAction; missing: readonly string[] }
    | null;
  roadmap: readonly RoadmapEntry[];
  keystonesPlanned: number;
  keystonesDone: number;
};

function actionSatisfied(
  action: PortableTowerAction | null,
  allocation: ElementAllocation,
  built: readonly BuiltTower[],
): boolean {
  if (!action) return false;
  return built.some(
    (entry) =>
      entry.towerId === action.towerId &&
      entry.quantity > 0 &&
      entry.level >= action.toLevel &&
      // Not a row an undone keystone has since stranded.
      liveTowerReachableLevel(entry.towerId, allocation) >= entry.level,
  );
}

/**
 * Where the player is against an imported engine plan.
 *
 * A roadmap step counts as done when the allocation actually holds that
 * element that deep — order-independent, so a player who takes their picks
 * in a different sequence still reads as on-plan.
 */
export function planProgress(
  progression: readonly PortableProgressionStage[],
  allocation: ElementAllocation,
  built: readonly BuiltTower[],
): PlanProgress | null {
  if (progression.length === 0) return null;

  const roadmap: RoadmapEntry[] = [];
  for (const stage of progression) {
    for (const step of stage.keystoneSteps) {
      roadmap.push({
        stage: stage.stage,
        element: step.element,
        from: step.from,
        to: step.to,
        unlocks: step.unlocks.map((action) => action.towerName),
        done: (allocation[step.element] ?? 0) >= step.to,
      });
    }
  }

  const firstPending = roadmap.find((entry) => !entry.done);
  const stageId: PortableStage =
    firstPending?.stage ??
    progression[progression.length - 1]?.stage ??
    "END_GAME";
  const stage =
    progression.find((entry) => entry.stage === stageId) ??
    progression[progression.length - 1];

  // Walk forward to the first unbuilt stage action. Offer it only when the
  // player can actually reach that tower now; otherwise surface it as a
  // "needs X" hint so tapping can never log an illegal tower.
  const stageIndex = progression.indexOf(stage);
  let nextAction: PortableTowerAction | null = null;
  let blockedAction: PlanProgress["blockedAction"] = null;
  for (let i = stageIndex; i < progression.length; i += 1) {
    const candidate = progression[i].primaryAction;
    if (!candidate || actionSatisfied(candidate, allocation, built))
      continue;
    const reachTo = isEndGameTowerId(candidate.towerId)
      ? isTowerLoggable(candidate.towerId, allocation)
        ? 1
        : 0
      : liveTowerReachableLevel(candidate.towerId, allocation);
    if (reachTo >= candidate.toLevel) {
      nextAction = candidate;
      break;
    }
    if (!blockedAction) {
      blockedAction = {
        action: candidate,
        missing: towerReachGap(
          candidate.towerId,
          allocation,
          candidate.toLevel,
        ),
      };
    }
  }

  return {
    stage: stage.stage,
    headline: stage.headline,
    reason: stage.reason,
    nextAction,
    nextActionDone: actionSatisfied(
      stage.primaryAction,
      allocation,
      built,
    ),
    blockedAction,
    roadmap,
    keystonesPlanned: roadmap.length,
    keystonesDone: roadmap.filter((entry) => entry.done).length,
  };
}

// ------------------------------------------------------------ helpers

export function emptyLiveAllocation(): ElementAllocation {
  return {
    Light: 0,
    Darkness: 0,
    Water: 0,
    Fire: 0,
    Nature: 0,
    Earth: 0,
  };
}

export { ELEMENTS, MAX_KEYSTONES, totalKeystones };
