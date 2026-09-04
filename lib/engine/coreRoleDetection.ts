import {
  CORE_ROLE_PRIORITY,
  CORE_ROLE_REQUIREMENTS,
  type CoreRole,
} from "@/lib/domain/roles";

import type { TowerProfile } from "@/lib/domain/towerProfile";

export type CoreRoleStatus = {
  role: CoreRole;
  count: number;
  minimum: number;
  satisfied: boolean;
};

/**
 * Count how many selected towers can satisfy each core role.
 *
 * Core roles are minimum requirements.
 * There is no maximum number of towers for a role.
 */
export function countCoreRoles(
  profiles: readonly TowerProfile[],
): Record<CoreRole, number> {
  const counts: Record<CoreRole, number> = {
    "main-dps": 0,
    slow: 0,
    "damage-amp": 0,
    buff: 0,
  };

  for (const profile of profiles) {
    for (const role of profile.coreRoles) {
      counts[role] += 1;
    }
  }

  return counts;
}

/**
 * Return the minimum required count for a core role.
 */
function getMinimumRequirement(
  role: CoreRole,
): number {
  const requirement = CORE_ROLE_REQUIREMENTS.find(
    (item) => item.role === role,
  );

  if (!requirement) {
    throw new Error(
      `Missing core role requirement for: ${role}`,
    );
  }

  return requirement.minimum;
}

/**
 * Describe the current status of every core role.
 */
export function getCoreRoleStatus(
  profiles: readonly TowerProfile[],
): readonly CoreRoleStatus[] {
  const counts = countCoreRoles(profiles);

  return CORE_ROLE_PRIORITY.map((role) => {
    const minimum = getMinimumRequirement(role);

    return {
      role,
      count: counts[role],
      minimum,
      satisfied: counts[role] >= minimum,
    };
  });
}

/**
 * Return the highest-priority missing core role.
 *
 * For a normal Build Lab flow, the anchor should already
 * satisfy Main DPS, so progression is normally:
 *
 * Slow -> Damage Amp -> Buff
 */
export function getNextMissingCoreRole(
  profiles: readonly TowerProfile[],
): CoreRole | null {
  const status = getCoreRoleStatus(profiles);

  const missingRole = status.find(
    (item) => !item.satisfied,
  );

  return missingRole?.role ?? null;
}

/**
 * True when the minimum core package is complete:
 *
 * Main DPS + Slow + Damage Amp + Buff
 */
export function hasCompleteCorePackage(
  profiles: readonly TowerProfile[],
): boolean {
  return getCoreRoleStatus(profiles).every(
    (item) => item.satisfied,
  );
}