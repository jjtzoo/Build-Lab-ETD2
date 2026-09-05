import type { ElementName } from "./elements";

export type ElementMultiplier = 0.5 | 1 | 2;

export type ElementMatchupProfile = Record<
  ElementName,
  ElementMultiplier
>;

export type ElementMatchupTable = Record<
  ElementName,
  ElementMatchupProfile
>;

export type ElementMatchupCatalog = {
  schemaVersion: 1;
  elements: readonly ElementName[];
  matchups: ElementMatchupTable;
};