import type { TowerProfile } from "@/lib/domain/towerProfile";

export const MUSHROOM_PROFILE: TowerProfile = {
  towerId: "mushroom",

  coreRoles: ["main-dps"],

  offense: {
    damageShape: "aoe",
    damageProfile: "sustained",
    damageDelivery: "basic-attack",
    offensiveElement: "Nature",
  },

  mechanics: {
    provides: [],

    consumes: [
      {
        signal: "enemy-slow",
        strength: 4,
        saturation: "repeatable",
      },
    ],
  },
};

export const BLACKSMITH_PROFILE: TowerProfile = {
  towerId: "blacksmith",

  coreRoles: ["buff"],

  mechanics: {
    provides: [
      {
        signal: "attack-damage-buff",
        strength: 4,
      },
    ],

    consumes: [],
  },
};

export const INCANTATION_PROFILE: TowerProfile = {
  towerId: "incantation",

  coreRoles: ["damage-amp"],

  mechanics: {
    provides: [
      {
        signal: "damage-taken-amp",
        strength: 4,
      },
    ],

    consumes: [
      {
        signal: "target-isolation",
        strength: 3,
        saturation: "single",
      },
    ],
  },
};

export const TRICKERY_PROFILE: TowerProfile = {
  towerId: "trickery",

  coreRoles: ["buff"],

  mechanics: {
    provides: [
      {
        signal: "tower-replication",
        strength: 4,
      },
    ],

    consumes: [],
  },
};


export const ETHEREAL_PROFILE: TowerProfile = {
  towerId: "ethereal",

  coreRoles: ["main-dps"],

  mechanics: {
    provides: [],

    consumes: [
      {
        signal: "nearby-enemy-death",
        strength: 4,
        saturation: "repeatable",
      },
    ],
  },
};


export const GRAVITY_CANNON_PROFILE: TowerProfile = {
  towerId: "gravity-cannon",

  coreRoles: ["main-dps"],

  mechanics: {
    provides: [
      {
        signal: "enemy-displacement",
        strength: 4,
      },
    ],

    consumes: [],
  },
};