import { describe, expect, it } from "vitest";

import type { TowerProfile } from "@/lib/domain/towerProfile";
import {
  applyMechanicSaturation,
  findDirectMechanicSynergies,
} from "@/lib/engine/mechanicSynergy";

describe("findDirectMechanicSynergies", () => {
  it("matches Rage target isolation with Incantation", () => {
    const profiles: TowerProfile[] = [
      {
        towerId: "rage",
        coreRoles: ["damage-amp"],
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