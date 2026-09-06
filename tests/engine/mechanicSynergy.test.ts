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

describe("canonical Flamethrower synergy profile", () => {
  const flamethrower = profileCatalog.profiles.find(
    (profile) => profile.towerId === "flamethrower",
  );

  if (!flamethrower) {
    throw new Error("Canonical Flamethrower profile must exist.");
  }

  it("models Flamethrower as density-scaling", () => {
    expect(flamethrower.offense?.scalingTriggers).toEqual(
      expect.arrayContaining([
        "attack-scaling",
        "density-scaling",
      ]),
    );
  });

  it("curates Flamethrower's deliberate support synergies", () => {
    expect(flamethrower.mechanics.consumes).toEqual([
      {
        signal: "attack-speed-buff",
        strength: 4,
        saturation: "repeatable",
      },
      {
        signal: "attack-damage-buff",
        strength: 2,
        saturation: "repeatable",
      },
      {
        signal: "enemy-grouping",
        strength: 4,
        saturation: "diminishing",
      },
      {
        signal: "enemy-slow",
        strength: 3,
        saturation: "diminishing",
      },
    ]);
  });

  it("does not assume Flamethrower replication synergy", () => {
    expect(
      flamethrower.mechanics.consumes.some(
        (demand) => demand.signal === "tower-replication",
      ),
    ).toBe(false);
  });
});

describe("canonical Haste synergy profile", () => {
  const haste = profileCatalog.profiles.find(
    (profile) => profile.towerId === "haste",
  );

  if (!haste) {
    throw new Error("Canonical Haste profile must exist.");
  }

  it("curates Haste around attack-speed ramp and sustained targeting", () => {
    expect(haste.mechanics.consumes).toEqual([
      {
        signal: "attack-speed-buff",
        strength: 4,
        saturation: "repeatable",
      },
      {
        signal: "attack-damage-buff",
        strength: 2,
        saturation: "repeatable",
      },
      {
        signal: "enemy-slow",
        strength: 3,
        saturation: "diminishing",
      },
    ]);
  });

  it("does not infer grouping synergy for single-target Haste", () => {
    expect(
      haste.mechanics.consumes.some(
        (demand) => demand.signal === "enemy-grouping",
      ),
    ).toBe(false);
  });

  it("does not assume special replication synergy for Haste", () => {
    expect(
      haste.mechanics.consumes.some(
        (demand) => demand.signal === "tower-replication",
      ),
    ).toBe(false);
  });
});

describe("canonical Ethereal synergy profile", () => {
  const ethereal = profileCatalog.profiles.find(
    (profile) => profile.towerId === "ethereal",
  );

  if (!ethereal) {
    throw new Error("Canonical Ethereal profile must exist.");
  }

  it("keeps nearby enemy deaths as Ethereal's defining synergy", () => {
    expect(ethereal.mechanics.consumes).toContainEqual({
      signal: "nearby-enemy-death",
      strength: 4,
      saturation: "repeatable",
    });
  });

  it("curates Ethereal's damage-window support", () => {
    expect(ethereal.mechanics.consumes).toEqual(
      expect.arrayContaining([
        {
          signal: "attack-speed-buff",
          strength: 3,
          saturation: "repeatable",
        },
        {
          signal: "attack-damage-buff",
          strength: 2,
          saturation: "repeatable",
        },
      ]),
    );
  });

  it("retains verified replication synergy for Ethereal", () => {
    expect(ethereal.mechanics.consumes).toContainEqual({
      signal: "tower-replication",
      strength: 3,
      saturation: "repeatable",
    });
  });

  it("does not turn grouping or slow into direct Ethereal synergy", () => {
    expect(
      ethereal.mechanics.consumes.some(
        (demand) =>
          demand.signal === "enemy-grouping" ||
          demand.signal === "enemy-slow",
      ),
    ).toBe(false);
  });
});

[
  {
    "signal": "attack-speed-buff",
    "strength": 3,
    "saturation": "repeatable"
  },
  {
    "signal": "attack-damage-buff",
    "strength": 2,
    "saturation": "repeatable"
  },
  {
    "signal": "enemy-grouping",
    "strength": 4,
    "saturation": "diminishing"
  },
  {
    "signal": "enemy-slow",
    "strength": 3,
    "saturation": "diminishing"
  },
  {
    "signal": "tower-replication",
    "strength": 4,
    "saturation": "repeatable"
  }
]

describe("canonical Railgun synergy profile", () => {
  const railgun = profileCatalog.profiles.find(
    (profile) => profile.towerId === "railgun",
  );

  if (!railgun) {
    throw new Error("Canonical Railgun profile must exist.");
  }

  it("keeps density scaling as part of Railgun's defining mechanic", () => {
    expect(railgun.offense?.scalingTriggers).toEqual(
      expect.arrayContaining([
        "attack-scaling",
        "density-scaling",
      ]),
    );
  });

  it("treats grouping as a defining Railgun synergy", () => {
    expect(railgun.mechanics.consumes).toContainEqual({
      signal: "enemy-grouping",
      strength: 4,
      saturation: "diminishing",
    });
  });

  it("curates Railgun's attack-speed and slow support", () => {
    expect(railgun.mechanics.consumes).toEqual(
      expect.arrayContaining([
        {
          signal: "attack-speed-buff",
          strength: 3,
          saturation: "repeatable",
        },
        {
          signal: "enemy-slow",
          strength: 3,
          saturation: "diminishing",
        },
      ]),
    );
  });

  it("keeps attack damage secondary to Railgun's charge mechanic", () => {
    expect(railgun.mechanics.consumes).toContainEqual({
      signal: "attack-damage-buff",
      strength: 2,
      saturation: "repeatable",
    });
  });

  it("recognizes Railgun as a defining replication beneficiary", () => {
    expect(railgun.mechanics.consumes).toContainEqual({
      signal: "tower-replication",
      strength: 4,
      saturation: "repeatable",
    });
  });

  it("does not model target isolation as a Railgun benefit", () => {
    expect(
      railgun.mechanics.consumes.some(
        (demand) => demand.signal === "target-isolation",
      ),
    ).toBe(false);
  });
});

describe("canonical Nuclear synergy profile", () => {
  const nuclear = profileCatalog.profiles.find(
    (profile) => profile.towerId === "nuclear",
  );

  if (!nuclear) {
    throw new Error("Canonical Nuclear profile must exist.");
  }

  it("models Nuclear as both HP-scaling and density-scaling", () => {
    expect(nuclear.offense?.scalingTriggers).toEqual(
      expect.arrayContaining([
        "hp-scaling",
        "density-scaling",
      ]),
    );
  });

  it("retains Nuclear's built-in slow contribution", () => {
    expect(nuclear.mechanics.provides).toContainEqual({
      signal: "enemy-slow",
      strength: 3,
    });
  });

  it("treats attack speed as defining Nuclear mutation support", () => {
    expect(nuclear.mechanics.consumes).toContainEqual({
      signal: "attack-speed-buff",
      strength: 4,
      saturation: "repeatable",
    });
  });

  it("treats grouping as defining but diminishing Nuclear support", () => {
    expect(nuclear.mechanics.consumes).toContainEqual({
      signal: "enemy-grouping",
      strength: 4,
      saturation: "diminishing",
    });
  });

  it("curates Nuclear's secondary damage and slow support", () => {
    expect(nuclear.mechanics.consumes).toEqual(
      expect.arrayContaining([
        {
          signal: "attack-damage-buff",
          strength: 2,
          saturation: "repeatable",
        },
        {
          signal: "enemy-slow",
          strength: 3,
          saturation: "diminishing",
        },
      ]),
    );
  });

  it("does not infer replication or isolation as Nuclear benefits", () => {
    expect(
      nuclear.mechanics.consumes.some(
        (demand) =>
          demand.signal === "tower-replication" ||
          demand.signal === "target-isolation",
      ),
    ).toBe(false);
  });
});

describe("canonical Atom synergy profile", () => {
  const atom = profileCatalog.profiles.find(
    (profile) => profile.towerId === "atom",
  );

  if (!atom) {
    throw new Error("Canonical Atom profile must exist.");
  }

  it("treats attack speed as defining Atom ramp support", () => {
    expect(atom.mechanics.consumes).toContainEqual({
      signal: "attack-speed-buff",
      strength: 4,
      saturation: "repeatable",
    });
  });

  it("curates Atom's attack-damage and target-uptime support", () => {
    expect(atom.mechanics.consumes).toEqual(
      expect.arrayContaining([
        {
          signal: "attack-damage-buff",
          strength: 3,
          saturation: "repeatable",
        },
        {
          signal: "enemy-slow",
          strength: 3,
          saturation: "diminishing",
        },
      ]),
    );
  });

  it("keeps grouping secondary to Atom's focused ramp", () => {
    expect(atom.mechanics.consumes).toContainEqual({
      signal: "enemy-grouping",
      strength: 2,
      saturation: "diminishing",
    });

    expect(atom.offense?.scalingTriggers).not.toContain(
      "density-scaling",
    );
  });

  it("does not infer replication or isolation as Atom benefits", () => {
    expect(
      atom.mechanics.consumes.some(
        (demand) =>
          demand.signal === "tower-replication" ||
          demand.signal === "target-isolation",
      ),
    ).toBe(false);
  });
});

describe("canonical Poison synergy profile", () => {
  const poison = profileCatalog.profiles.find(
    (profile) => profile.towerId === "poison",
  );

  if (!poison) {
    throw new Error("Canonical Poison profile must exist.");
  }

  it("models Poison as attack-scaling through independent DoT stacks", () => {
    expect(poison.offense?.scalingTriggers).toContain(
      "attack-scaling",
    );
  });

  it("treats attack speed as defining Poison stack support", () => {
    expect(poison.mechanics.consumes).toContainEqual({
      signal: "attack-speed-buff",
      strength: 4,
      saturation: "repeatable",
    });
  });

  it("recognizes Poison as a defining replication beneficiary", () => {
    expect(poison.mechanics.consumes).toContainEqual({
      signal: "tower-replication",
      strength: 4,
      saturation: "repeatable",
    });
  });

  it("curates Poison's grouping and slow support", () => {
    expect(poison.mechanics.consumes).toEqual(
      expect.arrayContaining([
        {
          signal: "enemy-grouping",
          strength: 3,
          saturation: "diminishing",
        },
        {
          signal: "enemy-slow",
          strength: 3,
          saturation: "diminishing",
        },
      ]),
    );
  });

  it("keeps attack damage secondary to Poison's DoT stacking", () => {
    expect(poison.mechanics.consumes).toContainEqual({
      signal: "attack-damage-buff",
      strength: 2,
      saturation: "repeatable",
    });

    expect(poison.offense?.scalingTriggers).not.toContain(
      "density-scaling",
    );
  });
});

describe("canonical Vapor synergy profile", () => {
  const vapor = profileCatalog.profiles.find(
    (profile) => profile.towerId === "vapor",
  );

  if (!vapor) {
    throw new Error("Canonical Vapor profile must exist.");
  }

  it("keeps density scaling as Vapor's defining mechanic", () => {
    expect(vapor.offense?.scalingTriggers).toContain(
      "density-scaling",
    );

    expect(vapor.offense?.scalingTriggers).not.toContain(
      "attack-scaling",
    );
  });

  it("treats grouping as defining Vapor support", () => {
    expect(vapor.mechanics.consumes).toContainEqual({
      signal: "enemy-grouping",
      strength: 4,
      saturation: "diminishing",
    });
  });

  it("curates slow as strong density-maintenance support", () => {
    expect(vapor.mechanics.consumes).toContainEqual({
      signal: "enemy-slow",
      strength: 3,
      saturation: "diminishing",
    });
  });

  it("curates Vapor's direct attack buffs below its density mechanic", () => {
    expect(vapor.mechanics.consumes).toEqual(
      expect.arrayContaining([
        {
          signal: "attack-damage-buff",
          strength: 3,
          saturation: "repeatable",
        },
        {
          signal: "attack-speed-buff",
          strength: 3,
          saturation: "repeatable",
        },
      ]),
    );
  });

  it("does not infer replication or isolation as Vapor benefits", () => {
    expect(
      vapor.mechanics.consumes.some(
        (demand) =>
          demand.signal === "tower-replication" ||
          demand.signal === "target-isolation",
      ),
    ).toBe(false);
  });
});

describe("canonical Infernal synergy profile", () => {
  const infernal = profileCatalog.profiles.find(
    (profile) => profile.towerId === "infernal",
  );

  if (!infernal) {
    throw new Error("Canonical Infernal profile must exist.");
  }

  it("curates Infernal's direct sustained attack buffs", () => {
    expect(infernal.mechanics.consumes).toEqual([
      {
        signal: "attack-damage-buff",
        strength: 3,
        saturation: "repeatable",
      },
      {
        signal: "attack-speed-buff",
        strength: 3,
        saturation: "repeatable",
      },
    ]);
  });

  it("does not treat slow as required target-uptime support for Infernal", () => {
    expect(
      infernal.mechanics.consumes.some(
        (demand) => demand.signal === "enemy-slow",
      ),
    ).toBe(false);
  });

  it("does not infer grouping, isolation, or replication as Infernal benefits", () => {
    expect(
      infernal.mechanics.consumes.some(
        (demand) =>
          demand.signal === "enemy-grouping" ||
          demand.signal === "target-isolation" ||
          demand.signal === "tower-replication",
      ),
    ).toBe(false);
  });

  it("does not label Infernal's persistence mechanic as attack-scaling", () => {
    expect(infernal.offense?.scalingTriggers ?? []).not.toContain(
      "attack-scaling",
    );
  });
});

describe("canonical Bloom synergy profile", () => {
  const bloom = profileCatalog.profiles.find(
    (profile) => profile.towerId === "bloom",
  );

  if (!bloom) {
    throw new Error("Canonical Bloom profile must exist.");
  }

  it("models Bloom as front-loaded burst rather than sustained uptime DPS", () => {
    expect(bloom.offense?.damageProfile).toBe("burst");
  });

  it("does not misrepresent Bloom's rest-dependent mechanic as attack-scaling", () => {
    expect(bloom.offense?.scalingTriggers ?? []).not.toContain(
      "attack-scaling",
    );
  });

  it("keeps attack damage as strong straightforward Bloom support", () => {
    expect(bloom.mechanics.consumes).toEqual([
      {
        signal: "attack-damage-buff",
        strength: 3,
        saturation: "repeatable",
      },
    ]);
  });

  it("does not model attack speed or slow as unconditional Bloom synergies", () => {
    expect(
      bloom.mechanics.consumes.some(
        (demand) =>
          demand.signal === "attack-speed-buff" ||
          demand.signal === "enemy-slow",
      ),
    ).toBe(false);
  });

  it("does not infer grouping, replication, or isolation as Bloom benefits", () => {
    expect(
      bloom.mechanics.consumes.some(
        (demand) =>
          demand.signal === "enemy-grouping" ||
          demand.signal === "tower-replication" ||
          demand.signal === "target-isolation",
      ),
    ).toBe(false);
  });
});

describe("curated Howitzer through Solar synergy batch", () => {
  function profile(towerId: string) {
    const result = profileCatalog.profiles.find(
      (entry) => entry.towerId === towerId,
    );

    if (!result) {
      throw new Error(`Canonical ${towerId} profile must exist.`);
    }

    return result;
  }

  it("curates Howitzer around distance-aware AoE rather than uptime", () => {
    const howitzer = profile("howitzer");

    expect(howitzer.offense?.scalingTriggers).toContain(
      "distance-scaling",
    );

    expect(howitzer.mechanics.consumes).toEqual([
      {
        signal: "enemy-grouping",
        strength: 3,
        saturation: "diminishing",
      },
      {
        signal: "attack-damage-buff",
        strength: 3,
        saturation: "repeatable",
      },
      {
        signal: "attack-speed-buff",
        strength: 3,
        saturation: "repeatable",
      },
    ]);
  });

  it("does not invent slow or isolation synergy for Howitzer", () => {
    const howitzer = profile("howitzer");

    expect(
      howitzer.mechanics.consumes.some(
        (demand) =>
          demand.signal === "enemy-slow" ||
          demand.signal === "target-isolation",
      ),
    ).toBe(false);
  });

  it("models Lightning as density-dependent chain damage", () => {
    const lightning = profile("lightning");

    expect(lightning.offense?.scalingTriggers).toContain(
      "density-scaling",
    );

    expect(lightning.mechanics.consumes).toContainEqual({
      signal: "enemy-grouping",
      strength: 3,
      saturation: "diminishing",
    });
  });

  it("keeps Lightning's direct buffs below a defining mechanic score", () => {
    const lightning = profile("lightning");

    expect(lightning.mechanics.consumes).toEqual(
      expect.arrayContaining([
        {
          signal: "attack-damage-buff",
          strength: 3,
          saturation: "repeatable",
        },
        {
          signal: "attack-speed-buff",
          strength: 3,
          saturation: "repeatable",
        },
      ]),
    );
  });

  it("makes current HP removal a defining Disease synergy", () => {
    const disease = profile("disease");

    expect(disease.offense?.scalingTriggers).toContain("hp-scaling");

    expect(disease.mechanics.consumes).toContainEqual({
      signal: "current-hp-removal",
      strength: 4,
      saturation: "repeatable",
    });
  });

  it("curates Disease's normal attack amplification below HP shaving", () => {
    const disease = profile("disease");

    expect(disease.mechanics.consumes).toEqual(
      expect.arrayContaining([
        {
          signal: "attack-damage-buff",
          strength: 3,
          saturation: "repeatable",
        },
        {
          signal: "attack-speed-buff",
          strength: 3,
          saturation: "repeatable",
        },
      ]),
    );
  });

  it("retains Ice as a defining stun provider", () => {
    const ice = profile("ice");

    expect(ice.mechanics.provides).toContainEqual({
      signal: "enemy-stun",
      strength: 4,
    });
  });

  it("does not overrate attack speed through Ice's stun cooldown", () => {
    const ice = profile("ice");

    expect(ice.mechanics.consumes).toEqual([
      {
        signal: "attack-damage-buff",
        strength: 3,
        saturation: "repeatable",
      },
      {
        signal: "attack-speed-buff",
        strength: 2,
        saturation: "repeatable",
      },
    ]);
  });

  it("models Solar as attack and density scaling", () => {
    const solar = profile("solar");

    expect(solar.offense?.scalingTriggers).toEqual(
      expect.arrayContaining([
        "attack-scaling",
        "density-scaling",
      ]),
    );

    expect(solar.mechanics.consumes).toEqual(
      expect.arrayContaining([
        {
          signal: "attack-speed-buff",
          strength: 4,
          saturation: "repeatable",
        },
        {
          signal: "enemy-grouping",
          strength: 4,
          saturation: "diminishing",
        },
        {
          signal: "enemy-slow",
          strength: 3,
          saturation: "diminishing",
        },
      ]),
    );
  });

  it("recognizes Solar replication while keeping direct damage secondary", () => {
    const solar = profile("solar");

    expect(solar.mechanics.consumes).toEqual(
      expect.arrayContaining([
        {
          signal: "tower-replication",
          strength: 4,
          saturation: "repeatable",
        },
        {
          signal: "attack-damage-buff",
          strength: 2,
          saturation: "repeatable",
        },
      ]),
    );
  });
});