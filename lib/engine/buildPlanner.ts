import {
  getAnchorAssumedAllocation,
} from "@/lib/domain/anchorPolicy";

import {
  ELEMENTS,
  type ElementAllocation,
} from "@/lib/domain/elements";

import {
  ELEMENT_MATCHUPS,
} from "@/lib/domain/elementMatchupCatalog";

import type {
  ElementMatchupTable,
} from "@/lib/domain/elementMatchups";

import type {
  TowerId,
} from "@/lib/domain/tower";

import {
  legalNextAllocations,
} from "@/lib/engine/allocation";

import {
  evaluateAnchorPackages,
  type AnchorPackageEvaluation,
} from "@/lib/engine/anchorPackageEvaluations";

import {
  evaluatePackageAdditions,
  type CandidateAdditionEvaluation,
} from "@/lib/engine/candidateAdditionEvaluations";

import {
  getCoreRoleFeasibility,
  type CoreRoleFeasibility,
} from "@/lib/engine/coreRoleDetection";

import type {
  CorePackageEvidence,
} from "@/lib/engine/corePackageEvidence";

import {
  evaluateKeystoneTransition,
  type KeystoneTransitionEvaluation,
} from "@/lib/engine/keystoneTransitions";

/**
 * Explicit planner evidence.
 *
 * This is NOT a weighted score.
 *
 * The fields are compared lexicographically according
 * to Build Lab's strategic doctrine.
 */
export type PlannerDecision = {
  coreDeveloped: boolean;

  slowDeveloped: boolean;
  damageAmpDeveloped: boolean;
  buffDeveloped: boolean;

  anchorDefiningSynergyCount: number;
  anchorStrongSynergyCount: number;

  fullSynergyStrength: number;
  diminishedSynergyStrength: number;

  elementWeaknessesCovered: number;
  elementWeaknessesRemaining: number;

  damageShapeComplementary: boolean;

  rangeExtensionFromAnchor: number;

  /**
   * Number of distinct strategic dimensions improved
   * by an optional tower:
   *
   * synergy
   * element coverage
   * damage-shape coverage
   * range coverage
   * mechanic tension reduction
   */
  multiPurposeDimensionCount: number;

  tensionCount: number;

  /**
   * New tensions introduced by the optional addition.
   */
  newTensionCount: number;

  totalKeystones: number;

  optionalTowerReachableLevel: number;

  selectedTowerCount: number;
};

export type PlannedKeystoneStep = {
  transition:
    KeystoneTransitionEvaluation;

  /**
   * Core-role status immediately after
   * this keystone.
   */
  roleFeasibility:
    readonly CoreRoleFeasibility[];
};

export type RankedBuildPlan = {
  anchorTowerId: TowerId;

  /**
   * Minimum core package used as the baseline.
   */
  baseline:
    AnchorPackageEvaluation;

  /**
   * Optional strategic addition.
   *
   * null means the core package itself is
   * the evaluated final package.
   */
  optionalTowerId:
    TowerId | null;

  selectedTowerIds:
    readonly TowerId[];

  evidence:
    CorePackageEvidence;

  decision:
    PlannerDecision;

  /**
   * Preferred order for reaching the already-selected
   * final allocation.
   *
   * Final allocation selection happened BEFORE this
   * sequence is reconstructed, so this is not a greedy
   * final-build search.
   */
  keystonePath:
    readonly PlannedKeystoneStep[];
};

type UnpathedBuildPlan =
  Omit<
    RankedBuildPlan,
    "keystonePath"
  >;

type EvidenceMetrics = {
  anchorDefiningSynergyCount: number;
  anchorStrongSynergyCount: number;

  fullSynergyStrength: number;
  diminishedSynergyStrength: number;

  elementWeaknessesCovered: number;
  elementWeaknessesRemaining: number;

  damageShapeComplementary: boolean;

  rangeExtensionFromAnchor: number;

  tensionCount: number;
};

function roleDeveloped(
  baseline: AnchorPackageEvaluation,
  role:
    | "slow"
    | "damage-amp"
    | "buff",
): boolean {
  const evidence =
    baseline.package.roles.find(
      (entry) =>
        entry.role === role,
    );

  return evidence?.developed ?? false;
}

function measureEvidence(
  evidence: CorePackageEvidence,
): EvidenceMetrics {
  const anchorId =
    evidence.anchorTowerId;

  const applicable =
    evidence.synergy.applicable.filter(
      (match) =>
        match.contribution !==
        "ignored",
    );

  const anchorSynergies =
    applicable.filter(
      (match) =>
        match.providerTowerId ===
          anchorId ||
        match.consumerTowerId ===
          anchorId,
    );

  const anchorDefiningSynergyCount =
    anchorSynergies.filter(
      (match) =>
        match.contribution ===
          "full" &&
        match.effectiveStrength ===
          4,
    ).length;

  const anchorStrongSynergyCount =
    anchorSynergies.filter(
      (match) =>
        match.contribution ===
          "full" &&
        match.effectiveStrength >=
          3,
    ).length;

  const fullSynergyStrength =
    applicable
      .filter(
        (match) =>
          match.contribution ===
          "full",
      )
      .reduce(
        (total, match) =>
          total +
          match.effectiveStrength,
        0,
      );

  const diminishedSynergyStrength =
    applicable
      .filter(
        (match) =>
          match.contribution ===
          "diminished",
      )
      .reduce(
        (total, match) =>
          total +
          match.effectiveStrength,
        0,
      );

  const anchorWeaknesses =
    evidence.coverage.element.filter(
      (entry) =>
        entry.anchorMultiplier ===
        0.5,
    );

  const elementWeaknessesCovered =
    anchorWeaknesses.filter(
      (entry) =>
        entry.hasDirectCounter,
    ).length;

  const elementWeaknessesRemaining =
    anchorWeaknesses.length -
    elementWeaknessesCovered;

  return {
    anchorDefiningSynergyCount,
    anchorStrongSynergyCount,

    fullSynergyStrength,
    diminishedSynergyStrength,

    elementWeaknessesCovered,
    elementWeaknessesRemaining,

    damageShapeComplementary:
      evidence.coverage
        .damageShape
        .hasComplementaryShape,

    rangeExtensionFromAnchor:
      evidence.coverage
        .range
        .rangeExtensionFromAnchor,

    tensionCount:
      evidence.synergy
        .tensions.length,
  };
}

function countMultiPurposeDimensions(
  before: CorePackageEvidence,
  after: CorePackageEvidence,
): number {
  const beforeMetrics =
    measureEvidence(before);

  const afterMetrics =
    measureEvidence(after);

  let dimensions = 0;

  const synergyImproved =
    afterMetrics
      .anchorDefiningSynergyCount >
      beforeMetrics
        .anchorDefiningSynergyCount ||
    afterMetrics
      .anchorStrongSynergyCount >
      beforeMetrics
        .anchorStrongSynergyCount ||
    afterMetrics
      .fullSynergyStrength >
      beforeMetrics
        .fullSynergyStrength;

  if (synergyImproved) {
    dimensions += 1;
  }

  if (
    afterMetrics
      .elementWeaknessesCovered >
    beforeMetrics
      .elementWeaknessesCovered
  ) {
    dimensions += 1;
  }

  if (
    !beforeMetrics
      .damageShapeComplementary &&
    afterMetrics
      .damageShapeComplementary
  ) {
    dimensions += 1;
  }

  if (
    afterMetrics
      .rangeExtensionFromAnchor >
    beforeMetrics
      .rangeExtensionFromAnchor
  ) {
    dimensions += 1;
  }

  if (
    afterMetrics.tensionCount <
    beforeMetrics.tensionCount
  ) {
    dimensions += 1;
  }

  return dimensions;
}

export function buildPlannerDecision(
  baseline: AnchorPackageEvaluation,
  evidence: CorePackageEvidence,
  addition:
    CandidateAdditionEvaluation | null =
      null,
): PlannerDecision {
  const metrics =
    measureEvidence(
      evidence,
    );

  const beforeTensionCount =
    addition
      ? measureEvidence(
          addition.beforeEvidence,
        ).tensionCount
      : metrics.tensionCount;

  return {
    coreDeveloped:
      baseline.package
        .coreDeveloped,

    slowDeveloped:
      roleDeveloped(
        baseline,
        "slow",
      ),

    damageAmpDeveloped:
      roleDeveloped(
        baseline,
        "damage-amp",
      ),

    buffDeveloped:
      roleDeveloped(
        baseline,
        "buff",
      ),

    anchorDefiningSynergyCount:
      metrics
        .anchorDefiningSynergyCount,

    anchorStrongSynergyCount:
      metrics
        .anchorStrongSynergyCount,

    fullSynergyStrength:
      metrics
        .fullSynergyStrength,

    diminishedSynergyStrength:
      metrics
        .diminishedSynergyStrength,

    elementWeaknessesCovered:
      metrics
        .elementWeaknessesCovered,

    elementWeaknessesRemaining:
      metrics
        .elementWeaknessesRemaining,

    damageShapeComplementary:
      metrics
        .damageShapeComplementary,

    rangeExtensionFromAnchor:
      metrics
        .rangeExtensionFromAnchor,

    multiPurposeDimensionCount:
      addition
        ? countMultiPurposeDimensions(
            addition.beforeEvidence,
            addition.afterEvidence,
          )
        : 0,

    tensionCount:
      metrics.tensionCount,

    newTensionCount:
      Math.max(
        0,
        metrics.tensionCount -
          beforeTensionCount,
      ),

    totalKeystones:
      baseline.routeState
        .totalKeystones,

    optionalTowerReachableLevel:
      addition?.candidateReachableLevel ??
      0,

    selectedTowerCount:
      evidence
        .selectedTowerIds.length,
  };
}

/**
 * Planner policy encoded as an ordered decision vector.
 *
 * Higher is better for every position.
 *
 * There is deliberately no weighted scalar score.
 */
function decisionVector(
  decision: PlannerDecision,
): readonly number[] {
  return [
    // Mandatory package development first.
    decision.coreDeveloped ? 1 : 0,

    decision.slowDeveloped ? 1 : 0,
    decision.damageAmpDeveloped ? 1 : 0,
    decision.buffDeveloped ? 1 : 0,

    // Defining anchor interaction may outrank
    // ordinary coverage repair.
    decision
      .anchorDefiningSynergyCount,

    // Prefer one investment doing multiple jobs.
    decision
      .multiPurposeDimensionCount,

    decision
      .anchorStrongSynergyCount,

    // Contextual optimization evidence.
    decision
      .elementWeaknessesCovered,

    decision
      .damageShapeComplementary
      ? 1
      : 0,

    decision
      .fullSynergyStrength,

    decision
      .rangeExtensionFromAnchor,

    decision
      .diminishedSynergyStrength,

    // Lower unresolved weakness is better.
    -decision
      .elementWeaknessesRemaining,

    // Lower mechanic conflict is better.
    -decision.tensionCount,

    -decision.newTensionCount,

    // If two routes create equivalent strategic
    // value, prefer the cheaper keystone route.
    -decision.totalKeystones,

    // Late deterministic tie-breakers.
    decision
      .optionalTowerReachableLevel,

    -decision.selectedTowerCount,
  ];
}

/**
 * Array.sort-compatible comparator.
 *
 * Negative means A ranks ahead of B.
 */
export function comparePlannerDecisions(
  a: PlannerDecision,
  b: PlannerDecision,
): number {
  const aVector =
    decisionVector(a);

  const bVector =
    decisionVector(b);

  for (
    let index = 0;
    index < aVector.length;
    index += 1
  ) {
    const aValue =
      aVector[index];

    const bValue =
      bVector[index];

    if (aValue > bValue) {
      return -1;
    }

    if (aValue < bValue) {
      return 1;
    }
  }

  return 0;
}

function allocationEquals(
  a: ElementAllocation,
  b: ElementAllocation,
): boolean {
  return ELEMENTS.every(
    (element) =>
      a[element] ===
      b[element],
  );
}

function allocationFitsTarget(
  allocation: ElementAllocation,
  target: ElementAllocation,
): boolean {
  return ELEMENTS.every(
    (element) =>
      allocation[element] <=
      target[element],
  );
}

function getRole(
  statuses:
    readonly CoreRoleFeasibility[],
  role:
    | "slow"
    | "damage-amp"
    | "buff",
): CoreRoleFeasibility {
  const status =
    statuses.find(
      (entry) =>
        entry.role === role,
    );

  if (!status) {
    throw new Error(
      `Missing planner role status: ${role}`,
    );
  }

  return status;
}

/**
 * When the final target allocation is already known,
 * this vector decides the preferred ordering of the
 * necessary keystones.
 *
 * It does NOT choose the final allocation.
 */
function pathStepVector(
  statuses:
    readonly CoreRoleFeasibility[],
  transition:
    KeystoneTransitionEvaluation,
  selectedTowerIds:
    ReadonlySet<TowerId>,
): readonly number[] {
  const slow =
    getRole(
      statuses,
      "slow",
    );

  const damageAmp =
    getRole(
      statuses,
      "damage-amp",
    );

  const buff =
    getRole(
      statuses,
      "buff",
    );

  const selectedAccessChanges =
    transition
      .towerAccessChanges
      .filter(
        (change) =>
          selectedTowerIds.has(
            change.towerId,
          ),
      );

  const selectedUnlocks =
    selectedAccessChanges
      .filter(
        (change) =>
          change.change ===
          "newly-unlocked",
      ).length;

  const selectedDeepenings =
    selectedAccessChanges
      .filter(
        (change) =>
          change.change ===
          "deepened",
      ).length;

  return [
    slow.available ? 1 : 0,
    damageAmp.available ? 1 : 0,
    buff.available ? 1 : 0,

    slow.developed ? 1 : 0,
    damageAmp.developed ? 1 : 0,
    buff.developed ? 1 : 0,

    selectedUnlocks,
    selectedDeepenings,

    selectedAccessChanges.length,
  ];
}

function compareNumericVectors(
  a: readonly number[],
  b: readonly number[],
): number {
  for (
    let index = 0;
    index <
    Math.min(
      a.length,
      b.length,
    );
    index += 1
  ) {
    if (a[index] > b[index]) {
      return -1;
    }

    if (a[index] < b[index]) {
      return 1;
    }
  }

  return 0;
}

/**
 * Reconstructs a preferred shortest sequence to an
 * already-selected final allocation.
 *
 * Because allocations only increase by one level,
 * every valid sequence to the target has the same
 * keystone count.
 */
export function buildPreferredKeystonePath(
  anchorTowerId: TowerId,
  target: ElementAllocation,
  selectedTowerIds:
    readonly TowerId[],
): readonly PlannedKeystoneStep[] {
  let current =
    getAnchorAssumedAllocation(
      anchorTowerId,
    );

  const selected =
    new Set(
      selectedTowerIds,
    );

  const path:
    PlannedKeystoneStep[] = [];

  while (
    !allocationEquals(
      current,
      target,
    )
  ) {
    const options =
      legalNextAllocations(
        current,
      )
        .filter(
          (next) =>
            allocationFitsTarget(
              next,
              target,
            ),
        )
        .map(
          (next) => {
            const transition =
              evaluateKeystoneTransition(
                current,
                next,
              );

            const statuses =
              getCoreRoleFeasibility(
                next,
              );

            return {
              next,
              transition,
              statuses,
              vector:
                pathStepVector(
                  statuses,
                  transition,
                  selected,
                ),
            };
          },
        );

    if (options.length === 0) {
      throw new Error(
        "Could not reconstruct legal path to target allocation.",
      );
    }

    options.sort(
      (a, b) => {
        const comparison =
          compareNumericVectors(
            a.vector,
            b.vector,
          );

        if (comparison !== 0) {
          return comparison;
        }

        /*
         * Deterministic final tie-breaker:
         * canonical element order.
         */
        return (
          ELEMENTS.indexOf(
            a.transition.element,
          ) -
          ELEMENTS.indexOf(
            b.transition.element,
          )
        );
      },
    );

    const chosen =
      options[0];

    path.push({
      transition:
        chosen.transition,

      roleFeasibility:
        chosen.statuses,
    });

    current =
      chosen.next;
  }

  return path;
}

function makeBaselinePlan(
  baseline: AnchorPackageEvaluation,
): UnpathedBuildPlan {
  return {
    anchorTowerId:
      baseline.package
        .anchorTowerId,

    baseline,

    optionalTowerId:
      null,

    selectedTowerIds:
      baseline.package
        .selectedTowerIds,

    evidence:
      baseline.evidence,

    decision:
      buildPlannerDecision(
        baseline,
        baseline.evidence,
      ),
  };
}

function makeAdditionPlan(
  addition: CandidateAdditionEvaluation,
): UnpathedBuildPlan {
  return {
    anchorTowerId:
      addition.baseline
        .package
        .anchorTowerId,

    baseline:
      addition.baseline,

    optionalTowerId:
      addition.candidateTowerId,

    selectedTowerIds:
      addition.afterEvidence
        .selectedTowerIds,

    evidence:
      addition.afterEvidence,

    decision:
      buildPlannerDecision(
        addition.baseline,
        addition.afterEvidence,
        addition,
      ),
  };
}

function deterministicPlanKey(
  plan: UnpathedBuildPlan,
): string {
  return [
    plan.baseline
      .routeState
      .totalKeystones,

    ...ELEMENTS.map(
      (element) =>
        plan.baseline
          .routeState
          .allocation[element],
    ),

    ...[
      ...plan.selectedTowerIds,
    ].sort(),
  ].join("|");
}

/**
 * Searches the complete legal future allocation space,
 * evaluates actual selected core packages and optional
 * tower additions, and ranks those complete outcomes.
 *
 * The ranking happens AFTER future-state enumeration,
 * so this is not a greedy next-keystone algorithm.
 */
export function rankAnchorBuildPlans(
  anchorTowerId: TowerId,
  limit = 10,
  matchups:
    ElementMatchupTable =
      ELEMENT_MATCHUPS,
): readonly RankedBuildPlan[] {
  if (limit <= 0) {
    return [];
  }

  const candidates:
    UnpathedBuildPlan[] = [];

  const baselines =
    evaluateAnchorPackages(
      anchorTowerId,
      matchups,
    );

  for (const baseline of baselines) {
    candidates.push(
      makeBaselinePlan(
        baseline,
      ),
    );

    const additions =
      evaluatePackageAdditions(
        baseline,
        matchups,
      );

    for (const addition of additions) {
      candidates.push(
        makeAdditionPlan(
          addition,
        ),
      );
    }
  }

  candidates.sort(
    (a, b) => {
      const decisionComparison =
        comparePlannerDecisions(
          a.decision,
          b.decision,
        );

      if (
        decisionComparison !== 0
      ) {
        return decisionComparison;
      }

      return deterministicPlanKey(
        a,
      ).localeCompare(
        deterministicPlanKey(
          b,
        ),
      );
    },
  );

  return candidates
    .slice(
      0,
      limit,
    )
    .map(
      (candidate) => ({
        ...candidate,

        keystonePath:
          buildPreferredKeystonePath(
            anchorTowerId,
            candidate.baseline
              .routeState
              .allocation,
            candidate
              .selectedTowerIds,
          ),
      }),
    );
}

export function getBestAnchorBuildPlan(
  anchorTowerId: TowerId,
  matchups:
    ElementMatchupTable =
      ELEMENT_MATCHUPS,
): RankedBuildPlan | null {
  return (
    rankAnchorBuildPlans(
      anchorTowerId,
      1,
      matchups,
    )[0] ?? null
  );
}