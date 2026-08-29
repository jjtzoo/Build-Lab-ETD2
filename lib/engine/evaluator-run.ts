import type {
  Allocation,
  ElementName,
  Tower,
} from "@/lib/types";

import {
  unlockedTowers,
} from "./allocation";

import {
  evaluateLegality,
} from "./legality";

import {
  buildTowerState,
} from "./tower-state";

import {
  evaluateTower,
} from "./evaluator-bundle";

import {
  evaluatePackage,
} from "./package-evaluator";

import {
  buildSynergyGraph,
} from "./synergy-graph";

import {
  evaluateSynergy,
} from "./synergy-evaluator";

import {
  evaluateOpportunityCost,
} from "./opportunity-evaluator";

import {
  evaluateRedundancy,
} from "./redundancy-evaluator";

import {
  evaluateAntiSynergy,
} from "./anti-synergy-evaluator";

import {
  evaluateEndgame,
} from "./endgame-evaluator";

import type {
  CandidateEvaluation,
  DecisionGate,
} from "./types";

const EVALUATOR_NAMES = [
  "dps",
  "control",
  "coverage",
  "amplification",
  "range",
  "scaling",
] as const;

function invalidTowerGate(
  tower: Tower,
  allocation: Allocation,
): DecisionGate | null {
  const state = buildTowerState(
    tower,
    allocation,
  );

  if (!state.unlocked) {
    return {
      name: "legality",
      passed: false,
      reason:
        `Selected tower "${tower.name}" is not unlocked by the allocation.`,
    };
  }

  if (state.tier <= 0) {
    return {
      name: "legality",
      passed: false,
      reason:
        `Selected tower "${tower.name}" has no invested recipe depth.`,
    };
  }

  return null;
}

export function evaluateCandidate(
  allocation: Allocation,
  core: ElementName[],
  selectedTowers: Tower[],
  anchor: string | null = null,
): CandidateEvaluation {

  const allocationLegality =
    evaluateLegality(
      allocation,
      core,
    );

  const invalidTower =
    selectedTowers
      .map((tower) =>
        invalidTowerGate(
          tower,
          allocation,
        ),
      )
      .find(
        (gate): gate is DecisionGate =>
          gate !== null,
      );

  const legality =
    invalidTower ?? allocationLegality;

  const towers =
    selectedTowers.map((tower) =>
      buildTowerState(
        tower,
        allocation,
      ),
    );

  const bundles =
    towers.map(evaluateTower);

  const evaluatorEvidence =
    EVALUATOR_NAMES.reduce(
      (result, name) => {
        const first =
          bundles.find(
            (bundle) =>
              bundle[name].evaluator === name,
          );

        if (first) {
          result[name] = first[name];
        }

        return result;
      },
      {} as CandidateEvaluation["evaluators"],
    );

  const packageEvaluation =
    evaluatePackage(
      bundles,
    );

  const graph =
    buildSynergyGraph(
      towers,
    );

  const synergyEvaluation =
    evaluateSynergy(
      graph,
      bundles,
    );

  const availableBundles =
    unlockedTowers(allocation)
      .filter(
        (tower) =>
          !selectedTowers.some(
            (selected) =>
              selected.name === tower.name,
          ),
      )
      .map((tower) =>
        evaluateTower(
          buildTowerState(
            tower,
            allocation,
          ),
        ),
      );

  const opportunityEvaluation =
    evaluateOpportunityCost(
      bundles,
      availableBundles,
    );

  const redundancyEvaluation =
    evaluateRedundancy(
      bundles,
    );

  const antiSynergyEvaluation =
    evaluateAntiSynergy(
      graph,
    );

  const endgameEvaluation =
    evaluateEndgame(
      allocation,
      towers,
    );

  return {
    allocation,
    core,
    anchor,

    towers,

    legality,

    evaluators: evaluatorEvidence,

    package:
      packageEvaluation,

    synergy:
      synergyEvaluation,

    opportunity:
      opportunityEvaluation,

    redundancy:
      redundancyEvaluation,

    antiSynergy:
      antiSynergyEvaluation,

    endgame:
      endgameEvaluation,

    /*
     * Fine optimization is intentionally not defined yet.
     * The Decision Engine treats it as the final tie-break layer.
     */
    fineScore: 0,
  };
}