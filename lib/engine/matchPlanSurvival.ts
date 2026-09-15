import combatData from "@/data/earlyTowerCombat.v1.json";
import engagementData from "@/data/towerEngagement.v1.json";
import mechanicFacts from "@/data/towerMechanicFacts.v1.json";
import { ELEMENT_MATCHUPS } from "@/lib/domain/elementMatchupCatalog";
import type { ElementName } from "@/lib/domain/elements";
import type { MapConfig, WaveMode } from "@/lib/domain/mapConfig";
import type {
  MatchPlanSurvival,
  PlannedTowerState,
} from "@/lib/domain/matchPlan";
import { getTower } from "@/lib/domain/towerCatalog";
import { coverageForMode } from "@/lib/engine/mapPlacement";
import {
  type MatchPlanDifficulty,
  waveBenchmark,
} from "@/lib/engine/waveBenchmarks";

type CombatFact = {
  averageDps: number;
  range: number;
  damageElement: ElementName | "Composite";
};

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
  defender: ElementName | "Composite",
): number {
  if (attacker === "Composite" || defender === "Composite") return 1;
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

    const unknownAbility = benchmark.modelConfidence === "ability-estimate";
    let missingTowerFacts = false;
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
        return [{ tower, level, damage: 0, cell: tower.cell }];
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
        return [{ tower, level, damage: 0, cell: tower.cell }];
      }
      const coverage = coverageForMode(map, tower.cell, facts.range, mode);
      const contactSeconds =
        coverage.coveredSeconds / benchmark.speedMultiplier;
      return [
        {
          tower,
          level,
          cell: tower.cell,
          damage:
            facts.averageDps *
            (contactSeconds + trainSeconds) *
            matchup(facts.damageElement, benchmark.element) *
            tower.quantity,
        },
      ];
    });
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
        return sum + entry.damage * (boost ? boost.damage * boost.speed : 1);
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
        ? unknownAbility
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
      "Blacksmith, Well and Trickery are credited from their verified magnitudes on the strongest towers in range (same-signal buffs do not stack); Laser and Incantation use their isolated damage row while Rage is fielded in reach. Interest, hand-cast buffs, creep abilities and overkill are not credited.",
      "Every verified wave must reach 100% damage capacity. The planner never spends the 50-life pool as a buffer.",
    ],
  };
}
