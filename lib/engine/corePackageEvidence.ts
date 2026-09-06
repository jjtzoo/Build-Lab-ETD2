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

  coverage:
    CorePackageCoverageEvidence;

  synergy:
    CombinedSynergyPackageEvidence;
};

function resolveSelectedTowers(
  candidate: CorePackageCandidate,
): readonly SelectedTower[] {
  return candidate.selectedTowerIds.map(
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
export function evaluateCorePackageEvidence(
  candidate: CorePackageCandidate,
  matchups: ElementMatchupTable,
): CorePackageEvidence {
  const selected =
    resolveSelectedTowers(
      candidate,
    );

  const anchor =
    getAnchor(
      selected,
      candidate.anchorTowerId,
    );

  const anchorOffense =
    anchor.profile.offense;

  if (!anchorOffense) {
    throw new Error(
      `Anchor is missing canonical offense profile: ${candidate.anchorTowerId}`,
    );
  }

  const supportingOffense =
    selected.filter(
      (entry) =>
        entry.tower.id !==
          candidate.anchorTowerId &&
        entry.profile.offense !==
          undefined,
    );

  const supportingElements =
    supportingOffense.map(
      (entry) =>
        entry.tower.damageElement,
    );

  const supportingShapes =
    supportingOffense.map(
      (entry) =>
        entry.profile.offense!
          .damageShape,
    );

  const supportingRanges =
    supportingOffense.map(
      (entry) =>
        entry.tower.stats.range,
    );

  const profiles =
    selected.map(
      (entry) =>
        entry.profile,
    );

  return {
    anchorTowerId:
      candidate.anchorTowerId,

    selectedTowerIds:
      candidate.selectedTowerIds,

    offensiveContributorTowerIds: [
      candidate.anchorTowerId,
      ...supportingOffense.map(
        (entry) =>
          entry.tower.id,
      ),
    ],

    coverage: {
      element:
        evaluateElementCoverage(
          matchups,
          anchor.tower.damageElement,
          supportingElements,
        ),

      damageShape:
        evaluateDamageShapeCoverage(
          anchorOffense.damageShape,
          supportingShapes,
        ),

      range:
        evaluateRangeCoverage(
          anchor.tower.stats.range,
          supportingRanges,
        ),
    },

    synergy:
      evaluateCombinedSynergyPackage(
        profiles,
      ),
  };
}