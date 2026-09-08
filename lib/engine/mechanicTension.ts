import type { TowerProfile } from "@/lib/domain/towerProfile";

export type ConditionalMechanicTension = {
  providerTowerId: TowerProfile["towerId"];
  affectedTowerId: TowerProfile["towerId"];

  signal: "target-isolation";
  affectedScalingTrigger: "density-scaling";

  relationshipType: "conditional";
  status: "potential";
  condition: string;
};

export function findConditionalMechanicTensions(
  profiles: readonly TowerProfile[],
): readonly ConditionalMechanicTension[] {
  const tensions: ConditionalMechanicTension[] = [];

  for (const provider of profiles) {
    const providesIsolation = provider.mechanics.provides.some(
      (supply) => supply.signal === "target-isolation",
    );

    if (!providesIsolation) {
      continue;
    }

    for (const affected of profiles) {
      if (provider.towerId === affected.towerId) {
        continue;
      }

      const dependsOnDensity =
        affected.offense?.scalingTriggers?.includes(
          "density-scaling",
        ) ?? false;
      // An AoE attacker wants a clumped wave even without an explicit
      // density-scaling stat — pulling one creep out of the pack wastes
      // its splash and speeds that creep toward the exit.
      const isAreaAttacker =
        affected.offense?.damageShape === "aoe" ||
        affected.offense?.damageShape === "hybrid";

      if (!dependsOnDensity && !isAreaAttacker) {
        continue;
      }

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

  return tensions;
}