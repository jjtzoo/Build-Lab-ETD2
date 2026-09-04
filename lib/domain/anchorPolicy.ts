import type { TowerId } from "./tower";

/**
 * Build Lab only supports explicitly curated anchor towers.
 *
 * Main DPS capability alone does not make a tower
 * eligible to be selected as an anchor.
 */
export type CuratedAnchor = {
  towerId: TowerId;
};

/**
 * Planning assumptions used when an anchor is selected.
 *
 * Dual anchor  -> 3-3
 * Trio anchor  -> 2-2-2
 *
 * Quad is intentionally absent because the current
 * governing engine logic only defines Dual and Trio
 * anchor starting assumptions.
 */
export const ANCHOR_ASSUMED_LEVEL = {
  Dual: 3,
  Trio: 2,
} as const;

export type AnchorCombination =
  keyof typeof ANCHOR_ASSUMED_LEVEL;