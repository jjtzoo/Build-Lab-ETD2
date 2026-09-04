export const CORE_ROLE_PRIORITY = [
  "main-dps",
  "slow",
  "damage-amp",
  "buff",
] as const;

export type CoreRole =
  (typeof CORE_ROLE_PRIORITY)[number];

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