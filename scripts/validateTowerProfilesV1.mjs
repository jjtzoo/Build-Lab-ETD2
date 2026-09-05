import fs from "node:fs";

const towerCatalog = JSON.parse(
  fs.readFileSync("./data/towers.v2.json", "utf8"),
);

const profileCatalog = JSON.parse(
  fs.readFileSync("./data/towerProfiles.v1.json", "utf8"),
);

const CORE_ROLES = new Set([
  "main-dps",
  "slow",
  "damage-amp",
  "buff",
]);

const DAMAGE_SHAPES = new Set([
  "single-target",
  "aoe",
  "hybrid",
]);

const DAMAGE_PROFILES = new Set([
  "burst",
  "sustained",
  "dot",
  "ramp",
  "execute",
]);

const DAMAGE_DELIVERIES = new Set([
  "basic-attack",
  "fixed-cooldown",
  "attack-count",
  "triggered",
  "periodic",
]);

const ELEMENTS = new Set([
  "Light",
  "Darkness",
  "Water",
  "Fire",
  "Nature",
  "Earth",
]);

const MECHANIC_SIGNALS = new Set([
  "enemy-slow",
  "damage-taken-amp",
  "attack-damage-buff",
  "attack-speed-buff",
  "tower-replication",
  "nearby-enemy-death",
  "target-isolation",
  "enemy-grouping",
  "enemy-displacement",
  "path-distance",
]);

const SATURATION_MODES = new Set([
  "single",
  "diminishing",
  "repeatable",
]);

const towerIds = new Set(
  towerCatalog.towers.map((tower) => tower.id),
);

const errors = [];
const profileIds = new Set();

if (profileCatalog.schemaVersion !== 1) {
  errors.push(
    `Expected schemaVersion 1, got ${profileCatalog.schemaVersion}`,
  );
}

if (!Array.isArray(profileCatalog.profiles)) {
  errors.push("profiles must be an array.");
}

for (const profile of profileCatalog.profiles ?? []) {
  const id = profile.towerId ?? "Unknown profile";

  if (!towerIds.has(id)) {
    errors.push(`${id}: towerId does not exist in towers.v2.json`);
  }

  if (profileIds.has(id)) {
    errors.push(`${id}: duplicate tower profile`);
  } else {
    profileIds.add(id);
  }

  if (!Array.isArray(profile.coreRoles)) {
    errors.push(`${id}: coreRoles must be an array`);
  } else {
    for (const role of profile.coreRoles) {
      if (!CORE_ROLES.has(role)) {
        errors.push(`${id}: invalid core role "${role}"`);
      }
    }
  }

  if (profile.offense) {
    if (!DAMAGE_SHAPES.has(profile.offense.damageShape)) {
      errors.push(
        `${id}: invalid damageShape "${profile.offense.damageShape}"`,
      );
    }

    if (!DAMAGE_PROFILES.has(profile.offense.damageProfile)) {
      errors.push(
        `${id}: invalid damageProfile "${profile.offense.damageProfile}"`,
      );
    }

    if (!DAMAGE_DELIVERIES.has(profile.offense.damageDelivery)) {
      errors.push(
        `${id}: invalid damageDelivery "${profile.offense.damageDelivery}"`,
      );
    }

    if (!ELEMENTS.has(profile.offense.offensiveElement)) {
      errors.push(
        `${id}: invalid offensiveElement "${profile.offense.offensiveElement}"`,
      );
    }
  }

  const mechanics = profile.mechanics;

  if (!mechanics) {
    errors.push(`${id}: missing mechanics`);
    continue;
  }

  for (const supply of mechanics.provides ?? []) {
    if (!MECHANIC_SIGNALS.has(supply.signal)) {
      errors.push(
        `${id}: invalid provided signal "${supply.signal}"`,
      );
    }

    if (
      !Number.isInteger(supply.strength) ||
      supply.strength < 1 ||
      supply.strength > 4
    ) {
      errors.push(
        `${id}: invalid provide strength "${supply.strength}"`,
      );
    }
  }

  for (const demand of mechanics.consumes ?? []) {
    if (!MECHANIC_SIGNALS.has(demand.signal)) {
      errors.push(
        `${id}: invalid consumed signal "${demand.signal}"`,
      );
    }

    if (
      !Number.isInteger(demand.strength) ||
      demand.strength < 1 ||
      demand.strength > 4
    ) {
      errors.push(
        `${id}: invalid consume strength "${demand.strength}"`,
      );
    }

    if (!SATURATION_MODES.has(demand.saturation)) {
      errors.push(
        `${id}: invalid saturation "${demand.saturation}"`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(
    `Tower profile validation failed with ${errors.length} error(s):`,
  );

  for (const error of errors) {
    console.error(`- ${error}`);
  }

  process.exit(1);
}

console.log(
  `Tower profiles valid: ${profileCatalog.profiles.length} profiles`,
);