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

/**
 * Compares factual allocation-ecosystem properties.
 *
 * This deliberately uses information already exposed by
 * AllocationProfile instead of introducing arbitrary
 * element-specific score bonuses.
 */
function compareAllocationProfiles(
  a: CandidateEvaluation,
  b: CandidateEvaluation,
): number {
  const profileA =
    a.allocationProfile;

  const profileB =
    b.allocationProfile;

  /*
   * A structurally weak allocation loses to a
   * structurally healthy allocation.
   */
  if (
    profileA.structuralWeakness.isWeak !==
    profileB.structuralWeakness.isWeak
  ) {
    return profileA.structuralWeakness.isWeak
      ? -1
      : 1;
  }

  /*
   * Compare the number of meaningful functional
   * categories available in the ecosystem.
   */
  const functionalA =
    Object.values(
      profileA.functionalAccess,
    ).filter(
      (value) => value > 0,
    ).length;

  const functionalB =
    Object.values(
      profileB.functionalAccess,
    ).filter(
      (value) => value > 0,
    ).length;

  let result =
    compareNumbers(
      functionalA,
      functionalB,
      true,
    );

  if (result !== 0) {
    return result;
  }

  /*
   * Larger Quad ecosystems are more capable
   * of supporting nonlinear Quad routes.
   */
  result =
    compareNumbers(
      profileA.quadAccess,
      profileB.quadAccess,
      true,
    );

  if (result !== 0) {
    return result;
  }

  /*
   * More Tri access means more breadth around
   * the core package.
   */
  result =
    compareNumbers(
      profileA.triAccess,
      profileB.triAccess,
      true,
    );

  if (result !== 0) {
    return result;
  }

  /*
   * Compare the deepest available Dual route.
   */
  const dualDepthA =
    profileA.dualDepth.length > 0
      ? Math.max(
          ...profileA.dualDepth.map(
            (entry) => entry.depth,
          ),
        )
      : 0;

  const dualDepthB =
    profileB.dualDepth.length > 0
      ? Math.max(
          ...profileB.dualDepth.map(
            (entry) => entry.depth,
          ),
        )
      : 0;

  return compareNumbers(
    dualDepthA,
    dualDepthB,
    true,
  );
}

/**
 * Measures how well an explicit anchor has been
 * realized by the candidate allocation/package.
 *
 * Auto has no anchor and therefore produces a neutral
 * comparison.
 */
function getAnchorRealization(
  candidate: CandidateEvaluation,
): number {
  const profile =
    candidate.anchorProfile;

  if (
    profile.kind === "AUTO" ||
    !profile.tower ||
    !profile.blueprint
  ) {
    return 0;
  }

  /*
   * First prefer the actual selected anchor tower
   * because package search is responsible for carrying
   * an explicit anchor into the package.
   */
  const selectedAnchor =
    candidate.towers.find(
      (state) =>
        state.tower.name ===
        profile.anchor,
    );

  if (!selectedAnchor) {
    return 0;
  }

  /*
   * Normalize realization against the anchor's
   * modeled maximum tier.
   *
   * Examples:
   * Dual:
   *   Lv1 => 1/3
   *   Lv2 => 2/3
   *   Lv3 => 3/3
   *
   * Trio:
   *   Lv1 => 1/2
   *   Lv2 => 2/2
   *
   * Quad:
   *   Lv1 => 1/1
   */
  const tier =
    Math.max(
      0,
      Math.min(
        selectedAnchor.tier,
        profile.maxTier,
      ),
    );

  const tierRatio =
    profile.maxTier > 0
      ? tier / profile.maxTier
      : 0;

  /*
   * Confirm that the allocation itself actually
   * satisfies the anchor blueprint.
   *
   * This is intentionally generic: it reads the
   * blueprint rather than knowing Howitzer/Haste/Doom.
   */
  const targetLevels =
    Object.entries(
      profile.blueprint
        .targetLevels,
    );

  if (
    targetLevels.length === 0
  ) {
    return tierRatio;
  }

  const elementRatios =
    targetLevels.map(
      ([element, target]) => {
        const elementIndex =
          candidate.allocationProfile
            .allocation
            .findIndex(
              (_, index) =>
                candidate.allocationProfile
                  .allocation[index] >=
                0 &&
                index >= 0,
            );

        /*
         * Find the actual elemental level through
         * the canonical element ordering used by
         * AllocationProfile's stored allocation.
         */
        const level =
          candidate.allocation[
            getElementIndex(
              element,
            )
          ] ?? 0;

        if (
          !target ||
          target <= 0
        ) {
          return 1;
        }

        return Math.min(
          1,
          level / target,
        );
      },
    );

  const blueprintRatio =
    elementRatios.length > 0
      ? Math.min(
          ...elementRatios,
        )
      : 0;

  /*
   * The actual tower tier and the elemental blueprint
   * must agree. The lower value is the true realization.
   */
  return Math.min(
    tierRatio,
    blueprintRatio,
  );
}

/**
 * Canonical element ordering used by Allocation.
 */
function getElementIndex(
  element: string,
): number {
  switch (element) {
    case "Light":
      return 0;

    case "Darkness":
      return 1;

    case "Water":
      return 2;

    case "Fire":
      return 3;

    case "Nature":
      return 4;

    case "Earth":
      return 5;

    default:
      return -1;
  }
}

/**
 * Compare explicit anchor realization.
 *
 * This is intentionally placed after the hard package
 * gates and allocation-ecosystem facts, but before the
 * numerical opportunity/synergy tie-breakers.
 */
function compareAnchorProfiles(
  a: CandidateEvaluation,
  b: CandidateEvaluation,
): number {
  const anchorA =
    a.anchorProfile;

  const anchorB =
    b.anchorProfile;

  /*
   * Auto never receives anchor preference.
   */
  if (
    anchorA.kind === "AUTO" &&
    anchorB.kind === "AUTO"
  ) {
    return 0;
  }

  /*
   * A candidate with an explicit requested anchor
   * should not lose to one that failed to realize it.
   */
  if (
    anchorA.kind === "AUTO" !==
    (anchorB.kind === "AUTO")
  ) {
    return anchorA.kind ===
      "AUTO"
      ? -1
      : 1;
  }

  const realizationA =
    getAnchorRealization(
      a,
    );

  const realizationB =
    getAnchorRealization(
      b,
    );

  return compareNumbers(
    realizationA,
    realizationB,
    true,
  );
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

  /*
   * Existing hard decision gates remain first.
   */
  for (
    let i = 0;
    i < gatesA.length;
    i += 1
  ) {
    if (
      gatesA[i] !==
      gatesB[i]
    ) {
      return gatesA[i]
        ? 1
        : -1;
    }
  }

  /*
   * 1. Allocation ecosystem quality
   */
  const allocationProfileResult =
    compareAllocationProfiles(
      a,
      b,
    );

  if (
    allocationProfileResult !== 0
  ) {
    return allocationProfileResult;
  }

  /*
   * 2. Explicit anchor realization
   *
   * Auto remains neutral here.
   */
  const anchorProfileResult =
    compareAnchorProfiles(
      a,
      b,
    );

  if (
    anchorProfileResult !== 0
  ) {
    return anchorProfileResult;
  }

  /*
   * 3. Numerical and downstream decision layers.
   */
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
      a.opportunity
        .opportunityLoss,
      b.opportunity
        .opportunityLoss,
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

  for (
    const [
      left,
      right,
      higher,
    ] of comparisons
  ) {
    const result =
      compareNumbers(
        left,
        right,
        higher,
      );

    if (
      result !== 0
    ) {
      return result;
    }
  }

  /*
   * Smaller packages win the final deterministic
   * tie-break.
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
      passed:
        candidate.legality
          .passed,
      reason:
        candidate.legality
          .reason ||
        "Legality evaluation completed.",
    },

    {
      name: "viability",
      passed:
        candidate.package
          .viability,
      reason:
        candidate.package
          .viability
          ? "A viable primary damage package exists."
          : "No viable primary damage package exists.",
    },

    {
      name: "primaryFunction",
      passed:
        candidate.package
          .primaryDps > 0,
      reason:
        candidate.package
          .primaryDps > 0
          ? "A positive primary DPS function is established."
          : "No positive primary DPS function is established.",
    },

    {
      name: "investmentQuality",
      passed:
        candidate.package
          .primaryDepth >= 1,
      reason:
        candidate.package
          .primaryDepth >= 1
          ? "Primary investment reaches modeled maximum depth."
          : "Primary investment remains below modeled maximum depth.",
    },

    {
      name: "packageComplete",
      passed:
        candidate.package
          .completeness >= 0.55,
      reason:
        candidate.package
          .completeness >= 0.55
          ? "Package completeness reaches the decision threshold."
          : "Package completeness is below the decision threshold.",
    },
  ];
}

function buildTuple(
  candidate: CandidateEvaluation,
): NonNullable<
  DecisionResult["tuple"]
> {
  return {
    legality:
      candidate.legality
        .passed,

    viability:
      candidate.package
        .viability,

    primaryFunction:
      candidate.package
        .primaryDps > 0,

    investmentQuality:
      candidate.package
        .primaryDepth >= 1,

    packageComplete:
      candidate.package
        .completeness >= 0.55,

    primaryDps:
      candidate.package
        .primaryDps,

    investmentDepth:
      candidate.package
        .primaryDepth,

    opportunityLoss:
      candidate.opportunity
        .opportunityLoss,

    realizedSynergy:
      candidate.synergy
        .realized,

    redundancy:
      candidate.redundancy
        .raw,

    antiSynergy:
      candidate.antiSynergy
        .raw,

    endgame:
      candidate.endgame
        .score,

    fineScore:
      candidate.fineScore,
  };
}

export function makeDecision(
  candidates: CandidateEvaluation[],
): DecisionResult {
  if (
    candidates.length === 0
  ) {
    return {
      winner: null,
      gates: [],
      tuple: null,
      finalists: [],
      rationale: [
        "No candidate evaluations were provided.",
      ],
      engineVersion:
        ENGINE_VERSION,
    };
  }

  const ranked =
    [...candidates].sort(
      (a, b) =>
        compareCandidates(
          b,
          a,
        ),
    );

  const winner =
    ranked[0];

  const gates =
    buildGates(
      winner,
    );

  const profile =
    winner.allocationProfile;

  const anchor =
    winner.anchorProfile;

  const anchorRealization =
    getAnchorRealization(
      winner,
    );

  const rationale = [
    `Winner allocation: ${winner.allocation.join(" / ")}.`,
    `Allocation shape: ${profile.shape}.`,
    `Active elements: ${profile.activeElements}.`,
    `Accessible Tri candidates: ${profile.triAccess}.`,
    `Accessible Quad candidates: ${profile.quadAccess}.`,
    `Primary DPS: ${winner.package.primaryDps.toFixed(2)}.`,
    `Primary depth: ${winner.package.primaryDepth.toFixed(2)}.`,
    `Opportunity loss: ${winner.opportunity.opportunityLoss.toFixed(2)}.`,
    `Realized synergy: ${winner.synergy.realized.toFixed(2)}.`,
    `Redundancy: ${winner.redundancy.raw.toFixed(2)}.`,
    `Anti-synergy: ${winner.antiSynergy.raw.toFixed(2)}.`,
    `Endgame: ${winner.endgame.score.toFixed(2)}.`,
  ];

  if (
    anchor.kind !== "AUTO"
  ) {
    rationale.splice(
      3,
      0,
      `Anchor: ${anchor.anchor}.`,
      `Anchor realization: ${(anchorRealization * 100).toFixed(0)}%.`,
    );
  }

  return {
    winner,

    gates,

    tuple:
      buildTuple(
        winner,
      ),

    finalists:
      ranked.slice(
        0,
        5,
      ),

    rationale,

    engineVersion:
      ENGINE_VERSION,
  };
}