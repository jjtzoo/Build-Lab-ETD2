import {
  ELEMENTS,
  type ElementAllocation,
  type ElementName,
} from "@/lib/domain/elements";

import {
  resolveNormalTowerCost,
} from "@/lib/domain/towerEconomics";

import {
  getTower,
} from "@/lib/domain/towerCatalog";

import type {
  EndGameTowerSelection,
} from "@/lib/domain/endGameTower";

import type {
  TowerId,
} from "@/lib/domain/tower";

import {
  maxReachableTowerLevel,
} from "@/lib/engine/allocation";

import type {
  CombinedBuildPlan,
} from "@/lib/engine/combinedBuildPlan";

export type ProgressionStage =
  | "EARLY"
  | "MID"
  | "LATE"
  | "END_GAME";

export type TowerProgressionAction = {
  towerId: TowerId;
  action: "build" | "upgrade";
  fromLevel: number;
  toLevel: number;
  marginalMinimumCapital: number;
  reason: string;
};

export type AllocationProgressionStep = {
  stage: Exclude<
    ProgressionStage,
    "END_GAME"
  >;
  allocationBefore:
    ElementAllocation;
  nextElementAllocation:
    ElementName;
  allocationAfter:
    ElementAllocation;
  newlyLegalOrReachableSelectedTowers:
    readonly TowerProgressionAction[];
  primaryAction:
    TowerProgressionAction | null;
  secondaryActions:
    readonly TowerProgressionAction[];
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
    TowerProgressionAction | {
      action: "execute-endgame-package";
      selections:
        readonly EndGameTowerSelection[];
    } | null;
  secondaryActions:
    readonly TowerProgressionAction[];
  reason: string;
  allocationPrerequisite:
    ElementAllocation;
  resultingAllocation:
    ElementAllocation;
};

export type BuildProgression = {
  steps:
    readonly AllocationProgressionStep[];
  stagePriorities:
    readonly StagePriority[];
  endGame: {
    stage: "END_GAME";
    allocation:
      ElementAllocation;
    selections:
      readonly EndGameTowerSelection[];
    minimumCapital: number | null;
  };
};

const EMPTY_ALLOCATION:
  ElementAllocation = {
  Light: 0,
  Darkness: 0,
  Water: 0,
  Fire: 0,
  Nature: 0,
  Earth: 0,
};

function cloneAllocation(
  allocation: ElementAllocation,
): ElementAllocation {
  return { ...allocation };
}

function anchorOperationalLevel(
  anchorTowerId: TowerId,
): number {
  return getTower(anchorTowerId)
    .combination === "Dual"
    ? 2
    : 1;
}

function towerLevels(
  towerIds: readonly TowerId[],
  allocation: ElementAllocation,
): ReadonlyMap<TowerId, number> {
  return new Map(
    towerIds.map((towerId) => [
      towerId,
      maxReachableTowerLevel(
        getTower(towerId),
        allocation,
      ),
    ] as const),
  );
}

function roleNamesForTower(
  plan: CombinedBuildPlan,
  towerId: TowerId,
): readonly string[] {
  if (
    towerId === plan.anchorTowerId
  ) {
    return ["main-dps"];
  }

  return plan.normalPlan
    .baseline.package.roles
    .filter((role) =>
      role.candidates.some(
        (candidate) =>
          candidate.towerId ===
            towerId,
      ),
    )
    .map((role) => role.role);
}

function actionPriority(
  plan: CombinedBuildPlan,
  towerId: TowerId,
  toLevel: number,
): number {
  const operational =
    anchorOperationalLevel(
      plan.anchorTowerId,
    );

  if (
    towerId === plan.anchorTowerId &&
    toLevel <= operational
  ) {
    return 100;
  }

  const roles =
    roleNamesForTower(
      plan,
      towerId,
    );

  if (roles.includes("slow")) {
    return 90;
  }
  if (roles.includes("damage-amp")) {
    return 80;
  }
  if (roles.includes("buff")) {
    return 70;
  }
  if (towerId === plan.anchorTowerId) {
    return 60;
  }
  return 40;
}

function makeActions(
  plan: CombinedBuildPlan,
  before: ElementAllocation,
  after: ElementAllocation,
): readonly TowerProgressionAction[] {
  const ids =
    plan.normalPlan
      .selectedTowerIds;
  const beforeLevels =
    towerLevels(ids, before);
  const afterLevels =
    towerLevels(ids, after);

  return ids
    .flatMap((towerId) => {
      const fromLevel =
        beforeLevels.get(towerId) ?? 0;
      const toLevel =
        afterLevels.get(towerId) ?? 0;

      if (toLevel <= fromLevel) {
        return [];
      }

      const toCost =
        resolveNormalTowerCost(
          towerId,
          toLevel,
        ).minimumFieldCost;
      const fromCost =
        fromLevel === 0
          ? 0
          : resolveNormalTowerCost(
              towerId,
              fromLevel,
            ).minimumFieldCost;
      const roles =
        roleNamesForTower(
          plan,
          towerId,
        );

      return [{
        towerId,
        action:
          fromLevel === 0
            ? "build" as const
            : "upgrade" as const,
        fromLevel,
        toLevel,
        marginalMinimumCapital:
          toCost - fromCost,
        reason:
          roles.length > 0
            ? `Advance selected ${roles.join("/")} tower.`
            : "Advance a justified post-core package tower.",
      }];
    })
    .sort((a, b) =>
      actionPriority(
        plan,
        b.towerId,
        b.toLevel,
      ) -
        actionPriority(
          plan,
          a.towerId,
          a.toLevel,
        ) ||
      a.towerId.localeCompare(
        b.towerId,
      ),
    );
}

function coreDevelopedAt(
  plan: CombinedBuildPlan,
  allocation: ElementAllocation,
): boolean {
  return plan.normalPlan
    .baseline.package.roles
    .every((role) =>
      role.candidates.some(
        (candidate) =>
          plan.normalPlan
            .selectedTowerIds.includes(
              candidate.towerId,
            ) &&
          maxReachableTowerLevel(
            getTower(
              candidate.towerId,
            ),
            allocation,
          ) >= candidate.targetLevel,
      ),
    );
}

function milestoneStatus(
  plan: CombinedBuildPlan,
  allocation: ElementAllocation,
) {
  const anchor =
    getTower(plan.anchorTowerId);
  const anchorLevel =
    maxReachableTowerLevel(
      anchor,
      allocation,
    );

  return {
    anchorOperational:
      anchorLevel >=
      anchorOperationalLevel(
        plan.anchorTowerId,
      ),
    anchorDeveloped:
      anchorLevel >=
      anchor.maxLevel,
    coreDeveloped:
      coreDevelopedAt(
        plan,
        allocation,
      ),
    finalAllocationReached:
      ELEMENTS.every((element) =>
        allocation[element] ===
        plan.normalPlan.baseline
          .routeState.allocation[
            element
          ],
      ),
  };
}

function stageFor(
  status: ReturnType<
    typeof milestoneStatus
  >,
): Exclude<ProgressionStage, "END_GAME"> {
  if (!status.anchorOperational) {
    return "EARLY";
  }
  if (
    !status.anchorDeveloped ||
    !status.coreDeveloped
  ) {
    return "MID";
  }
  return "LATE";
}

function stepPriority(
  plan: CombinedBuildPlan,
  before: ElementAllocation,
  after: ElementAllocation,
): readonly number[] {
  const actions =
    makeActions(plan, before, after);
  const status =
    milestoneStatus(plan, after);
  const anchor =
    getTower(plan.anchorTowerId);
  const operational =
    anchorOperationalLevel(
      plan.anchorTowerId,
    );
  const anchorPrerequisiteProgress =
    anchor.recipe.reduce(
      (total, element) =>
        total +
        Math.min(
          after[element],
          operational,
        ),
      0,
    );

  return [
    status.anchorOperational ? 1 : 0,
    anchorPrerequisiteProgress,
    actions[0]
      ? actionPriority(
          plan,
          actions[0].towerId,
          actions[0].toLevel,
        )
      : 0,
    status.coreDeveloped ? 1 : 0,
    status.anchorDeveloped ? 1 : 0,
    actions.length,
  ];
}

function vectorComparison(
  a: readonly number[],
  b: readonly number[],
): number {
  for (
    let index = 0;
    index < a.length;
    index += 1
  ) {
    if (a[index] > b[index]) return -1;
    if (a[index] < b[index]) return 1;
  }
  return 0;
}

export function buildProgression(
  plan: CombinedBuildPlan,
): BuildProgression {
  const target =
    plan.normalPlan.baseline
      .routeState.allocation;
  let current =
    cloneAllocation(
      EMPTY_ALLOCATION,
    );
  const steps:
    AllocationProgressionStep[] = [];

  while (
    ELEMENTS.some((element) =>
      current[element] <
      target[element],
    )
  ) {
    const before =
      cloneAllocation(current);
    const options = ELEMENTS
      .filter((element) =>
        current[element] <
        target[element],
      )
      .map((element) => {
        const after = {
          ...current,
          [element]:
            current[element] + 1,
        };

        return {
          element,
          after,
          vector:
            stepPriority(
              plan,
              before,
              after,
            ),
        };
      })
      .sort((a, b) =>
        vectorComparison(
          a.vector,
          b.vector,
        ) ||
        ELEMENTS.indexOf(a.element) -
          ELEMENTS.indexOf(b.element),
      );
    const chosen = options[0];
    const actions =
      makeActions(
        plan,
        before,
        chosen.after,
      );
    const beforeStatus =
      milestoneStatus(
        plan,
        before,
      );
    const afterStatus =
      milestoneStatus(
        plan,
        chosen.after,
      );
    const stage =
      stageFor(beforeStatus);

    steps.push({
      stage,
      allocationBefore: before,
      nextElementAllocation:
        chosen.element,
      allocationAfter:
        chosen.after,
      newlyLegalOrReachableSelectedTowers:
        actions,
      primaryAction:
        actions[0] ?? null,
      secondaryActions:
        actions.slice(1),
      strategicReason:
        actions[0]?.reason ??
        `Allocate ${chosen.element} as a prerequisite for the selected final plan.`,
      milestoneStatus:
        afterStatus,
    });

    current = chosen.after;
  }

  const normalStages = [
    "EARLY",
    "MID",
    "LATE",
  ] as const;
  const stagePriorities:
    StagePriority[] =
    normalStages.map((stage) => {
      const stageSteps =
        steps.filter((step) =>
          step.stage === stage,
        );
      const actions =
        stageSteps.flatMap((step) => [
          ...(step.primaryAction
            ? [step.primaryAction]
            : []),
          ...step.secondaryActions,
        ]);

      return {
        stage,
        primaryAction:
          actions[0] ?? null,
        secondaryActions:
          actions.slice(1),
        reason:
          stageSteps[0]
            ?.strategicReason ??
          `No separate ${stage} tower action is required by this route.`,
        allocationPrerequisite:
          stageSteps[0]
            ?.allocationBefore ??
          cloneAllocation(target),
        resultingAllocation:
          stageSteps.at(-1)
            ?.allocationAfter ??
          cloneAllocation(target),
      };
    });
  const endGameSelections =
    plan.bestEndGamePackage
      ?.package.selections ?? [];

  stagePriorities.push({
    stage: "END_GAME",
    primaryAction:
      endGameSelections.length > 0
        ? {
            action:
              "execute-endgame-package",
            selections:
              endGameSelections,
          }
        : null,
    secondaryActions: [],
    reason:
      "Spend the two selected Essence uses only after the final normal allocation makes the package legal.",
    allocationPrerequisite:
      cloneAllocation(target),
    resultingAllocation:
      cloneAllocation(target),
  });

  return {
    steps,
    stagePriorities,
    endGame: {
      stage: "END_GAME",
      allocation:
        cloneAllocation(target),
      selections:
        endGameSelections,
      minimumCapital:
        plan
          .minimumEndGameOptionCapital,
    },
  };
}
