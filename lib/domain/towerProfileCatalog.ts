import type { TowerProfile } from "./towerProfile";

export type TowerProfileCatalog = {
  schemaVersion: 1;
  profiles: readonly TowerProfile[];
};