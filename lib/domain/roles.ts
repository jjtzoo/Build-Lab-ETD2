export const CORE_ROLE_PRIORITY = [
  "main-dps",
  "slow",
  "damage-amp",
  "buff",
] as const;

export type CoreRole =
  (typeof CORE_ROLE_PRIORITY)[number];

/** Display label for each core role (front-end use). */
export const CORE_ROLE_LABEL: Record<CoreRole, string> = {
  "main-dps": "Main DPS",
  slow: "Slow",
  "damage-amp": "Damage Amp",
  buff: "Buff",
};

/** Label for a tower with no mandatory core role. */
export const SUPPORT_ROLE_LABEL = "Support";

export type CoreRoleRequirement = {
  role: CoreRole;
  minimum: number;
};

export const CORE_ROLE_REQUIREMENTS: readonly CoreRoleRequirement[] = [
  {
    role: "main-dps",
    minimum: 1,
  },
  {
    role: "slow",
    minimum: 1,
  },
  {
    role: "damage-amp",
    minimum: 1,
  },
  {
    role: "buff",
    minimum: 1,
  },
];