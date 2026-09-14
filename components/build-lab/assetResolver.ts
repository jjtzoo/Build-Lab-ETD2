import "server-only";

import { existsSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

import {
  BASIC_TOWERS,
  type BasicTowerId,
} from "@/lib/domain/auxiliaryTowers";
import type { ElementName } from "@/lib/domain/elements";
import type { EndGameTowerId } from "@/lib/domain/endGameTower";
import type { TowerId } from "@/lib/domain/tower";
import { TOWERS } from "@/lib/domain/towerCatalog";

/**
 * Recorded in-game footage for one tower. Every field is optional: a
 * tower with no recorded video still renders from its poster, and a
 * tower with nothing at all falls back to the static form art. The hero
 * is architected so footage can be added tower-by-tower without any code
 * change — drop `assets/towers/hero/<id>.webm` (and optionally `.mp4`
 * and `<id>.jpg` poster) and it appears.
 */
export type TowerHeroMedia = {
  poster: string | null;
  webm: string | null;
  mp4: string | null;
};

export type BuildLabAssets = {
  towerForms: Record<TowerId, string | null>;
  towerIcons: Record<TowerId, string | null>;
  /**
   * Icon art for the six single-element base towers, keyed by element. The
   * recommendation catalog does not carry these towers, so mono placements
   * (`mono-<element>`) resolve their token art through here instead of
   * `towerIcons`.
   */
  elementTowerIcons: Record<ElementName, string | null>;
  /**
   * Icon art for the non-elemental starter towers (Arrow, Cannon). These
   * also live outside the recommendation catalog, so basic placements
   * resolve their token art through here instead of `towerIcons`.
   */
  basicTowerIcons: Record<BasicTowerId, string | null>;
  towerHero: Record<TowerId, TowerHeroMedia>;
  endGameForms: Record<EndGameTowerId, string | null>;
  elements: Record<ElementName, string | null>;
};

type AssetEntry = {
  stem: string;
  extension: string;
  url: string;
};

const END_GAME_TOWER_IDS = [
  "pure-light",
  "pure-darkness",
  "pure-water",
  "pure-fire",
  "pure-nature",
  "pure-earth",
  "periodic",
] as const satisfies readonly EndGameTowerId[];

function readAssets(relativeDirectory: string): AssetEntry[] {
  const directory = join(process.cwd(), "public", relativeDirectory);

  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const extension = extname(entry.name).toLowerCase();
      return {
        stem: entry.name.slice(0, -extension.length || undefined).toLowerCase(),
        extension,
        url: `/${relativeDirectory.replaceAll("\\", "/")}/${entry.name}`,
      };
    });
}

function resolveTowerAssets(
  entries: AssetEntry[],
): Record<TowerId, string | null> {
  const exact = new Map(entries.map((entry) => [entry.stem, entry.url]));

  return Object.fromEntries(
    TOWERS.map((tower) => {
      const direct = exact.get(tower.id);
      const suffixed = entries.find(
        (entry) =>
          entry.stem.endsWith("-tower") &&
          entry.stem.slice(0, -"-tower".length) === tower.id,
      );

      return [tower.id, direct ?? suffixed?.url ?? null];
    }),
  );
}

function resolveHeroMedia(
  entries: AssetEntry[],
  forms: Record<TowerId, string | null>,
): Record<TowerId, TowerHeroMedia> {
  const byStem = new Map<string, AssetEntry[]>();
  for (const entry of entries) {
    byStem.set(entry.stem, [...(byStem.get(entry.stem) ?? []), entry]);
  }

  return Object.fromEntries(
    TOWERS.map((tower) => {
      const own = byStem.get(tower.id) ?? [];
      const pick = (ext: string) =>
        own.find((entry) => entry.extension === ext)?.url ?? null;

      const media: TowerHeroMedia = {
        webm: pick(".webm"),
        mp4: pick(".mp4"),
        poster:
          pick(".jpg") ??
          pick(".jpeg") ??
          pick(".png") ??
          pick(".webp") ??
          forms[tower.id],
      };

      return [tower.id, media];
    }),
  );
}

export function resolveBuildLabAssets(): BuildLabAssets {
  const forms = readAssets("assets/towers/forms/Level1");
  const icons = readAssets("assets/towers/icons");
  const hero = readAssets("assets/towers/hero");
  const endGame = readAssets("assets/towers/forms/endgame");
  const elementFiles = readAssets("elements");

  const towerForms = resolveTowerAssets(forms);
  const iconLookup = new Map(icons.map((entry) => [entry.stem, entry.url]));
  const elementLookup = new Map(
    elementFiles.map((entry) => [entry.stem, entry.url]),
  );
  const endGameLookup = new Map(
    endGame.map((entry) => [entry.stem, entry.url]),
  );

  const elements = [
    "Light",
    "Darkness",
    "Water",
    "Fire",
    "Nature",
    "Earth",
  ] as const satisfies readonly ElementName[];

  return {
    towerForms,
    towerIcons: resolveTowerAssets(icons),
    elementTowerIcons: Object.fromEntries(
      elements.map((element) => [
        element,
        iconLookup.get(element.toLowerCase()) ?? null,
      ]),
    ) as Record<ElementName, string | null>,
    basicTowerIcons: Object.fromEntries(
      BASIC_TOWERS.map((tower) => [tower.id, iconLookup.get(tower.id) ?? null]),
    ) as Record<BasicTowerId, string | null>,
    towerHero: resolveHeroMedia(hero, towerForms),
    endGameForms: Object.fromEntries(
      END_GAME_TOWER_IDS.map((id) => [id, endGameLookup.get(id) ?? null]),
    ) as Record<EndGameTowerId, string | null>,
    elements: Object.fromEntries(
      elements.map((element) => [
        element,
        elementLookup.get(element.toLowerCase()) ?? null,
      ]),
    ) as Record<ElementName, string | null>,
  };
}
