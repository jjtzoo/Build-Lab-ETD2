import type { ElementName } from "./elements";
import type { Tower } from "./tower";

export type TowerCatalog = {
  schemaVersion: 2;
  elements: readonly ElementName[];
  towers: readonly Tower[];
};