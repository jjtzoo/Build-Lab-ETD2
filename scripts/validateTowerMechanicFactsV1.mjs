import fs from "node:fs";

const catalog = JSON.parse(
  fs.readFileSync(
    "./data/towerMechanicFacts.v1.json",
    "utf8",
  ),
);

const towers = JSON.parse(
  fs.readFileSync(
    "./data/towers.v2.json",
    "utf8",
  ),
).towers;

const profiles = JSON.parse(
  fs.readFileSync(
    "./data/towerProfiles.v1.json",
    "utf8",
  ),
).profiles;

const towerById = new Map(
  towers.map((tower) => [
    tower.id,
    tower,
  ]),
);

const profileById = new Map(
  profiles.map((profile) => [
    profile.towerId,
    profile,
  ]),
);

const errors = [];
const keys = new Set();

if (catalog.schemaVersion !== 1) {
  errors.push(
    `Expected schemaVersion 1, got ${catalog.schemaVersion}`,
  );
}

for (const effect of catalog.effects ?? []) {
  const tower =
    towerById.get(effect.towerId);

  const profile =
    profileById.get(effect.towerId);

  if (!tower || !profile) {
    errors.push(
      `${effect.towerId}: unknown tower`,
    );
    continue;
  }

  const key =
    `${effect.towerId}:${effect.signal}`;

  if (keys.has(key)) {
    errors.push(
      `${key}: duplicate mechanic fact`,
    );
  }

  keys.add(key);

  const declared = [
    ...profile.mechanics.provides,
    ...profile.mechanics.consumes,
  ].some(
    (entry) =>
      entry.signal === effect.signal,
  );

  if (!declared) {
    errors.push(
      `${key}: signal is absent from the canonical tower profile`,
    );
  }

  for (const [label, values] of [
    ["magnitude.byLevel", effect.magnitude?.byLevel],
    ["durationSeconds.byLevel", effect.durationSeconds?.byLevel],
  ]) {
    if (!values) {
      continue;
    }

    if (values.length !== tower.maxLevel) {
      errors.push(
        `${key}: ${label} has ${values.length} values; expected ${tower.maxLevel}`,
      );
    }

    if (
      values.some(
        (value) =>
          typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < 0,
      )
    ) {
      errors.push(
        `${key}: ${label} must contain finite non-negative numbers`,
      );
    }
  }

  for (const field of [
    "cooldownSeconds",
    "triggerIntervalSeconds",
    "maxTargets",
    "resetSeconds",
  ]) {
    const value = effect[field];

    if (
      value !== undefined &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        value <= 0)
    ) {
      errors.push(
        `${key}: ${field} must be a positive finite number`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(
    `Tower mechanic fact validation failed with ${errors.length} error(s):`,
  );

  for (const error of errors) {
    console.error(`- ${error}`);
  }

  process.exit(1);
}

console.log(
  `Tower mechanic facts valid: ${catalog.effects.length} effects`,
);
