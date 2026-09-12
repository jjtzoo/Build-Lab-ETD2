import forestData from "@/data/maps/forest.json";
import lavaData from "@/data/maps/lava.json";
import tropicalData from "@/data/maps/tropical.json";
import wastelandData from "@/data/maps/wasteland.json";

import type { MapConfig } from "./mapConfig";

export const MAPS: readonly MapConfig[] = [
  forestData as MapConfig,
  lavaData as MapConfig,
  tropicalData as MapConfig,
  wastelandData as MapConfig,
];

const MAPS_BY_ID = new Map<string, MapConfig>(
  MAPS.map((map) => [map.id, map]),
);

export function getMap(id: string): MapConfig {
  const map = MAPS_BY_ID.get(id);
  if (!map) throw new Error(`Unknown map: ${id}`);
  return map;
}

/**
 * Whether a map carries enough real data to give an answer.
 *
 * Every map ships as a skeleton with only its confirmed facts (name,
 * image, official path length) and empty geometry, so the catalog can
 * grow a map at a time without guessing. Player-facing surfaces should
 * offer {@link tracedMaps} rather than {@link MAPS}: a picker listing
 * maps with no path and no buildable cells is three dead ends and one
 * working option, which reads as broken rather than as partial.
 */
export function isMapTraced(map: MapConfig): boolean {
  return (
    map.buildableCells.length > 0 &&
    map.paths.some((path) => path.points.length >= 2)
  );
}

/** The maps that can actually be reasoned about, in catalog order. */
export function tracedMaps(): readonly MapConfig[] {
  return MAPS.filter(isMapTraced);
}
