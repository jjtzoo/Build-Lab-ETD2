import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const towerCatalogPath = path.join(root, "data", "towers.v2.json");
const towerProfilesPath = path.join(
  root,
  "data",
  "towerProfiles.v1.json",
);
const anchorPolicyPath = path.join(
  root,
  "lib",
  "domain",
  "anchorPolicy.ts",
);

const towerCatalog = JSON.parse(
  fs.readFileSync(towerCatalogPath, "utf8"),
);

const towerProfiles = JSON.parse(
  fs.readFileSync(towerProfilesPath, "utf8"),
);

const anchorPolicySource = fs.readFileSync(
  anchorPolicyPath,
  "utf8",
);

const anchorIds = [
  ...anchorPolicySource.matchAll(
    /\{\s*towerId:\s*"([^"]+)"\s*\}/g,
  ),
].map((match) => match[1]);

const towersById = new Map(
  towerCatalog.towers.map((tower) => [tower.id, tower]),
);

const profilesById = new Map(
  towerProfiles.profiles.map((profile) => [
    profile.towerId,
    profile,
  ]),
);

const errors = [];

const seen = new Set();

for (const towerId of anchorIds) {
  if (seen.has(towerId)) {
    errors.push(`Duplicate curated anchor: ${towerId}`);
  }

  seen.add(towerId);

  const tower = towersById.get(towerId);

  if (!tower) {
    errors.push(`Unknown curated anchor: ${towerId}`);
    continue;
  }

  if (
    tower.combination !== "Dual" &&
    tower.combination !== "Trio"
  ) {
    errors.push(
      `Curated anchor ${towerId} must be Dual or Trio, got ${tower.combination}`,
    );
  }

  const profile = profilesById.get(towerId);

  if (!profile) {
    errors.push(
      `Missing tower profile for curated anchor: ${towerId}`,
    );
    continue;
  }

  if (!profile.coreRoles.includes("main-dps")) {
    errors.push(
      `Curated anchor ${towerId} is not classified as main-dps`,
    );
  }
}

if (anchorIds.length === 0) {
  errors.push("No curated anchors found.");
}

if (errors.length > 0) {
  console.error("Anchor policy validation failed:\n");

  for (const error of errors) {
    console.error(`- ${error}`);
  }

  process.exit(1);
}

console.log(
  `Anchor policy valid: ${anchorIds.length} curated anchors`,
);