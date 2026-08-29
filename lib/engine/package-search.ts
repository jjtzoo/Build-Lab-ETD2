import type {
  Allocation,
  ElementName,
  Tower,
} from "@/lib/types";

import { TOWERS } from "@/lib/data";

import { evaluatePackage } from "./package-evaluator";

import {
  buildTowerState,
} from "./tower-state";

import {
  evaluateTower,
} from "./evaluator-bundle";

import type {
  PackageEvaluation,
  TowerEvaluationBundle,
} from "./types";

export interface PackageSearchResult {
  towers: Tower[];
  bundles: TowerEvaluationBundle[];
  evaluation: PackageEvaluation;
}

function packageSortScore(
  bundle: TowerEvaluationBundle,
): number {
  const dps =
    typeof bundle.dps.score === "number"
      ? bundle.dps.score
      : 0;

  const control =
    typeof bundle.control.score === "number"
      ? bundle.control.score
      : 0;

  const coverage =
    typeof bundle.coverage.score === "number"
      ? bundle.coverage.score
      : 0;

  const amplification =
    typeof bundle.amplification.score === "number"
      ? bundle.amplification.score
      : 0;

  const range =
    typeof bundle.range.score === "number"
      ? bundle.range.score
      : 0;

  const scaling =
    typeof bundle.scaling.score === "number"
      ? bundle.scaling.score
      : 0;

  return (
    dps * 0.5 +
    control * 0.15 +
    coverage * 0.15 +
    amplification * 0.1 +
    range * 0.05 +
    scaling * 0.05
  );
}

function unlockedBundles(
  allocation: Allocation,
): TowerEvaluationBundle[] {
  return TOWERS
    .filter((tower) => {
      const state =
        buildTowerState(
          tower,
          allocation,
        );

      return state.unlocked && state.tier > 0;
    })
    .map((tower) =>
      evaluateTower(
        buildTowerState(
          tower,
          allocation,
        ),
      ),
    );
}

export function searchPackage(
  allocation: Allocation,
  _core: ElementName[],
  anchor = "Auto",
): PackageSearchResult | null {
  const bundles =
    unlockedBundles(allocation);

  if (!bundles.length) {
    return null;
  }

  let ordered = [...bundles].sort(
    (a, b) =>
      packageSortScore(b) -
      packageSortScore(a),
  );

  if (
    anchor !== "Auto"
  ) {
    const anchorBundle =
      ordered.find(
        (bundle) =>
          bundle.state.tower.name ===
          anchor,
      );

    if (!anchorBundle) {
      return null;
    }

    ordered = [
      anchorBundle,
      ...ordered.filter(
        (bundle) =>
          bundle.state.tower.name !==
          anchor,
      ),
    ];
  }

  /*
   * Start conservatively with a small package.
   * The package evaluator decides whether the set
   * is viable and complete.
   *
   * Package expansion will be made more sophisticated
   * after anchor behavior has regression coverage.
   */
  const selected =
    ordered.slice(0, 5);

  const evaluation =
    evaluatePackage(selected);

  if (
    anchor !== "Auto" &&
    !selected.some(
      (bundle) =>
        bundle.state.tower.name ===
        anchor,
    )
  ) {
    return null;
  }

  return {
    towers: selected.map(
      (bundle) =>
        bundle.state.tower,
    ),
    bundles: selected,
    evaluation,
  };
}