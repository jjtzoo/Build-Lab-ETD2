import {
  ELEMENTS,
  type ElementAllocation,
  type ElementName,
} from "@/lib/domain/elements";
import type { Tower, TowerId } from "@/lib/domain/tower";
import { getTower } from "@/lib/domain/towerCatalog";
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
import type {
  PortableBuild,
  PortableProgressionStage,
  PortableStage,
  PortableTowerAction,
} from "@/lib/domain/portableBuild";

import {
  availableTowers,
  legalNextAllocations,
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

export type BuiltTower = {
  towerId: string;
  level: number;
  quantity: number;
};

const END_GAME_TOWER_IDS: ReadonlySet<string> = new Set(
  END_GAME_TOWER_FACT_CATALOG.facts.map((fact) => fact.towerId),
);

export function isEndGameTowerId(towerId: string): boolean {
  return END_GAME_TOWER_IDS.has(towerId);
}

// ---------------------------------------------------------------- gold

/**
 * Gold the player has committed, summed from what they logged.
 *
 * Catalog costs are *cumulative* minimum field cost — the value at a level
 * is the total to stand that tower up at that level — so a tower counts
 * once at its current level; upgrades are not summed on top.
 */
export function deriveGoldSpent(
  built: readonly BuiltTower[],
): number {
  return built.reduce((total, entry) => {
    if (entry.quantity <= 0) return total;
    if (isEndGameTowerId(entry.towerId)) {
      const fact = getEndGameTowerFact(
        entry.towerId as EndGameTowerId,
      );
      return total + fact.minimumFieldCost * entry.quantity;
    }
    const tower = getTower(entry.towerId);
    const level = Math.max(
      1,
      Math.min(tower.maxLevel, Math.round(entry.level)),
    );
    return (
      total +
      resolveNormalTowerCost(entry.towerId, level).minimumFieldCost *
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
  const fielded = built.filter((entry) => entry.quantity > 0);

  return feasibility.map((entry) => {
    const builtTowerNames = fielded
      .filter(
        (placed) =>
          !isEndGameTowerId(placed.towerId) &&
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
  unlocked: boolean;
  /** Plain-language requirement when still locked. */
  requirement: string;
  /** The imported plan's End Game picks, when one is loaded. */
  planSelections: readonly { name: string; quantity: number }[];
};

export function endGameReadiness(
  allocation: ElementAllocation,
  plan: PortableBuild | null,
): EndGameReadiness {
  const access = evaluateEndGameAccess(allocation);
  const unlocked = access.candidates.length > 0;

  return {
    access,
    unlocked,
    requirement: unlocked
      ? ""
      : "Take an element to III for a Pure tower, or all six to I for Periodic.",
    planSelections: plan?.endGame ?? [],
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
  nextAction: PortableTowerAction | null;
  nextActionDone: boolean;
  roadmap: readonly RoadmapEntry[];
  keystonesPlanned: number;
  keystonesDone: number;
};

function actionSatisfied(
  action: PortableTowerAction | null,
  built: readonly BuiltTower[],
): boolean {
  if (!action) return false;
  return built.some(
    (entry) =>
      entry.towerId === action.towerId &&
      entry.quantity > 0 &&
      entry.level >= action.toLevel,
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

  // Walk forward to the first stage action the player has not done yet.
  const stageIndex = progression.indexOf(stage);
  let nextAction: PortableTowerAction | null = null;
  for (let i = stageIndex; i < progression.length; i += 1) {
    const candidate = progression[i].primaryAction;
    if (candidate && !actionSatisfied(candidate, built)) {
      nextAction = candidate;
      break;
    }
  }

  return {
    stage: stage.stage,
    headline: stage.headline,
    reason: stage.reason,
    nextAction,
    nextActionDone: actionSatisfied(stage.primaryAction, built),
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
