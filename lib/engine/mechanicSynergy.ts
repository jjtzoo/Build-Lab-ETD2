import type {
  MechanicRelationshipType,
  MechanicStrength,
  SaturationMode,
} from "@/lib/domain/mechanicSignals";
import type { TowerProfile } from "@/lib/domain/towerProfile";

export type MechanicSynergyMatch = {
  providerTowerId: string;
  consumerTowerId: string;

  signal: string;

  providerStrength: MechanicStrength;
  consumerStrength: MechanicStrength;

  effectiveStrength: MechanicStrength;
  saturation: SaturationMode;

  relationshipType: MechanicRelationshipType;
};

export type MechanicContribution =
  | "full"
  | "diminished"
  | "ignored";

export type SaturatedMechanicSynergyMatch =
  MechanicSynergyMatch & {
    contribution: MechanicContribution;
  };

export function applyMechanicSaturation(
  matches: readonly MechanicSynergyMatch[],
): readonly SaturatedMechanicSynergyMatch[] {
  const groups = new Map<string, MechanicSynergyMatch[]>();

  for (const match of matches) {
    const key = `${match.consumerTowerId}:${match.signal}`;

    const group = groups.get(key) ?? [];
    group.push(match);
    groups.set(key, group);
  }

  const saturatedMatches: SaturatedMechanicSynergyMatch[] =
    [];

  for (const group of groups.values()) {
    const ordered = [...group].sort(
      (a, b) =>
        b.effectiveStrength - a.effectiveStrength ||
        a.providerTowerId.localeCompare(b.providerTowerId),
    );

    const saturation = ordered[0]?.saturation;

    if (!saturation) {
      continue;
    }

    for (const [index, match] of ordered.entries()) {
      let contribution: MechanicContribution;

      switch (saturation) {
        case "single":
          contribution = index === 0 ? "full" : "ignored";
          break;

        case "diminishing":
          contribution =
            index === 0 ? "full" : "diminished";
          break;

        case "repeatable":
          contribution = "full";
          break;
      }

      saturatedMatches.push({
        ...match,
        contribution,
      });
    }
  }

  return saturatedMatches;
}

export function findDirectMechanicSynergies(
  profiles: readonly TowerProfile[],
): readonly MechanicSynergyMatch[] {
  const matches: MechanicSynergyMatch[] = [];

  for (const provider of profiles) {
    for (const supply of provider.mechanics.provides) {
      for (const consumer of profiles) {
        if (provider.towerId === consumer.towerId) {
          continue;
        }

        for (const demand of consumer.mechanics.consumes) {
          if (supply.signal !== demand.signal) {
            continue;
          }

          matches.push({
            providerTowerId: provider.towerId,
            consumerTowerId: consumer.towerId,

            signal: supply.signal,

            providerStrength: supply.strength,
            consumerStrength: demand.strength,

            effectiveStrength: Math.min(
              supply.strength,
              demand.strength,
            ) as MechanicStrength,

            saturation: demand.saturation,

            relationshipType: "direct",
          });
        }
      }
    }
  }

  return matches;
}