import placementFactData from "@/data/towerPlacementFacts.v1.json";

import type { TowerId } from "@/lib/domain/tower";

/**
 * Where along a creep's route a tower wants to engage.
 *
 * Derived from a mechanic-level statement only — never from a debuff's
 * duration, which the placement scorer already accounts for directly.
 * `late` means the tower's damage scales with how hurt the target
 * already is (Disease's missing-HP scaling; Doom's and Obelisk's
 * "Back-loaded" tag). `front` means the mechanic explicitly wants to act
 * before anything else does (Polar's "Pre-damage HP shaving"; Shredder
 * splitting a creep, whose halves then need route left to be killed on).
 */
export type RoutePreference = "front" | "anywhere" | "late";

/**
 * How a tower wants its covered path spread across its own range circle.
 *
 * `spread` is Howitzer: "AoE increases with distance… damage increases as
 * target gets closer", so it wants the route to pass both far and near.
 * `far` is Impulse, whose multiplier scales with projectile travel.
 * `near` is a short-range tower whose circle is small to begin with.
 */
export type RadialPreference = "near" | "far" | "spread" | "any";

export type TowerPlacementFact = {
  towerId: TowerId;
  /**
   * The verbatim `data/mechanics.json` strings this row was derived
   * from, so every non-default field stays auditable against its source
   * rather than becoming an unexplained constant.
   */
  evidence: {
    coreMechanic: string;
    buildPosition: string;
  };
  /**
   * A debuff this tower applies to creeps, if any. `durationSeconds`
   * null means it runs for the rest of the route (Nuclear's permanent
   * radiation). `permanentEffect` records that the effect does not
   * revert once applied — true for Polar, whose removed HP never comes
   * back even though the application window is 30s.
   */
  debuff: null | {
    durationSeconds: number | null;
    permanentEffect: boolean;
  };
  routePreference: RoutePreference;
  radialPreference: RadialPreference;
  /**
   * True when the tower's effect lands on towers rather than creeps
   * (Blacksmith, Well, Trickery, Life Altar). Route position is
   * meaningless for these — what matters is the damage output standing
   * inside their radius.
   */
  targetsTowers: boolean;
};

export type TowerPlacementFactCatalog = {
  schemaVersion: 1;
  facts: readonly TowerPlacementFact[];
};

export const TOWER_PLACEMENT_FACTS =
  placementFactData as TowerPlacementFactCatalog;

const BY_ID = new Map<string, TowerPlacementFact>(
  TOWER_PLACEMENT_FACTS.facts.map((fact) => [fact.towerId, fact]),
);

/**
 * Neutral facts for anything the catalog doesn't cover — mono towers,
 * Arrow/Cannon, end-game forms, and the 27 normal towers whose mechanics
 * imply no placement preference. These reproduce plain damage scoring
 * rather than asserting a preference nothing in the data supports.
 */
export const NEUTRAL_PLACEMENT_FACT: Omit<TowerPlacementFact, "towerId"> = {
  evidence: { coreMechanic: "", buildPosition: "" },
  debuff: null,
  routePreference: "anywhere",
  radialPreference: "any",
  targetsTowers: false,
};

export function getTowerPlacementFact(towerId: string): TowerPlacementFact {
  return (
    BY_ID.get(towerId) ?? {
      ...NEUTRAL_PLACEMENT_FACT,
      towerId: towerId as TowerId,
    }
  );
}
