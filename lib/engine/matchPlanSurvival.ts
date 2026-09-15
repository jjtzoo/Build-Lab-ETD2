import combatData from "@/data/earlyTowerCombat.v1.json";
import engagementData from "@/data/towerEngagement.v1.json";
import mechanicFacts from "@/data/towerMechanicFacts.v1.json";
import { ELEMENT_MATCHUPS } from "@/lib/domain/elementMatchupCatalog";
import type { ElementName } from "@/lib/domain/elements";
import type { EndGameTowerId } from "@/lib/domain/endGameTower";
import {
  END_GAME_TOWER_FACT_CATALOG,
  getEndGameTowerFact,
} from "@/lib/domain/endGameTowerFacts";
import type { MapConfig, WaveMode } from "@/lib/domain/mapConfig";
import type {
  MatchPlanSurvival,
  PlannedTowerState,
} from "@/lib/domain/matchPlan";
import { getTower } from "@/lib/domain/towerCatalog";
import { sustainedEngagementDps } from "@/lib/engine/endGamePackageEvaluation";
import { coverageForMode } from "@/lib/engine/mapPlacement";
import {
  type MatchPlanDifficulty,
  waveBenchmark,
} from "@/lib/engine/waveBenchmarks";

type CombatFact = {
  averageDps: number;
  range: number;
  damageElement: ElementName | "Composite";
  /** Open assumptions in the damage figure above (e.g. Overkill's spread
   * value needs unverified creep HP) — present only for End Game towers. */
  unresolvedFactors?: readonly string[];
};

/** Pure/Periodic towers — a flat purchase, not a levelled one. */
const END_GAME_TOWER_IDS: ReadonlySet<string> = new Set(
  END_GAME_TOWER_FACT_CATALOG.facts.map((fact) => fact.towerId),
);

type OpeningTowerFacts = {
  range: number;
  damageElement: ElementName | "Composite";
  levels: readonly {
    level: number;
    damage: number;
    attacksPerSecond: number;
    averageDps: number;
  }[];
};

const OPENING_FACTS = combatData.towers as Record<string, OpeningTowerFacts>;
const ENGAGEMENT = engagementData.towers as Record<
  string,
  { engagementFactor: number; isolatedEngagementFactor?: number }
>;

/** Towers whose verified mechanic isolates a target (Rage speeds it out of the pack). */
const ISOLATION_PROVIDERS = new Set(
  (mechanicFacts.effects as readonly { towerId: string; signal: string }[])
    .filter((effect) => effect.signal === "target-isolation")
    .map((effect) => effect.towerId),
);

/**
 * The developer workbook's expected-engagement convention: its DPS column
 * averages single-target and area damage and, where it gives an average row,
 * the tower's duty cycle. The single-element rows in the opening-field file
 * already carry that figure; normal towers get the same treatment here from
 * the catalog's current damage and the workbook's ratio, so an AoE anchor is
 * no longer valued as if it hit one creep and a burst tower is not credited
 * with its active window all the time.
 */
export function expectedEngagementDps(
  towerId: string,
  level: number,
  isolated = false,
): number | null {
  try {
    const tower = getTower(towerId);
    const damage = tower.stats.damage[level - 1];
    if (damage == null) return null;
    const entry = ENGAGEMENT[towerId];
    const factor =
      (isolated ? entry?.isolatedEngagementFactor : undefined) ??
      entry?.engagementFactor ??
      1;
    return damage * tower.stats.attackSpeed * factor;
  } catch {
    return null;
  }
}

/** True when this tower's workbook row differs with an isolated target. */
export function benefitsFromIsolation(towerId: string): boolean {
  return ENGAGEMENT[towerId]?.isolatedEngagementFactor != null;
}

/**
 * Damage facts for one copy at one level, or null when the level is not in
 * the data. Basic and single-element towers come from the opening-field file;
 * every normal tower from the catalog. A null here makes the wave unverified —
 * it must never be filled with a guess.
 */
export function combatFacts(towerId: string, level: number): CombatFact | null {
  // Pure/Periodic: a single flat purchase, not a level — the level argument
  // is not meaningful for these ids. sustainedEngagementDps already
  // integrates each tower's verified ability (ramp/stack/burst) from its
  // own facts; where a factor cannot be derived without an unverified
  // number (Overkill's on-kill spread, an unconfirmed duplicate-copy
  // interaction) it contributes 0 and is named in unresolvedFactors rather
  // than guessed.
  if (END_GAME_TOWER_IDS.has(towerId)) {
    const fact = getEndGameTowerFact(towerId as EndGameTowerId);
    const engagement = sustainedEngagementDps(fact);
    return {
      averageDps: engagement.sustainedDps,
      range: fact.range,
      damageElement: fact.element,
      unresolvedFactors: engagement.unresolvedFactors,
    };
  }
  const opening = OPENING_FACTS[towerId];
  if (opening) {
    const row = opening.levels.find((entry) => entry.level === level);
    return row
      ? {
          averageDps: row.averageDps,
          range: opening.range,
          damageElement: opening.damageElement,
        }
      : null;
  }
  try {
    const tower = getTower(towerId);
    const averageDps = expectedEngagementDps(towerId, level);
    if (averageDps == null) return null;
    return {
      averageDps,
      range: tower.stats.range,
      damageElement: tower.damageElement as ElementName,
    };
  } catch {
    return null;
  }
}

function matchup(
  attacker: ElementName | "Composite",
  defender: ElementName | "Composite" | "Boss",
): number {
  // "Boss · Mixed" armour is not in the matchup table; 1.0 until measured.
  if (
    attacker === "Composite" ||
    defender === "Composite" ||
    defender === "Boss"
  )
    return 1;
  return ELEMENT_MATCHUPS[attacker][defender];
}

type BuffFact = {
  towerId: string;
  signal: "attack-damage-buff" | "attack-speed-buff" | "tower-replication";
  /** Multiplier on a target's damage by buff level (1-indexed via level - 1). */
  multiplierByLevel: readonly number[];
  maxTargets: number;
};

/**
 * Verified, automatic, effectively-continuous buffs from towerMechanicFacts:
 * Blacksmith (+10/30/90% damage) and Well (+10/30/90% attack speed) hold a
 * 60s buff on up to 4 towers, re-applied every 15s; Trickery copies one tower
 * for 6/18/54s of every 60s. Hand-cast buffs (Life Altar) are excluded — the
 * survival floor must not assume the player is casting.
 */
const BUFF_FACTS: readonly BuffFact[] = (
  mechanicFacts.effects as readonly {
    towerId: string;
    signal: string;
    magnitude: { unit: string; byLevel: readonly number[] };
    durationSeconds?: { byLevel: readonly number[] };
    activationRequirement?: string;
    maxTargets?: number;
    resetSeconds?: number;
  }[]
).flatMap((effect): BuffFact[] => {
  if (effect.activationRequirement === "active-cast") return [];
  if (
    effect.signal === "attack-damage-buff" ||
    effect.signal === "attack-speed-buff"
  )
    return [
      {
        towerId: effect.towerId,
        signal: effect.signal,
        multiplierByLevel: effect.magnitude.byLevel.map(
          (percent) => 1 + percent / 100,
        ),
        maxTargets: effect.maxTargets ?? 1,
      },
    ];
  if (effect.signal === "tower-replication") {
    const reset = effect.resetSeconds ?? 60;
    return [
      {
        towerId: effect.towerId,
        signal: effect.signal,
        // A clone deals the original's damage for its duration out of every
        // reset window: the duty cycle is the credited fraction.
        multiplierByLevel: (effect.durationSeconds?.byLevel ?? []).map(
          (seconds) =>
            (effect.magnitude.byLevel[0] / 100) * Math.min(1, seconds / reset),
        ),
        maxTargets: effect.maxTargets ?? 1,
      },
    ];
  }
  return [];
});
const BUFF_BY_TOWER = new Map(BUFF_FACTS.map((fact) => [fact.towerId, fact]));

type AmpFact = {
  towerId: string;
  /** Multiplier on damage taken by an affected creep, by provider level. */
  multiplierByLevel: readonly number[];
  /** How long the debuff lingers after the last hit, by provider level. */
  durationByLevel: readonly number[];
};

/**
 * Verified on-hit damage-taken amplifiers from towerMechanicFacts: Corrosion
 * (+20/40% for 5s), Incantation (+13/26%), Rage (+28%). A creep the provider
 * is hitting takes that much more from every tower for the duration, so
 * each amplifier present lifts the damage of the towers whose reach
 * overlaps its own, for the share of their contact during which the creep
 * carries the debuff. Same-signal amplifiers do not stack (the higher
 * applies — stacking is not a verified fact).
 */
const AMP_FACTS: readonly AmpFact[] = (
  mechanicFacts.effects as readonly {
    towerId: string;
    signal: string;
    magnitude?: { unit: string; byLevel: readonly number[] };
    durationSeconds?: { byLevel: readonly number[] };
    activationRequirement?: string;
  }[]
).flatMap((effect) =>
  effect.signal === "damage-taken-amp" &&
  effect.activationRequirement === "on-hit" &&
  effect.magnitude
    ? [
        {
          towerId: effect.towerId,
          multiplierByLevel: effect.magnitude.byLevel.map(
            (percent) => 1 + percent / 100,
          ),
          durationByLevel: effect.durationSeconds?.byLevel ?? [],
        },
      ]
    : [],
);
const AMP_BY_TOWER = new Map(AMP_FACTS.map((fact) => [fact.towerId, fact]));

export function isSurvivalAmpProvider(towerId: string): boolean {
  return AMP_BY_TOWER.has(towerId);
}

type SlowFact = {
  towerId: string;
  /** Contact-time multiplier on a slowed creep, by provider level. */
  dwellFactorByLevel: readonly number[];
  /** How long the slow lingers after the last hit, by provider level. */
  durationByLevel: readonly number[];
};

/**
 * Verified on-hit slows from towerMechanicFacts: Nova, Muck, Root and
 * Windstorm each slow a hit creep 16/32% for 5s. A fixed route segment
 * crossed at (1 - slow%) of normal speed takes 1 / (1 - slow%) as long, so
 * a slowed creep spends that much longer inside every other tower's reach
 * it shares with the provider — the same "overlapping reach, share of
 * contact, highest wins" mechanism already used for the damage-taken
 * amplifiers above, applied to contact time instead of damage taken.
 */
const SLOW_FACTS: readonly SlowFact[] = (
  mechanicFacts.effects as readonly {
    towerId: string;
    signal: string;
    magnitude?: { unit: string; byLevel: readonly number[] };
    durationSeconds?: { byLevel: readonly number[] };
    activationRequirement?: string;
  }[]
).flatMap((effect) =>
  effect.signal === "enemy-slow" &&
  effect.activationRequirement === "on-hit" &&
  effect.magnitude
    ? [
        {
          towerId: effect.towerId,
          dwellFactorByLevel: effect.magnitude.byLevel.map(
            (percent) => 1 / (1 - percent / 100),
          ),
          durationByLevel: effect.durationSeconds?.byLevel ?? [],
        },
      ]
    : [],
);
const SLOW_BY_TOWER = new Map(SLOW_FACTS.map((fact) => [fact.towerId, fact]));

export function isSurvivalSlowProvider(towerId: string): boolean {
  return SLOW_BY_TOWER.has(towerId);
}

export function isSurvivalBuffProvider(towerId: string): boolean {
  return BUFF_BY_TOWER.has(towerId);
}

function cellsApart(
  a: { col: number; row: number },
  b: { col: number; row: number },
): number {
  return Math.hypot(a.col - b.col, a.row - b.row);
}

/** One step of a copy's life inside a window: from this wave it is at this level. */
export type LevelStep = { fromWave: number; level: number };

/**
 * The level a copy is at during `wave`, or null if it is not on the field yet.
 * A copy with no timeline is assumed present at its listed level all window.
 */
function levelDuringWave(
  timeline: readonly LevelStep[] | undefined,
  wave: number,
  fallbackLevel: number,
): number | null {
  if (!timeline) return fallbackLevel;
  let level: number | null = null;
  for (const step of timeline) if (wave >= step.fromWave) level = step.level;
  return level;
}

export function evaluatePhaseSurvival({
  map,
  mode,
  difficulty,
  startWave,
  endWave,
  towers,
  levelTimeline,
}: {
  map: MapConfig;
  mode: WaveMode;
  difficulty: MatchPlanDifficulty;
  startWave: number;
  endWave: number | null;
  towers: readonly PlannedTowerState[];
  /**
   * Per-copy life inside the window, sorted by wave. A copy upgraded mid-window
   * keeps dealing its previous level's damage until the upgrade wave; a copy
   * built mid-window deals nothing before it lands.
   */
  levelTimeline?: ReadonlyMap<string, readonly LevelStep[]>;
}): MatchPlanSurvival {
  if (endWave == null || map.pathDurationSeconds == null) {
    return {
      status: "unverified",
      worstWave: null,
      margin: null,
      waves: [],
      assumptions: [
        "This window has no complete route-time or bounded wave benchmark.",
      ],
    };
  }

  const waves = Array.from(
    { length: endWave - startWave + 1 },
    (_, offset) => startWave + offset,
  ).map((wave) => {
    const benchmark = waveBenchmark(wave, difficulty);
    if (!benchmark)
      return {
        wave,
        element: "Composite" as const,
        ability: null,
        count: 0,
        hpPerCreep: 0,
        effectiveWaveHp: 0,
        modeledDamage: null,
        margin: null,
        estimatedLeaks: null,
        status: "unverified" as const,
        limitingFactor: "No benchmark row is available for this wave.",
      };

    // A boss wave's HP per creep is in the workbook; its creep count is
    // not. Without a count there is no wave total to verify against, so
    // the wave is reported as it is known — per creep — and stays
    // unverified until a capture supplies the count.
    if (benchmark.count == null)
      return {
        wave,
        element: benchmark.element,
        ability: benchmark.ability,
        count: null,
        hpPerCreep: benchmark.hpPerCreep,
        effectiveWaveHp: benchmark.effectiveHpPerCreep,
        modeledDamage: null,
        margin: null,
        estimatedLeaks: null,
        status: "unverified" as const,
        limitingFactor: `Boss wave: ${Math.round(benchmark.hpPerCreep).toLocaleString()} HP per creep from the workbook, but the creep count is not measured yet, so no wave total can be verified.`,
      };
    const unknownAbility = benchmark.modelConfidence === "ability-estimate";
    let missingTowerFacts = false;
    // An End Game tower on the field with an open assumption in its own
    // damage figure (Overkill's creep-HP dependency, an unconfirmed
    // duplicate-copy interaction) — the modeled damage is a floor, so the
    // wave cannot read as a clean "survives" even if it clears on paper.
    let essenceUnresolved = false;
    const trainSeconds = (benchmark.count - 1) * benchmark.spawnSpacingSeconds;
    // Isolation providers present this wave, for the consumers that have a
    // verified isolated damage row (Laser, Incantation). A consumer counts as
    // isolated when a provider's reach overlaps its own.
    const isolators = towers.flatMap((tower) => {
      if (!ISOLATION_PROVIDERS.has(tower.towerId) || !tower.cell) return [];
      const level = levelDuringWave(
        levelTimeline?.get(tower.copyId),
        wave,
        tower.level,
      );
      if (level == null) return [];
      try {
        return [
          { cell: tower.cell, range: getTower(tower.towerId).stats.range },
        ];
      } catch {
        return [];
      }
    });
    const isolatedAt = (cell: { col: number; row: number }, range: number) =>
      isolators.some(
        (provider) =>
          cellsApart(cell, provider.cell) *
            Math.max(1, map.rangeUnitsPerCell) <=
          provider.range + range,
      );
    // Base damage per copy present this wave. Buff providers deal their own
    // attack damage like anyone else; their buff is layered on below.
    const present = towers.flatMap((tower) => {
      const level = levelDuringWave(
        levelTimeline?.get(tower.copyId),
        wave,
        tower.level,
      );
      if (level == null) return [];
      if (tower.effect === "global-buff" || tower.effect === "debuff")
        return [
          {
            tower,
            level,
            damage: 0,
            cell: tower.cell,
            contactSeconds: 0,
            range: 0,
          },
        ];
      const baseFacts = combatFacts(tower.towerId, level);
      const facts =
        baseFacts &&
        tower.cell &&
        benefitsFromIsolation(tower.towerId) &&
        isolatedAt(tower.cell, baseFacts.range)
          ? {
              ...baseFacts,
              averageDps:
                expectedEngagementDps(tower.towerId, level, true) ??
                baseFacts.averageDps,
            }
          : baseFacts;
      if (!facts || !tower.cell) {
        missingTowerFacts = true;
        return [
          {
            tower,
            level,
            damage: 0,
            cell: tower.cell,
            contactSeconds: 0,
            range: 0,
          },
        ];
      }
      if (facts.unresolvedFactors?.length) essenceUnresolved = true;
      const coverage = coverageForMode(map, tower.cell, facts.range, mode);
      const contactSeconds =
        coverage.coveredSeconds / benchmark.speedMultiplier;
      return [
        {
          tower,
          level,
          cell: tower.cell,
          contactSeconds,
          range: facts.range,
          damage:
            facts.averageDps *
            (contactSeconds + trainSeconds) *
            matchup(facts.damageElement, benchmark.element) *
            tower.quantity,
        },
      ];
    });
    // Damage-taken amplifiers: a creep hit by Corrosion / Incantation / Rage
    // takes more from everyone for the debuff's duration. Each amplifier
    // lifts every other damage copy whose reach overlaps its own, by the
    // share of that copy's contact during which the creep still carries the
    // debuff (the amplifier's own contact plus the linger). Highest wins.
    const ampMultiplier = new Map<string, number>();
    for (const provider of present) {
      const fact = AMP_BY_TOWER.get(provider.tower.towerId);
      if (!fact || !provider.cell || provider.contactSeconds <= 0) continue;
      const amp =
        fact.multiplierByLevel[provider.level - 1] ??
        fact.multiplierByLevel.at(-1) ??
        1;
      const linger =
        fact.durationByLevel[provider.level - 1] ??
        fact.durationByLevel.at(-1) ??
        0;
      const debuffedSeconds =
        provider.contactSeconds + linger / benchmark.speedMultiplier;
      for (const target of present) {
        if (
          target === provider ||
          target.damage <= 0 ||
          !target.cell ||
          target.contactSeconds <= 0 ||
          cellsApart(target.cell, provider.cell) *
            Math.max(1, map.rangeUnitsPerCell) >
            provider.range + target.range
        )
          continue;
        const share = Math.min(1, debuffedSeconds / target.contactSeconds);
        const factor = 1 + (amp - 1) * share;
        ampMultiplier.set(
          target.tower.copyId,
          Math.max(ampMultiplier.get(target.tower.copyId) ?? 1, factor),
        );
      }
    }
    // Slows: a creep hit by Nova / Muck / Root / Windstorm spends longer in
    // every other damage copy's reach that overlaps the provider's, for the
    // share of that copy's contact during which the creep still carries the
    // slow. Same mechanism as the amplifiers above, as a dwell-time
    // multiplier instead of a damage-taken one.
    const slowMultiplier = new Map<string, number>();
    for (const provider of present) {
      const fact = SLOW_BY_TOWER.get(provider.tower.towerId);
      if (!fact || !provider.cell || provider.contactSeconds <= 0) continue;
      const dwell =
        fact.dwellFactorByLevel[provider.level - 1] ??
        fact.dwellFactorByLevel.at(-1) ??
        1;
      const linger =
        fact.durationByLevel[provider.level - 1] ??
        fact.durationByLevel.at(-1) ??
        0;
      const slowedSeconds =
        provider.contactSeconds + linger / benchmark.speedMultiplier;
      for (const target of present) {
        if (
          target === provider ||
          target.damage <= 0 ||
          !target.cell ||
          target.contactSeconds <= 0 ||
          cellsApart(target.cell, provider.cell) *
            Math.max(1, map.rangeUnitsPerCell) >
            provider.range + target.range
        )
          continue;
        const share = Math.min(1, slowedSeconds / target.contactSeconds);
        const factor = 1 + (dwell - 1) * share;
        slowMultiplier.set(
          target.tower.copyId,
          Math.max(slowMultiplier.get(target.tower.copyId) ?? 1, factor),
        );
      }
    }
    // Buffs: each provider present this wave lifts up to maxTargets of the
    // strongest non-provider damage copies within its range. Two copies of
    // the same signal do not stack on one target (the higher applies —
    // stacking is not a verified fact); damage and attack-speed buffs
    // multiply. A clone credits its duty-cycle share of its target's damage.
    const multiplier = new Map<string, { damage: number; speed: number }>();
    let cloneDamage = 0;
    for (const provider of present) {
      const fact = BUFF_BY_TOWER.get(provider.tower.towerId);
      if (!fact || !provider.cell) continue;
      let rangeCells: number;
      try {
        rangeCells =
          getTower(provider.tower.towerId).stats.range /
          Math.max(1, map.rangeUnitsPerCell);
      } catch {
        continue;
      }
      const factor =
        fact.multiplierByLevel[provider.level - 1] ??
        fact.multiplierByLevel.at(-1) ??
        1;
      const targets = present
        .filter(
          (entry) =>
            entry !== provider &&
            entry.damage > 0 &&
            entry.cell &&
            !BUFF_BY_TOWER.has(entry.tower.towerId) &&
            cellsApart(entry.cell, provider.cell!) <= rangeCells,
        )
        .sort((a, b) => b.damage - a.damage)
        .slice(0, fact.maxTargets);
      for (const target of targets) {
        if (fact.signal === "tower-replication") {
          cloneDamage += target.damage * factor;
          continue;
        }
        const current = multiplier.get(target.tower.copyId) ?? {
          damage: 1,
          speed: 1,
        };
        if (fact.signal === "attack-damage-buff")
          current.damage = Math.max(current.damage, factor);
        else current.speed = Math.max(current.speed, factor);
        multiplier.set(target.tower.copyId, current);
      }
    }
    const modeledDamage =
      present.reduce((sum, entry) => {
        const boost = multiplier.get(entry.tower.copyId);
        const amp = ampMultiplier.get(entry.tower.copyId) ?? 1;
        const slow = slowMultiplier.get(entry.tower.copyId) ?? 1;
        return (
          sum +
          entry.damage * (boost ? boost.damage * boost.speed : 1) * amp * slow
        );
      }, 0) + cloneDamage;
    const effectiveWaveHp = benchmark.effectiveHpPerCreep * benchmark.count;
    const margin = modeledDamage / effectiveWaveHp;
    // The modeled damage is a floor: a copy whose stat is missing adds nothing
    // to it, and an unquantified ability only ever makes the wave harder. So a
    // shortfall on base HP with every copy modeled is a real failure even when
    // the ability is unknown, and a clear on the modeled copies alone is a real
    // clear even when another copy is unmodeled. Only "short, but a copy is
    // unmodeled" and "clear, but the ability is unknown" stay unverified.
    const status =
      margin >= 1
        ? unknownAbility || essenceUnresolved
          ? ("unverified" as const)
          : ("survives" as const)
        : missingTowerFacts
          ? ("unverified" as const)
          : ("fails" as const);
    const estimatedLeaks =
      status === "unverified"
        ? null
        : Math.max(
            0,
            Math.min(
              benchmark.count,
              Math.ceil(
                (effectiveWaveHp - modeledDamage) /
                  benchmark.effectiveHpPerCreep,
              ),
            ),
          );
    return {
      wave,
      element: benchmark.element,
      ability: benchmark.ability,
      count: benchmark.count,
      hpPerCreep: benchmark.hpPerCreep,
      effectiveWaveHp,
      modeledDamage,
      margin,
      estimatedLeaks,
      status,
      limitingFactor:
        status === "fails"
          ? unknownAbility
            ? `Short of the base wave HP before ${benchmark.ability} is even counted; ${benchmark.element} armour leaves the modeled field short.`
            : `${benchmark.element} armour leaves the modeled field short of the wave HP.`
          : status === "unverified"
            ? unknownAbility && !missingTowerFacts
              ? `Clears the base HP, but ${benchmark.ability} is not quantified yet.`
              : essenceUnresolved && !missingTowerFacts
                ? "Clears the base HP, but an End Game tower's damage carries an open assumption — see its own unresolved factor."
                : "A placed copy has no combat stat at this level, so the modeled damage is only a floor."
            : missingTowerFacts
              ? "Clears the wave on the modeled copies alone; one copy has no combat stat at this level."
              : null,
    };
  });

  const measured = waves.filter(
    (wave): wave is (typeof waves)[number] & { margin: number } =>
      wave.status !== "unverified" && wave.margin != null,
  );
  const worst = [...measured].sort((a, b) => a.margin - b.margin)[0];
  const status = waves.some((wave) => wave.status === "fails")
    ? "fails"
    : waves.some((wave) => wave.status === "unverified")
      ? "unverified"
      : "survives";
  return {
    status,
    worstWave: worst?.wave ?? null,
    margin: worst?.margin ?? null,
    waves,
    assumptions: [
      `${difficulty} creep HP and per-wave unit counts are benchmark inputs.`,
      "Damage capacity uses each placed tower's traced seconds in range plus wave spawn duration.",
      "Elemental armour multipliers are applied; each normal tower's damage uses the developer workbook's expected-engagement ratio (area damage and duty cycle averaged in, isolation not credited).",
      "Blacksmith, Well and Trickery are credited from their verified magnitudes on the strongest towers in range (same-signal buffs do not stack); Laser and Incantation use their isolated damage row while Rage is fielded in reach.",
      "Corrosion, Incantation and Rage amplify the damage every tower in overlapping reach deals, for the share of that tower's contact during which the creep still carries the debuff (highest amplifier applies). Nova, Muck, Root and Windstorm extend the contact time of every tower in overlapping reach the same way, for the share of that tower's contact during which the creep is still slowed. Interest, hand-cast buffs, creep abilities, creep displacement and overkill are not credited.",
      "Every verified wave must reach 100% damage capacity. The planner never spends the 50-life pool as a buffer.",
      "End Game towers (Pure, Periodic) are credited over a 20-second sustained engagement from their own verified facts, ability included where it can be derived without a guess (Overkill's on-kill spread cannot, and stays uncredited); a wave with an open factor on its field never reads as a clean pass.",
    ],
  };
}
