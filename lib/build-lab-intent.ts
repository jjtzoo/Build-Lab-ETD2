import type {
  BuildIntent,
  BuildMode,
  TowerPriority,
} from "@/lib/engine/build-intent";
import type { StrategicProfileKey } from "@/lib/types";

export type BuildDirection =
  | "engine"
  | "tower"
  | "wave-clear"
  | "boss-damage"
  | "control"
  | "explore";

export type BuildLabIntentControls = Readonly<{
  direction: BuildDirection;
  focalTower: string;
  priority: TowerPriority;
  preferredProfile: StrategicProfileKey | "";
  mode: BuildMode;
}>;

/** The standard Build Lab path uses bounded two-step planning. */
export const DEFAULT_TWO_STEP_PLANNING = true;

const directionProfiles: Readonly<Partial<Record<BuildDirection, StrategicProfileKey>>> = {
  "wave-clear": "aoeWaveClear",
  "boss-damage": "bossSingleTarget",
  control: "control",
};

/**
 * Adapts the low-friction Build Lab controls to the canonical BuildIntent.
 * "Let engine decide" is deliberately undefined so the request contains no
 * player intent at all unless the player chooses a direction or an advanced
 * override.
 */
export function createBuildLabIntent(
  controls: BuildLabIntentControls,
): BuildIntent | undefined {
  const requestedProfile = controls.preferredProfile || directionProfiles[controls.direction];
  const directionIsExplore = controls.direction === "explore";
  const hasAdvancedIntent = controls.preferredProfile !== "" || controls.mode === "explore";

  if (controls.direction === "engine" && !hasAdvancedIntent) {
    return undefined;
  }

  if (controls.direction === "tower" && !controls.focalTower) {
    return requestedProfile || hasAdvancedIntent
      ? {
          focusedTowers: [],
          ...(requestedProfile ? { preferredProfiles: [requestedProfile] } : {}),
          mode: controls.mode,
        }
      : undefined;
  }

  return {
    focusedTowers: controls.direction === "tower"
      ? [{ tower: controls.focalTower, priority: controls.priority }]
      : [],
    ...(requestedProfile ? { preferredProfiles: [requestedProfile] } : {}),
    mode: directionIsExplore ? "explore" : controls.mode,
  };
}
