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