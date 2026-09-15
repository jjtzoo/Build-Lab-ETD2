import type { ElementName } from "@/lib/domain/elements";

export const MATCH_PLAN_DIFFICULTIES = [
  "normal",
  "hard",
  "veryHard",
  "insane",
  "legendary",
] as const;

export type MatchPlanDifficulty = (typeof MATCH_PLAN_DIFFICULTIES)[number];

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

export type WaveBenchmark = {
  wave: number;
  element: ElementName | "Composite";
  ability: (typeof ABILITIES)[number];
  count: number;
  spawnSpacingSeconds: number;
  hpPerCreep: number;
  effectiveHpPerCreep: number;
  bountyPerCreep: number;
  waveBounty: number;
  speedMultiplier: number;
  modelConfidence: "verified" | "ability-estimate";
};

function normalHp(wave: number): number {
  if (wave <= 45) return 125 * 1.157 ** (wave - 1);
  return 90_600 * 1.19 ** (wave - 46);
}

export function waveBenchmark(
  wave: number,
  difficulty: MatchPlanDifficulty,
): WaveBenchmark | null {
  if (wave < 1 || wave > 55) return null;
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
    wave <= Math.min(55, endWave);
    wave += 1
  )
    total += WAVE_BOUNTIES[wave - 1] ?? 0;
  return total;
}
