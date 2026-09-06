import { describe, expect, it } from "vitest";

import type { MechanicRelationship } from "@/lib/domain/mechanicSignals";
import type { TowerProfile } from "@/lib/domain/towerProfile";
import { findDerivedMechanicSynergies } from "@/lib/engine/derivedMechanicSynergy";
import profileCatalog from "@/data/towerProfiles.v1.json";
import { findDirectMechanicSynergies } from "@/lib/engine/mechanicSynergy";
import { evaluateDerivedSynergyConditions } from "@/lib/engine/derivedSynergyConditions";

// Synthetic profiles test the relationship independently
// of the pending Shredder profile change.
const provider: TowerProfile = {
  towerId: "kill-provider",
  coreRoles: [],
  mechanics: {
    provides: [
      { signal: "kill-generation", strength: 3 },
    ],
    consumes: [],
  },
};

const consumer: TowerProfile = {
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

const relationship: MechanicRelationship = {
  from: "kill-generation",
  to: "nearby-enemy-death",
  type: "derived",
  conditions: ["deaths-within-consumer-trigger-area"],
};

describe("findDerivedMechanicSynergies", () => {
  it("finds the registered chain and preserves its required condition", () => {
    const result = findDerivedMechanicSynergies([
      provider,
      consumer,
    ]);

    expect(result).toEqual([
      {
        providerTowerId: "kill-provider",
        consumerTowerId: "death-consumer",
        providerSignal: "kill-generation",
        consumerSignal: "nearby-enemy-death",
        providerStrength: 3,
        consumerStrength: 4,
        saturation: "repeatable",
        relationshipType: "derived",
        status: "potential",
        conditions: [
          "deaths-within-consumer-trigger-area",
        ],
      },
    ]);
  });

  it("does not infer a chain without a registered relationship", () => {
    expect(
      findDerivedMechanicSynergies(
        [provider, consumer],
        [],
      ),
    ).toEqual([]);
  });

  it("requires the provider to supply the relationship's source signal", () => {
    const unrelatedProvider: TowerProfile = {
      ...provider,
      mechanics: {
        provides: [
          { signal: "enemy-grouping", strength: 4 },
        ],
        consumes: [],
      },
    };

    expect(
      findDerivedMechanicSynergies([
        unrelatedProvider,
        consumer,
      ]),
    ).toEqual([]);
  });

  it("requires the consumer to demand the relationship's destination signal", () => {
    const unrelatedConsumer: TowerProfile = {
      ...consumer,
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

    expect(
      findDerivedMechanicSynergies([
        provider,
        unrelatedConsumer,
      ]),
    ).toEqual([]);
  });

  it("does not infer demand from kill scaling alone", () => {
    const scalingOnly: TowerProfile = {
      towerId: "scaling-only",
      coreRoles: ["main-dps"],
      offense: {
        damageShape: "aoe",
        damageProfile: "ramp",
        damageDelivery: "basic-attack",
        offensiveElement: "Darkness",
        scalingTriggers: ["kill-scaling"],
      },
      mechanics: {
        provides: [],
        consumes: [],
      },
    };

    expect(
      findDerivedMechanicSynergies([
        provider,
        scalingOnly,
      ]),
    ).toEqual([]);
  });

  it("does not create self-synergy", () => {
    const combined: TowerProfile = {
      ...consumer,
      mechanics: {
        provides: provider.mechanics.provides,
        consumes: consumer.mechanics.consumes,
      },
    };

    expect(
      findDerivedMechanicSynergies([combined]),
    ).toEqual([]);
  });

  it("does not process direct relationship entries", () => {
    const otherRelationships: MechanicRelationship[] = [
      { ...relationship, type: "direct" },
    ];

    expect(
      findDerivedMechanicSynergies(
        [provider, consumer],
        otherRelationships,
      ),
    ).toEqual([]);
  });

  it("preserves conditional relationships between different signals", () => {
    const matches = findDerivedMechanicSynergies(
      [provider, consumer],
      [{ ...relationship, type: "conditional" }],
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      relationshipType: "conditional",
      conditions: ["deaths-within-consumer-trigger-area"],
    });
  });

  it("does not duplicate an existing direct supply as derived synergy", () => {
    const directProvider: TowerProfile = {
      ...provider,
      mechanics: {
        provides: [
          { signal: "nearby-enemy-death", strength: 3 },
        ],
        consumes: [],
      },
    };

    expect(
      findDerivedMechanicSynergies([
        directProvider,
        consumer,
      ]),
    ).toEqual([]);
  });

  it("reports each consumer separately", () => {
    const secondConsumer: TowerProfile = {
      ...consumer,
      towerId: "second-consumer",
    };

    const result = findDerivedMechanicSynergies([
      provider,
      consumer,
      secondConsumer,
    ]);

    expect(
      result.map((match) => match.consumerTowerId),
    ).toEqual([
      "death-consumer",
      "second-consumer",
    ]);
  });

  it("does not mutate the input profiles or relationships", () => {
    const profiles = [provider, consumer];
    const relationships = [relationship];

    const originalProfiles = structuredClone(profiles);
    const originalRelationships =
      structuredClone(relationships);

    const result = findDerivedMechanicSynergies(
      profiles,
      relationships,
    );

    expect(profiles).toEqual(originalProfiles);
    expect(relationships).toEqual(originalRelationships);
    expect(result[0].conditions).not.toBe(
      relationship.conditions,
    );
  });

  it("returns no matches for an empty package", () => {
    expect(findDerivedMechanicSynergies([])).toEqual([]);
  });
});

describe("canonical Shredder–Ethereal relationship", () => {
  it("uses a conditional derived chain instead of direct nearby-death supply", () => {
    // Catalog structure is checked by the profile validator.
    const profiles =
      profileCatalog.profiles as readonly TowerProfile[];

    const shredder = profiles.find(
      (profile) => profile.towerId === "shredder",
    );
    const ethereal = profiles.find(
      (profile) => profile.towerId === "ethereal",
    );

    if (!shredder || !ethereal) {
      throw new Error(
        "Canonical Shredder and Ethereal profiles must exist.",
      );
    }

    const selected = [shredder, ethereal];

    expect(shredder.mechanics.provides).toContainEqual({
      signal: "kill-generation",
      strength: 4,
    });

    expect(
      shredder.mechanics.provides.some(
        (supply) => supply.signal === "nearby-enemy-death",
      ),
    ).toBe(false);

    expect(findDirectMechanicSynergies(selected)).toEqual([]);

    expect(findDerivedMechanicSynergies(selected)).toEqual([
      {
        providerTowerId: "shredder",
        consumerTowerId: "ethereal",
        providerSignal: "kill-generation",
        consumerSignal: "nearby-enemy-death",
        providerStrength: 4,
        consumerStrength: 4,
        saturation: "repeatable",
        relationshipType: "derived",
        status: "potential",
        conditions: [
          "deaths-within-consumer-trigger-area",
        ],
      },
    ]);
  });
});

describe("derived synergy condition evaluation", () => {
  function getMatches() {
    return findDerivedMechanicSynergies([
      provider,
      consumer,
    ]);
  }

  it("defaults missing condition information to unknown", () => {
    const result = evaluateDerivedSynergyConditions(
      getMatches(),
    );

    expect(result[0].conditionState).toBe("unknown");
    expect(result[0].conditions).toEqual([
      {
        condition: "deaths-within-consumer-trigger-area",
        state: "unknown",
      },
    ]);
  });

  it("recognizes an explicitly met condition", () => {
    const result = evaluateDerivedSynergyConditions(
      getMatches(),
      [
        {
          providerTowerId: provider.towerId,
          consumerTowerId: consumer.towerId,
          condition: "deaths-within-consumer-trigger-area",
          state: "met",
        },
      ],
    );

    expect(result[0].conditionState).toBe("met");
  });

  it("recognizes an explicitly unmet condition", () => {
    const result = evaluateDerivedSynergyConditions(
      getMatches(),
      [
        {
          providerTowerId: provider.towerId,
          consumerTowerId: consumer.towerId,
          condition: "deaths-within-consumer-trigger-area",
          state: "unmet",
        },
      ],
    );

    expect(result[0].conditionState).toBe("unmet");
  });

  it("does not share condition states across different tower pairs", () => {
    const secondProvider: TowerProfile = {
      ...provider,
      towerId: "second-provider",
    };

    const secondConsumer: TowerProfile = {
      ...consumer,
      towerId: "second-consumer",
    };

    const matches = findDerivedMechanicSynergies([
      provider,
      secondProvider,
      consumer,
      secondConsumer,
    ]);

    const result = evaluateDerivedSynergyConditions(
      matches,
      [
        {
          providerTowerId: provider.towerId,
          consumerTowerId: consumer.towerId,
          condition: "deaths-within-consumer-trigger-area",
          state: "met",
        },
      ],
    );

    expect(result).toHaveLength(4);

    const met = result.filter(
      (entry) => entry.conditionState === "met",
    );

    expect(met).toHaveLength(1);
    expect(met[0].match).toMatchObject({
      providerTowerId: provider.towerId,
      consumerTowerId: consumer.towerId,
    });

    expect(
      result.filter(
        (entry) => entry.conditionState === "unknown",
      ),
    ).toHaveLength(3);
  });

  it("rejects contradictory states for the same condition and pair", () => {
    expect(() =>
      evaluateDerivedSynergyConditions(getMatches(), [
        {
          providerTowerId: provider.towerId,
          consumerTowerId: consumer.towerId,
          condition: "deaths-within-consumer-trigger-area",
          state: "met",
        },
        {
          providerTowerId: provider.towerId,
          consumerTowerId: consumer.towerId,
          condition: "deaths-within-consumer-trigger-area",
          state: "unmet",
        },
      ]),
    ).toThrow("Conflicting condition states");
  });

  it("treats an interaction with no required conditions as met", () => {
    const matches = getMatches().map((match) => ({
      ...match,
      conditions: [],
    }));

    const result = evaluateDerivedSynergyConditions(matches);

    expect(result[0].conditionState).toBe("met");
    expect(result[0].conditions).toEqual([]);
  });

  it("does not mutate the original match when evaluating conditions", () => {
    const matches = getMatches();
    const original = structuredClone(matches);

    evaluateDerivedSynergyConditions(matches, [
      {
        providerTowerId: provider.towerId,
        consumerTowerId: consumer.towerId,
        condition: "deaths-within-consumer-trigger-area",
        state: "met",
      },
    ]);

    expect(matches).toEqual(original);
  });
});