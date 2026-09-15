import type { TowerProfile } from "@/lib/domain/towerProfile";

export type ConditionalMechanicTension = {
  providerTowerId: TowerProfile["towerId"];
  affectedTowerId: TowerProfile["towerId"];

  signal: "target-isolation" | "enemy-displacement";
  affectedScalingTrigger:
    | "density-scaling"
    | "attack-scaling"
    | "duration-scaling";

  relationshipType: "conditional";
  status: "potential";
  condition: string;
};

/**
 * Anti-synergy inside a package: a provider whose verified mechanic works
 * against what another tower needs from the wave.
 *
 * - Target isolation (Rage) vs. density / area towers: pulling a creep out
 *   of the pack wastes splash and speeds that creep to the exit.
 * - Enemy displacement (Archdruid) vs. towers that need sustained contact:
 *   the hit creep is thrown forward to the front of the wave, so the path it
 *   skips is contact a ramping (attack-scaling) or duration-scaling tower
 *   never gets — Haste wants to keep attacking for as long as possible, and
 *   a thrown target ends that. Owner-observed in live play (2026-09-15):
 *   Archdruid nullified the build's damage towers.
 */
export function findConditionalMechanicTensions(
  profiles: readonly TowerProfile[],
): readonly ConditionalMechanicTension[] {
  const tensions: ConditionalMechanicTension[] = [];

  for (const provider of profiles) {
    const providesIsolation = provider.mechanics.provides.some(
      (supply) => supply.signal === "target-isolation",
    );
    const providesDisplacement = provider.mechanics.provides.some(
      (supply) => supply.signal === "enemy-displacement",
    );

    if (!providesIsolation && !providesDisplacement) {
      continue;
    }

    for (const affected of profiles) {
      if (provider.towerId === affected.towerId) {
        continue;
      }

      const triggers = affected.offense?.scalingTriggers ?? [];

      if (providesIsolation) {
        const dependsOnDensity = triggers.includes("density-scaling");
        // An AoE attacker wants a clumped wave even without an explicit
        // density-scaling stat — pulling one creep out of the pack wastes
        // its splash and speeds that creep toward the exit.
        const isAreaAttacker =
          affected.offense?.damageShape === "aoe" ||
          affected.offense?.damageShape === "hybrid";

        if (dependsOnDensity || isAreaAttacker) {
          tensions.push({
            providerTowerId: provider.towerId,
            affectedTowerId: affected.towerId,
            signal: "target-isolation",
            affectedScalingTrigger: "density-scaling",
            relationshipType: "conditional",
            status: "potential",
            condition: dependsOnDensity
              ? "Target isolation reduces enemy density where the affected tower deals damage."
              : "Target isolation pulls a creep out of the pack, wasting the affected tower's area damage.",
          });
        }
      }

      if (providesDisplacement) {
        const rampsWithContact = triggers.includes("attack-scaling");
        const scalesWithDuration = triggers.includes("duration-scaling");

        if (rampsWithContact || scalesWithDuration) {
          tensions.push({
            providerTowerId: provider.towerId,
            affectedTowerId: affected.towerId,
            signal: "enemy-displacement",
            affectedScalingTrigger: rampsWithContact
              ? "attack-scaling"
              : "duration-scaling",
            relationshipType: "conditional",
            status: "potential",
            condition: rampsWithContact
              ? "Enemy displacement throws the target forward out of reach, cutting the sustained contact the affected tower ramps on."
              : "Enemy displacement throws the target forward out of reach before the affected tower's duration-scaled effect pays off.",
          });
        }
      }
    }
  }

  return tensions;
}
