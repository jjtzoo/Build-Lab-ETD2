import { describe, expect, it } from "vitest";

import profileCatalog from "@/data/towerProfiles.v1.json";
import type { TowerProfile } from "@/lib/domain/towerProfile";
import {
  applyMechanicSaturation,
  findDirectMechanicSynergies,
} from "@/lib/engine/mechanicSynergy";
import { evaluateCombinedSynergyOpportunity } from "@/lib/engine/combinedSynergyOpportunity";

function profile(towerId: string): TowerProfile {
  const result = (profileCatalog.profiles as readonly TowerProfile[]).find(
    (entry) => entry.towerId === towerId,
  );

  if (!result) {
    throw new Error(`Canonical ${towerId} profile must exist.`);
  }

  return result;
}

describe("Step 8 regression audit", () => {
  it("exposes both isolation providers to Laser at their real strengths", () => {
    // Rage's speed-up is full-strength isolation; Gravity Cannon's is
    // weaker (it can clump as easily as separate). Phantom Zone is not an
    // isolation provider — its stasis bunches the trailing pack.
    const expected: Record<string, number> = {
      rage: 4,
      "gravity-cannon": 2,
    };

    for (const [provider, strength] of Object.entries(
      expected,
    )) {
      const matches = findDirectMechanicSynergies([
        profile(provider),
        profile("laser"),
      ]);

      expect(matches).toContainEqual(
        expect.objectContaining({
          providerTowerId: provider,
          consumerTowerId: "laser",
          signal: "target-isolation",
          effectiveStrength: strength,
        }),
      );
    }

    expect(
      findDirectMechanicSynergies([
        profile("phantom-zone"),
        profile("laser"),
      ]).some(
        (match) => match.signal === "target-isolation",
      ),
    ).toBe(false);
  });

  it("exposes both isolation providers to Incantation at their real strengths", () => {
    const expected: Record<string, number> = {
      rage: 3,
      "gravity-cannon": 2,
    };

    for (const [provider, strength] of Object.entries(
      expected,
    )) {
      const matches = findDirectMechanicSynergies([
        profile(provider),
        profile("incantation"),
      ]);

      expect(matches).toContainEqual(
        expect.objectContaining({
          providerTowerId: provider,
          consumerTowerId: "incantation",
          signal: "target-isolation",
          effectiveStrength: strength,
        }),
      );
    }
  });

  it("keeps isolation saturation single for Laser", () => {
    const saturated = applyMechanicSaturation(
      findDirectMechanicSynergies([
        profile("laser"),
        profile("rage"),
        profile("gravity-cannon"),
      ]),
    ).filter(
      (match) =>
        match.consumerTowerId === "laser" &&
        match.signal === "target-isolation",
    );

    expect(saturated).toHaveLength(2);

    expect(
      saturated.map((match) => match.contribution),
    ).toEqual(["full", "ignored"]);
  });

  it("connects Polar HP removal directly to Disease", () => {
    const matches = findDirectMechanicSynergies([
      profile("polar"),
      profile("disease"),
    ]);

    expect(matches).toContainEqual(
      expect.objectContaining({
        providerTowerId: "polar",
        consumerTowerId: "disease",
        signal: "current-hp-removal",
        effectiveStrength: 4,
      }),
    );
  });

  it("keeps Shredder to Ethereal visible as conditional derived synergy", () => {
    const result = evaluateCombinedSynergyOpportunity(
      [profile("ethereal")],
      profile("shredder"),
    );

    expect(result.opportunities).toContainEqual(
      expect.objectContaining({
        providerTowerId: "shredder",
        consumerTowerId: "ethereal",
        signal: "nearby-enemy-death",
      }),
    );
  });

  it("realizes Shredder to Ethereal when nearby-death condition is met", () => {
    const result = evaluateCombinedSynergyOpportunity(
      [profile("ethereal")],
      profile("shredder"),
      {
        after: [
          {
            providerTowerId: "shredder",
            consumerTowerId: "ethereal",
            condition: "deaths-within-consumer-trigger-area",
            state: "met",
          },
        ],
      },
    );

    expect(result.applicable.after).toContainEqual(
      expect.objectContaining({
        providerTowerId: "shredder",
        consumerTowerId: "ethereal",
        signal: "nearby-enemy-death",
        effectiveStrength: 4,
      }),
    );
  });

  it("connects Shredder kill generation directly to Life Altar", () => {
    const matches = findDirectMechanicSynergies([
      profile("shredder"),
      profile("life-altar"),
    ]);

    expect(matches).toContainEqual(
      expect.objectContaining({
        providerTowerId: "shredder",
        consumerTowerId: "life-altar",
        signal: "kill-generation",
        effectiveStrength: 3,
      }),
    );
  });

  it("exposes grouping providers to a defining density consumer", () => {
    for (const provider of [
      "windstorm",
      "archdruid",
      "singularity",
    ]) {
      const matches = findDirectMechanicSynergies([
        profile(provider),
        profile("vapor"),
      ]);

      expect(matches).toContainEqual(
        expect.objectContaining({
          providerTowerId: provider,
          consumerTowerId: "vapor",
          signal: "enemy-grouping",
        }),
      );
    }
  });

  it("applies diminishing returns to repeated grouping support", () => {
    const saturated = applyMechanicSaturation(
      findDirectMechanicSynergies([
        profile("vapor"),
        profile("windstorm"),
        profile("singularity"),
      ]),
    ).filter(
      (match) =>
        match.consumerTowerId === "vapor" &&
        match.signal === "enemy-grouping",
    );

    expect(
      saturated.map((match) => match.contribution),
    ).toEqual([
      "full",
      "diminished",
    ]);
  });

  it("keeps Trickery replication conditional before applicability is known", () => {
    const result = evaluateCombinedSynergyOpportunity(
      [profile("solar")],
      profile("trickery"),
    );

    expect(result.opportunities).toContainEqual(
      expect.objectContaining({
        providerTowerId: "trickery",
        consumerTowerId: "solar",
        signal: "tower-replication",
      }),
    );

    expect(result.applicable.after).toEqual([]);
  });

  it("realizes Trickery replication when compatibility is confirmed", () => {
    const result = evaluateCombinedSynergyOpportunity(
      [profile("solar")],
      profile("trickery"),
      {
        after: [
          {
            providerTowerId: "trickery",
            consumerTowerId: "solar",
            condition: "replication-applicable",
            state: "met",
          },
        ],
      },
    );

    expect(result.applicable.after).toContainEqual(
      expect.objectContaining({
        providerTowerId: "trickery",
        consumerTowerId: "solar",
        signal: "tower-replication",
        effectiveStrength: 4,
      }),
    );
  });

  it("preserves different Well values by consumer mechanic", () => {
    const matches = findDirectMechanicSynergies([
      profile("well"),
      profile("quake"),
      profile("laser"),
      profile("ice"),
    ]);

    expect(matches).toContainEqual(
      expect.objectContaining({
        consumerTowerId: "quake",
        signal: "attack-speed-buff",
        effectiveStrength: 4,
      }),
    );

    expect(matches).toContainEqual(
      expect.objectContaining({
        consumerTowerId: "laser",
        signal: "attack-speed-buff",
        effectiveStrength: 3,
      }),
    );

    expect(matches).toContainEqual(
      expect.objectContaining({
        consumerTowerId: "ice",
        signal: "attack-speed-buff",
        effectiveStrength: 2,
      }),
    );
  });

  it("does not invent Well synergy for Bloom", () => {
    const matches = findDirectMechanicSynergies([
      profile("well"),
      profile("bloom"),
    ]);

    expect(
      matches.some(
        (match) =>
          match.consumerTowerId === "bloom" &&
          match.signal === "attack-speed-buff",
      ),
    ).toBe(false);
  });

  it("preserves different Blacksmith values by consumer mechanic", () => {
    const matches = findDirectMechanicSynergies([
      profile("blacksmith"),
      profile("doom"),
      profile("laser"),
      profile("plague"),
    ]);

    expect(matches).toContainEqual(
      expect.objectContaining({
        consumerTowerId: "doom",
        signal: "attack-damage-buff",
        effectiveStrength: 4,
      }),
    );

    expect(matches).toContainEqual(
      expect.objectContaining({
        consumerTowerId: "laser",
        signal: "attack-damage-buff",
        effectiveStrength: 3,
      }),
    );

    expect(matches).toContainEqual(
      expect.objectContaining({
        consumerTowerId: "plague",
        signal: "attack-damage-buff",
        effectiveStrength: 2,
      }),
    );
  });

  it("keeps repeated slows diminishing for Mushroom", () => {
    const saturated = applyMechanicSaturation(
      findDirectMechanicSynergies([
        profile("mushroom"),
        profile("nova"),
        profile("windstorm"),
      ]),
    ).filter(
      (match) =>
        match.consumerTowerId === "mushroom" &&
        match.signal === "enemy-slow",
    );

    expect(
      saturated.map((match) => match.contribution),
    ).toEqual([
      "full",
      "diminished",
    ]);
  });
});