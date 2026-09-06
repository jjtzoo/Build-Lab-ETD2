import { describe, expect, it } from "vitest";

import type { TowerProfile } from "@/lib/domain/towerProfile";
import { evaluateCombinedSynergyOpportunity } from "@/lib/engine/combinedSynergyOpportunity";

// Synthetic fixtures isolate direct and derived interactions.
const isolationConsumer: TowerProfile = {
  towerId: "isolation-consumer",
  coreRoles: [],
  mechanics: {
    provides: [],
    consumes: [
      {
        signal: "target-isolation",
        strength: 4,
        saturation: "single",
      },
    ],
  },
};

const deathConsumer: TowerProfile = {
  towerId: "death-consumer",
  coreRoles: [],
  mechanics: {
    provides: [],
    consumes: [
      {
        signal: "nearby-enemy-death",
        strength: 4,
        saturation: "repeatable",
      },
    ],
  },
};

const killProvider: TowerProfile = {
  towerId: "kill-provider",
  coreRoles: [],
  mechanics: {
    provides: [
      { signal: "kill-generation", strength: 4 },
    ],
    consumes: [],
  },
};

describe("evaluateCombinedSynergyOpportunity", () => {
  it("keeps direct and potential derived findings separate", () => {
    const candidate: TowerProfile = {
      towerId: "candidate",
      coreRoles: [],
      mechanics: {
        provides: [
          { signal: "target-isolation", strength: 3 },
          { signal: "kill-generation", strength: 4 },
        ],
        consumes: [],
      },
    };

    const result = evaluateCombinedSynergyOpportunity(
      [isolationConsumer, deathConsumer],
      candidate,
    );

    expect(result.candidateTowerId).toBe("candidate");
    expect(result.direct.before).toEqual([]);
    expect(result.derived.before).toEqual([]);

    expect(result.direct.after).toHaveLength(1);
    expect(result.direct.after[0]).toMatchObject({
      consumerTowerId: "isolation-consumer",
      signal: "target-isolation",
      effectiveStrength: 3,
      contribution: "full",
    });

    expect(result.derived.after).toHaveLength(1);
    expect(result.derived.after[0]).toMatchObject({
      providerTowerId: "candidate",
      consumerTowerId: "death-consumer",
      relationshipType: "derived",
      status: "potential",
      conditions: [
        "deaths-within-consumer-trigger-area",
      ],
    });
  });

  it("finds a candidate supplying a derived interaction", () => {
    const result = evaluateCombinedSynergyOpportunity(
      [deathConsumer],
      killProvider,
    );

    expect(result.direct.before).toEqual([]);
    expect(result.direct.after).toEqual([]);
    expect(result.derived.before).toEqual([]);
    expect(result.derived.after).toHaveLength(1);
    expect(result.derived.after[0]).toMatchObject({
      providerTowerId: "kill-provider",
      consumerTowerId: "death-consumer",
      status: "potential",
    });
  });

  it("finds a candidate consuming an existing derived supply", () => {
    const result = evaluateCombinedSynergyOpportunity(
      [killProvider],
      deathConsumer,
    );

    expect(result.derived.before).toEqual([]);
    expect(result.derived.after).toHaveLength(1);
    expect(result.derived.after[0]).toMatchObject({
      providerTowerId: "kill-provider",
      consumerTowerId: "death-consumer",
    });
  });

  it("preserves existing derived findings for an unrelated candidate", () => {
    const result = evaluateCombinedSynergyOpportunity(
      [killProvider, deathConsumer],
      isolationConsumer,
    );

    expect(result.derived.before).toHaveLength(1);
    expect(result.derived.after).toEqual(
      result.derived.before,
    );
  });

  it("retains direct saturation when a stronger candidate is added", () => {
    const existing: TowerProfile = {
      towerId: "existing",
      coreRoles: [],
      mechanics: {
        provides: [
          { signal: "target-isolation", strength: 2 },
        ],
        consumes: [],
      },
    };

    const candidate: TowerProfile = {
      ...existing,
      towerId: "candidate",
      mechanics: {
        provides: [
          { signal: "target-isolation", strength: 4 },
        ],
        consumes: [],
      },
    };

    const result = evaluateCombinedSynergyOpportunity(
      [isolationConsumer, existing],
      candidate,
    );

    expect(result.direct.before[0]).toMatchObject({
      providerTowerId: "existing",
      effectiveStrength: 2,
      contribution: "full",
    });

    expect(result.direct.after).toHaveLength(2);
    expect(result.direct.after).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerTowerId: "candidate",
          effectiveStrength: 4,
          contribution: "full",
        }),
        expect.objectContaining({
          providerTowerId: "existing",
          contribution: "ignored",
        }),
      ]),
    );
  });

  it("does not mutate the selection or candidate", () => {
    const selected = [deathConsumer];
    const originalSelected = structuredClone(selected);
    const originalCandidate = structuredClone(killProvider);

    evaluateCombinedSynergyOpportunity(
      selected,
      killProvider,
    );

    expect(selected).toEqual(originalSelected);
    expect(killProvider).toEqual(originalCandidate);
  });

  it("rejects a candidate that is already selected", () => {
    expect(() =>
      evaluateCombinedSynergyOpportunity(
        [deathConsumer],
        deathConsumer,
      ),
    ).toThrow("Candidate is already selected: death-consumer");
  });

  it("rejects duplicate selected tower IDs", () => {
    expect(() =>
      evaluateCombinedSynergyOpportunity(
        [deathConsumer, { ...deathConsumer }],
        killProvider,
      ),
    ).toThrow(
      "Duplicate selected tower profile: death-consumer",
    );
  });

  it("handles an empty selected package", () => {
    const result = evaluateCombinedSynergyOpportunity(
      [],
      killProvider,
    );

    expect(result.direct.before).toEqual([]);
    expect(result.direct.after).toEqual([]);
    expect(result.derived.before).toEqual([]);
    expect(result.derived.after).toEqual([]);
  });
});

describe("combined opportunity tension findings", () => {
  const densityConsumer: TowerProfile = {
    towerId: "density-consumer",
    coreRoles: ["main-dps"],
    offense: {
      damageShape: "aoe",
      damageProfile: "sustained",
      damageDelivery: "basic-attack",
      offensiveElement: "Water",
      scalingTriggers: ["density-scaling"],
    },
    mechanics: {
      provides: [],
      consumes: [],
    },
  };

  const isolationProvider: TowerProfile = {
    towerId: "isolation-provider",
    coreRoles: [],
    mechanics: {
      provides: [
        { signal: "target-isolation", strength: 4 },
      ],
      consumes: [],
    },
  };

  it("reports a candidate's benefit and potential tension together", () => {
    const result = evaluateCombinedSynergyOpportunity(
      [isolationConsumer, densityConsumer],
      isolationProvider,
    );

    expect(result.direct.after).toHaveLength(1);
    expect(result.direct.after[0]).toMatchObject({
      providerTowerId: "isolation-provider",
      consumerTowerId: "isolation-consumer",
      contribution: "full",
    });

    expect(result.tensions.before).toEqual([]);
    expect(result.tensions.after).toEqual([
      {
        providerTowerId: "isolation-provider",
        affectedTowerId: "density-consumer",
        signal: "target-isolation",
        affectedScalingTrigger: "density-scaling",
        relationshipType: "conditional",
        status: "potential",
        condition:
          "Target isolation reduces enemy density where the affected tower deals damage.",
      },
    ]);
  });

  it("finds a tension when the candidate is the affected tower", () => {
    const result = evaluateCombinedSynergyOpportunity(
      [isolationProvider],
      densityConsumer,
    );

    expect(result.tensions.before).toEqual([]);
    expect(result.tensions.after).toHaveLength(1);
    expect(result.tensions.after[0]).toMatchObject({
      providerTowerId: "isolation-provider",
      affectedTowerId: "density-consumer",
      status: "potential",
    });
  });

  it("preserves an existing tension when an unrelated candidate is added", () => {
    const result = evaluateCombinedSynergyOpportunity(
      [isolationProvider, densityConsumer],
      killProvider,
    );

    expect(result.tensions.before).toHaveLength(1);
    expect(result.tensions.after).toEqual(
      result.tensions.before,
    );
  });

  it("reports no tension without an affected density-scaling tower", () => {
    const result = evaluateCombinedSynergyOpportunity(
      [isolationConsumer],
      isolationProvider,
    );

    expect(result.direct.after).toHaveLength(1);
    expect(result.tensions.before).toEqual([]);
    expect(result.tensions.after).toEqual([]);
  });
});

describe("condition-aware combined contributions", () => {
  it.each(["met", "unmet", "unknown"] as const)(
    "handles a derived condition marked %s",
    (state) => {
      const result = evaluateCombinedSynergyOpportunity(
        [deathConsumer],
        killProvider,
        {
          after: [
            {
              providerTowerId: killProvider.towerId,
              consumerTowerId: deathConsumer.towerId,
              condition: "deaths-within-consumer-trigger-area",
              state,
            },
          ],
        },
      );

      expect(result.evaluatedDerived.after[0].conditionState)
        .toBe(state);

      expect(result.applicable.after).toHaveLength(
        state === "met" ? 1 : 0,
      );

      expect(result.summaries).toHaveLength(
        state === "met" ? 1 : 0,
      );

      if (state === "met") {
        expect(result.summaries[0].status).toBe("new-benefit");
      }
    },
  );

  it("keeps missing condition context unknown", () => {
    const result = evaluateCombinedSynergyOpportunity(
      [deathConsumer],
      killProvider,
    );

    expect(result.derived.after).toHaveLength(1);
    expect(result.evaluatedDerived.after[0].conditionState)
      .toBe("unknown");
    expect(result.applicable.after).toEqual([]);
  });

  it.each([
    ["single", "ignored"],
    ["diminishing", "diminished"],
    ["repeatable", "full"],
  ] as const)(
    "saturates direct and derived supply together under %s",
    (saturation, existingContribution) => {
      const consumer: TowerProfile = {
        ...deathConsumer,
        mechanics: {
          provides: [],
          consumes: [
            {
              signal: "nearby-enemy-death",
              strength: 3,
              saturation,
            },
          ],
        },
      };

      const existing: TowerProfile = {
        towerId: "existing-direct",
        coreRoles: [],
        mechanics: {
          provides: [
            { signal: "nearby-enemy-death", strength: 2 },
          ],
          consumes: [],
        },
      };

      const result = evaluateCombinedSynergyOpportunity(
        [consumer, existing],
        killProvider,
        {
          after: [
            {
              providerTowerId: killProvider.towerId,
              consumerTowerId: consumer.towerId,
              condition: "deaths-within-consumer-trigger-area",
              state: "met",
            },
          ],
        },
      );

      expect(result.applicable.after).toHaveLength(2);
      expect(result.applicable.after).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            providerTowerId: killProvider.towerId,
            effectiveStrength: 3,
            relationshipType: "derived",
            contribution: "full",
          }),
          expect.objectContaining({
            providerTowerId: "existing-direct",
            contribution: existingContribution,
          }),
        ]),
      );
    },
  );

  it("does not count alternate paths from one provider twice", () => {
    const candidate: TowerProfile = {
      ...killProvider,
      mechanics: {
        provides: [
          { signal: "kill-generation", strength: 4 },
          { signal: "nearby-enemy-death", strength: 4 },
        ],
        consumes: [],
      },
    };

    const result = evaluateCombinedSynergyOpportunity(
      [deathConsumer],
      candidate,
      {
        after: [
          {
            providerTowerId: candidate.towerId,
            consumerTowerId: deathConsumer.towerId,
            condition: "deaths-within-consumer-trigger-area",
            state: "met",
          },
        ],
      },
    );

    expect(result.direct.after).toHaveLength(1);
    expect(result.derived.after).toHaveLength(1);
    expect(result.applicable.after).toHaveLength(1);
    expect(result.summaries[0].additionalFullContributionCount)
      .toBe(1);
  });

  it("uses separate before and after condition context", () => {
    const result = evaluateCombinedSynergyOpportunity(
      [killProvider, deathConsumer],
      isolationConsumer,
      {
        before: [
          {
            providerTowerId: killProvider.towerId,
            consumerTowerId: deathConsumer.towerId,
            condition: "deaths-within-consumer-trigger-area",
            state: "met",
          },
        ],
        after: [
          {
            providerTowerId: killProvider.towerId,
            consumerTowerId: deathConsumer.towerId,
            condition: "deaths-within-consumer-trigger-area",
            state: "unmet",
          },
        ],
      },
    );

    expect(result.applicable.before).toHaveLength(1);
    expect(result.applicable.after).toEqual([]);
    expect(result.summaries[0].status).toBe("changed-benefit");
  });

  it("does not carry before context into after implicitly", () => {
    const result = evaluateCombinedSynergyOpportunity(
      [killProvider, deathConsumer],
      isolationConsumer,
      {
        before: [
          {
            providerTowerId: killProvider.towerId,
            consumerTowerId: deathConsumer.towerId,
            condition: "deaths-within-consumer-trigger-area",
            state: "met",
          },
        ],
      },
    );

    expect(result.evaluatedDerived.before[0].conditionState)
      .toBe("met");
    expect(result.evaluatedDerived.after[0].conditionState)
      .toBe("unknown");
  });
});

describe("replication applicability", () => {
  const replicator: TowerProfile = {
    towerId: "replicator",
    coreRoles: ["buff"],
    mechanics: {
      provides: [
        { signal: "tower-replication", strength: 4 },
      ],
      consumes: [],
    },
  };

  const compatibleConsumer: TowerProfile = {
    towerId: "compatible-consumer",
    coreRoles: ["main-dps"],
    mechanics: {
      provides: [],
      consumes: [
        {
          signal: "tower-replication",
          strength: 4,
          saturation: "repeatable",
        },
      ],
    },
  };

  it.each(["met", "unmet", "unknown"] as const)(
    "counts replication only when applicability is met: %s",
    (state) => {
      const result = evaluateCombinedSynergyOpportunity(
        [compatibleConsumer],
        replicator,
        {
          after: [
            {
              providerTowerId: replicator.towerId,
              consumerTowerId: compatibleConsumer.towerId,
              condition: "replication-applicable",
              state,
            },
          ],
        },
      );

      expect(result.direct.after).toHaveLength(1);
      expect(result.evaluatedDirect.after[0]).toMatchObject({
        condition: "replication-applicable",
        conditionState: state,
      });
      expect(result.applicable.after).toHaveLength(
        state === "met" ? 1 : 0,
      );
      expect(result.summaries).toHaveLength(
        state === "met" ? 1 : 0,
      );
    },
  );

  it("preserves a potential replication match without context", () => {
    const result = evaluateCombinedSynergyOpportunity(
      [compatibleConsumer],
      replicator,
    );

    expect(result.direct.after).toHaveLength(1);
    expect(result.evaluatedDirect.after[0].conditionState)
      .toBe("unknown");
    expect(result.applicable.after).toEqual([]);
  });

  it("does not share applicability between consumers", () => {
    const secondConsumer: TowerProfile = {
      ...compatibleConsumer,
      towerId: "second-consumer",
    };

    const result = evaluateCombinedSynergyOpportunity(
      [compatibleConsumer, secondConsumer],
      replicator,
      {
        after: [
          {
            providerTowerId: replicator.towerId,
            consumerTowerId: compatibleConsumer.towerId,
            condition: "replication-applicable",
            state: "met",
          },
        ],
      },
    );

    expect(result.direct.after).toHaveLength(2);
    expect(result.applicable.after).toHaveLength(1);
    expect(result.applicable.after[0].consumerTowerId)
      .toBe(compatibleConsumer.towerId);
  });

  it("does not infer compatibility from fixed-cooldown delivery", () => {
    const unclassified: TowerProfile = {
      towerId: "unclassified",
      coreRoles: ["main-dps"],
      offense: {
        damageShape: "aoe",
        damageProfile: "burst",
        damageDelivery: "fixed-cooldown",
        offensiveElement: "Light",
      },
      mechanics: {
        provides: [],
        consumes: [],
      },
    };

    const result = evaluateCombinedSynergyOpportunity(
      [unclassified],
      replicator,
      {
        after: [
          {
            providerTowerId: replicator.towerId,
            consumerTowerId: unclassified.towerId,
            condition: "replication-applicable",
            state: "met",
          },
        ],
      },
    );

    expect(result.direct.after).toEqual([]);
    expect(result.applicable.after).toEqual([]);
  });

  it("rejects contradictory replication context", () => {
    expect(() =>
      evaluateCombinedSynergyOpportunity(
        [compatibleConsumer],
        replicator,
        {
          after: [
            {
              providerTowerId: replicator.towerId,
              consumerTowerId: compatibleConsumer.towerId,
              condition: "replication-applicable",
              state: "met",
            },
            {
              providerTowerId: replicator.towerId,
              consumerTowerId: compatibleConsumer.towerId,
              condition: "replication-applicable",
              state: "unmet",
            },
          ],
        },
      ),
    ).toThrow("Conflicting condition states");
  });
});