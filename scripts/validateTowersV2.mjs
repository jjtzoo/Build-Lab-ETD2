import fs from "node:fs";

const catalog = JSON.parse(
  fs.readFileSync("./data/towers.v2.json", "utf8"),
);

const ELEMENTS = new Set([
  "Light",
  "Darkness",
  "Water",
  "Fire",
  "Nature",
  "Earth",
]);

const EXPECTED = {
  Dual: {
    recipeLength: 2,
    maxLevel: 3,
  },
  Trio: {
    recipeLength: 3,
    maxLevel: 2,
  },
  Quad: {
    recipeLength: 4,
    maxLevel: 1,
  },
};

const errors = [];

if (catalog.schemaVersion !== 2) {
  errors.push(
    `Expected schemaVersion 2, got ${catalog.schemaVersion}`,
  );
}

if (!Array.isArray(catalog.towers)) {
  errors.push("Catalog towers must be an array.");
}

const ids = new Set();

for (const tower of catalog.towers ?? []) {
  const label = tower.name ?? tower.id ?? "Unknown tower";

  if (!tower.id) {
    errors.push(`${label}: missing id`);
  } else if (ids.has(tower.id)) {
    errors.push(`${label}: duplicate id "${tower.id}"`);
  } else {
    ids.add(tower.id);
  }

  const rule = EXPECTED[tower.combination];

  if (!rule) {
    errors.push(
      `${label}: invalid combination "${tower.combination}"`,
    );
    continue;
  }

  if (
    !Array.isArray(tower.recipe) ||
    tower.recipe.length !== rule.recipeLength
  ) {
    errors.push(
      `${label}: ${tower.combination} must have ${rule.recipeLength} recipe elements`,
    );
  }

  for (const element of tower.recipe ?? []) {
    if (!ELEMENTS.has(element)) {
      errors.push(
        `${label}: invalid recipe element "${element}"`,
      );
    }
  }

  if (!ELEMENTS.has(tower.damageElement)) {
    errors.push(
      `${label}: invalid damageElement "${tower.damageElement}"`,
    );
  }

  if (tower.maxLevel !== rule.maxLevel) {
    errors.push(
      `${label}: expected maxLevel ${rule.maxLevel}, got ${tower.maxLevel}`,
    );
  }

  if (
    !tower.stats ||
    !Array.isArray(tower.stats.damage)
  ) {
    errors.push(`${label}: missing damage stats`);
    continue;
  }

  if (tower.stats.damage.length !== tower.maxLevel) {
    errors.push(
      `${label}: damage array has ${tower.stats.damage.length} values but maxLevel is ${tower.maxLevel}`,
    );
  }

  for (const field of [
    "attackSpeed",
    "range",
    "aoe",
  ]) {
    if (typeof tower.stats[field] !== "number") {
      errors.push(
        `${label}: stats.${field} must be a number`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(
    `Tower catalog validation failed with ${errors.length} error(s):`,
  );

  for (const error of errors) {
    console.error(`- ${error}`);
  }

  process.exit(1);
}

console.log(
  `Tower catalog valid: ${catalog.towers.length} towers`,
);