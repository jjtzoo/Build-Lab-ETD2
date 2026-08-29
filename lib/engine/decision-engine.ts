import type {
  CandidateEvaluation,
  DecisionGate,
  DecisionResult,
} from "./types";

const ENGINE_VERSION = "V8";

const EPSILON = 1e-9;

function compareNumbers(
  a: number,
  b: number,
  preferHigher: boolean,
): number {
  if (Math.abs(a - b) <= EPSILON) {
    return 0;
  }

  if (preferHigher) {
    return a > b ? 1 : -1;
  }

  return a < b ? 1 : -1;
}

export function compareCandidates(
  a: CandidateEvaluation,
  b: CandidateEvaluation,
): number {
  const gatesA = [
    a.legality.passed,
    a.package.viability,
    a.package.primaryDps > 0,
    a.package.primaryDepth >= 1,
    a.package.completeness >= 0.55,
  ];

  const gatesB = [
    b.legality.passed,
    b.package.viability,
    b.package.primaryDps > 0,
    b.package.primaryDepth >= 1,
    b.package.completeness >= 0.55,
  ];

  for (let i = 0; i < gatesA.length; i += 1) {
    if (gatesA[i] !== gatesB[i]) {
      return gatesA[i] ? 1 : -1;
    }
  }

  const comparisons: Array<
    [number, number, boolean]
  > = [
    [
      a.package.primaryDps,
      b.package.primaryDps,
      true,
    ],
    [
      a.package.primaryDepth,
      b.package.primaryDepth,
      true,
    ],
    [
      a.opportunity.opportunityLoss,
      b.opportunity.opportunityLoss,
      false,
    ],
    [
      a.synergy.realized,
      b.synergy.realized,
      true,
    ],
    [
      a.redundancy.raw,
      b.redundancy.raw,
      false,
    ],
    [
      a.antiSynergy.raw,
      b.antiSynergy.raw,
      false,
    ],
    [
      a.endgame.score,
      b.endgame.score,
      true,
    ],
    [
      a.fineScore,
      b.fineScore,
      true,
    ],
  ];

  for (const [left, right, higher] of comparisons) {
    const result = compareNumbers(
      left,
      right,
      higher,
    );

    if (result !== 0) {
      return result;
    }
  }

  /*
   * Smaller packages win the final deterministic tie-break.
   * This prevents unnecessary package expansion from winning
   * when every substantive evaluation is equal.
   */
  return compareNumbers(
    a.towers.length,
    b.towers.length,
    false,
  );
}

function buildGates(
  candidate: CandidateEvaluation,
): DecisionGate[] {
  return [
    {
      name: "legality",
      passed: candidate.legality.passed,
      reason:
        candidate.legality.reason ||
        "Legality evaluation completed.",
    },
    {
      name: "viability",
      passed: candidate.package.viability,
      reason: candidate.package.viability
        ? "A viable primary damage package exists."
        : "No viable primary damage package exists.",
    },
    {
      name: "primaryFunction",
      passed:
        candidate.package.primaryDps > 0,
      reason:
        candidate.package.primaryDps > 0
          ? "A positive primary DPS function is established."
          : "No positive primary DPS function is established.",
    },
    {
      name: "investmentQuality",
      passed:
        candidate.package.primaryDepth >= 1,
      reason:
        candidate.package.primaryDepth >= 1
          ? "Primary investment reaches modeled maximum depth."
          : "Primary investment remains below modeled maximum depth.",
    },
    {
      name: "packageComplete",
      passed:
        candidate.package.completeness >= 0.55,
      reason:
        candidate.package.completeness >= 0.55
          ? "Package completeness reaches the decision threshold."
          : "Package completeness is below the decision threshold.",
    },
  ];
}

function buildTuple(
  candidate: CandidateEvaluation,
): NonNullable<DecisionResult["tuple"]> {
  return {
    legality: candidate.legality.passed,
    viability: candidate.package.viability,
    primaryFunction:
      candidate.package.primaryDps > 0,
    investmentQuality:
      candidate.package.primaryDepth >= 1,
    packageComplete:
      candidate.package.completeness >= 0.55,

    primaryDps:
      candidate.package.primaryDps,

    investmentDepth:
      candidate.package.primaryDepth,

    opportunityLoss:
      candidate.opportunity.opportunityLoss,

    realizedSynergy:
      candidate.synergy.realized,

    redundancy:
      candidate.redundancy.raw,

    antiSynergy:
      candidate.antiSynergy.raw,

    endgame:
      candidate.endgame.score,

    fineScore:
      candidate.fineScore,
  };
}

export function makeDecision(
  candidates: CandidateEvaluation[],
): DecisionResult {
  if (candidates.length === 0) {
    return {
      winner: null,
      gates: [],
      tuple: null,
      finalists: [],
      rationale: ["No candidate evaluations were provided."],
      engineVersion: ENGINE_VERSION,
    };
  }

  const ranked = [...candidates].sort(
    (a, b) => compareCandidates(b, a),
  );

  const winner = ranked[0];

  const gates = buildGates(winner);

  const rationale = [
    `Winner allocation: ${winner.allocation.join(" / ")}.`,
    `Primary DPS: ${winner.package.primaryDps.toFixed(2)}.`,
    `Primary depth: ${winner.package.primaryDepth.toFixed(2)}.`,
    `Opportunity loss: ${winner.opportunity.opportunityLoss.toFixed(2)}.`,
    `Realized synergy: ${winner.synergy.realized.toFixed(2)}.`,
    `Redundancy: ${winner.redundancy.raw.toFixed(2)}.`,
    `Anti-synergy: ${winner.antiSynergy.raw.toFixed(2)}.`,
    `Endgame: ${winner.endgame.score.toFixed(2)}.`,
  ];

  return {
    winner,
    gates,
    tuple: buildTuple(winner),
    finalists: ranked.slice(0, 5),
    rationale,
    engineVersion: ENGINE_VERSION,
  };
}