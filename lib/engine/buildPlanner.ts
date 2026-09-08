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
  MAX_KEYSTONES,
} from "@/lib/engine/allocation";

import {
  evaluateAnchorPackages,
  type AnchorPackageEvaluation,
} from "@/lib/engine/anchorPackageEvaluations";

import type {
  CandidateAdditionEvaluation,
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

import {
  emptyNormalPackageSearchDiagnostics,
  mergeNormalPackageSearchDiagnostics,
  normalPackageContextDominates,
  normalPackageContextSignature,
  searchNormalPackagesForBaseline,
  type NormalPackageSearchDiagnostics,
  type NormalPackageSearchResult,
} from "@/lib/engine/normalPackageSearch";

import {
  evaluateNormalPackageEconomics,
  minimumNormalPackageCapital,
  type NormalPackageEconomics,
} from "@/lib/engine/normalPackageEconomics";

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

  persistentSynergyStrength: number;
  intermittentSynergyStrength: number;

  /**
   * Full synergies whose provider effect must be manually cast every
   * cooldown (Life Altar's buffs). Ranked in its own strictly-lowest
   * synergy tier — a buff the player has to babysit is a disadvantage in
   * itself and must never outrank an automatic or on-hit equivalent.
   */
  manualActivationSynergyStrength: number;

  unknownAvailabilitySynergyStrength: number;

  elementWeaknessesCovered: number;
  elementWeaknessesRemaining: number;

  damageShapeComplementary: boolean;

  /**
   * Summed verified percent magnitude of the team damage / attack-speed
   * buffs the package actually realises at its reachable levels
   * (Blacksmith and Well scale 10 -> 30 -> 90 across L1-L3). A baseline
   * that develops a selected buff tower to L3 realises far more of this
   * than one that stops at L2 and instead fields another marginal tower,
   * so this dimension lets buff development outrank discretionary breadth.
   */
  realizedBuffMagnitude: number;

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

  /**
   * Basic-attack DPS from canonical damage and attack-speed facts
   * at the optional tower's actual reachable level. Ability damage
   * and uptime are intentionally excluded.
   */
  optionalTowerBaseDps: number;

  /**
   * Sum of reachable levels for towers actually selected into
   * the package. This is a late tie-break only; unlike raw access
   * breadth, every counted level belongs to the recommended build.
   */
  selectedTowerReachableLevelTotal: number;

  /**
   * Minimum verified gold needed to field one copy of every selected
   * normal tower at its recommended level. This is a cumulative field
   * cost, not a budget cap or a score-per-gold term.
   */
  minimumNormalPackageCapital: number;

  /**
   * Diagnostic access breadth. These fields are exposed for
   * inspection only and never participate in plan ranking.
   */
  availableQuadCount: number;
  availableTowerCount: number;

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
   * Compatibility projection for legacy API consumers.
   * Exactly one post-core tower maps to its ID; zero or multiple map to null.
   * Planner logic must use postCoreTowerIds.
   */
  optionalTowerId:
    TowerId | null;

  /**
   * Every strategically justified tower selected after the mandatory
   * Anchor / Slow / Damage Amp / Buff core.
   */
  postCoreTowerIds:
    readonly TowerId[];

  selectedTowerIds:
    readonly TowerId[];

  evidence:
    CorePackageEvidence;

  minimumNormalPackageCapital: number;

  normalPackageEconomics:
    NormalPackageEconomics;

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

type CandidateBuildPlan =
  Omit<
    UnpathedBuildPlan,
    "normalPackageEconomics"
  >;

type EvidenceMetrics = {
  anchorDefiningSynergyCount: number;
  anchorStrongSynergyCount: number;

  fullSynergyStrength: number;
  diminishedSynergyStrength: number;

  persistentSynergyStrength: number;
  intermittentSynergyStrength: number;
  manualActivationSynergyStrength: number;
  unknownAvailabilitySynergyStrength: number;

  elementWeaknessesCovered: number;
  elementWeaknessesRemaining: number;

  damageShapeComplementary: boolean;

  rangeExtensionFromAnchor: number;

  tensionCount: number;
};

const SCALING_BUFF_SIGNALS:
  ReadonlySet<string> = new Set([
  "attack-damage-buff",
  "attack-speed-buff",
]);

/**
 * Summed verified percent magnitude of team damage / attack-speed buffs
 * realised by the package at its reachable levels, counting only towers
 * whose buff actually scales with level (Blacksmith and Well: 10 -> 30
 * -> 90 across L1-L3). Flat Quad buffs (Life Altar) are excluded — they
 * contribute the same magnitude in every legal build, so they cannot
 * express the "develop the buff to L3 vs. add another tower" trade-off.
 */
function realizedBuffMagnitude(
  evidence: CorePackageEvidence,
): number {
  let total = 0;

  for (const contribution of
    evidence.resolvedContributions) {
    if (
      contribution.maxNormalLevel < 2
    ) {
      continue;
    }

    for (const fact of
      contribution.supportedAbilityFacts) {
      if (
        SCALING_BUFF_SIGNALS.has(
          fact.signal,
        ) &&
        fact.magnitude?.unit ===
          "percent" &&
        typeof fact.magnitude.value ===
          "number"
      ) {
        total += fact.magnitude.value;
      }
    }
  }

  return total;
}

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

  const availabilityClassFor = (
    providerTowerId: TowerId,
    signal: string,
  ) =>
    evidence
      .resolvedContributions
      .find(
        (entry) =>
          entry.towerId ===
          providerTowerId,
      )
      ?.supportedAbilityFacts
      .find(
        (effect) =>
          effect.signal === signal,
      )
      ?.availability
      .classification ??
    "unknown";

  const requiresActiveCast = (
    providerTowerId: TowerId,
    signal: string,
  ) =>
    evidence
      .resolvedContributions
      .find(
        (entry) =>
          entry.towerId ===
          providerTowerId,
      )
      ?.supportedAbilityFacts
      .find(
        (effect) =>
          effect.signal === signal,
      )
      ?.availability
      .activationRequirement ===
    "active-cast";

  const fullByAvailability =
    applicable.filter(
      (match) =>
        match.contribution ===
        "full",
    );

  const persistentSynergyStrength =
    fullByAvailability
      .filter(
        (match) =>
          !requiresActiveCast(
            match.providerTowerId,
            match.signal,
          ) &&
          availabilityClassFor(
            match.providerTowerId,
            match.signal,
          ) ===
            "effectively-continuous",
      )
      .reduce(
        (total, match) =>
          total +
          match.effectiveStrength,
        0,
      );

  const intermittentSynergyStrength =
    fullByAvailability
      .filter((match) => {
        if (
          requiresActiveCast(
            match.providerTowerId,
            match.signal,
          )
        ) {
          return false;
        }

        const availability =
          availabilityClassFor(
            match.providerTowerId,
            match.signal,
          );

        return (
          availability ===
            "periodic" ||
          availability ===
            "triggered" ||
          availability ===
            "burst-window" ||
          availability ===
            "ramping"
        );
      })
      .reduce(
        (total, match) =>
          total +
          match.effectiveStrength,
        0,
      );

  /*
   * A buff the player must manually cast every cooldown (Life Altar) is a
   * disadvantage in itself in a tower-defense context: it cannot be
   * relied on, it competes for attention, and it often carries a resource
   * cost. Its full synergies are pulled out of the intermittent tier into
   * their own strictly-lowest tier so they can never outrank an
   * equivalent automatic or on-hit interaction.
   */
  const manualActivationSynergyStrength =
    fullByAvailability
      .filter((match) =>
        requiresActiveCast(
          match.providerTowerId,
          match.signal,
        ),
      )
      .reduce(
        (total, match) =>
          total +
          match.effectiveStrength,
        0,
      );

  const unknownAvailabilitySynergyStrength =
    fullByAvailability
      .filter(
        (match) =>
          availabilityClassFor(
            match.providerTowerId,
            match.signal,
          ) === "unknown",
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
        entry
          .hasMeaningfulDirectCounter,
    ).length;

  const elementWeaknessesRemaining =
    anchorWeaknesses.length -
    elementWeaknessesCovered;

  return {
    anchorDefiningSynergyCount,
    anchorStrongSynergyCount,

    fullSynergyStrength,
    diminishedSynergyStrength,

    persistentSynergyStrength,
    intermittentSynergyStrength,
    manualActivationSynergyStrength,
    unknownAvailabilitySynergyStrength,

    elementWeaknessesCovered,
    elementWeaknessesRemaining,

    damageShapeComplementary:
      evidence.coverage
        .damageShape
        .hasMeaningfulComplementaryShape,

    rangeExtensionFromAnchor:
      evidence.coverage
        .range
        .meaningfulRangeExtensionFromAnchor,

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

  const baselineSelected =
    new Set(
      baseline.package
        .selectedTowerIds,
    );

  const postCoreContributions =
    evidence.resolvedContributions
      .filter((entry) =>
        !baselineSelected.has(
          entry.towerId,
        ),
      );

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

    persistentSynergyStrength:
      metrics
        .persistentSynergyStrength,

    intermittentSynergyStrength:
      metrics
        .intermittentSynergyStrength,

    manualActivationSynergyStrength:
      metrics
        .manualActivationSynergyStrength,

    unknownAvailabilitySynergyStrength:
      metrics
        .unknownAvailabilitySynergyStrength,

    elementWeaknessesCovered:
      metrics
        .elementWeaknessesCovered,

    elementWeaknessesRemaining:
      metrics
        .elementWeaknessesRemaining,

    damageShapeComplementary:
      metrics
        .damageShapeComplementary,

    realizedBuffMagnitude:
      realizedBuffMagnitude(
        evidence,
      ),

    rangeExtensionFromAnchor:
      metrics
        .rangeExtensionFromAnchor,

    multiPurposeDimensionCount:
      countMultiPurposeDimensions(
        baseline.evidence,
        evidence,
      ),

    tensionCount:
      metrics.tensionCount,

    newTensionCount:
      Math.max(
        0,
        metrics.tensionCount -
          (addition
            ? beforeTensionCount
            : measureEvidence(
                baseline.evidence,
              ).tensionCount),
      ),

    totalKeystones:
      baseline.routeState
        .totalKeystones,

    optionalTowerReachableLevel:
      postCoreContributions.length === 1
        ? postCoreContributions[0]
            .reachableLevel
        : 0,

    optionalTowerBaseDps:
      postCoreContributions.length === 1
        ? postCoreContributions[0]
            .factualStatsAtLevel
            .baseDps
        : 0,

    selectedTowerReachableLevelTotal:
      baseline.routeState
        .availableTowers
        .filter((entry) =>
          evidence.selectedTowerIds.includes(
            entry.tower.id,
          ),
        )
        .reduce(
          (total, entry) =>
            total + entry.maxLevel,
          0,
        ),

    minimumNormalPackageCapital:
      minimumNormalPackageCapital(
        evidence
          .resolvedContributions,
      ),

    availableQuadCount:
      baseline.routeState
        .availableTowers
        .filter(
          (entry) =>
            entry.tower.combination ===
            "Quad",
        )
        .length,

    availableTowerCount:
      baseline.routeState
        .availableTowers.length,

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

    // Contextual optimization evidence: covering the anchor's own armour
    // weakness and its missing damage shape comes before raw synergy
    // potency.
    decision
      .elementWeaknessesCovered,

    decision
      .damageShapeComplementary
      ? 1
      : 0,

    // A developed scaling team buff (Blacksmith / Well at L3) outranks the
    // marginal synergy value of one more discretionary tower, so pushing a
    // selected buff tower to L3 can beat adding another tower. It stays
    // below core development, anchor synergy and coverage, and above raw
    // synergy potency / range / breadth.
    decision
      .realizedBuffMagnitude,

    // Potency and practical availability remain distinct. Persistent
    // contributions rank before otherwise-equal intermittent or unknown.
    decision
      .persistentSynergyStrength,

    decision
      .fullSynergyStrength,

    decision
      .intermittentSynergyStrength,

    decision
      .rangeExtensionFromAnchor,

    decision
      .diminishedSynergyStrength,

    decision
      .unknownAvailabilitySynergyStrength,

    // Strictly lowest synergy tier: a buff the player must hand-cast
    // every cooldown can never carry a package over an automatic or
    // on-hit equivalent.
    decision
      .manualActivationSynergyStrength,

    // Lower unresolved weakness is better.
    -decision
      .elementWeaknessesRemaining,

    // Lower mechanic conflict is better.
    -decision.tensionCount,

    -decision.newTensionCount,

    decision.optionalTowerBaseDps,

    decision
      .selectedTowerReachableLevelTotal,

    // Economic burden breaks ties only after substantive strategic
    // evidence and factual development/offense. It is not a hard cap.
    -decision
      .minimumNormalPackageCapital,

    // Package size is never positive evidence. When every
    // meaningful selected-package dimension ties, prefer the
    // smaller non-dominated package.
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

function makeNormalPackagePlan(
  baseline: AnchorPackageEvaluation,
  result: NormalPackageSearchResult,
): CandidateBuildPlan {
  const capital =
    minimumNormalPackageCapital(
      result.evidence
        .resolvedContributions,
    );

  return {
    anchorTowerId:
      baseline.package
        .anchorTowerId,
    baseline,
    optionalTowerId:
      result.postCoreTowerIds
        .length === 1
        ? result.postCoreTowerIds[0]
        : null,
    postCoreTowerIds:
      result.postCoreTowerIds,
    selectedTowerIds:
      result.selectedTowerIds,
    evidence:
      result.evidence,
    minimumNormalPackageCapital:
      capital,
    decision:
      buildPlannerDecision(
        baseline,
        result.evidence,
      ),
  };
}

function deterministicPlanKey(
  plan: CandidateBuildPlan,
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
 * evaluates actual selected cores plus zero or more justified post-core
 * towers, and ranks those complete outcomes.
 *
 * The ranking happens AFTER future-state enumeration,
 * so this is not a greedy next-keystone algorithm.
 */
export type RankedAnchorBuildPlanSearch = {
  plans: readonly RankedBuildPlan[];
  diagnostics:
    NormalPackageSearchDiagnostics;
};

const defaultRankedPlanCache =
  new Map<
    TowerId,
    {
      limit: number;
      result:
        RankedAnchorBuildPlanSearch;
    }
  >();

export function rankAnchorBuildPlansWithDiagnostics(
  anchorTowerId: TowerId,
  limit = 10,
  matchups:
    ElementMatchupTable =
      ELEMENT_MATCHUPS,
): RankedAnchorBuildPlanSearch {
  if (limit <= 0) {
    return {
      plans: [],
      diagnostics:
        emptyNormalPackageSearchDiagnostics(),
    };
  }

  if (matchups === ELEMENT_MATCHUPS) {
    const cached =
      defaultRankedPlanCache.get(
        anchorTowerId,
      );

    if (cached && cached.limit >= limit) {
      return {
        plans:
          cached.result.plans.slice(
            0,
            limit,
          ),
        diagnostics:
          cached.result.diagnostics,
      };
    }
  }

  const candidates:
    CandidateBuildPlan[] = [];

  const diagnostics =
    emptyNormalPackageSearchDiagnostics();

  const allBaselines =
    evaluateAnchorPackages(
        anchorTowerId,
        matchups,
    ).filter(
        (baseline) =>
        baseline.routeState
            .totalKeystones ===
        MAX_KEYSTONES,
    );

  /*
   * Core development is the first planner dimension. Once at least one
   * final state develops every mandatory role, an undeveloped state has
   * an admissible upper bound below every developed state.
   */
  const developedBaselines =
    allBaselines.filter(
      (baseline) =>
        baseline.package
          .coreDeveloped,
    );
  const eligibleBaselines =
    developedBaselines.length > 0
      ? developedBaselines
      : allBaselines;

  diagnostics.branchesPruned +=
    allBaselines.length -
    eligibleBaselines.length;

  const uniqueContexts =
    new Map<
      string,
      AnchorPackageEvaluation
    >();

  for (const baseline of
    eligibleBaselines) {
    const key = [
      ...ELEMENTS.map((element) =>
        baseline.routeState
          .allocation[element],
      ),
      normalPackageContextSignature(
        baseline,
        baseline.evidence,
      ),
    ].join("|");
    const existing =
      uniqueContexts.get(key);

    if (
      !existing ||
      baseline.package
        .selectedTowerIds
        .join("|") <
      existing.package
        .selectedTowerIds
        .join("|")
    ) {
      uniqueContexts.set(
        key,
        baseline,
      );
    }
  }

  const uniqueBaselines =
    [...uniqueContexts.values()];

  const availabilityDominates = (
    alternative:
      AnchorPackageEvaluation,
    candidate:
      AnchorPackageEvaluation,
  ): boolean => {
    const alternativeLevels =
      new Map(
        alternative.routeState
          .availableTowers
          .map((entry) => [
            entry.tower.id,
            entry.maxLevel,
          ] as const),
      );

    return candidate.routeState
      .availableTowers
      .every((entry) =>
        (alternativeLevels.get(
          entry.tower.id,
        ) ?? 0) >= entry.maxLevel,
      );
  };

  const baselines =
    uniqueBaselines.filter(
      (candidate) =>
        !uniqueBaselines.some(
          (alternative) => {
            if (
              alternative === candidate ||
              !availabilityDominates(
                alternative,
                candidate,
              ) ||
              !normalPackageContextDominates(
                alternative,
                candidate,
              )
            ) {
              return false;
            }

            const equivalent =
              availabilityDominates(
                candidate,
                alternative,
              ) &&
              normalPackageContextDominates(
                candidate,
                alternative,
              );

            if (!equivalent) {
              return true;
            }

            const keyFor = (
              baseline:
                AnchorPackageEvaluation,
            ) => [
              ...ELEMENTS.map(
                (element) =>
                  baseline.routeState
                    .allocation[element],
              ),
              ...baseline.package
                .selectedTowerIds,
            ].join("|");

            return keyFor(alternative) <
              keyFor(candidate);
          },
        ),
    );

  diagnostics.branchesPruned +=
    eligibleBaselines.length -
    baselines.length;

  for (const baseline of baselines) {
    const search =
      searchNormalPackagesForBaseline(
        baseline,
        matchups,
      );

    mergeNormalPackageSearchDiagnostics(
      diagnostics,
      search.diagnostics,
    );

    for (const result of search.results) {
      candidates.push(
        makeNormalPackagePlan(
          baseline,
          result,
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

  const plans = candidates
    .slice(
      0,
      limit,
    )
    .map(
      (candidate) => ({
        ...candidate,

        normalPackageEconomics:
          evaluateNormalPackageEconomics(
            candidate.baseline,
            candidate.evidence,
            matchups,
          ),

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

  const result = {
    plans,
    diagnostics,
  };

  if (matchups === ELEMENT_MATCHUPS) {
    defaultRankedPlanCache.set(
      anchorTowerId,
      {
        limit,
        result,
      },
    );
  }

  return result;
}

export function rankAnchorBuildPlans(
  anchorTowerId: TowerId,
  limit = 10,
  matchups:
    ElementMatchupTable =
      ELEMENT_MATCHUPS,
): readonly RankedBuildPlan[] {
  return rankAnchorBuildPlansWithDiagnostics(
    anchorTowerId,
    limit,
    matchups,
  ).plans;
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
