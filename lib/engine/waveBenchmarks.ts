import type { ElementName } from "@/lib/domain/elements";

export const MATCH_PLAN_DIFFICULTIES = [
  "normal",
  "hard",
  "veryHard",
  "insane",
  "legendary",
] as const;

export type MatchPlanDifficulty = (typeof MATCH_PLAN_DIFFICULTIES)[number];

/**
 * The difficulty a plan is scored on when the build does not say. Hard: the
 * owner's two archived zero-leak wins are Hard games and the calibration
 * captures are taken on Hard, so Hard is where the model is checked against
 * the game first. Very Hard stays one select away.
 */
export const DEFAULT_MATCH_PLAN_DIFFICULTY: MatchPlanDifficulty = "hard";

export const MATCH_PLAN_DIFFICULTY_LABELS: Record<MatchPlanDifficulty, string> =
  {
    normal: "Normal · 100% HP",
    hard: "Hard · 130% HP",
    veryHard: "Very Hard · 160% HP",
    insane: "Insane · 200% HP",
    legendary: "Legendary · 250% HP",
  };

const DIFFICULTY_MULTIPLIERS: Record<MatchPlanDifficulty, number> = {
  normal: 1,
  hard: 1.3,
  veryHard: 1.6,
  insane: 2,
  legendary: 2.5,
};

const ELEMENTS = [
  "Light",
  "Darkness",
  "Water",
  "Fire",
  "Nature",
  "Earth",
  "Composite",
  "Light",
  "Fire",
  "Nature",
  "Darkness",
  "Water",
  "Earth",
  "Composite",
  "Light",
  "Fire",
  "Earth",
  "Nature",
  "Water",
  "Darkness",
  "Fire",
  "Nature",
  "Earth",
  "Darkness",
  "Light",
  "Water",
  "Composite",
  "Fire",
  "Nature",
  "Darkness",
  "Light",
  "Water",
  "Composite",
  "Earth",
  "Nature",
  "Water",
  "Darkness",
  "Earth",
  "Light",
  "Composite",
  "Fire",
  "Water",
  "Light",
  "Darkness",
  "Nature",
  "Earth",
  "Fire",
  "Light",
  "Nature",
  "Water",
  "Composite",
  "Fire",
  "Darkness",
  "Earth",
  "Composite",
] as const;

const ABILITIES = [
  null,
  null,
  null,
  null,
  null,
  null,
  "Fast",
  "Cursed",
  "Healing",
  "Temporal",
  "Undead",
  "Bulky",
  "Shield",
  "Cursed",
  "Healing",
  "Undead",
  "Temporal",
  "Bulky",
  "Shield",
  "Fast",
  "Temporal",
  "Healing",
  "Undead",
  "Cursed",
  "Bulky",
  "Fast",
  "Shield",
  "Cursed",
  "Undead",
  "Healing",
  "Shield",
  "Temporal",
  "Bulky",
  "Cursed",
  "Fast",
  "Undead",
  "Bulky",
  "Healing",
  "Fast",
  "Temporal",
  "Shield",
  "Cursed",
  "Undead",
  "Temporal",
  "Shield",
  "Bulky",
  "Fast",
  "Temporal",
  "Cursed",
  "Healing",
  "Undead",
  "Bulky",
  "Shield",
  "Fast",
  "Healing",
] as const;

/** Per-creep bounty from the developer-linked DPS/Gold workbook. */
const BOUNTIES = [
  2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 7, 8, 9, 9, 10, 11, 12, 14, 15, 16,
  18, 20, 22, 24, 26, 29, 31, 35, 38, 42, 46, 50, 55, 61, 67, 73, 81, 89, 98,
  107, 118, 130, 143, 157, 172, 190, 208, 229, 252, 277, 305,
] as const;

const WAVE_BOUNTIES = [
  60, 60, 90, 90, 90, 90, 120, 120, 120, 150, 150, 180, 180, 210, 210, 240, 270,
  270, 300, 330, 360, 420, 450, 480, 540, 600, 660, 720, 780, 870, 930, 1050,
  1140, 1260, 1380, 1500, 1650, 1830, 2010, 2190, 2430, 2670, 2940, 3210, 3540,
  3900, 4290, 4710, 5160, 5700, 6240, 6870, 7560, 8310, 9150,
] as const;

/** Last wave the developer workbook describes: the boss stage runs 56–70. */
export const LAST_BENCHMARK_WAVE = 70;
/** Last wave with a normal element and a measured creep count; 55 clears the game. */
export const LAST_NORMAL_WAVE = 55;

/**
 * Boss stage, from the workbook's wave table (rows 56–70): element "Boss",
 * ability "Mixed", Normal HP 500,000 growing ×1.25 per wave, 300 bounty per
 * creep and 9,000 per wave. The owner confirms creep quantity does not
 * change across the match — wave 1 and a boss wave carry the same count;
 * only HP, element/armour and abilities differ — and the workbook's own
 * numbers agree: 9,000 wave bounty ÷ 300 per-creep bounty is 30, the same
 * count every non-Bulky normal wave uses. What the workbook does not give
 * is the boss stage's ability composition ("Mixed"), so — per the owner,
 * abilities stay out of scope for now — a boss wave is modeled at base HP
 * with the same ability-estimate confidence as any other wave whose
 * ability multiplier is unknown: a clear is a floor, not a guarantee.
 */
const BOSS_BASE_HP = 500_000;
const BOSS_HP_GROWTH = 1.25;
const BOSS_BOUNTY_PER_CREEP = 300;
const BOSS_WAVE_BOUNTY = 9_000;
const BOSS_COUNT = BOSS_WAVE_BOUNTY / BOSS_BOUNTY_PER_CREEP;

export type WaveBenchmark = {
  wave: number;
  element: ElementName | "Composite" | "Boss";
  ability: (typeof ABILITIES)[number] | "Mixed";
  /** Creeps in the wave — constant across the match, boss waves included. */
  count: number | null;
  spawnSpacingSeconds: number;
  hpPerCreep: number;
  effectiveHpPerCreep: number;
  bountyPerCreep: number;
  waveBounty: number;
  speedMultiplier: number;
  modelConfidence: "verified" | "ability-estimate";
};

/**
 * Provisional scale on the waves 1-55 HP curve below. That curve — base
 * 125 growing ×1.157/wave through wave 45, then base 90,600 growing
 * ×1.19/wave through wave 55 — has no documented source anywhere in this
 * repo or its history; it was never checked against a real per-wave HP
 * capture. Summed across waves 1-55 on Hard it credits 119.0M total creep
 * HP, but the owner's two archived zero-leak Hard wins put a firm UPPER
 * bound on the true total: Bloom dealt 66.0M total damage through wave 61
 * and Wisp 50.1M through wave 59 (data/waveObservations.v1.json) — a
 * zero-leak win cannot have dealt less damage than the HP it faced, and
 * both totals are themselves generous, since they include boss-wave
 * (56-59/61) damage that isn't even part of the 1-55 range being checked.
 * Verified directly (see tests/engine/matchPlanCalibration.test.ts): the
 * unscaled curve overshoots Bloom's bound by 1.80x and Wisp's by 2.38x.
 *
 * This constant scales the curve down to sit comfortably under the
 * tighter of the two (Wisp), preserving the curve's original SHAPE
 * (relative wave-to-wave growth) since no per-wave data exists yet to
 * correct that independently — it is a calibration placeholder pinned to
 * the only real evidence available, not a claim that 1/3 is the true
 * ratio. Replace it the moment real per-wave HP or creep-count captures
 * exist, and delete this constant rather than layering a second one on
 * top of it. Does NOT apply to the boss stage below (BOSS_BASE_HP): that
 * figure is sourced from the developer workbook directly, not invented.
 */
const HP_CALIBRATION_SCALE = 1 / 3;

function normalHp(wave: number): number {
  if (wave <= 45) return HP_CALIBRATION_SCALE * 125 * 1.157 ** (wave - 1);
  if (wave <= LAST_NORMAL_WAVE)
    return HP_CALIBRATION_SCALE * 90_600 * 1.19 ** (wave - 46);
  return BOSS_BASE_HP * BOSS_HP_GROWTH ** (wave - 56);
}

export function waveBenchmark(
  wave: number,
  difficulty: MatchPlanDifficulty,
): WaveBenchmark | null {
  if (wave < 1 || wave > LAST_BENCHMARK_WAVE) return null;
  if (wave > LAST_NORMAL_WAVE) {
    const hpPerCreep = normalHp(wave) * DIFFICULTY_MULTIPLIERS[difficulty];
    return {
      wave,
      element: "Boss",
      ability: "Mixed",
      count: BOSS_COUNT,
      spawnSpacingSeconds: 0.5,
      hpPerCreep,
      effectiveHpPerCreep: hpPerCreep,
      bountyPerCreep: BOSS_BOUNTY_PER_CREEP,
      waveBounty: BOSS_WAVE_BOUNTY,
      speedMultiplier: 1,
      modelConfidence: "ability-estimate",
    };
  }
  const index = wave - 1;
  const ability = ABILITIES[index];
  const hpPerCreep = normalHp(wave) * DIFFICULTY_MULTIPLIERS[difficulty];
  // "This wave has half the creeps ... gives double bounty": the workbook's
  // wave bounty over its doubled per-creep bounty is 15 on every Bulky wave
  // (W12 180/12, W18 270/18, W25 540/36), and 30 elsewhere (W1 60/2).
  const count = ability === "Bulky" ? 15 : 30;
  const abilityHpMultiplier =
    ability === "Bulky" ? 2.5 : ability === "Undead" ? 1.5 : 1;
  return {
    wave,
    element: ELEMENTS[index],
    ability,
    count,
    spawnSpacingSeconds: ability === "Bulky" ? 0.75 : 0.5,
    hpPerCreep,
    effectiveHpPerCreep: hpPerCreep * abilityHpMultiplier,
    bountyPerCreep: BOUNTIES[index],
    waveBounty: WAVE_BOUNTIES[index],
    speedMultiplier: ability === "Fast" ? 5 / 3 : 1,
    modelConfidence:
      ability && !["Fast", "Bulky", "Undead"].includes(ability)
        ? "ability-estimate"
        : "verified",
  };
}

export function bountyThroughWave(startWave: number, endWave: number): number {
  let total = 0;
  for (
    let wave = Math.max(1, startWave);
    wave <= Math.min(LAST_BENCHMARK_WAVE, endWave);
    wave += 1
  )
    total +=
      wave > LAST_NORMAL_WAVE
        ? BOSS_WAVE_BOUNTY
        : (WAVE_BOUNTIES[wave - 1] ?? 0);
  return total;
}
