import mechanicFactData from "@/data/towerMechanicFacts.v1.json";

import type {
  MechanicSignal,
} from "@/lib/domain/mechanicSignals";

import type {
  TowerId,
} from "@/lib/domain/tower";

export type MechanicMagnitudeUnit =
  | "percent"
  | "percent-damage"
  | "percent-speed-increase"
  | "seconds";

export type MechanicEffectFact = {
  towerId: TowerId;
  signal: MechanicSignal;
  magnitude?: {
    unit: MechanicMagnitudeUnit;
    byLevel: readonly number[];
  };
  durationSeconds?: {
    byLevel: readonly number[];
  };
  cooldownSeconds?: number;
  triggerIntervalSeconds?: number;
  activationRequirement:
    | "automatic-or-manual"
    | "active-cast"
    | "on-hit";
  maxTargets?: number;
  targetCoverage?: string;
  refreshBehavior?: string;
  conditionalRequirement?: string;
  resetSeconds?: number;
  resourceBurden?: {
    resource: "lives";
    amount: string;
  };
};

export type TowerMechanicFactCatalog = {
  schemaVersion: 1;
  effects:
    readonly MechanicEffectFact[];
};

export const TOWER_MECHANIC_FACTS =
  mechanicFactData as TowerMechanicFactCatalog;

export function getTowerMechanicFacts(
  towerId: TowerId,
): readonly MechanicEffectFact[] {
  return TOWER_MECHANIC_FACTS
    .effects
    .filter(
      (effect) =>
        effect.towerId === towerId,
    );
}
