import fs from "node:fs";

const economics = JSON.parse(
  fs.readFileSync(
    "./data/towerEconomics.v1.json",
    "utf8",
  ),
);
const towers = JSON.parse(
  fs.readFileSync(
    "./data/towers.v2.json",
    "utf8",
  ),
);

const errors = [];
const expectedLevels = {
  Dual: 3,
  Trio: 2,
  Quad: 1,
};

if (economics.schemaVersion !== 1) {
  errors.push(
    `Expected schemaVersion 1, got ${economics.schemaVersion}.`,
  );
}

if (
  economics.costSemantics !==
  "cumulative-minimum-field-cost"
) {
  errors.push(
    "Cost semantics must be cumulative-minimum-field-cost.",
  );
}

for (const [combination, levelCount]
  of Object.entries(expectedLevels)) {
  const costs =
    economics.costsByCombination
      ?.[combination];

  if (
    !Array.isArray(costs) ||
    costs.length !== levelCount
  ) {
    errors.push(
      `${combination} must define ${levelCount} cumulative level costs.`,
    );
    continue;
  }

  for (let index = 0;
    index < costs.length;
    index += 1) {
    const cost = costs[index];

    if (
      !Number.isFinite(cost) ||
      cost <= 0
    ) {
      errors.push(
        `${combination} L${index + 1} cost must be positive and finite.`,
      );
    }

    if (
      index > 0 &&
      cost <= costs[index - 1]
    ) {
      errors.push(
        `${combination} cumulative costs must strictly increase by level.`,
      );
    }
  }
}

for (const tower of towers.towers) {
  const costs =
    economics.costsByCombination
      ?.[tower.combination];

  if (
    !Array.isArray(costs) ||
    costs.length !== tower.maxLevel
  ) {
    errors.push(
      `${tower.id}: economics levels do not match maxLevel ${tower.maxLevel}.`,
    );
  }
}

if (
  !Array.isArray(economics.sources) ||
  economics.sources.length === 0
) {
  errors.push(
    "At least one provenance source is required.",
  );
}

if (errors.length > 0) {
  console.error(
    `Tower economics validation failed with ${errors.length} error(s):`,
  );
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Tower economics catalog valid: ${towers.towers.length} normal towers, cumulative field-cost semantics.`,
  );
}
