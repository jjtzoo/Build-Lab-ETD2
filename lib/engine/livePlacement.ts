import { TOWERS } from "@/lib/domain/towerCatalog";
import { BASIC_TOWERS, MONO_TOWERS } from "@/lib/domain/auxiliaryTowers";
import { END_GAME_TOWER_FACT_CATALOG } from "@/lib/domain/endGameTowerFacts";
import { evolutionTargets } from "@/lib/domain/towerEvolution";
import { liveTowerMaxLevel, liveTowerName } from "./liveGame";
import earlyRanges from "@/data/earlyTowerRanges.v1.json";

export function isCoverageOnlyTower(towerId: string): boolean {
  return Object.hasOwn(earlyRanges.ranges, towerId);
}
export const LIVE_MAP_TOWERS = [
  ...TOWERS.map((t) => ({
    id: t.id,
    name: t.name,
    group: t.combination,
    maxLevel: t.maxLevel,
    stats: { range: t.stats.range },
  })),
  ...BASIC_TOWERS.map((t) => ({
    id: t.id,
    name: liveTowerName(t.id),
    group: "Basic" as const,
    maxLevel: liveTowerMaxLevel(t.id),
    stats: { range: earlyRanges.ranges[t.id] },
  })),
  ...MONO_TOWERS.map((t) => ({
    id: t.id,
    name: liveTowerName(t.id),
    group: "Mono" as const,
    maxLevel: liveTowerMaxLevel(t.id),
    stats: { range: earlyRanges.ranges[t.id] },
  })),
  ...END_GAME_TOWER_FACT_CATALOG.facts.map((t) => ({
    id: t.towerId,
    name: t.name,
    group: "End Game" as const,
    maxLevel: 1,
    stats: { range: t.range },
  })),
];

export function placementDestinations(towerId: string, fromLevel: number) {
  const targets = [
    { towerId, level: fromLevel },
    ...evolutionTargets(towerId, fromLevel),
  ];
  // Basics can be planned through any eligible mono branch into their finish.
  if (BASIC_TOWERS.some((t) => t.id === towerId)) {
    targets.push(...TOWERS.map((t) => ({ towerId: t.id, level: 1 })));
  }
  return targets.flatMap((step) => {
    const tower = LIVE_MAP_TOWERS.find((t) => t.id === step.towerId);
    return tower
      ? Array.from({ length: tower.maxLevel - step.level + 1 }, (_, i) => ({
          tower,
          level: step.level + i,
        }))
      : [];
  });
}

export function followsFinalForm(
  towerId: string,
  level: number,
  finalForm?: { towerId: string; level: number },
): boolean {
  return (
    !finalForm ||
    placementDestinations(towerId, level).some(
      (step) =>
        step.tower.id === finalForm.towerId && step.level === finalForm.level,
    )
  );
}

export function placementKey(p: {
  mapId: string;
  col: number;
  row: number;
}): string {
  return `${p.mapId}:${p.col},${p.row}`;
}
