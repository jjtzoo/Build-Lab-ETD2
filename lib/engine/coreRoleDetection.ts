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

import type { ElementAllocation } from "@/lib/domain/elements";

import type {
  CombinationClass,
  Tower,
  TowerId,
} from "@/lib/domain/tower";

import {
  getTowerProfile,
} from "@/lib/domain/towerProfileCatalog";

import {
  availableTowers,
} from "@/lib/engine/allocation";

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

export type CoreRoleLevelCandidate = {
  towerId: TowerId;
  towerName: string;
  combination: CombinationClass;
  reachableLevel: number;
  targetLevel: number;
  atTargetLevel: boolean;
};

export type CoreRoleFeasibility = {
  role: CoreRole;
  available: boolean;
  developed: boolean;
  candidates: readonly CoreRoleLevelCandidate[];
};

/**
 * Desired tower depth for satisfying a core role.
 *
 * Main DPS, Slow and Damage Amp are planned toward the
 * tower's relevant normal maximum level.
 *
 * Buff is normally sufficient at Level 2, unless the tower's
 * canonical maximum level is lower than 2.
 *
 * This describes role development only.
 * It does not select or rank a tower.
 */
function targetLevelForRole(
  role: CoreRole,
  tower: Tower,
): number {
  if (role === "buff") {
    return Math.min(2, tower.maxLevel);
  }

  return tower.maxLevel;
}

/**
 * Evaluates which currently accessible towers can satisfy
 * each required core role and at what reachable level.
 *
 * available:
 *   at least one tower for the role can currently be built.
 *
 * developed:
 *   at least one candidate has reached the desired role depth.
 *
 * Availability and planner selection remain separate.
 */
export function getCoreRoleFeasibility(
  allocation: ElementAllocation,
): readonly CoreRoleFeasibility[] {
  const available =
    availableTowers(allocation);

  return CORE_ROLE_PRIORITY.map((role) => {
    const candidates: CoreRoleLevelCandidate[] = [];

    for (const entry of available) {
      const profile =
        getTowerProfile(entry.tower.id);

      if (!profile.coreRoles.includes(role)) {
        continue;
      }

      const targetLevel =
        targetLevelForRole(
          role,
          entry.tower,
        );

      candidates.push({
        towerId: entry.tower.id,
        towerName: entry.tower.name,
        combination:
          entry.tower.combination,
        reachableLevel:
          entry.maxLevel,
        targetLevel,
        atTargetLevel:
          entry.maxLevel >= targetLevel,
      });
    }

    return {
      role,
      available:
        candidates.length > 0,
      developed:
        candidates.some(
          (candidate) =>
            candidate.atTargetLevel,
        ),
      candidates,
    };
  });
}

/**
 * True when every mandatory core role has at least one
 * accessible candidate.
 *
 * This intentionally does NOT require target development.
 */
export function hasFeasibleCorePackage(
  allocation: ElementAllocation,
): boolean {
  return getCoreRoleFeasibility(
    allocation,
  ).every(
    (status) => status.available,
  );
}

/**
 * True when every mandatory core role has at least one
 * candidate developed to the role's desired depth.
 *
 * This is stronger than simple role availability.
 */
export function hasDevelopedCorePackage(
  allocation: ElementAllocation,
): boolean {
  return getCoreRoleFeasibility(
    allocation,
  ).every(
    (status) => status.developed,
  );
}