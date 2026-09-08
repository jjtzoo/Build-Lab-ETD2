import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getTowerMechanicFacts,
} from "@/lib/domain/towerMechanicFacts";

import {
  comparePlannerDecisions,
  type PlannerDecision,
} from "@/lib/engine/buildPlanner";

import {
  evaluateMechanicAvailability,
} from "@/lib/engine/mechanicAvailability";

import {
  resolveTowerContribution,
} from "@/lib/engine/resolvedTowerContribution";

function fact(
  towerId: string,
  signal: string,
) {
  const result =
    getTowerMechanicFacts(
      towerId,
    ).find(
      (entry) =>
        entry.signal === signal,
    );

  expect(result).toBeDefined();
  return result!;
}

describe(
  "mechanic availability",
  () => {
    it("distinguishes Life Altar's high-potency burst window from persistent support", () => {
      const altar =
        resolveTowerContribution(
          "life-altar",
          1,
        ).supportedAbilityFacts
          .find(
            (entry) =>
              entry.signal ===
              "attack-speed-buff",
          );

      const well =
        resolveTowerContribution(
          "well",
          2,
        ).supportedAbilityFacts
          .find(
            (entry) =>
              entry.signal ===
              "attack-speed-buff",
          );

      expect(altar?.magnitude)
        .toEqual({
          unit: "percent",
          value: 30,
        });

      expect(
        altar?.durationSeconds,
      ).toBe(12);

      expect(altar?.availability)
        .toMatchObject({
          classification:
            "burst-window",
          dutyCycle: 0.2,
          lowUptime: true,
          activationRequirement:
            "active-cast",
          resourceBurden: {
            resource: "lives",
            amount:
              "scales-with-affected-towers",
          },
        });

      expect(well?.magnitude)
        .toEqual({
          unit: "percent",
          value: 30,
        });

      expect(well?.availability)
        .toMatchObject({
          classification:
            "effectively-continuous",
          dutyCycle: null,
          rampSeconds: 45,
        });
    });

    it("keeps missing availability facts unknown", () => {
      expect(
        evaluateMechanicAvailability(
          null,
          1,
        ),
      ).toMatchObject({
        classification: "unknown",
        dutyCycle: null,
        lowUptime: null,
        activationRequirement:
          "unknown",
      });
    });

    it("preserves a burst contribution as positive situational evidence", () => {
      const persistent = {
        persistentSynergyStrength: 3,
        intermittentSynergyStrength: 0,
      } as PlannerDecision;

      const burst = {
        ...persistent,
        persistentSynergyStrength: 0,
        intermittentSynergyStrength: 4,
      };

      const noSynergy = {
        ...persistent,
        persistentSynergyStrength: 0,
        intermittentSynergyStrength: 0,
      };

      expect(
        comparePlannerDecisions(
          burst,
          noSynergy,
        ),
      ).toBeLessThan(0);
    });

    it("resolves level-specific support potency without changing curated strengths", () => {
      const levelOne =
        resolveTowerContribution(
          "well",
          1,
        ).supportedAbilityFacts[0];

      const levelThree =
        resolveTowerContribution(
          "well",
          3,
        ).supportedAbilityFacts[0];

      expect(levelOne.magnitude?.value)
        .toBe(10);

      expect(levelThree.magnitude?.value)
        .toBe(90);

      expect(
        fact(
          "well",
          "attack-speed-buff",
        ).magnitude?.byLevel,
      ).toEqual([10, 30, 90]);
    });

    it("uses the latest-live slow and amplification facts", () => {
      expect(
        fact(
          "nova",
          "enemy-slow",
        ).durationSeconds
          ?.byLevel,
      ).toEqual([5, 5]);

      expect(
        fact(
          "windstorm",
          "enemy-slow",
        ).durationSeconds
          ?.byLevel,
      ).toEqual([5, 5]);

      expect(
        fact(
          "rage",
          "damage-taken-amp",
        ).magnitude?.byLevel,
      ).toEqual([28]);
    });
  },
);
