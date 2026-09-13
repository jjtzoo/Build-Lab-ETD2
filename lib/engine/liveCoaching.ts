import type { ElementAllocation } from "@/lib/domain/elements";
import type { PortableBuild } from "@/lib/domain/portableBuild";
import { END_GAME_TOWER_FACT_CATALOG } from "@/lib/domain/endGameTowerFacts";
import { liveBuildBlock } from "./liveAvailability";
import {
  liveTowerName,
  liveTowerReachableLevel,
  planKeystoneProgress,
  recommendedPick,
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
  missing: readonly string[];
  done: boolean;
};

/** One interpretation of the plan shared by the sticky strip and Plan panel. */
export function liveCoaching(
  plan: PortableBuild | null,
  allocation: ElementAllocation,
  built: readonly BuiltTower[],
  holds: number,
) {
  const stale = new Set(staleFieldRows(allocation, built));
  const valid = built.filter((entry) => !stale.has(entry));
  const goals: { towerId: string; level: number; quantity: number }[] = [];
  for (const stage of plan?.progression ?? []) {
    if (stage.primaryAction)
      goals.push({
        towerId: stage.primaryAction.towerId,
        level: stage.primaryAction.toLevel,
        quantity: 1,
      });
  }
  for (const tower of plan?.towers ?? []) {
    if (
      !goals.some((g) => g.towerId === tower.towerId && g.level === tower.level)
    )
      goals.push({ ...tower, quantity: 1 });
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
    return {
      towerId: goal.towerId,
      towerName: liveTowerName(goal.towerId),
      toLevel: goal.level,
      fromLevel: from?.level,
      kind: from ? "upgrade" : "build",
      quantity: goal.quantity,
      missing,
      done,
    };
  });
  const pending = actions.filter((a) => !a.done);
  const nextAction = pending.find((a) => !a.missing.length) ?? null;
  const blockedAction = pending.find((a) => a.missing.length) ?? null;
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
  };
}
