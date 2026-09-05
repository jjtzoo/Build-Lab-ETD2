import { MECHANIC_RELATIONSHIPS } from "@/lib/domain/mechanicRelationships";
import type {
  MechanicRelationship,
  MechanicRelationshipCondition,
  MechanicSignal,
  MechanicStrength,
  SaturationMode,
} from "@/lib/domain/mechanicSignals";
import type { TowerProfile } from "@/lib/domain/towerProfile";

export type DerivedMechanicSynergyMatch = {
  providerTowerId: TowerProfile["towerId"];
  consumerTowerId: TowerProfile["towerId"];

  providerSignal: MechanicSignal;
  consumerSignal: MechanicSignal;

  providerStrength: MechanicStrength;
  consumerStrength: MechanicStrength;
  saturation: SaturationMode;

  relationshipType: "derived";
  status: "potential";
  conditions: readonly MechanicRelationshipCondition[];
};

/**
 * Finds potential synergy through one registered derived
 * relationship. It does not verify combat conditions,
 * calculate realized strength, or apply saturation.
 */
export function findDerivedMechanicSynergies(
  profiles: readonly TowerProfile[],
  relationships: readonly MechanicRelationship[] =
    MECHANIC_RELATIONSHIPS,
): readonly DerivedMechanicSynergyMatch[] {
  const matches: DerivedMechanicSynergyMatch[] = [];

  for (const provider of profiles) {
    for (const supply of provider.mechanics.provides) {
      for (const relationship of relationships) {
        if (
          relationship.type !== "derived" ||
          relationship.from !== supply.signal
        ) {
          continue;
        }

        for (const consumer of profiles) {
          if (provider.towerId === consumer.towerId) {
            continue;
          }

          for (const demand of consumer.mechanics.consumes) {
            if (demand.signal !== relationship.to) {
              continue;
            }

            matches.push({
              providerTowerId: provider.towerId,
              consumerTowerId: consumer.towerId,

              providerSignal: supply.signal,
              consumerSignal: demand.signal,

              providerStrength: supply.strength,
              consumerStrength: demand.strength,
              saturation: demand.saturation,

              relationshipType: "derived",
              status: "potential",
              conditions: [...relationship.conditions],
            });
          }
        }
      }
    }
  }

  return matches;
}