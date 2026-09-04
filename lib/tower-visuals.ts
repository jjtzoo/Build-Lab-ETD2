import towerData from "@/data/towers.json";
import type { ElementName } from "@/lib/types";

export type TowerArtwork = Readonly<{ imageSrc: string; source: string; license: string }>;

// Add only local files with documented redistribution permission. No guessed URLs.
export const TOWER_ARTWORK: Readonly<Record<string, TowerArtwork>> = Object.freeze({});

export function towerAssetSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function getTowerVisual(towerName: string) {
  const tower = towerData.towers.find((entry) => entry.name === towerName);
  const artwork = TOWER_ARTWORK[towerName];
  const words = towerName.trim().split(/\s+/);
  return Object.freeze({
    imageSrc: artwork?.imageSrc ?? null,
    alt: `${towerName} tower`,
    fallbackLabel: words.length > 1
      ? words.slice(0, 2).map((word) => word[0]).join("").toUpperCase()
      : towerName.slice(0, 2).toUpperCase() || "?",
    name: towerName,
    type: tower?.type ?? "Tower",
    recipe: Object.freeze([...(tower?.recipe ?? [])] as ElementName[]),
    variant: [...towerName].reduce((value, char) => value + char.charCodeAt(0), 0) % 3,
  });
}
