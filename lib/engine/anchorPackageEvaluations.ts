import type {
  ElementMatchupTable,
} from "@/lib/domain/elementMatchups";

import {
  ELEMENT_MATCHUPS,
} from "@/lib/domain/elementMatchupCatalog";

import type {
  TowerId,
} from "@/lib/domain/tower";

import {
  getAnchorRouteStates,
  type AnchorRouteState,
} from "@/lib/engine/anchorRouteStates";

import {
  getCorePackageCandidates,
  type CorePackageCandidate,
} from "@/lib/engine/corePackageCandidates";

import {
  evaluateCorePackageEvidence,
  type CorePackageEvidence,
} from "@/lib/engine/corePackageEvidence";

export type AnchorPackageEvaluation = {
  /**
   * Legal future allocation where this package
   * is being considered.
   */
  routeState: AnchorRouteState;

  /**
   * Actual selected minimum core package.
   */
  package: CorePackageCandidate;

  /**
   * Coverage + synergy evidence for only the
   * towers actually selected into the package.
   */
  evidence: CorePackageEvidence;
};

/**
 * Evaluates every selectable core package across
 * every legal future allocation for the anchor.
 *
 * This deliberately searches the complete future
 * route space rather than stopping at the earliest
 * core-completion state.
 *
 * No ranking occurs here.
 */
export function evaluateAnchorPackages(
  anchorTowerId: TowerId,
  matchups:
    ElementMatchupTable =
      ELEMENT_MATCHUPS,
): readonly AnchorPackageEvaluation[] {
  const evaluations:
    AnchorPackageEvaluation[] = [];

  const routeStates =
    getAnchorRouteStates(
      anchorTowerId,
    );

  for (const routeState of routeStates) {
    const packages =
      getCorePackageCandidates(
        routeState,
      );

    for (const candidate of packages) {
      evaluations.push({
        routeState,

        package:
          candidate,

        evidence:
          evaluateCorePackageEvidence(
            candidate,
            matchups,
          ),
      });
    }
  }

  return evaluations;
}

/**
 * Stronger subset where Slow, Damage Amp and Buff
 * have all reached their desired development depth.
 *
 * This remains a filter, not a ranking decision.
 */
export function evaluateDevelopedAnchorPackages(
  anchorTowerId: TowerId,
  matchups:
    ElementMatchupTable =
      ELEMENT_MATCHUPS,
): readonly AnchorPackageEvaluation[] {
  return evaluateAnchorPackages(
    anchorTowerId,
    matchups,
  ).filter(
    (evaluation) =>
      evaluation.package
        .coreDeveloped,
  );
}