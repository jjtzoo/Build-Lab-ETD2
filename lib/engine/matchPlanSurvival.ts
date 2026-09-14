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

const OPENING_FACTS = combatData.towers as Record<string, CombatFact>;

export function combatFacts(towerId: string, level: number): CombatFact | null {
  const opening = level === 1 ? OPENING_FACTS[towerId] : null;
  if (opening) return opening;
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

export function evaluatePhaseSurvival({
  map,
  mode,
  difficulty,
  startWave,
  endWave,
  towers,
  availableFromWave,
}: {
  map: MapConfig;
  mode: WaveMode;
  difficulty: MatchPlanDifficulty;
  startWave: number;
  endWave: number | null;
  towers: readonly PlannedTowerState[];
  availableFromWave?: ReadonlyMap<string, number>;
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
      if (wave < (availableFromWave?.get(tower.copyId) ?? startWave))
        return sum;
      if (tower.effect === "global-buff" || tower.effect === "debuff")
        return sum;
      const facts = combatFacts(tower.towerId, tower.level);
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
    const estimatedLeaks =
      unknownAbility || missingTowerFacts
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
    const status =
      unknownAbility || missingTowerFacts
        ? ("unverified" as const)
        : margin >= 1
          ? ("survives" as const)
          : ("fails" as const);
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
          ? `${benchmark.element} armour leaves the modeled field short of the wave HP.`
          : status === "unverified"
            ? unknownAbility
              ? `${benchmark.ability} is not quantified yet; base HP, speed and tower damage are still shown.`
              : "A tower stat or placement is missing."
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
