import "server-only";

import { readdirSync } from "node:fs";
import { extname, join } from "node:path";

import type { ElementName } from "@/lib/domain/elements";
import type { TowerId } from "@/lib/domain/tower";
import { TOWERS } from "@/lib/domain/towerCatalog";

export type BuildLabAssets = {
  towerForms: Record<TowerId, string | null>;
  towerIcons: Record<TowerId, string | null>;
  elements: Record<ElementName, string | null>;
};

type AssetEntry = {
  stem: string;
  url: string;
};

function readAssets(relativeDirectory: string): AssetEntry[] {
  const directory = join(process.cwd(), "public", relativeDirectory);

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      stem: entry.name.slice(0, -extname(entry.name).length).toLowerCase(),
      url: `/${relativeDirectory.replaceAll("\\", "/")}/${entry.name}`,
    }));
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

export function resolveBuildLabAssets(): BuildLabAssets {
  const forms = readAssets("assets/towers/forms/Level1");
  const icons = readAssets("assets/towers/icons");
  const elementFiles = readAssets("elements");
  const elementLookup = new Map(
    elementFiles.map((entry) => [entry.stem, entry.url]),
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
    towerForms: resolveTowerAssets(forms),
    towerIcons: resolveTowerAssets(icons),
    elements: Object.fromEntries(
      elements.map((element) => [
        element,
        elementLookup.get(element.toLowerCase()) ?? null,
      ]),
    ) as Record<ElementName, string | null>,
  };
}
