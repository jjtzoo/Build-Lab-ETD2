import type {
  Allocation,
  ElementName,
  MechanicsRecord,
  Tower,
} from "@/lib/types";
import { ELEMENTS, MECHANICS_BY_TOWER } from "@/lib/data";
import type { EvidenceStatus, RoleLevel, TowerState } from "./types";

function getTier(tower: Tower, allocation: Allocation): number {
  if (tower.recipe.length === 0) return 0;

  return Math.min(
    ...tower.recipe.map((element) => {
      const index = ELEMENTS.indexOf(element as ElementName);
      return index >= 0 ? allocation[index] : 0;
    }),
  );
}

function getMaxTier(
  mechanics: MechanicsRecord | null,
  tower: Tower,
): number {
  return mechanics?.max_level ?? (tower.type === "Dual"
    ? 3
    : tower.type === "Trio"
      ? 2
      : tower.type === "Quad"
        ? 1
        : 0);
}

function isUnlocked(tower: Tower, allocation: Allocation): boolean {
  return tower.recipe.every((element) => {
    const index = ELEMENTS.indexOf(element as ElementName);

    return (
      index >= 0 &&
      allocation[index] >= (tower.req[element] ?? 1)
    );
  });
}

function hasRole(
  roles: string[],
  aliases: readonly string[],
): boolean {
  return aliases.some((alias) => roles.includes(alias));
}

function roleLevel(
  roles: string[],
  rolePriority: string[],
  aliases: readonly string[],
): RoleLevel {
  if (hasRole(rolePriority.slice(0, 1), aliases)) {
    return "Primary";
  }

  if (hasRole(roles, aliases)) {
    return "Secondary";
  }

  return "None";
}

function behaviorStatus(
  mechanics: MechanicsRecord | null,
  aliases: readonly string[],
): EvidenceStatus {
  if (!mechanics) return "UNKNOWN";

  const tags = mechanics.damage_profile?.tags ?? [];

  return hasRole(tags, aliases) ? "CONFIRMED" : "UNKNOWN";
}

export function buildTowerState(
  tower: Tower,
  allocation: Allocation,
): TowerState {
  const mechanics = MECHANICS_BY_TOWER.get(tower.name) ?? null;

  const tier = getTier(tower, allocation);
  const maxTier = getMaxTier(mechanics, tower);
  const unlocked = isUnlocked(tower, allocation);

  const strategicRoles = mechanics?.strategic_roles ?? [];
  const rolePriority = mechanics?.role_priority ?? [];

  return {
    tower,
    mechanics,
    tier,
    allocation,

    unlocked,
    maxTier,

    roles: {
      mainDPS: roleLevel(
        strategicRoles,
        rolePriority,
        ["Main DPS"],
      ),

      subDPS: roleLevel(
        strategicRoles,
        rolePriority,
        ["Sub-DPS", "Secondary Damage"],
      ),

      control: roleLevel(
        strategicRoles,
        rolePriority,
        ["Control"],
      ),

      coverage: roleLevel(
        strategicRoles,
        rolePriority,
        ["Coverage", "Wave Clear"],
      ),

      amplification: roleLevel(
        strategicRoles,
        rolePriority,
        [
          "Damage Amp",
          "Damage Buff",
          "Attack-speed Amp",
          "Attack-Speed Amp",
        ],
      ),

      range: roleLevel(
        strategicRoles,
        rolePriority,
        [
          "Range Specialist",
          "Range-effective",
        ],
      ),

      scaling: roleLevel(
        strategicRoles,
        rolePriority,
        [
          "Scaling",
          "Density Scaling",
          "Kill Scaling",
          "Attack-Speed Scaling",
        ],
      ),

      support: roleLevel(
        strategicRoles,
        rolePriority,
        ["Support", "Enabler"],
      ),
    },

    behavior: {
      burst: behaviorStatus(mechanics, ["Burst"]),
      sustained: behaviorStatus(mechanics, ["Sustained"]),
      ramp: behaviorStatus(mechanics, ["Ramp"]),
      stacking: behaviorStatus(mechanics, ["Stacking"]),
      dot: behaviorStatus(mechanics, ["DoT", "DoT-like"]),
      execute: behaviorStatus(mechanics, [
        "Execute",
        "Execute-like",
        "Finisher",
        "Global finisher",
      ]),
      killScaling: behaviorStatus(mechanics, ["Kill Scaling"]),
      attackScaling: behaviorStatus(mechanics, [
        "Attack Scaling",
      ]),
      frontLoaded: behaviorStatus(mechanics, [
        "Front-loaded",
      ]),
      backLoaded: behaviorStatus(mechanics, [
        "Back-loaded",
      ]),
      focused: behaviorStatus(mechanics, [
        "Focused",
        "Burst/Focused",
      ]),
      distributed: behaviorStatus(mechanics, [
        "Distributed",
        "Distributed Sub-DPS",
      ]),
      chainReaction: behaviorStatus(mechanics, [
        "Chain Reaction",
      ]),
    },
  };
}