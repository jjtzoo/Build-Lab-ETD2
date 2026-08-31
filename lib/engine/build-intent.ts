import type { Tower } from "@/lib/types";

export type TowerPriority =
  | "explore"
  | "balanced"
  | "maximum-depth";

export type BuildMode =
  | "normal"
  | "explore";

export type TowerFocus = {
  tower: Tower;
  priority?: TowerPriority;
};

export type BuildIntent = {
  focusedTowers: TowerFocus[];
  mode: BuildMode;
};