import { describe, expect, it } from "vitest";

import type {
  Allocation,
  ElementName,
} from "@/lib/types";

import {
  buildAnchorProfile,
} from "@/lib/engine/anchor-profile";

import {
  buildAllocationProfile,
  type AllocationProfile,
} from "@/lib/engine/allocation-profile";

import {
  compareCandidates,
} from "@/lib/engine/decision-engine";

import type {
  CandidateEvaluation,
  EndgameEvaluation,
  OpportunityCostEvaluation,
  RedundancyEvaluation,
  SynergyEvaluation,
} from "@/lib/engine/types";

function makeProfile(
  overrides: Partial<
    Pick<
      AllocationProfile,
      | "shape"
      | "activeElements"
      | "triAccess"
      | "quadAccess"
      | "quadCount"
      | "dualDepth"
      | "functionalAccess"
      | "structuralWeakness"
    >
  > = {},
): AllocationProfile {
  const allocation: Allocation = [
    3,
    3,
    2,
    2,
    1,
    0,
  ];

  const base =
    buildAllocationProfile(
      allocation,
    );

  return {
    ...base,

    shape:
      overrides.shape ??
      base.shape,

    activeElements:
      overrides.activeElements ??
      base.activeElements,

    triAccess:
      overrides.triAccess ??
      base.triAccess,

    quadAccess:
      overrides.quadAccess ??
      base.quadAccess,

    quadCount:
      overrides.quadCount ??
      base.quadCount,

    dualDepth:
      overrides.dualDepth ??
      base.dualDepth,

    functionalAccess:
      overrides.functionalAccess ??
      base.functionalAccess,

    structuralWeakness:
      overrides.structuralWeakness ??
      base.structuralWeakness,
  };
}

function makeCandidate(
  profile: AllocationProfile,
  primaryDps: number,
): CandidateEvaluation {
  const allocation: Allocation = [
    3,
    3,
    2,
    2,
    1,
    0,
  ];

  const opportunity:
    OpportunityCostEvaluation = {
    score: 0,
    opportunityLoss: 0,
    lostDepth: 0,
    lostDps: 0,
    replacementGain: 0,
    breadthCost: 0,
    selectedPrimary: null,
    bestAvailableReplacement: null,
    protection: "OFF",
    provenance: [],
  };

  const synergy:
    SynergyEvaluation = {
    score: 0,
    realized: 0,
    anti: 0,
    edges: [],
    reasons: [],
    confidence: "UNKNOWN",
    provenance: [],
  };

  const redundancy:
    RedundancyEvaluation = {
    score: 0,
    raw: 0,
    duplicateRoles: {},
    provenance: [],
  };

  const endgame:
    EndgameEvaluation = {
    score: 0,
    totalEssence: 2,
    spent: 0,
    selected: [],
    availablePure: [],
    periodicAvailable: false,
    periodicState: "UNKNOWN",
    reasons: [],
    provenance: [],
  };

  return {
    allocation,

    allocationProfile:
      profile,

    core: [
      "Light",
      "Darkness",
      "Water",
    ],

    anchor: null,

    anchorProfile:
      buildAnchorProfile(
        "Auto",
      ),

    towers: [],

    legality: {
      name: "legality",
      passed: true,
      reason: "PASS",
    },

    evaluators:
      {} as CandidateEvaluation[
        "evaluators"
      ],

    package: {
      score: 0,

      viability: true,

      primaryDps,

      secondaryDps: 0,

      primaryDepth: 1,

      completeness: 1,

      duplicatePenalty: 0,

      counts: {
        main: 1,
        sub: 0,
        control: 1,
        cover: 1,
        amp: 0,
        range: 0,
        scaling: 0,
        support: 0,
        manual: 0,
      },

      missing: [],

      primaryState: null,

      secondPrimary: null,

      provenance: [],
    },

    synergy,

    opportunity,

    redundancy,

    antiSynergy: {
      score: 0,
      raw: 0,
      reasons: [],
      provenance: [],
    },

    endgame,

    fineScore: 0,
  };
}

describe(
  "allocation profile decision integration",
  () => {
    it(
      "prefers a healthier allocation ecosystem before raw DPS",
      () => {
        const healthyProfile =
          makeProfile({
            structuralWeakness: {
              isWeak: false,
              reasons: [],
            },

            functionalAccess: {
              mainDPS: 2,
              control: 1,
              coverage: 1,
              amplification: 1,
              range: 1,
              scaling: 1,
              support: 1,
            },

            triAccess: 4,

            quadAccess: 5,

            quadCount: 5,

            dualDepth: [
              {
                elements: [
                  "Light",
                  "Darkness",
                ],

                depth: 3,

                towerCount: 3,
              },
            ],
          });

        const weakProfile =
          makeProfile({
            structuralWeakness: {
              isWeak: true,
              reasons: [
                "No meaningful control or coverage.",
              ],
            },

            functionalAccess: {
              mainDPS: 1,
              control: 0,
              coverage: 0,
              amplification: 0,
              range: 0,
              scaling: 0,
              support: 0,
            },

            triAccess: 1,

            quadAccess: 1,

            quadCount: 1,

            dualDepth: [
              {
                elements: [
                  "Light",
                  "Darkness",
                ],

                depth: 2,

                towerCount: 1,
              },
            ],
          });

        const healthy =
          makeCandidate(
            healthyProfile,
            90,
          );

        const weak =
          makeCandidate(
            weakProfile,
            100,
          );

        expect(
          compareCandidates(
            healthy,
            weak,
          ),
        ).toBeGreaterThan(0);

        expect(
          compareCandidates(
            weak,
            healthy,
          ),
        ).toBeLessThan(0);
      },
    );

    it(
      "keeps identical allocation profiles neutral",
      () => {
        const profile =
          makeProfile({
            structuralWeakness: {
              isWeak: false,
              reasons: [],
            },

            functionalAccess: {
              mainDPS: 2,
              control: 1,
              coverage: 1,
              amplification: 1,
              range: 1,
              scaling: 1,
              support: 1,
            },

            triAccess: 3,

            quadAccess: 3,

            quadCount: 3,

            dualDepth: [
              {
                elements: [
                  "Light",
                  "Darkness",
                ],

                depth: 3,

                towerCount: 2,
              },
            ],
          });

        const lower =
          makeCandidate(
            profile,
            80,
          );

        const higher =
          makeCandidate(
            profile,
            100,
          );

        expect(
          compareCandidates(
            higher,
            lower,
          ),
        ).toBeGreaterThan(0);

        expect(
          compareCandidates(
            lower,
            higher,
          ),
        ).toBeLessThan(0);
      },
    );

    it(
      "uses functional breadth when structural weakness is tied",
      () => {
        const broadProfile =
          makeProfile({
            structuralWeakness: {
              isWeak: false,
              reasons: [],
            },

            functionalAccess: {
              mainDPS: 2,
              control: 1,
              coverage: 1,
              amplification: 1,
              range: 0,
              scaling: 0,
              support: 0,
            },

            triAccess: 2,

            quadAccess: 2,

            quadCount: 2,
          });

        const narrowProfile =
          makeProfile({
            structuralWeakness: {
              isWeak: false,
              reasons: [],
            },

            functionalAccess: {
              mainDPS: 1,
              control: 0,
              coverage: 0,
              amplification: 0,
              range: 0,
              scaling: 0,
              support: 0,
            },

            triAccess: 2,

            quadAccess: 2,

            quadCount: 2,
          });

        const broad =
          makeCandidate(
            broadProfile,
            100,
          );

        const narrow =
          makeCandidate(
            narrowProfile,
            110,
          );

        expect(
          compareCandidates(
            broad,
            narrow,
          ),
        ).toBeGreaterThan(0);
      },
    );
  },
);