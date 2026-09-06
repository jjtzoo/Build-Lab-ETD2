import towerProfileCatalogData
  from "@/data/towerProfiles.v1.json";

import type { TowerId } from "./tower";
import type { TowerProfile } from "./towerProfile";

export type TowerProfileCatalog = {
  schemaVersion: 1;
  profiles: readonly TowerProfile[];
};

export const TOWER_PROFILE_CATALOG =
  towerProfileCatalogData as TowerProfileCatalog;

export const TOWER_PROFILES =
  TOWER_PROFILE_CATALOG.profiles;

export const TOWER_PROFILES_BY_ID =
  new Map<TowerId, TowerProfile>(
    TOWER_PROFILES.map((profile) => [
      profile.towerId,
      profile,
    ]),
  );

export function getTowerProfile(
  towerId: TowerId,
): TowerProfile {
  const profile =
    TOWER_PROFILES_BY_ID.get(towerId);

  if (!profile) {
    throw new Error(
      `Missing canonical tower profile: ${towerId}`,
    );
  }

  return profile;
}