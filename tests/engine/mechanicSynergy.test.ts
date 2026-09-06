import { describe, expect, it } from "vitest";
import profileCatalog from "@/data/towerProfiles.v1.json";
import { CURATED_ANCHORS } from "@/lib/domain/anchorPolicy";
import { evaluateCombinedSynergyOpportunity } from "@/lib/engine/combinedSynergyOpportunity";

import type { TowerProfile } from "@/lib/domain/towerProfile";
import {
  applyMechanicSaturation,
  findDirectMechanicSynergies,
} from "@/lib/engine/mechanicSynergy";

describe("curated five-tower synergy batch", () => {
  function profile(id: string): TowerProfile {
    const found = (profileCatalog.profiles as readonly TowerProfile[])
      .find((entry) => entry.towerId === id);
    if (!found) throw new Error(`Missing canonical profile: ${id}`);
    return found;
  }

  // Strategic ratings, not measured damage multipliers. Mechanics are
  // described in data/mechanics.json (core_mechanic for these five towers).
  // Buff/replication demands use the catalog's existing repeatable source
  // convention; this does not assert that identical in-game buffs stack.
  // Slow/grouping use diminishing returns: the first source helps, while
  // additional providers do not guarantee proportional extra targets/uptime.
  it.each([
    ["golem", "blacksmith", "attack-damage-buff", 3,
      "stronger attacks during the active burst, without removing downtime"],
    ["golem", "well", "attack-speed-buff", 3,
      "more attacks during the active burst, without shortening the rest cycle"],
    ["astral", "blacksmith", "attack-damage-buff", 3,
      "stronger attack output rather than a range-based preference"],
    ["astral", "well", "attack-speed-buff", 3,
      "more attacks during the timed window, not a shorter ability cooldown"],
    ["runic", "blacksmith", "attack-damage-buff", 3,
      "stronger attacks in its area-attack window"],
    ["runic", "well", "attack-speed-buff", 3,
      "more attacks during the timed window, not a shorter ability cooldown"],
    ["quake", "well", "attack-speed-buff", 4,
      "faster attack-count progression generates more shockwave triggers"],
    ["quake", "blacksmith", "attack-damage-buff", 2,
      "basic-attack benefit without claiming its fixed shockwave damage scales"],
  ] as const)("%s benefits from %s: %s (%s) — %s",
    (consumer, provider, signal, strength, reason) => {
      expect(reason).not.toBe("");
      const matches = findDirectMechanicSynergies([
        profile(provider), profile(consumer),
      ]);
      expect(matches).toContainEqual(expect.objectContaining({
        providerTowerId: provider, consumerTowerId: consumer,
        signal, effectiveStrength: strength,
      }));
    },
  );

  it.each([
    ["golem", 3], ["astral", 3], ["runic", 3], ["crystal-spire", 4],
  ] as const)("retains replication as an opportunity for %s", (consumer, strength) => {
    const unknown = evaluateCombinedSynergyOpportunity(
      [profile(consumer)], profile("trickery"),
    );
    expect(unknown.opportunities).toContainEqual(expect.objectContaining({
      providerTowerId: "trickery", consumerTowerId: consumer,
      signal: "tower-replication",
      after: [expect.objectContaining({ consumerStrength: strength,
        conditionState: "unknown" })],
    }));
    expect(unknown.applicable.after).toEqual([]);

    const applicable = evaluateCombinedSynergyOpportunity(
      [profile(consumer)], profile("trickery"), {
        after: [{ providerTowerId: "trickery", consumerTowerId: consumer,
          condition: "replication-applicable", state: "met" }],
      },
    );
    expect(applicable.applicable.after).toContainEqual(expect.objectContaining({
      signal: "tower-replication", effectiveStrength: strength,
    }));
  });

  it.each([
    ["runic", 4], ["quake", 3], ["crystal-spire", 3],
  ] as const)("%s recognizes grouping from different providers", (consumer, strength) => {
    const matches = applyMechanicSaturation(findDirectMechanicSynergies([
      profile(consumer), profile("windstorm"), profile("singularity"),
    ])).filter((match) => match.consumerTowerId === consumer &&
      match.signal === "enemy-grouping");
    expect(matches).toHaveLength(2);
    expect(matches.map((match) => match.contribution)).toEqual(["full", "diminished"]);
    expect(matches[0].effectiveStrength).toBe(strength);
  });

  it.each([
    ["golem", 3], ["astral", 2], ["runic", 3], ["quake", 3], ["crystal-spire", 3],
  ] as const)("%s recognizes slow as attack-window support", (consumer, strength) => {
    expect(findDirectMechanicSynergies([
      profile("nova"), profile(consumer),
    ])).toContainEqual(expect.objectContaining({
      signal: "enemy-slow", consumerTowerId: consumer,
      consumerStrength: strength, saturation: "diminishing",
    }));
    // A benefit from slow does not make a tower a slow-scaling damage mechanic.
    expect(profile(consumer).offense?.scalingTriggers ?? []).not.toContain("slow-scaling");
  });

  it("keeps Golem burst single-target and outside the anchor whitelist", () => {
    expect(profile("golem").offense).toMatchObject({
      damageShape: "single-target", damageProfile: "burst", damageDelivery: "periodic",
    });
    expect(CURATED_ANCHORS.some((anchor) => anchor.towerId === "golem")).toBe(false);
  });
});

describe("findDirectMechanicSynergies", () => {
  it("matches Rage target isolation with Incantation", () => {
    const profiles: TowerProfile[] = [
      {
        towerId: "rage",
        coreRoles: [],
        mechanics: {
          provides: [
            {
              signal: "target-isolation",
              strength: 4,
            },
          ],
          consumes: [],
        },
      },
      {
        towerId: "incantation",
        coreRoles: ["damage-amp"],
        mechanics: {
          provides: [],
          consumes: [
            {
              signal: "target-isolation",
              strength: 3,
              saturation: "single",
            },
          ],
        },
      },
    ];

    const matches = findDirectMechanicSynergies(profiles);

    expect(matches).toEqual([
      {
        providerTowerId: "rage",
        consumerTowerId: "incantation",
        signal: "target-isolation",
        providerStrength: 4,
        consumerStrength: 3,
        effectiveStrength: 3,
        saturation: "single",
        relationshipType: "direct",
      },
    ]);
  });

  it("matches Well attack speed with Flamethrower", () => {
    const profiles: TowerProfile[] = [
      {
        towerId: "well",
        coreRoles: ["buff"],
        mechanics: {
          provides: [
            {
              signal: "attack-speed-buff",
              strength: 4,
            },
          ],
          consumes: [],
        },
      },
      {
        towerId: "flamethrower",
        coreRoles: ["main-dps"],
        mechanics: {
          provides: [],
          consumes: [
            {
              signal: "attack-speed-buff",
              strength: 4,
              saturation: "repeatable",
            },
          ],
        },
      },
    ];

    const matches = findDirectMechanicSynergies(profiles);

    expect(matches).toEqual([
      {
        providerTowerId: "well",
        consumerTowerId: "flamethrower",
        signal: "attack-speed-buff",
        providerStrength: 4,
        consumerStrength: 4,
        effectiveStrength: 4,
        saturation: "repeatable",
        relationshipType: "direct",
      },
    ]);
  });

  it("does not match different mechanic signals", () => {
    const profiles: TowerProfile[] = [
      {
        towerId: "provider",
        coreRoles: [],
        mechanics: {
          provides: [
            {
              signal: "enemy-slow",
              strength: 4,
            },
          ],
          consumes: [],
        },
      },
      {
        towerId: "consumer",
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
      },
    ];

    expect(findDirectMechanicSynergies(profiles)).toEqual([]);
  });

  it("does not create self-synergy", () => {
    const profiles: TowerProfile[] = [
      {
        towerId: "self-synergy-test",
        coreRoles: [],
        mechanics: {
          provides: [
            {
              signal: "enemy-slow",
              strength: 4,
            },
          ],
          consumes: [
            {
              signal: "enemy-slow",
              strength: 4,
              saturation: "repeatable",
            },
          ],
        },
      },
    ];

    expect(findDirectMechanicSynergies(profiles)).toEqual([]);
  });

  it("keeps only the strongest provider at full contribution for single saturation", () => {
    const profiles: TowerProfile[] = [
      {
        towerId: "provider-strong",
        coreRoles: [],
        mechanics: {
          provides: [
            {
              signal: "enemy-slow",
              strength: 4,
            },
          ],
          consumes: [],
        },
      },
      {
        towerId: "provider-medium",
        coreRoles: [],
        mechanics: {
          provides: [
            {
              signal: "enemy-slow",
              strength: 3,
            },
          ],
          consumes: [],
        },
      },
      {
        towerId: "consumer",
        coreRoles: [],
        mechanics: {
          provides: [],
          consumes: [
            {
              signal: "enemy-slow",
              strength: 4,
              saturation: "single",
            },
          ],
        },
      },
    ];

    const matches = findDirectMechanicSynergies(profiles);
    const saturated = applyMechanicSaturation(matches);

    expect(
      saturated.map((match) => [
        match.providerTowerId,
        match.contribution,
      ]),
    ).toEqual([
      ["provider-strong", "full"],
      ["provider-medium", "ignored"],
    ]);
  });

  it("marks additional providers as diminished for diminishing saturation", () => {
    const profiles: TowerProfile[] = [
      {
        towerId: "provider-strong",
        coreRoles: [],
        mechanics: {
          provides: [
            {
              signal: "enemy-slow",
              strength: 4,
            },
          ],
          consumes: [],
        },
      },
      {
        towerId: "provider-medium",
        coreRoles: [],
        mechanics: {
          provides: [
            {
              signal: "enemy-slow",
              strength: 3,
            },
          ],
          consumes: [],
        },
      },
      {
        towerId: "consumer",
        coreRoles: [],
        mechanics: {
          provides: [],
          consumes: [
            {
              signal: "enemy-slow",
              strength: 4,
              saturation: "diminishing",
            },
          ],
        },
      },
    ];

    const matches = findDirectMechanicSynergies(profiles);
    const saturated = applyMechanicSaturation(matches);

    expect(
      saturated.map((match) => [
        match.providerTowerId,
        match.contribution,
      ]),
    ).toEqual([
      ["provider-strong", "full"],
      ["provider-medium", "diminished"],
    ]);
  });

  it("keeps every provider at full contribution for repeatable saturation", () => {
    const profiles: TowerProfile[] = [
      {
        towerId: "provider-strong",
        coreRoles: [],
        mechanics: {
          provides: [
            {
              signal: "enemy-slow",
              strength: 4,
            },
          ],
          consumes: [],
        },
      },
      {
        towerId: "provider-medium",
        coreRoles: [],
        mechanics: {
          provides: [
            {
              signal: "enemy-slow",
              strength: 3,
            },
          ],
          consumes: [],
        },
      },
      {
        towerId: "consumer",
        coreRoles: [],
        mechanics: {
          provides: [],
          consumes: [
            {
              signal: "enemy-slow",
              strength: 4,
              saturation: "repeatable",
            },
          ],
        },
      },
    ];

    const matches = findDirectMechanicSynergies(profiles);
    const saturated = applyMechanicSaturation(matches);

    expect(
      saturated.map((match) => [
        match.providerTowerId,
        match.contribution,
      ]),
    ).toEqual([
      ["provider-strong", "full"],
      ["provider-medium", "full"],
    ]);
  });
});
