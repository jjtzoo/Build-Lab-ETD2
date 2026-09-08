import type {
  DamageShape,
} from "@/lib/domain/attributes";

import type {
  ElementMatchupTable,
} from "@/lib/domain/elementMatchups";

import type {
  Tower,
  TowerId,
} from "@/lib/domain/tower";

import {
  getTower,
} from "@/lib/domain/towerCatalog";

import type {
  TowerProfile,
} from "@/lib/domain/towerProfile";

import {
  getTowerProfile,
} from "@/lib/domain/towerProfileCatalog";

import {
  evaluateCombinedSynergyPackage,
  type CombinedSynergyPackageEvidence,
} from "@/lib/engine/combinedSynergyOpportunity";

import type {
  CorePackageCandidate,
} from "@/lib/engine/corePackageCandidates";

import {
  evaluateDamageShapeCoverage,
  type DamageShapeCoverageMeasurement,
} from "@/lib/engine/damageShapeCoverage";

import {
  evaluateElementCoverage,
  type ElementCoverageEntry,
} from "@/lib/engine/elementCoverage";

import {
  evaluateRangeCoverage,
  type RangeCoverageMeasurement,
} from "@/lib/engine/rangeCoverage";

import {
  resolvePracticalOffense,
  type PracticalOffensiveContribution,
} from "@/lib/engine/practicalOffense";

import {
  resolveTowerContribution,
  type ResolvedTowerContribution,
} from "@/lib/engine/resolvedTowerContribution";

type SelectedTower = {
  tower: Tower;
  profile: TowerProfile;
};

export type CorePackageCoverageEvidence = {
  element:
    readonly ElementCoverageEntry[];

  damageShape:
    DamageShapeCoverageMeasurement;

  range:
    RangeCoverageMeasurement;
};

export type CorePackageEvidence = {
  anchorTowerId: TowerId;

  /**
   * Towers actually selected into this package.
   * Unlocked but unselected towers do not appear here.
   */
  selectedTowerIds:
    readonly TowerId[];

  /**
   * Selected towers treated as meaningful
   * offensive contributors for coverage.
   *
   * The anchor is always included.
   * Support towers are included only when their
   * canonical profile defines offense.
   */
  offensiveContributorTowerIds:
    readonly TowerId[];

  meaningfulOffensiveContributorTowerIds:
    readonly TowerId[];

  practicalOffensiveContributions:
    readonly PracticalOffensiveContribution[];

  /**
   * Factual contribution of every selected tower at the maximum
   * level reachable in this exact allocation.
   */
  resolvedContributions:
    readonly ResolvedTowerContribution[];

  coverage:
    CorePackageCoverageEvidence;

  synergy:
    CombinedSynergyPackageEvidence;
};

function resolveSelectedTowers(
  selectedTowerIds:
    readonly TowerId[],
): readonly SelectedTower[] {
  return selectedTowerIds.map(
    (towerId) => ({
      tower:
        getTower(towerId),

      profile:
        getTowerProfile(towerId),
    }),
  );
}

function getAnchor(
  selected:
    readonly SelectedTower[],
  anchorTowerId: TowerId,
): SelectedTower {
  const anchor =
    selected.find(
      (entry) =>
        entry.tower.id ===
        anchorTowerId,
    );

  if (!anchor) {
    throw new Error(
      `Selected package is missing anchor: ${anchorTowerId}`,
    );
  }

  if (!anchor.profile.offense) {
    throw new Error(
      `Anchor is missing canonical offense profile: ${anchorTowerId}`,
    );
  }

  return anchor;
}

/**
 * Evaluates coverage and mechanic evidence for an
 * already-selected minimum core package.
 *
 * This function does not rank the package.
 */
/**
 * Evaluates coverage and mechanic evidence for any
 * explicitly selected tower package.
 *
 * The anchor must be present in selectedTowerIds.
 *
 * No ranking occurs here.
 */
export function evaluateSelectedPackageEvidence(
  anchorTowerId: TowerId,
  selectedTowerIds:
    readonly TowerId[],
  matchups: ElementMatchupTable,
  reachableLevels?:
    ReadonlyMap<TowerId, number>,
): CorePackageEvidence {
  const selected =
    resolveSelectedTowers(
      selectedTowerIds,
    );

  const anchor =
    getAnchor(
      selected,
      anchorTowerId,
    );

  const anchorOffense =
    anchor.profile.offense;

  if (!anchorOffense) {
    throw new Error(
      `Anchor is missing canonical offense profile: ${anchorTowerId}`,
    );
  }

  const supportingOffense =
    selected.filter(
      (entry) =>
        entry.tower.id !==
          anchorTowerId &&
        entry.profile.offense !==
          undefined,
    );

  const profiles =
    selected.map(
      (entry) =>
      entry.profile,
    );

  const resolvedContributions =
    selected.map((entry) =>
      resolveTowerContribution(
        entry.tower.id,
        reachableLevels?.get(
          entry.tower.id,
        ) ?? entry.tower.maxLevel,
      ),
    );

  const resolvedAnchor =
    resolvedContributions.find(
      (entry) =>
        entry.towerId ===
        anchorTowerId,
    );

  if (!resolvedAnchor) {
    throw new Error(
      `Missing resolved anchor contribution: ${anchorTowerId}`,
    );
  }

  const practicalOffensiveContributions =
    resolvedContributions
      .filter(
        (entry) =>
          entry.towerId !==
          anchorTowerId,
      )
      .map((entry) =>
        resolvePracticalOffense(
          resolvedAnchor,
          entry,
        ),
      )
      .filter(
        (
          entry,
        ): entry is PracticalOffensiveContribution =>
          entry !== null,
      );

  const meaningfulOffense =
    practicalOffensiveContributions
      .filter(
        (entry) =>
          entry.meaningful,
      );

  return {
    anchorTowerId,

    selectedTowerIds,

    offensiveContributorTowerIds: [
      anchorTowerId,
      ...supportingOffense.map(
        (entry) =>
          entry.tower.id,
      ),
    ],

    meaningfulOffensiveContributorTowerIds: [
      anchorTowerId,
      ...meaningfulOffense.map(
        (entry) =>
          entry.towerId,
      ),
    ],

    practicalOffensiveContributions,

    resolvedContributions,

    coverage: {
      element:
        evaluateElementCoverage(
          matchups,
          anchor.tower.damageElement,
          practicalOffensiveContributions
            .map(
              (entry) =>
                entry.offensiveElement,
            ),
          meaningfulOffense.map(
            (entry) =>
              entry.offensiveElement,
          ),
        ),

      damageShape:
        evaluateDamageShapeCoverage(
          anchorOffense.damageShape,
          practicalOffensiveContributions
            .map(
              (entry) =>
                entry.damageShape,
            ),
          meaningfulOffense.map(
            (entry) =>
              entry.damageShape,
          ),
        ),

      range:
        evaluateRangeCoverage(
          anchor.tower.stats.range,
          practicalOffensiveContributions
            .map(
              (entry) =>
                entry.range,
            ),
          meaningfulOffense.map(
            (entry) =>
              entry.range,
          ),
        ),
    },

    synergy:
      evaluateCombinedSynergyPackage(
        profiles,
      ),
  };
}

/**
 * Core-package convenience wrapper.
 */
export function evaluateCorePackageEvidence(
  candidate: CorePackageCandidate,
  matchups: ElementMatchupTable,
  reachableLevels?:
    ReadonlyMap<TowerId, number>,
): CorePackageEvidence {
  return evaluateSelectedPackageEvidence(
    candidate.anchorTowerId,
    candidate.selectedTowerIds,
    matchups,
    reachableLevels,
  );
}
