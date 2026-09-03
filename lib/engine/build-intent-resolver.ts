import { TOWERS } from "@/lib/data";
import {
  INTENT_CAPABILITY_INPUTS,
  INTENT_PROFILE_ALIASES,
  INTENT_PROFILE_INPUTS,
  type BuildIntent,
  type TowerFocus,
} from "@/lib/engine/build-intent";
import type { CapabilityKey, StrategicProfileKey, Tower } from "@/lib/types";

export class BuildIntentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildIntentValidationError";
  }
}

export type ResolvedTowerFocus = {
  tower: Tower;
  priority: NonNullable<TowerFocus["priority"]>;
};

export type ResolvedBuildIntent = {
  focusedTowers: ResolvedTowerFocus[];
  preferredProfiles: StrategicProfileKey[];
  preferredCapabilities: CapabilityKey[];
  mode: BuildIntent["mode"];
};

function resolveTower(name: Tower["name"]): Tower {
  const tower = TOWERS.find((candidate) => candidate.name === name);
  if (!tower) throw new BuildIntentValidationError(`Unknown tower: ${name}`);
  return tower;
}

function resolveProfile(profile: unknown): StrategicProfileKey {
  if (typeof profile !== "string" || !INTENT_PROFILE_INPUTS.includes(profile as never)) {
    throw new BuildIntentValidationError(`Unsupported preferred profile: ${String(profile)}`);
  }
  return INTENT_PROFILE_ALIASES[profile as keyof typeof INTENT_PROFILE_ALIASES];
}

function resolveCapability(capability: unknown): CapabilityKey {
  if (typeof capability !== "string" || !INTENT_CAPABILITY_INPUTS.includes(capability as never)) {
    throw new BuildIntentValidationError(`Unsupported preferred capability: ${String(capability)}`);
  }
  return capability as CapabilityKey;
}

function uniqueValues<T>(values: readonly T[], label: string): T[] {
  if (new Set(values).size !== values.length) {
    throw new BuildIntentValidationError(`Duplicate ${label} values are not supported.`);
  }
  return [...values];
}

export function resolveBuildIntent(intent: BuildIntent): ResolvedBuildIntent {
  if (!intent || (intent.mode !== "normal" && intent.mode !== "explore")) {
    throw new BuildIntentValidationError("Intent mode must be normal or explore.");
  }
  if (!Array.isArray(intent.focusedTowers)) {
    throw new BuildIntentValidationError("Focused towers must be an array.");
  }
  if (intent.preferredProfiles !== undefined && !Array.isArray(intent.preferredProfiles)) {
    throw new BuildIntentValidationError("Preferred profiles must be an array.");
  }
  if (intent.preferredCapabilities !== undefined && !Array.isArray(intent.preferredCapabilities)) {
    throw new BuildIntentValidationError("Preferred capabilities must be an array.");
  }

  const focusedTowers = intent.focusedTowers.map((focus) => {
    const priority = focus.priority ?? "balanced";
    if (!(["explore", "balanced", "maximum-depth"] as const).includes(priority)) {
      throw new BuildIntentValidationError(`Unsupported tower priority: ${String(priority)}`);
    }
    return { tower: resolveTower(focus.tower), priority };
  });
  uniqueValues(focusedTowers.map((focus) => focus.tower.name), "focused tower");

  return {
    focusedTowers,
    preferredProfiles: uniqueValues(
      (intent.preferredProfiles ?? []).map(resolveProfile),
      "preferred profile",
    ),
    preferredCapabilities: uniqueValues(
      (intent.preferredCapabilities ?? []).map(resolveCapability),
      "preferred capability",
    ),
    mode: intent.mode,
  };
}
