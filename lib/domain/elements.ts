export const ELEMENTS = [
  "Light",
  "Darkness",
  "Water",
  "Fire",
  "Nature",
  "Earth",
] as const;

export type ElementName = (typeof ELEMENTS)[number];

export type ElementAllocation = Record<ElementName, number>;