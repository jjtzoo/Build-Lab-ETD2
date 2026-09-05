import fs from "node:fs";

const towers = JSON.parse(
  fs.readFileSync("./data/towers.v2.json", "utf8"),
);

const profiles = JSON.parse(
  fs.readFileSync("./data/towerProfiles.v1.json", "utf8"),
);

const mechanics = JSON.parse(
  fs.readFileSync("./data/mechanics.json", "utf8"),
);

const profiledIds = new Set(
  profiles.profiles.map((profile) => profile.towerId),
);

function toId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const mechanicsById = new Map(
  mechanics.records
    .filter((record) => record.tower)
    .map((record) => [
      toId(record.tower),
      record,
    ]),
);

const remaining = towers.towers.filter(
  (tower) => !profiledIds.has(tower.id),
);

console.log(
  `Remaining tower profiles: ${remaining.length}\n`,
);

for (const tower of remaining) {
  const record = mechanicsById.get(tower.id);

  console.log(`=== ${tower.name} ===`);
  console.log(`ID: ${tower.id}`);
  console.log(
    `Combination: ${tower.combination}`,
  );

  if (!record) {
    console.log("Research record: MISSING");
    console.log();
    continue;
  }

  console.log(
    `Old role: ${record.source_catalog_role ?? ""}`,
  );

  console.log(
    `Old utility: ${record.source_catalog_utility ?? ""}`,
  );

  console.log(
    `Core mechanic: ${record.core_mechanic ?? ""}`,
  );

  console.log(
    `Old strategic roles: ${
      Array.isArray(record.strategic_roles)
        ? record.strategic_roles.join(", ")
        : ""
    }`,
  );

  console.log();
}