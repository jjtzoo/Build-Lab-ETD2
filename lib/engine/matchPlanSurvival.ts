import combatData from "@/data/earlyTowerCombat.v1.json";
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
    return {
      averageDps:
        (tower.stats.damage[level - 1] ?? 0) * tower.stats.attackSpeed,
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
    const modeledDamage = towers.reduce((sum, tower) => {
      const level = levelDuringWave(
        levelTimeline?.get(tower.copyId),
        wave,
        tower.level,
      );
      if (level == null) return sum;
      if (tower.effect === "global-buff" || tower.effect === "debuff")
        return sum;
      const facts = combatFacts(tower.towerId, level);
      if (!facts || !tower.cell) {
        missingTowerFacts = true;
        return sum;
      }
      const coverage = coverageForMode(map, tower.cell, facts.range, mode);
      const contactSeconds =
        coverage.coveredSeconds / benchmark.speedMultiplier;
      const trainSeconds =
        (benchmark.count - 1) * benchmark.spawnSpacingSeconds;
      return (
        sum +
        facts.averageDps *
          (contactSeconds + trainSeconds) *
          matchup(facts.damageElement, benchmark.element) *
          tower.quantity
      );
    }, 0);
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
      "Elemental armour multipliers are applied. Interest, active abilities, buffs and overkill are not credited.",
      "Every verified wave must reach 100% damage capacity. The planner never spends the 50-life pool as a buffer.",
    ],
  };
}
