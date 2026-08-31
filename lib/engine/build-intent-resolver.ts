import { TOWERS } from "@/lib/data";
import type { BuildIntent, TowerFocus } from "@/lib/engine/build-intent";
import type { Tower } from "@/lib/types";

export type ResolvedTowerFocus = {
  tower: Tower;
  priority?: TowerFocus["priority"];
};

export type ResolvedBuildIntent = {
  focusedTowers: ResolvedTowerFocus[];
  mode: BuildIntent["mode"];
};

function resolveTower(name: Tower["name"]): Tower {
  const tower = TOWERS.find((candidate) => candidate.name === name);

  if (!tower) {
    throw new Error(`Unknown tower: ${name}`);
  }

  return tower;
}

export function resolveBuildIntent(
  intent: BuildIntent,
): ResolvedBuildIntent {
  return {
    focusedTowers: intent.focusedTowers.map((focus) => ({
      tower: resolveTower(focus.tower),
      priority: focus.priority,
    })),
    mode: intent.mode,
  };
}