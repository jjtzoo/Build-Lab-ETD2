import towerCatalogData
  from "@/data/towers.v2.json";

import type { ElementName } from "./elements";
import type {
  Tower,
  TowerId,
} from "./tower";

export type TowerCatalog = {
  schemaVersion: 2;
  elements: readonly ElementName[];
  towers: readonly Tower[];
};

export const TOWER_CATALOG =
  towerCatalogData as unknown as TowerCatalog;

export const TOWERS =
  TOWER_CATALOG.towers;

export const TOWERS_BY_ID =
  new Map<TowerId, Tower>(
    TOWERS.map((tower) => [
      tower.id,
      tower,
    ]),
  );

export function getTower(
  towerId: TowerId,
): Tower {
  const tower =
    TOWERS_BY_ID.get(towerId);

  if (!tower) {
    throw new Error(
      `Missing canonical tower: ${towerId}`,
    );
  }

  return tower;
}