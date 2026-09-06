import {
  getAnchorAssumedAllocation,
} from "@/lib/domain/anchorPolicy";

import type {
  ElementAllocation,
} from "@/lib/domain/elements";

import type {
  TowerId,
} from "@/lib/domain/tower";

import {
  getTower,
} from "@/lib/domain/towerCatalog";

import {
  availableTowers,
  maxReachableTowerLevel,
  reachableAllocations,
  totalKeystones,
  type AvailableTower,
} from "@/lib/engine/allocation";

import {
  getCoreRoleFeasibility,
  type CoreRoleFeasibility,
} from "@/lib/engine/coreRoleDetection";

export type AnchorRouteState = {
  anchorTowerId: TowerId;

  allocation: ElementAllocation;

  /**
   * Normal element keystones spent after the
   * assumed anchor starting allocation.
   */
  additionalKeystones: number;

  /**
   * Total normal element keystones in this state.
   */
  totalKeystones: number;

  /**
   * All towers available at this allocation,
   * together with their maximum reachable level.
   */
  availableTowers: readonly AvailableTower[];

  /**
   * Generic role feasibility evidence for the state.
   */
  roleFeasibility: readonly CoreRoleFeasibility[];

  /**
   * The selected anchor's reachable level.
   */
  anchorReachableLevel: number;

  /**
   * Normal target level for the selected anchor.
   *
   * Dual anchor -> 3
   * Trio anchor -> 2
   */
  anchorTargetLevel: number;

  /**
   * True only when the selected anchor itself
   * is developed to its assumed anchor level.
   */
  anchorSatisfied: boolean;

  /**
   * Anchor + Slow + Damage Amp + Buff are all available.
   *
   * This does NOT require Slow / Damage Amp / Buff
   * to have reached their desired development depth.
   */
  coreFeasible: boolean;

  /**
   * Anchor is satisfied and Slow / Damage Amp / Buff
   * each have at least one candidate at desired depth.
   */
  coreDeveloped: boolean;
};

function supportRolesAreAvailable(
  statuses: readonly CoreRoleFeasibility[],
): boolean {
  return statuses
    .filter(
      (status) =>
        status.role !== "main-dps",
    )
    .every(
      (status) =>
        status.available,
    );
}

function supportRolesAreDeveloped(
  statuses: readonly CoreRoleFeasibility[],
): boolean {
  return statuses
    .filter(
      (status) =>
        status.role !== "main-dps",
    )
    .every(
      (status) =>
        status.developed,
    );
}

function evaluateAnchorRouteState(
  anchorTowerId: TowerId,
  start: ElementAllocation,
  allocation: ElementAllocation,
): AnchorRouteState {
  const anchor =
    getTower(anchorTowerId);

  const anchorReachableLevel =
    maxReachableTowerLevel(
      anchor,
      allocation,
    );

  const anchorTargetLevel =
    anchor.maxLevel;

  const anchorSatisfied =
    anchorReachableLevel >=
    anchorTargetLevel;

  const roleFeasibility =
    getCoreRoleFeasibility(
      allocation,
    );

  const towerAccess =
    availableTowers(
      allocation,
    );

  return {
    anchorTowerId,

    allocation,

    additionalKeystones:
      totalKeystones(allocation) -
      totalKeystones(start),

    totalKeystones:
      totalKeystones(allocation),

    availableTowers:
      towerAccess,

    roleFeasibility,

    anchorReachableLevel,

    anchorTargetLevel,

    anchorSatisfied,

    coreFeasible:
      anchorSatisfied &&
      supportRolesAreAvailable(
        roleFeasibility,
      ),

    coreDeveloped:
      anchorSatisfied &&
      supportRolesAreDeveloped(
        roleFeasibility,
      ),
  };
}

/**
 * Builds the complete normal-keystone search space
 * for a selected curated Build Lab anchor.
 *
 * The assumed anchor allocation is included as
 * route state 0.
 *
 * No ranking occurs here.
 */
export function getAnchorRouteStates(
  anchorTowerId: TowerId,
): readonly AnchorRouteState[] {
  const start =
    getAnchorAssumedAllocation(
      anchorTowerId,
    );

  const allocations = [
    start,
    ...reachableAllocations(start),
  ];

  return allocations.map(
    (allocation) =>
      evaluateAnchorRouteState(
        anchorTowerId,
        start,
        allocation,
      ),
  );
}

/**
 * Returns the earliest states where all mandatory support
 * roles are available alongside the selected anchor.
 *
 * "Earliest" means the fewest normal element keystones
 * spent after the assumed anchor starting allocation.
 *
 * Multiple states may tie at the same earliest depth.
 */
export function getEarliestCoreFeasibleStates(
  anchorTowerId: TowerId,
): readonly AnchorRouteState[] {
  const states =
    getAnchorRouteStates(anchorTowerId);

  const feasible =
    states.filter(
      (state) => state.coreFeasible,
    );

  if (feasible.length === 0) {
    return [];
  }

  const earliestAdditionalKeystones =
    Math.min(
      ...feasible.map(
        (state) =>
          state.additionalKeystones,
      ),
    );

  return feasible.filter(
    (state) =>
      state.additionalKeystones ===
      earliestAdditionalKeystones,
  );
}

/**
 * Returns the earliest states where the selected anchor
 * is satisfied and Slow, Damage Amp and Buff have all
 * reached their desired development depth.
 *
 * This is intentionally stronger than simple feasibility.
 */
export function getEarliestCoreDevelopedStates(
  anchorTowerId: TowerId,
): readonly AnchorRouteState[] {
  const states =
    getAnchorRouteStates(anchorTowerId);

  const developed =
    states.filter(
      (state) => state.coreDeveloped,
    );

  if (developed.length === 0) {
    return [];
  }

  const earliestAdditionalKeystones =
    Math.min(
      ...developed.map(
        (state) =>
          state.additionalKeystones,
      ),
    );

  return developed.filter(
    (state) =>
      state.additionalKeystones ===
      earliestAdditionalKeystones,
  );
}