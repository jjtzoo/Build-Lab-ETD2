/**
 * Derives `data/towerPlacementFacts.v1.json` from data the repo already
 * holds, and prints the derivation so it can be audited by eye.
 *
 * Nothing here is a new game fact. `data/mechanics.json` already records
 * every tower's real behaviour — the catch is that its *structured*
 * fields (`control.duration`, `damage_profile.back_loaded`, …) are the
 * literal string "UNKNOWN" for all 50 records, while the actual content
 * sits in three populated places: `core_mechanic` prose, the one-line
 * `build_position`, and `damage_profile.tags`. This script turns those
 * into typed fields and keeps the source strings alongside as evidence.
 *
 * Structured effect timings from `towerMechanicFacts.v1.json` take
 * precedence over the prose wherever they exist — that file was authored
 * deliberately, the prose parse is a fallback.
 *
 *   node scripts/derivePlacementFactsV1.mjs          # print only
 *   node scripts/derivePlacementFactsV1.mjs --write  # write the JSON
 */

import fs from "node:fs";

const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));

const mechanics = read("./data/mechanics.json");
const towers = read("./data/towers.v2.json").towers;
const profiles = read("./data/towerProfiles.v1.json").profiles;
const effects = read("./data/towerMechanicFacts.v1.json").effects;

const idByName = new Map(towers.map((t) => [t.name, t.id]));
const profileById = new Map(profiles.map((p) => [p.towerId, p]));

/**
 * Signals applied to a creep for a window of time, so route position and
 * overlap with a damage dealer both matter. `damage-echo` belongs here
 * even though it deals damage rather than weakening: Jinx "deals 8%/16%
 * of damage the creep has taken since debuff began", which is the purest
 * case in the game of an effect that is worth nothing without a DPS
 * tower firing at the same creeps.
 */
const CREEP_DEBUFF_SIGNALS = new Set([
  "enemy-slow",
  "enemy-stun",
  "enemy-stasis",
  "damage-taken-amp",
  "current-hp-removal",
  "damage-echo",
]);

/** Signals that land on towers, which makes route position irrelevant. */
const TOWER_BUFF_SIGNALS = new Set([
  "attack-damage-buff",
  "attack-speed-buff",
  "tower-replication",
]);

/**
 * Longest authored duration for a creep-facing effect, or null when the
 * structured catalog has nothing for this tower.
 */
function structuredDebuffSeconds(towerId) {
  const rows = effects.filter(
    (e) => e.towerId === towerId && CREEP_DEBUFF_SIGNALS.has(e.signal),
  );
  const durations = rows
    .flatMap((e) => e.durationSeconds?.byLevel ?? [])
    .filter((n) => Number.isFinite(n));
  return durations.length > 0 ? Math.max(...durations) : null;
}

/**
 * Duration stated in prose, e.g. "for 30s" or "for 5s in AoE". Takes the
 * largest value in a per-level list ("6/18/54s" -> 54), since placement
 * is judged at the level the tower will actually reach.
 */
function proseDebuffSeconds(text) {
  const match = text.match(/(?:for|lasts)\s+([0-9.]+(?:\/[0-9.]+)*)\s*s\b/i);
  if (!match) return null;
  const values = match[1].split("/").map(Number).filter(Number.isFinite);
  return values.length > 0 ? Math.max(...values) : null;
}

const PERMANENT = /permanent|does not return|does not expire|indefinit/i;

/**
 * These are deliberately narrow. A first pass matched `/finisher|execute/`
 * against `damage_profile.tags` and `/split/` against the prose, which
 * produced four wrong rows: Railgun and Crystal Spire are tagged
 * "Finisher" but have no HP-scaling mechanic, Vapor "splits damage
 * equally" between targets, and Flamethrower's text merely mentions that
 * "Shredder split can trigger napalm early" — another tower's mechanic.
 * So only an explicit statement counts.
 */
/** Exact tag, not a substring — the game's own back-loaded marker. */
const BACK_LOADED_TAG = "Back-loaded";
/** Damage that scales with how hurt the target already is. */
const HP_SCALING = /HP missing|missing HP|health-scaling/i;
/** Creep multiplication — anchored so "splits damage" doesn't match. */
const SPLITS_CREEPS = /\bsplits target\b/i;
/** Polar's "Pre-damage HP shaving". */
const PRE_DAMAGE = /^pre-/i;

function derive(record) {
  const towerId = idByName.get(record.tower);
  if (!towerId) return null;

  const coreMechanic = String(record.core_mechanic ?? "");
  const buildPosition = String(record.build_position ?? "");
  const tags = record.damage_profile?.tags ?? [];
  const provides = profileById.get(towerId)?.mechanics?.provides ?? [];
  const provided = new Set(provides.map((p) => p.signal));

  const targetsTowers = [...provided].some((s) => TOWER_BUFF_SIGNALS.has(s));

  // --- debuff persistence -------------------------------------------
  const permanentEffect = PERMANENT.test(coreMechanic);
  const appliesCreepDebuff =
    [...provided].some((s) => CREEP_DEBUFF_SIGNALS.has(s)) || permanentEffect;

  let debuff = null;
  if (appliesCreepDebuff && !targetsTowers) {
    const stated =
      structuredDebuffSeconds(towerId) ?? proseDebuffSeconds(coreMechanic);
    if (stated !== null) {
      // Polar: a stated 30s window whose HP removal then never reverts.
      debuff = { durationSeconds: stated, permanentEffect };
    } else if (permanentEffect) {
      // Nuclear: no window stated and the text says it is permanent, so
      // durationSeconds null means "runs for the rest of the route".
      debuff = { durationSeconds: null, permanentEffect: true };
    }
  }

  // --- where on the route -------------------------------------------
  /*
   * Only a mechanic-level statement sets this. Notably a debuff's
   * *duration* does not: the scorer already computes
   * min(duration, routeRemaining), which pulls a long or permanent
   * effect toward the front of the route on its own and correctly
   * shows no preference for a 5s slow. Labelling every debuff tower
   * "front" on top of that would double-count, and would invent a
   * front-loading bias for towers that genuinely do not have one.
   */
  let routePreference = "anywhere";
  if (tags.includes(BACK_LOADED_TAG) || HP_SCALING.test(coreMechanic)) {
    routePreference = "late";
  } else if (
    PRE_DAMAGE.test(buildPosition) ||
    SPLITS_CREEPS.test(coreMechanic)
  ) {
    routePreference = "front";
  }
  if (targetsTowers) routePreference = "anywhere";

  // --- how it wants the route distributed across its radius ---------
  let radialPreference = "any";
  const growsWithDistance = /increases with distance/i.test(coreMechanic);
  const rewardsClosing = /as target gets closer/i.test(coreMechanic);
  if (growsWithDistance && rewardsClosing) {
    radialPreference = "spread";
  } else if (/distance travel|far targeting/i.test(coreMechanic)) {
    radialPreference = "far";
  } else if (/short-?range/i.test(buildPosition)) {
    radialPreference = "near";
  }

  return {
    towerId,
    evidence: { coreMechanic, buildPosition },
    debuff,
    routePreference,
    radialPreference,
    targetsTowers,
  };
}

const facts = mechanics.records
  .map(derive)
  .filter((f) => f !== null)
  .sort((a, b) => a.towerId.localeCompare(b.towerId));

// ------------------------------------------------------------- report
const isDefault = (f) =>
  f.debuff === null &&
  f.routePreference === "anywhere" &&
  f.radialPreference === "any" &&
  !f.targetsTowers;

const derived = facts.filter((f) => !isDefault(f));
console.log(
  `${facts.length} towers, ${derived.length} with a non-default placement fact\n`,
);
console.log(
  "tower".padEnd(16) +
    "route".padEnd(10) +
    "radial".padEnd(9) +
    "debuff".padEnd(14) +
    "twr  evidence",
);
console.log("-".repeat(110));
for (const f of derived) {
  const d = f.debuff
    ? `${f.debuff.durationSeconds ?? "permanent"}${
        f.debuff.durationSeconds !== null && f.debuff.permanentEffect
          ? "s+perm"
          : f.debuff.durationSeconds !== null
            ? "s"
            : ""
      }`
    : "-";
  console.log(
    f.towerId.padEnd(16) +
      f.routePreference.padEnd(10) +
      f.radialPreference.padEnd(9) +
      d.padEnd(14) +
      (f.targetsTowers ? "yes  " : "     ") +
      (f.evidence.buildPosition || f.evidence.coreMechanic).slice(0, 46),
  );
}
console.log(
  `\nneutral defaults (scored as plain damage towers): ${facts
    .filter(isDefault)
    .map((f) => f.towerId)
    .join(", ")}`,
);

if (process.argv.includes("--write")) {
  fs.writeFileSync(
    "./data/towerPlacementFacts.v1.json",
    JSON.stringify({ schemaVersion: 1, facts }, null, 2) + "\n",
  );
  console.log("\nwrote data/towerPlacementFacts.v1.json");
}
