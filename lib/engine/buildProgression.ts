import {
  ELEMENTS,
  type ElementAllocation,
  type ElementName,
} from "@/lib/domain/elements";

import { resolveNormalTowerCost } from "@/lib/domain/towerEconomics";

import { getTower, TOWERS } from "@/lib/domain/towerCatalog";

import { getTowerProfile } from "@/lib/domain/towerProfileCatalog";

import {
  getMonoTowerForElement,
  monoTowerCost,
} from "@/lib/domain/auxiliaryTowers";

import type { EndGameTowerSelection } from "@/lib/domain/endGameTower";

import type { TowerId } from "@/lib/domain/tower";

import { maxReachableTowerLevel } from "@/lib/engine/allocation";

import type { CombinedBuildPlan } from "@/lib/engine/combinedBuildPlan";

export type ProgressionStage = "EARLY" | "MID" | "LATE" | "END_GAME";

export type TowerProgressionAction = {
  towerId: TowerId;
  action: "build" | "upgrade";
  fromLevel: number;
  toLevel: number;
  marginalMinimumCapital: number;
  reason: string;
  /** A short-lived early carry; it is intentionally outside the final package. */
  temporaryCarry?: boolean;
};

export type AllocationProgressionStep = {
  stage: Exclude<ProgressionStage, "END_GAME">;
  allocationBefore: ElementAllocation;
  nextElementAllocation: ElementName;
  allocationAfter: ElementAllocation;
  newlyLegalOrReachableSelectedTowers: readonly TowerProgressionAction[];
  primaryAction: TowerProgressionAction | null;
  secondaryActions: readonly TowerProgressionAction[];
  strategicReason: string;
  milestoneStatus: {
    anchorOperational: boolean;
    anchorDeveloped: boolean;
    coreDeveloped: boolean;
    finalAllocationReached: boolean;
  };
};

export type StagePriority = {
  stage: ProgressionStage;
  primaryAction:
    | TowerProgressionAction
    | {
        action: "execute-endgame-package";
        selections: readonly EndGameTowerSelection[];
      }
    | null;
  secondaryActions: readonly TowerProgressionAction[];
  reason: string;
  allocationPrerequisite: ElementAllocation;
  resultingAllocation: ElementAllocation;
};

export type BuildProgression = {
  steps: readonly AllocationProgressionStep[];
  stagePriorities: readonly StagePriority[];
  endGame: {
    stage: "END_GAME";
    allocation: ElementAllocation;
    selections: readonly EndGameTowerSelection[];
    minimumCapital: number | null;
  };
};

const EMPTY_ALLOCATION: ElementAllocation = {
  Light: 0,
  Darkness: 0,
  Water: 0,
  Fire: 0,
  Nature: 0,
  Earth: 0,
};

function cloneAllocation(allocation: ElementAllocation): ElementAllocation {
  return { ...allocation };
}

/**
 * The level at which a tower is doing its job, short of its last
 * upgrade. Reaching max costs disproportionately more than it does to
 * get here — a Trio's 1->2 is +3,500 gold and needs a third element at
 * depth 2, a Dual's 2->3 needs both elements at depth 3 — so bringing
 * every role online comes before pushing any one of them to max.
 */
function operationalLevel(towerId: TowerId): number {
  return getTower(towerId).combination === "Dual" ? 2 : 1;
}

function towerLevels(
  towerIds: readonly TowerId[],
  allocation: ElementAllocation,
): ReadonlyMap<TowerId, number> {
  return new Map(
    towerIds.map(
      (towerId) =>
        [
          towerId,
          maxReachableTowerLevel(getTower(towerId), allocation),
        ] as const,
    ),
  );
}

function roleNamesForTower(
  plan: CombinedBuildPlan,
  towerId: TowerId,
): readonly string[] {
  if (towerId === plan.anchorTowerId) {
    return ["main-dps"];
  }

  return plan.normalPlan.baseline.package.roles
    .filter((role) =>
      role.candidates.some((candidate) => candidate.towerId === towerId),
    )
    .map((role) => role.role);
}

/** Role order within a band: main DPS, then slow, amp, buff, then the rest. */
function roleRank(plan: CombinedBuildPlan, towerId: TowerId): number {
  if (towerId === plan.anchorTowerId) return 5;

  const roles = roleNamesForTower(plan, towerId);

  if (roles.includes("slow")) return 4;
  if (roles.includes("damage-amp")) return 3;
  if (roles.includes("buff")) return 2;
  return 1;
}

/**
 * Orders one keystone step's builds and upgrades.
 *
 * Two bands, each keeping the same role order. Everything reaches its
 * operational level first; only then does anything push to max. Ordering
 * on role alone let a support tower run all the way to max before the
 * anchor's own upgrade — on a Trio anchor that meant spending 3,500 gold
 * and a third element's depth on a multiplier while the thing being
 * multiplied sat at a quarter of its damage.
 */
function actionPriority(
  plan: CombinedBuildPlan,
  towerId: TowerId,
  toLevel: number,
  temporaryCarry = false,
): number {
  const band = temporaryCarry
    ? 100
    : toLevel <= operationalLevel(towerId)
      ? 100
      : 0;

  // A bridge carry must be available before a Trio anchor. It ranks just
  // ahead of the final anchor's own operational work, but only at L1.
  return band + (temporaryCarry ? 6 : roleRank(plan, towerId));
}

function temporaryCarryActions(
  plan: CombinedBuildPlan,
  before: ElementAllocation,
  after: ElementAllocation,
): readonly TowerProgressionAction[] {
  const anchor = getTower(plan.anchorTowerId);
  if (
    anchor.combination !== "Trio" ||
    maxReachableTowerLevel(anchor, before) >= 1
  ) {
    return [];
  }

  // A support such as Trickery may unlock before a Trio's final element,
  // but it has nobody substantial to multiply yet. Select an actual Dual
  // main-DPS carrier from the anchor's own elements instead. That keeps the
  // early route alive without smuggling a different end-game package into it.
  const dual = TOWERS.filter(
    (tower) =>
      tower.combination === "Dual" &&
      !plan.normalPlan.selectedTowerIds.includes(tower.id) &&
      tower.recipe.every((element) => anchor.recipe.includes(element)) &&
      getTowerProfile(tower.id).coreRoles.includes("main-dps") &&
      maxReachableTowerLevel(tower, after) >= 1,
  ).sort(
    (a, b) =>
      b.stats.damage[0] * b.stats.attackSpeed -
        a.stats.damage[0] * a.stats.attackSpeed || a.id.localeCompare(b.id),
  )[0];
  if (!dual) return [];

  const beforeLevel = maxReachableTowerLevel(dual, before);
  if (beforeLevel < 1) {
    return [
      {
        towerId: dual.id,
        action: "build",
        fromLevel: 0,
        toLevel: 1,
        marginalMinimumCapital: resolveNormalTowerCost(dual.id, 1)
          .minimumFieldCost,
        reason: `Build ${dual.name} I as a temporary early carry while ${anchor.name} comes online.`,
        temporaryCarry: true,
      },
    ];
  }

  // Once the carry is down, a level-II mono in its damage element provides
  // inexpensive armour coverage while the last Trio element is still being
  // gathered. It is deliberately marked temporary: it is an early-game
  // bridge, not an instruction to replace the final package.
  const coverageElement = dual.damageElement;
  if (before[coverageElement] < 2 && after[coverageElement] >= 2) {
    const mono = getMonoTowerForElement(coverageElement);
    return [
      {
        towerId: mono.id,
        action: "build",
        fromLevel: 0,
        toLevel: 2,
        marginalMinimumCapital: monoTowerCost(2),
        reason: `Add ${mono.name} II for temporary early coverage beside ${dual.name} I.`,
        temporaryCarry: true,
      },
    ];
  }

  return [];
}

function makeActions(
  plan: CombinedBuildPlan,
  before: ElementAllocation,
  after: ElementAllocation,
): readonly TowerProgressionAction[] {
  const ids = plan.normalPlan.selectedTowerIds;
  const beforeLevels = towerLevels(ids, before);
  const afterLevels = towerLevels(ids, after);

  const selectedActions: TowerProgressionAction[] = ids
    .flatMap((towerId) => {
      const fromLevel = beforeLevels.get(towerId) ?? 0;
      const toLevel = afterLevels.get(towerId) ?? 0;

      if (toLevel <= fromLevel) {
        return [];
      }

      const toCost = resolveNormalTowerCost(towerId, toLevel).minimumFieldCost;
      const fromCost =
        fromLevel === 0
          ? 0
          : resolveNormalTowerCost(towerId, fromLevel).minimumFieldCost;
      const roles = roleNamesForTower(plan, towerId);

      return [
        {
          towerId,
          action: fromLevel === 0 ? ("build" as const) : ("upgrade" as const),
          fromLevel,
          toLevel,
          marginalMinimumCapital: toCost - fromCost,
          reason:
            roles.length > 0
              ? `Advance selected ${roles.join("/")} tower.`
              : "Advance a justified post-core package tower.",
        },
      ];
    })
    .sort(
      (a, b) =>
        actionPriority(plan, b.towerId, b.toLevel) -
          actionPriority(plan, a.towerId, a.toLevel) ||
        a.towerId.localeCompare(b.towerId),
    );

  return [
    ...selectedActions,
    ...temporaryCarryActions(plan, before, after),
  ].sort(
    (a, b) =>
      actionPriority(plan, b.towerId, b.toLevel, b.temporaryCarry) -
        actionPriority(plan, a.towerId, a.toLevel, a.temporaryCarry) ||
      a.towerId.localeCompare(b.towerId),
  );
}

function coreDevelopedAt(
  plan: CombinedBuildPlan,
  allocation: ElementAllocation,
): boolean {
  return plan.normalPlan.baseline.package.roles.every((role) =>
    role.candidates.some(
      (candidate) =>
        plan.normalPlan.selectedTowerIds.includes(candidate.towerId) &&
        maxReachableTowerLevel(getTower(candidate.towerId), allocation) >=
          candidate.targetLevel,
    ),
  );
}

function milestoneStatus(
  plan: CombinedBuildPlan,
  allocation: ElementAllocation,
) {
  const anchor = getTower(plan.anchorTowerId);
  const anchorLevel = maxReachableTowerLevel(anchor, allocation);

  return {
    anchorOperational: anchorLevel >= operationalLevel(plan.anchorTowerId),
    anchorDeveloped: anchorLevel >= anchor.maxLevel,
    coreDeveloped: coreDevelopedAt(plan, allocation),
    finalAllocationReached: ELEMENTS.every(
      (element) =>
        allocation[element] ===
        plan.normalPlan.baseline.routeState.allocation[element],
    ),
  };
}

function stageFor(
  status: ReturnType<typeof milestoneStatus>,
): Exclude<ProgressionStage, "END_GAME"> {
  if (!status.anchorOperational) {
    return "EARLY";
  }
  if (!status.anchorDeveloped || !status.coreDeveloped) {
    return "MID";
  }
  return "LATE";
}

function stepPriority(
  plan: CombinedBuildPlan,
  before: ElementAllocation,
  after: ElementAllocation,
): readonly number[] {
  const actions = makeActions(plan, before, after);
  const status = milestoneStatus(plan, after);
  const anchor = getTower(plan.anchorTowerId);
  const operational = operationalLevel(plan.anchorTowerId);
  const anchorPrerequisiteProgress = anchor.recipe.reduce(
    (total, element) => total + Math.min(after[element], operational),
    0,
  );

  return [
    // A dual plus a level-II mono gets one beat before a Trio's first form.
    // It is the coverage bridge that keeps an expensive anchor from being
    // the only thing holding the early waves.
    actions.some((action) => action.temporaryCarry) ? 1 : 0,
    status.anchorOperational ? 1 : 0,
    anchorPrerequisiteProgress,
    actions[0]
      ? actionPriority(
          plan,
          actions[0].towerId,
          actions[0].toLevel,
          actions[0].temporaryCarry,
        )
      : 0,
    status.coreDeveloped ? 1 : 0,
    status.anchorDeveloped ? 1 : 0,
    actions.length,
  ];
}

function vectorComparison(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] > b[index]) return -1;
    if (a[index] < b[index]) return 1;
  }
  return 0;
}

export function buildProgression(plan: CombinedBuildPlan): BuildProgression {
  const target = plan.normalPlan.baseline.routeState.allocation;
  let current = cloneAllocation(EMPTY_ALLOCATION);
  const steps: AllocationProgressionStep[] = [];

  while (ELEMENTS.some((element) => current[element] < target[element])) {
    const before = cloneAllocation(current);
    const options = ELEMENTS.filter(
      (element) => current[element] < target[element],
    )
      .map((element) => {
        const after = {
          ...current,
          [element]: current[element] + 1,
        };

        return {
          element,
          after,
          vector: stepPriority(plan, before, after),
        };
      })
      .sort(
        (a, b) =>
          vectorComparison(a.vector, b.vector) ||
          ELEMENTS.indexOf(a.element) - ELEMENTS.indexOf(b.element),
      );
    const chosen = options[0];
    const actions = makeActions(plan, before, chosen.after);
    const beforeStatus = milestoneStatus(plan, before);
    const afterStatus = milestoneStatus(plan, chosen.after);
    const stage = stageFor(beforeStatus);

    steps.push({
      stage,
      allocationBefore: before,
      nextElementAllocation: chosen.element,
      allocationAfter: chosen.after,
      newlyLegalOrReachableSelectedTowers: actions,
      primaryAction: actions[0] ?? null,
      secondaryActions: actions.slice(1),
      strategicReason:
        actions[0]?.reason ??
        `Allocate ${chosen.element} as a prerequisite for the selected final plan.`,
      milestoneStatus: afterStatus,
    });

    current = chosen.after;
  }

  const normalStages = ["EARLY", "MID", "LATE"] as const;
  const stagePriorities: StagePriority[] = normalStages.map((stage) => {
    const stageSteps = steps.filter((step) => step.stage === stage);
    const actions = stageSteps.flatMap((step) => [
      ...(step.primaryAction ? [step.primaryAction] : []),
      ...step.secondaryActions,
    ]);

    return {
      stage,
      primaryAction: actions[0] ?? null,
      secondaryActions: actions.slice(1),
      reason:
        stageSteps[0]?.strategicReason ??
        `No separate ${stage} tower action is required by this route.`,
      allocationPrerequisite:
        stageSteps[0]?.allocationBefore ?? cloneAllocation(target),
      resultingAllocation:
        stageSteps.at(-1)?.allocationAfter ?? cloneAllocation(target),
    };
  });
  const endGameSelections = plan.bestEndGamePackage?.package.selections ?? [];

  stagePriorities.push({
    stage: "END_GAME",
    primaryAction:
      endGameSelections.length > 0
        ? {
            action: "execute-endgame-package",
            selections: endGameSelections,
          }
        : null,
    secondaryActions: [],
    reason:
      "Spend the two selected Essence uses only after the final normal allocation makes the package legal.",
    allocationPrerequisite: cloneAllocation(target),
    resultingAllocation: cloneAllocation(target),
  });

  return {
    steps,
    stagePriorities,
    endGame: {
      stage: "END_GAME",
      allocation: cloneAllocation(target),
      selections: endGameSelections,
      minimumCapital: plan.minimumEndGameOptionCapital,
    },
  };
}
