import { describe, expect, it } from "vitest";

import {
  decodePortableBuild,
  encodePortableBuild,
  PORTABLE_BUILD_SCHEMA,
  type PortableBuild,
} from "@/lib/domain/portableBuild";

const V2: PortableBuild = {
  schema: PORTABLE_BUILD_SCHEMA,
  source: "engine",
  anchorTowerId: "laser",
  towers: [
    { towerId: "laser", level: 2 },
    { towerId: "nova", level: 2 },
  ],
  allocation: {
    Light: 2,
    Darkness: 2,
    Water: 1,
    Fire: 2,
    Nature: 2,
    Earth: 2,
  },
  createdAt: "2026-09-10T00:00:00.000Z",
  progression: [
    {
      stage: "EARLY",
      headline: "Get the anchor firing.",
      reason: "anchor first",
      primaryAction: {
        kind: "build",
        towerId: "laser",
        towerName: "Laser",
        toLevel: 2,
        roles: ["Main DPS"],
      },
      keystoneSteps: [
        { element: "Light", from: 0, to: 1, unlocks: [] },
      ],
    },
  ],
  coverageWeaknesses: ["Earth"],
  endGame: [{ name: "Pure Nature", quantity: 2 }],
};

describe("portable build codec", () => {
  it("round-trips a v2 build with its coaching fields", () => {
    const decoded = decodePortableBuild(encodePortableBuild(V2));
    expect(decoded).toEqual(V2);
    expect(decoded?.progression?.[0].primaryAction?.towerName).toBe(
      "Laser",
    );
    expect(decoded?.coverageWeaknesses).toEqual(["Earth"]);
  });

  it("still accepts a v1 build (no coaching fields)", () => {
    const v1 = {
      schema: "etd2-build/1",
      source: "theorycraft",
      anchorTowerId: "mushroom",
      towers: [{ towerId: "mushroom", level: 3 }],
      allocation: {
        Light: 0,
        Darkness: 0,
        Water: 0,
        Fire: 0,
        Nature: 3,
        Earth: 3,
      },
      createdAt: "2026-09-10T00:00:00.000Z",
    } as PortableBuild;
    const decoded = decodePortableBuild(encodePortableBuild(v1));
    expect(decoded?.schema).toBe("etd2-build/1");
    expect(decoded?.progression).toBeUndefined();
  });

  it("rejects garbage and unknown schemas", () => {
    expect(decodePortableBuild("not-base64!!")).toBeNull();
    expect(
      decodePortableBuild(
        encodePortableBuild({
          ...V2,
          schema: "etd2-build/9",
        } as unknown as PortableBuild),
      ),
    ).toBeNull();
  });
});
