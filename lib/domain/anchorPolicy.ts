import type { ElementAllocation } from "./elements";

import { getTower } from "./towerCatalog";

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
 * Dual anchor -> 3-3
 * Trio anchor -> 2-2-2
 *
 * Quad is intentionally absent because the governing
 * engine logic currently defines Dual and Trio anchor
 * starting assumptions only.
 */
export const ANCHOR_ASSUMED_LEVEL = {
  Dual: 3,
  Trio: 2,
} as const;

export type AnchorCombination = keyof typeof ANCHOR_ASSUMED_LEVEL;

export const CURATED_ANCHORS: readonly CuratedAnchor[] = [
  // Dual anchors
  { towerId: "atom" },
  { towerId: "poison" },
  { towerId: "vapor" },
  { towerId: "infernal" },
  { towerId: "bloom" },
  { towerId: "howitzer" },
  { towerId: "lightning" },
  { towerId: "disease" },
  { towerId: "ice" },
  { towerId: "solar" },
  { towerId: "mushroom" },
  { towerId: "geyser" },

  // Trio anchors
  { towerId: "astral" },
  { towerId: "runic" },
  { towerId: "flooding" },
  { towerId: "flamethrower" },
  { towerId: "impulse" },
  { towerId: "laser" },
  { towerId: "ethereal" },
  { towerId: "wisp" },
  { towerId: "haste" },
  { towerId: "quake" },
];

export function isCuratedAnchor(towerId: TowerId): boolean {
  return CURATED_ANCHORS.some((anchor) => anchor.towerId === towerId);
}

function emptyAllocation(): ElementAllocation {
  return {
    Light: 0,
    Darkness: 0,
    Water: 0,
    Fire: 0,
    Nature: 0,
    Earth: 0,
  };
}

/**
 * Returns the assumed Build Lab starting allocation
 * for a curated anchor.
 *
 * Dual:
 *   recipe elements -> Level 3
 *
 * Trio:
 *   recipe elements -> Level 2
 *
 * This is a planning assumption, not a claim about
 * the player's current live-game allocation.
 */
export function getAnchorAssumedAllocation(
  towerId: TowerId,
): ElementAllocation {
  if (!isCuratedAnchor(towerId)) {
    throw new Error(`Tower is not a curated Build Lab anchor: ${towerId}`);
  }

  const tower = getTower(towerId);

  if (tower.combination !== "Dual" && tower.combination !== "Trio") {
    throw new Error(`Unsupported anchor combination: ${tower.combination}`);
  }

  const assumedLevel = ANCHOR_ASSUMED_LEVEL[tower.combination];

  const allocation = emptyAllocation();

  for (const element of tower.recipe) {
    allocation[element] = assumedLevel;
  }

  return allocation;
}
