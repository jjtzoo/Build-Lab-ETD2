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

      if (!dependsOnDensity) {
        continue;
      }

      tensions.push({
        providerTowerId: provider.towerId,
        affectedTowerId: affected.towerId,
        signal: "target-isolation",
        affectedScalingTrigger: "density-scaling",
        relationshipType: "conditional",
        status: "potential",
        condition:
          "Target isolation reduces enemy density where the affected tower deals damage.",
      });
    }
  }

  return tensions;
}