import endGameTowerFactsData
  from "@/data/endGameTowerFacts.v1.json";

import type {
  ElementName,
} from "./elements";

import type {
  EndGameTowerId,
} from "./endGameTower";

export type EndGameAbilityFact = {
  name: string | null;
  activation: string;
  perAttackMagnitude:
    number | null;
  maximumMagnitude:
    number | null;
  durationSeconds:
    number | null;
  cooldownSeconds:
    number | null;
  resetRule: string;
  targetRestriction: string;
  bossBehavior: string;
  duplicateBehavior: string;
};

export type EndGameTowerFact = {
  towerId: EndGameTowerId;
  name: string;
  kind: "Pure" | "Periodic";
  element: ElementName | "Composite";
  minimumFieldCost: number;
  damage: number;
  attackSpeed: number;
  range: number;
  aoe: number;
  ability: EndGameAbilityFact;
};

export type EndGameEngagementModel = {
  sustainedEngagementSeconds: number;
  note: string;
};

export type EndGameTowerFactCatalog = {
  schemaVersion: 1;
  verifiedThrough: string;
  costSemantics:
    "cumulative-minimum-field-cost";
  essenceUsesPerTower: 1;
  engagementModel:
    EndGameEngagementModel;
  facts:
    readonly EndGameTowerFact[];
  sources: readonly {
    label: string;
    url: string;
    supports: string;
  }[];
};

export const END_GAME_ENGAGEMENT_MODEL:
  EndGameEngagementModel =
  (endGameTowerFactsData as EndGameTowerFactCatalog)
    .engagementModel;

export const END_GAME_TOWER_FACT_CATALOG =
  endGameTowerFactsData as
    EndGameTowerFactCatalog;

const END_GAME_TOWER_FACTS_BY_ID =
  new Map(
    END_GAME_TOWER_FACT_CATALOG
      .facts.map((fact) => [
        fact.towerId,
        fact,
      ] as const),
  );

export function getEndGameTowerFact(
  towerId: EndGameTowerId,
): EndGameTowerFact {
  const fact =
    END_GAME_TOWER_FACTS_BY_ID.get(
      towerId,
    );

  if (!fact) {
    throw new Error(
      `Missing endgame tower fact: ${towerId}.`,
    );
  }

  return fact;
}
