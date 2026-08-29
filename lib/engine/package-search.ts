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

const BEAM_WIDTH = 4;
const MAX_PACKAGE_SIZE = 7;
const MIN_PACKAGE_SIZE = 3;
const FINAL_CANDIDATE_LIMIT = 6;

interface PackageSearchState {
  set: TowerEvaluationBundle[];
  evaluation: PackageEvaluation;
  shallowScore: number;
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

function shallowPackageScore(
  evaluation: PackageEvaluation,
): number {
  return (
    (evaluation.viability ? 1000 : 0) +
    evaluation.primaryDps * 0.6 +
    evaluation.completeness * 80 +
    evaluation.counts.cover * 0.25 +
    evaluation.counts.control * 0.18
  );
}

function expandPackageState(
  state: PackageSearchState,
  candidates: TowerEvaluationBundle[],
): PackageSearchState[] {
  const nextStates: PackageSearchState[] = [];

  for (const candidate of candidates) {
    const alreadySelected =
      state.set.some(
        (bundle) =>
          bundle.state.tower.name ===
          candidate.state.tower.name,
      );

    if (alreadySelected) {
      continue;
    }

    const nextSet = [
      ...state.set,
      candidate,
    ];

    if (
      nextSet.length >
      MAX_PACKAGE_SIZE
    ) {
      continue;
    }

    const evaluation =
      evaluatePackage(nextSet);

    nextStates.push({
      set: nextSet,
      evaluation,
      shallowScore:
        shallowPackageScore(
          evaluation,
        ),
    });
  }

  return nextStates;
}

function dedupePackageStates(
  states: PackageSearchState[],
): PackageSearchState[] {
  const seen = new Set<string>();
  const unique: PackageSearchState[] = [];

  for (const state of states) {
    const key = state.set
      .map(
        (bundle) =>
          bundle.state.tower.name,
      )
      .sort()
      .join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(state);
  }

  return unique;
}

function rankSearchStates(
  states: PackageSearchState[],
): PackageSearchState[] {
  return [...states].sort(
    (a, b) =>
      b.shallowScore -
      a.shallowScore,
  );
}

export function runBeamSearch(
  candidates: TowerEvaluationBundle[],
  anchor: string,
): PackageSearchState[] {
  let beam: PackageSearchState[] = [];

  if (anchor !== "Auto") {
    const anchorBundle =
      candidates.find(
        (bundle) =>
          bundle.state.tower.name ===
          anchor,
      );

    if (anchorBundle) {
      const evaluation =
        evaluatePackage([
          anchorBundle,
        ]);

      beam.push({
        set: [anchorBundle],
        evaluation,
        shallowScore:
          shallowPackageScore(
            evaluation,
          ),
      });
    }
  }

  if (beam.length === 0) {
    for (const candidate of candidates) {
      const evaluation =
        evaluatePackage([
          candidate,
        ]);

      beam.push({
        set: [candidate],
        evaluation,
        shallowScore:
          shallowPackageScore(
            evaluation,
          ),
      });
    }
  }

  beam = rankSearchStates(
    dedupePackageStates(beam),
  ).slice(0, BEAM_WIDTH);

  const completed: PackageSearchState[] = [];

  for (
    let size = 2;
    size <= MAX_PACKAGE_SIZE;
    size += 1
  ) {
    const expanded: PackageSearchState[] =
      [];

    for (const state of beam) {
      expanded.push(
        ...expandPackageState(
          state,
          candidates,
        ),
      );
    }

    if (expanded.length === 0) {
      break;
    }

    const unique =
      dedupePackageStates(expanded);

    const ranked =
      rankSearchStates(unique);

    for (const state of ranked) {
      if (
        state.set.length >=
        MIN_PACKAGE_SIZE
      ) {
        if (
          anchor === "Auto" ||
          state.set.some(
            (bundle) =>
              bundle.state.tower.name ===
              anchor,
          )
        ) {
          completed.push(state);
        }
      }
    }

    beam = ranked.slice(
      0,
      BEAM_WIDTH,
    );
  }

  return rankSearchStates(
    dedupePackageStates(
      completed,
    ),
  ).slice(
    0,
    FINAL_CANDIDATE_LIMIT,
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

function addBestCandidates(
  states: TowerEvaluationBundle[],
  selected: TowerEvaluationBundle[],
  predicate: (
    bundle: TowerEvaluationBundle,
  ) => boolean,
): void {
  const candidates = states
    .filter(predicate)
    .sort(
      (a, b) =>
        packageSortScore(b) -
        packageSortScore(a),
    );

  for (const candidate of candidates.slice(0, 3)) {
    const existingIndex =
      selected.findIndex(
        (bundle) =>
          bundle.state.tower.name ===
          candidate.state.tower.name,
      );

    if (existingIndex === -1) {
      selected.push(candidate);
    }
  }
}

function buildCandidatePool(
  bundles: TowerEvaluationBundle[],
  anchor: string,
): TowerEvaluationBundle[] {
  const selected: TowerEvaluationBundle[] = [];

  if (anchor !== "Auto") {
    const anchorBundle =
      bundles.find(
        (bundle) =>
          bundle.state.tower.name ===
          anchor,
      );

    if (anchorBundle) {
      selected.push(anchorBundle);
    }
  }

  addBestCandidates(
    bundles,
    selected,
    (bundle) =>
      bundle.state.roles.mainDPS !== "None",
  );

  addBestCandidates(
    bundles,
    selected,
    (bundle) =>
      bundle.state.roles.control !== "None",
  );

  addBestCandidates(
    bundles,
    selected,
    (bundle) =>
      bundle.state.roles.coverage !== "None",
  );

  addBestCandidates(
    bundles,
    selected,
    (bundle) =>
      bundle.state.roles.amplification !==
      "None",
  );

  addBestCandidates(
    bundles,
    selected,
    (bundle) =>
      bundle.state.roles.range !== "None",
  );

  addBestCandidates(
    bundles,
    selected,
    (bundle) =>
      bundle.state.tower.type === "Trio",
  );

  addBestCandidates(
    bundles,
    selected,
    (bundle) =>
      bundle.state.tower.type === "Quad",
  );

  const remaining = bundles
    .filter(
      (bundle) =>
        !selected.some(
          (chosen) =>
            chosen.state.tower.name ===
            bundle.state.tower.name,
        ),
    )
    .sort(
      (a, b) =>
        packageSortScore(b) -
        packageSortScore(a),
    );

  selected.push(
    ...remaining.slice(
      0,
      Math.max(0, 10 - selected.length),
    ),
  );

  return selected.slice(0, 10);
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

  const ordered =
    buildCandidatePool(
    bundles,
    anchor,
    );

  if (
    anchor !== "Auto" &&
    !ordered.some(
      (bundle) =>
        bundle.state.tower.name ===
        anchor,
    )
  ) {
    return null;
  }

  /*
   * Start conservatively with a small package.
   * The package evaluator decides whether the set
   * is viable and complete.
   *
   * Package expansion will be made more sophisticated
   * after anchor behavior has regression coverage.
   */
  const finalists =
    runBeamSearch(
      ordered,
      anchor,
    );

  if (!finalists.length) {
    return null;
  }

  const best =
    finalists[0];

  const selected =
    best.set;

  const evaluation =
    best.evaluation;

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