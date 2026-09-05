import fs from "node:fs";

const towersPath = "./data/towers.json";
const mechanicsPath = "./data/mechanics.json";
const outputPath = "./data/towers.v2.json";

const oldTowerData = JSON.parse(
  fs.readFileSync(towersPath, "utf8"),
);

const mechanicsData = JSON.parse(
  fs.readFileSync(mechanicsPath, "utf8"),
);

function toId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const mechanicsByTower = new Map(
  mechanicsData.records
    .filter((record) => record.tower)
    .map((record) => [record.tower, record]),
);

const expectedMaxLevel = {
  Dual: 3,
  Trio: 2,
  Quad: 1,
};

const towers = oldTowerData.towers.map((tower) => {
  const mechanics = mechanicsByTower.get(tower.name);

  if (!mechanics) {
    throw new Error(
      `Missing mechanics record for ${tower.name}`,
    );
  }

  const maxLevel = expectedMaxLevel[tower.type];

  if (!maxLevel) {
    throw new Error(
      `Unknown combination type for ${tower.name}: ${tower.type}`,
    );
  }

  if (mechanics.max_level !== maxLevel) {
    throw new Error(
      `${tower.name}: expected max level ${maxLevel}, got ${mechanics.max_level}`,
    );
  }

  const stats = mechanics.stats;

  if (
    !stats ||
    !Array.isArray(stats.damage) ||
    typeof stats.attack_speed !== "number" ||
    typeof stats.range !== "number" ||
    typeof stats.aoe !== "number"
  ) {
    throw new Error(
      `Missing required stats for ${tower.name}`,
    );
  }

  return {
    id: toId(tower.name),
    name: tower.name,
    combination: tower.type,
    recipe: tower.recipe,
    maxLevel: mechanics.max_level,
    damageElement: tower.damage,
    stats: {
      damage: stats.damage,
      attackSpeed: stats.attack_speed,
      range: stats.range,
      aoe: stats.aoe,
    },
  };
});

const output = {
  schemaVersion: 2,
  elements: oldTowerData.elements,
  towers,
};

fs.writeFileSync(
  outputPath,
  `${JSON.stringify(output, null, 2)}\n`,
);

console.log(
  `Migrated ${towers.length} towers → ${outputPath}`,
);