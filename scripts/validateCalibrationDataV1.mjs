import fs from "node:fs";

// Validates the three measured-play data files that calibrate the Match
// Plan model: data/waveObservations.v1.json, data/economy.v1.json and
// data/waveAbilityFacts.v1.json. Every value is a transcription of a
// screenshot; a null is "unmeasured" and is always allowed. What is not
// allowed is a number without a source, or a shape the engine cannot read.

const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const observations = read("./data/waveObservations.v1.json");
const economy = read("./data/economy.v1.json");
const abilities = read("./data/waveAbilityFacts.v1.json");

const DIFFICULTIES = new Set([
  "normal",
  "hard",
  "veryHard",
  "insane",
  "legendary",
]);
const ABILITIES = new Set([
  "Fast",
  "Cursed",
  "Healing",
  "Temporal",
  "Undead",
  "Bulky",
  "Shield",
]);
const errors = [];

const positive = (value) =>
  value === null ||
  (typeof value === "number" && Number.isFinite(value) && value >= 0);

// ---- wave observations
if (observations.schemaVersion !== 1)
  errors.push("waveObservations: schemaVersion must be 1");
const gameIds = new Set();
for (const game of observations.games ?? []) {
  const tag = `waveObservations.games[${game.id}]`;
  if (!game.id || gameIds.has(game.id))
    errors.push(`${tag}: id missing or duplicate`);
  gameIds.add(game.id);
  if (!DIFFICULTIES.has(game.difficulty))
    errors.push(`${tag}: unknown difficulty ${game.difficulty}`);
  if (!game.source) errors.push(`${tag}: source (screenshot) is required`);
  if (!["win", "loss"].includes(game.result))
    errors.push(`${tag}: result must be win or loss`);
  for (const field of ["wavesCleared", "networth", "totalDamageDealt", "leaks"]) {
    if (!positive(game[field]))
      errors.push(`${tag}: ${field} must be a non-negative number or null`);
  }
  if (
    typeof game.wavesCleared === "number" &&
    (game.wavesCleared < 0 || game.wavesCleared > 70)
  )
    errors.push(`${tag}: wavesCleared out of range`);
}
for (const wave of observations.waves ?? []) {
  const tag = `waveObservations.waves[${wave.gameId}#${wave.wave}]`;
  if (!gameIds.has(wave.gameId)) errors.push(`${tag}: unknown gameId`);
  if (!Number.isInteger(wave.wave) || wave.wave < 1 || wave.wave > 70)
    errors.push(`${tag}: wave must be 1-70`);
  for (const field of ["count", "hpPerCreep", "damageDealt", "bounty"]) {
    if (wave[field] !== undefined && !positive(wave[field]))
      errors.push(`${tag}: ${field} must be a non-negative number or null`);
  }
}

// ---- economy
if (economy.schemaVersion !== 1) errors.push("economy: schemaVersion must be 1");
if (economy.interest !== null) {
  const interest = economy.interest;
  if (typeof interest.ratePercent !== "number" || !positive(interest.ratePercent))
    errors.push("economy.interest.ratePercent must be a number");
  if (
    !(
      interest.interval === "per-wave" ||
      (interest.interval &&
        typeof interest.interval.seconds === "number" &&
        interest.interval.seconds > 0)
    )
  )
    errors.push("economy.interest.interval must be per-wave or { seconds }");
  if (!["gold", "networth"].includes(interest.base))
    errors.push("economy.interest.base must be gold or networth");
  if (!interest.source) errors.push("economy.interest.source is required");
}

// ---- wave abilities
if (abilities.schemaVersion !== 1)
  errors.push("waveAbilityFacts: schemaVersion must be 1");
for (const name of ABILITIES) {
  const entry = abilities.abilities?.[name];
  if (!entry) {
    errors.push(`waveAbilityFacts: missing ability ${name}`);
    continue;
  }
  if (!positive(entry.effectiveHpMultiplier))
    errors.push(
      `waveAbilityFacts.${name}: effectiveHpMultiplier must be a number or null`,
    );
  if (entry.effectiveHpMultiplier !== null && !entry.source)
    errors.push(`waveAbilityFacts.${name}: a measured multiplier needs a source`);
}
for (const name of Object.keys(abilities.abilities ?? {})) {
  if (!ABILITIES.has(name))
    errors.push(`waveAbilityFacts: unknown ability ${name}`);
}

if (errors.length) {
  console.error(
    `Calibration data validation failed with ${errors.length} error(s):`,
  );
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
const measuredWaves = (observations.waves ?? []).length;
const games = (observations.games ?? []).length;
const measuredAbilities = Object.values(abilities.abilities).filter(
  (entry) => entry.effectiveHpMultiplier !== null,
).length;
console.log(
  `Calibration data valid: ${games} games, ${measuredWaves} measured waves, interest ${economy.interest ? "measured" : "unmeasured"}, ${measuredAbilities}/7 abilities measured.`,
);
