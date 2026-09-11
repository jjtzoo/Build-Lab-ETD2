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
