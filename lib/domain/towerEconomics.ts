import towerEconomicsData
  from "@/data/towerEconomics.v1.json";

import type {
  CombinationClass,
  TowerId,
} from "./tower";

import {
  getTower,
} from "./towerCatalog";

export const NORMAL_TOWER_COST_SEMANTICS =
  "cumulative-minimum-field-cost" as const;

export type NormalTowerCostSemantics =
  typeof NORMAL_TOWER_COST_SEMANTICS;

export type TowerEconomicsCatalog = {
  schemaVersion: 1;
  currency: "gold";
  costSemantics:
    NormalTowerCostSemantics;
  definition: string;
  verifiedThrough: {
    date: string;
    announcement: string;
    note: string;
  };
  costsByCombination:
    Readonly<Record<
      CombinationClass,
      readonly number[]
    >>;
  /** Null until the owner supplies the verified in-game sell rate. */
  sellRefund?: {
    fraction: number | null;
    note: string;
  };
  sources: readonly {
    label: string;
    url: string;
    supports: string;
  }[];
};

export const TOWER_ECONOMICS_CATALOG =
  towerEconomicsData as
    TowerEconomicsCatalog;

export type ResolvedNormalTowerCost = {
  towerId: TowerId;
  level: number;
  currency: "gold";
  costSemantics:
    NormalTowerCostSemantics;
  minimumFieldCost: number;
};

/**
 * Resolves the verified total gold needed to field one copy of a
 * normal tower at the shown level.
 *
 * Catalog values are cumulative totals. The indexed level value is
 * returned directly; earlier entries are deliberately not summed.
 */
export function resolveNormalTowerCost(
  towerId: TowerId,
  level: number,
): ResolvedNormalTowerCost {
  const tower = getTower(towerId);

  if (
    !Number.isInteger(level) ||
    level < 1 ||
    level > tower.maxLevel
  ) {
    throw new Error(
      `Invalid cost level ${level} for ${towerId}; expected 1-${tower.maxLevel}.`,
    );
  }

  const minimumFieldCost =
    TOWER_ECONOMICS_CATALOG
      .costsByCombination[
        tower.combination
      ][level - 1];

  if (
    !Number.isFinite(
      minimumFieldCost,
    ) ||
    minimumFieldCost <= 0
  ) {
    throw new Error(
      `Missing verified level ${level} cost for ${towerId}.`,
    );
  }

  return {
    towerId,
    level,
    currency: "gold",
    costSemantics:
      NORMAL_TOWER_COST_SEMANTICS,
    minimumFieldCost,
  };
}

/**
 * Fraction of a tower's cumulative gold cost returned on sale, or null when
 * the catalog does not carry a verified value. Callers must treat null as
 * "selling is not modeled", never as zero.
 */
export function sellRefundFraction(): number | null {
  const fraction =
    TOWER_ECONOMICS_CATALOG.sellRefund?.fraction ?? null;
  return fraction != null &&
    Number.isFinite(fraction) &&
    fraction > 0 &&
    fraction <= 1
    ? fraction
    : null;
}
