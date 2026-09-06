import {
  ELEMENTS,
  type ElementAllocation,
  type ElementName,
} from "@/lib/domain/elements";

import type {
  CombinationClass,
  TowerId,
} from "@/lib/domain/tower";

import {
  getAnchorRouteStates,
} from "@/lib/engine/anchorRouteStates";

import {
  availableTowers,
  legalNextAllocations,
  totalKeystones,
} from "@/lib/engine/allocation";

export type TowerAccessChange = {
  towerId: TowerId;
  towerName: string;
  combination: CombinationClass;

  beforeLevel: number;
  afterLevel: number;

  change:
    | "newly-unlocked"
    | "deepened";
};

export type KeystoneTransitionEvaluation = {
  /**
   * Allocation before spending the keystone.
   */
  fromAllocation: ElementAllocation;

  /**
   * Allocation after spending exactly one
   * normal element keystone.
   */
  toAllocation: ElementAllocation;

  /**
   * Element that received the keystone.
   */
  element: ElementName;

  fromElementLevel: number;
  toElementLevel: number;

  fromTotalKeystones: number;
  toTotalKeystones: number;

  /**
   * Towers whose access changed because of this
   * exact keystone.
   *
   * Unchanged towers are intentionally omitted.
   */
  towerAccessChanges:
    readonly TowerAccessChange[];

  newlyUnlockedTowerIds:
    readonly TowerId[];

  deepenedTowerIds:
    readonly TowerId[];
};

function allocationsEqual(
  a: ElementAllocation,
  b: ElementAllocation,
): boolean {
  return ELEMENTS.every(
    (element) =>
      a[element] === b[element],
  );
}

function getChangedElement(
  before: ElementAllocation,
  after: ElementAllocation,
): ElementName {
  const changed =
    ELEMENTS.filter(
      (element) =>
        before[element] !==
        after[element],
    );

  if (changed.length !== 1) {
    throw new Error(
      "A keystone transition must change exactly one element.",
    );
  }

  const element = changed[0];

  if (
    after[element] !==
    before[element] + 1
  ) {
    throw new Error(
      "A keystone transition must increase one element by exactly one level.",
    );
  }

  return element;
}

/**
 * Evaluates the access delta produced by exactly
 * one legal normal-element keystone.
 *
 * No package selection or ranking occurs here.
 */
export function evaluateKeystoneTransition(
  before: ElementAllocation,
  after: ElementAllocation,
): KeystoneTransitionEvaluation {
  const legal =
    legalNextAllocations(
      before,
    ).some(
      (candidate) =>
        allocationsEqual(
          candidate,
          after,
        ),
    );

  if (!legal) {
    throw new Error(
      "Allocation is not a legal one-keystone continuation.",
    );
  }

  const element =
    getChangedElement(
      before,
      after,
    );

  const beforeAccess =
    new Map(
      availableTowers(
        before,
      ).map(
        (entry) => [
          entry.tower.id,
          entry.maxLevel,
        ],
      ),
    );

  const afterAccess =
    availableTowers(
      after,
    );

  const towerAccessChanges:
    TowerAccessChange[] = [];

  for (const entry of afterAccess) {
    const beforeLevel =
      beforeAccess.get(
        entry.tower.id,
      ) ?? 0;

    if (
      entry.maxLevel ===
      beforeLevel
    ) {
      continue;
    }

    towerAccessChanges.push({
      towerId:
        entry.tower.id,

      towerName:
        entry.tower.name,

      combination:
        entry.tower.combination,

      beforeLevel,

      afterLevel:
        entry.maxLevel,

      change:
        beforeLevel === 0
          ? "newly-unlocked"
          : "deepened",
    });
  }

  return {
    fromAllocation:
      before,

    toAllocation:
      after,

    element,

    fromElementLevel:
      before[element],

    toElementLevel:
      after[element],

    fromTotalKeystones:
      totalKeystones(
        before,
      ),

    toTotalKeystones:
      totalKeystones(
        after,
      ),

    towerAccessChanges,

    newlyUnlockedTowerIds:
      towerAccessChanges
        .filter(
          (change) =>
            change.change ===
            "newly-unlocked",
        )
        .map(
          (change) =>
            change.towerId,
        ),

    deepenedTowerIds:
      towerAccessChanges
        .filter(
          (change) =>
            change.change ===
            "deepened",
        )
        .map(
          (change) =>
            change.towerId,
        ),
  };
}

/**
 * Builds every legal one-keystone edge in the
 * future search graph for a selected anchor.
 *
 * A target allocation may have multiple incoming
 * transitions because different keystone sequences
 * can reach the same state.
 *
 * Those are intentionally preserved.
 */
export function getAnchorKeystoneTransitions(
  anchorTowerId: TowerId,
): readonly KeystoneTransitionEvaluation[] {
  const states =
    getAnchorRouteStates(
      anchorTowerId,
    );

  return states.flatMap(
    (state) =>
      legalNextAllocations(
        state.allocation,
      ).map(
        (next) =>
          evaluateKeystoneTransition(
            state.allocation,
            next,
          ),
      ),
  );
}