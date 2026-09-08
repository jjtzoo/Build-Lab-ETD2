import type {
  ElementName,
} from "./elements";

export type PureTowerId =
  | "pure-light"
  | "pure-darkness"
  | "pure-water"
  | "pure-fire"
  | "pure-nature"
  | "pure-earth";

export type PeriodicTowerId =
  "periodic";

export type EndGameTowerId =
  | PureTowerId
  | PeriodicTowerId;

export type EndGameTowerAccess = {
  towerId: EndGameTowerId;
  kind: "Pure" | "Periodic";
  element: ElementName | "Composite";
  requiredEssenceUses: 1;
};

export type EndGameTowerSelection = {
  towerId: EndGameTowerId;
  quantity: number;
};

export type EndGamePackage = {
  selections:
    readonly EndGameTowerSelection[];
  totalEssenceUses: number;
};
