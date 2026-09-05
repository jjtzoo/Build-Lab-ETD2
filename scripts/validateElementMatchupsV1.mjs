import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const matchupPath = path.join(
  root,
  "data",
  "elementMatchups.v1.json",
);

const catalog = JSON.parse(
  fs.readFileSync(matchupPath, "utf8"),
);

const ELEMENTS = [
  "Light",
  "Darkness",
  "Water",
  "Fire",
  "Nature",
  "Earth",
];

const VALID_MULTIPLIERS = new Set([0.5, 1, 2]);

const errors = [];

if (catalog.schemaVersion !== 1) {
  errors.push(
    `Expected schemaVersion 1, got ${catalog.schemaVersion}`,
  );
}

if (!Array.isArray(catalog.elements)) {
  errors.push("elements must be an array");
} else {
  const listed = new Set(catalog.elements);

  for (const element of ELEMENTS) {
    if (!listed.has(element)) {
      errors.push(`Missing element: ${element}`);
    }
  }

  for (const element of catalog.elements) {
    if (!ELEMENTS.includes(element)) {
      errors.push(`Unknown element: ${element}`);
    }
  }

  if (listed.size !== ELEMENTS.length) {
    errors.push(
      `Expected ${ELEMENTS.length} unique elements, got ${listed.size}`,
    );
  }
}

if (
  !catalog.matchups ||
  typeof catalog.matchups !== "object" ||
  Array.isArray(catalog.matchups)
) {
  errors.push("matchups must be an object");
} else {
  for (const attacker of ELEMENTS) {
    const row = catalog.matchups[attacker];

    if (!row || typeof row !== "object") {
      errors.push(
        `Missing matchup row for attacker: ${attacker}`,
      );
      continue;
    }

    for (const defender of ELEMENTS) {
      const multiplier = row[defender];

      if (!VALID_MULTIPLIERS.has(multiplier)) {
        errors.push(
          `Invalid multiplier ${attacker} -> ${defender}: ${multiplier}`,
        );
      }
    }

    for (const defender of Object.keys(row)) {
      if (!ELEMENTS.includes(defender)) {
        errors.push(
          `Unknown defender element in ${attacker} row: ${defender}`,
        );
      }
    }

    if (Object.keys(row).length !== ELEMENTS.length) {
      errors.push(
        `Expected ${ELEMENTS.length} entries in ${attacker} row, got ${Object.keys(row).length}`,
      );
    }
  }

  for (const attacker of Object.keys(catalog.matchups)) {
    if (!ELEMENTS.includes(attacker)) {
      errors.push(
        `Unknown attacker element: ${attacker}`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error("Element matchup validation failed:\n");

  for (const error of errors) {
    console.error(`- ${error}`);
  }

  process.exit(1);
}

console.log(
  `Element matchups valid: ${ELEMENTS.length} x ${ELEMENTS.length} matrix`,
);