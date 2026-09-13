import type { ElementAllocation } from "@/lib/domain/elements";
import type { PortableBuild } from "@/lib/domain/portableBuild";
import { END_GAME_TOWER_FACT_CATALOG } from "@/lib/domain/endGameTowerFacts";
import { liveBuildBlock } from "./liveAvailability";
import {
  liveTowerName,
  liveTowerReachableLevel,
  planKeystoneProgress,
  recommendedPick,
  resolveLiveTowerCost,
  staleFieldRows,
  towerReachGap,
  type BuiltTower,
} from "./liveGame";

export type LivePlanAction = {
  towerId: string;
  towerName: string;
  toLevel: number;
  fromLevel?: number;
  kind: "build" | "upgrade";
  /** Copies the plan wants — 1 for a normal tower, the chosen count for an End Game form. */
  quantity: number;
  goldCost: number;
  missing: readonly string[];
  done: boolean;
};

/** One interpretation of the plan shared by the sticky strip and Plan panel. */
export function liveCoaching(
  plan: PortableBuild | null,
  allocation: ElementAllocation,
  built: readonly BuiltTower[],
  holds: number,
  availableGold?: number,
) {
  const stale = new Set(staleFieldRows(allocation, built));
  const valid = built.filter((entry) => !stale.has(entry));
  const goals: { towerId: string; level: number; quantity: number }[] = [];

  // The engine's keystone steps are the real play order. A stage's primary
  // action is only a summary of that stage; relying on it alone used to drop
  // legitimate secondary unlocks such as Laser I on the Light/Darkness/Earth
  // route. Keep every unlock, then add the primary only as a legacy fallback.
  const addGoal = (towerId: string, level: number, quantity = 1) => {
    if (!goals.some((goal) => goal.towerId === towerId && goal.level === level))
      goals.push({ towerId, level, quantity });
  };
  for (const stage of plan?.progression ?? []) {
    for (const step of stage.keystoneSteps) {
      for (const action of step.unlocks)
        addGoal(action.towerId, action.toLevel);
    }
    if (stage.primaryAction)
      addGoal(stage.primaryAction.towerId, stage.primaryAction.toLevel);
  }
  for (const tower of plan?.towers ?? []) {
    addGoal(tower.towerId, tower.level);
  }
  for (const choice of plan?.endGame ?? []) {
    const fact = END_GAME_TOWER_FACT_CATALOG.facts.find(
      (t) => t.name === choice.name,
    );
    if (fact) {
      const existing = goals.find((g) => g.towerId === fact.towerId);
      if (existing) existing.quantity = choice.quantity;
      else
        goals.push({
          towerId: fact.towerId,
          level: 1,
          quantity: choice.quantity,
        });
    }
  }
  const actions: LivePlanAction[] = goals.map((goal) => {
    const from = valid
      .filter(
        (entry) => entry.towerId === goal.towerId && entry.level < goal.level,
      )
      .sort((a, b) => b.level - a.level)[0];
    const done =
      valid
        .filter(
          (entry) =>
            entry.towerId === goal.towerId && entry.level >= goal.level,
        )
        .reduce((n, entry) => n + entry.quantity, 0) >= goal.quantity;
    const block = liveBuildBlock(goal.towerId, allocation, holds, built);
    const missing = [...towerReachGap(goal.towerId, allocation, goal.level)];
    if (block && !missing.length) missing.push(block);
    if (
      !block &&
      liveTowerReachableLevel(goal.towerId, allocation) < goal.level &&
      !missing.length
    )
      missing.push("Higher element levels");
    const goldCost = Math.max(
      0,
      resolveLiveTowerCost(goal.towerId, goal.level) -
        (from ? resolveLiveTowerCost(goal.towerId, from.level) : 0),
    );
    if (availableGold !== undefined && goldCost > availableGold)
      missing.push(`Save ${(goldCost - availableGold).toLocaleString()} gold`);
    return {
      towerId: goal.towerId,
      towerName: liveTowerName(goal.towerId),
      toLevel: goal.level,
      fromLevel: from?.level,
      kind: from ? "upgrade" : "build",
      quantity: goal.quantity,
      goldCost,
      missing,
      done,
    };
  });
  const pending = actions.filter((a) => !a.done);
  // A player can take a different legal pick or build a later support tower
  // before the intended step. Offer the next legal recovery move instead of
  // dead-ending the plan, but keep the skipped step visible to explain why
  // the route has adapted.
  const firstPending = pending[0] ?? null;
  const nextAction = pending.find((action) => !action.missing.length) ?? null;
  const blockedAction =
    nextAction && nextAction !== firstPending
      ? firstPending
      : nextAction
        ? null
        : firstPending;
  const keystones = planKeystoneProgress(plan, allocation);
  const complete =
    !!plan && pending.length === 0 && keystones.stillNeeded.length === 0;
  return {
    actions,
    nextAction,
    blockedAction,
    keystones,
    complete,
    nextPick: recommendedPick(allocation, plan),
    isAdaptive: !!nextAction && nextAction !== firstPending,
  };
}
