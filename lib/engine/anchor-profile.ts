import type { ElementName, Tower } from "@/lib/types";
import { TOWERS } from "@/lib/data";

export type AnchorKind =
  | "AUTO"
  | "DUAL"
  | "TRIO"
  | "QUAD";

export interface AnchorBlueprint {
  elements: ElementName[];
  targetLevels: Partial<Record<ElementName, number>>;
}

export interface AnchorProfile {
  anchor: string;
  kind: AnchorKind;

  tower: Tower | null;

  recipe: ElementName[];

  maxTier: number;

  blueprint: AnchorBlueprint | null;

  priorities: string[];

  requiresAnchorRealization: boolean;

  notes: string[];
}

function getMaxTier(tower: Tower): number {
  switch (tower.type) {
    case "Dual":
      return 3;

    case "Trio":
      return 2;

    case "Quad":
      return 1;

    default:
      return 0;
  }
}

function buildBlueprint(
  tower: Tower,
): AnchorBlueprint {
  const targetLevel =
    tower.type === "Dual"
      ? 3
      : tower.type === "Trio"
        ? 2
        : 1;

  return {
    elements: [...tower.recipe],
    targetLevels: Object.fromEntries(
      tower.recipe.map((element) => [
        element,
        targetLevel,
      ]),
    ) as Partial<Record<ElementName, number>>,
  };
}

function buildPriorities(
  tower: Tower,
): string[] {
  switch (tower.type) {
    case "Dual":
      return [
        "Realize the anchor recipe at useful maximum depth.",
        "Use remaining allocation points for the strongest complete package.",
        "Compare complementary Dual / Trio / Quad opportunities.",
        "Preserve functional package requirements and endgame options.",
      ];

    case "Trio":
      return [
        "Realize the anchor recipe at or above the normal Lv2 blueprint.",
        "Use remaining allocation points for package diversity.",
        "Prioritize missing control, coverage, amplification, and DPS functions.",
        "Consider useful Tri / Quad ecosystem routes.",
      ];

    case "Quad":
      return [
        "Unlock the anchor recipe.",
        "Evaluate the resulting Quad ecosystem rather than the anchor alone.",
        "Measure additional Quad access created by the allocation.",
        "Consider complementary Dual / Trio and package-function routes.",
      ];

    default:
      return [];
  }
}

function buildNotes(
  tower: Tower,
): string[] {
  switch (tower.type) {
    case "Dual":
      return [
        "Dual anchors create a depth-oriented blueprint.",
        "The blueprint is a preference, not an absolute allocation lock.",
      ];

    case "Trio":
      return [
        "Trio anchors naturally establish a 2-2-2 starting blueprint.",
        "Remaining points should be optimized for package completeness and ecosystem value.",
      ];

    case "Quad":
      return [
        "Quad anchors are evaluated through ecosystem access as well as the anchor itself.",
        "Quad value should not be represented as a fixed bonus per accessible tower.",
      ];

    default:
      return [];
  }
}

export function buildAnchorProfile(
  anchor: string = "Auto",
): AnchorProfile {
  if (anchor === "Auto") {
    return {
      anchor: "Auto",
      kind: "AUTO",
      tower: null,
      recipe: [],
      maxTier: 0,
      blueprint: null,
      priorities: [
        "No anchor bias.",
        "Optimize the strongest complete build.",
      ],
      requiresAnchorRealization: false,
      notes: [
        "Auto mode does not protect any specific tower.",
      ],
    };
  }

  const tower = TOWERS.find(
    (candidate) => candidate.name === anchor,
  );

  if (!tower) {
    throw new Error(
      `Unknown anchor tower: ${anchor}`,
    );
  }

  const kind: AnchorKind =
    tower.type === "Dual"
      ? "DUAL"
      : tower.type === "Trio"
        ? "TRIO"
        : "QUAD";

  return {
    anchor: tower.name,
    kind,
    tower,
    recipe: [...tower.recipe],
    maxTier: getMaxTier(tower),
    blueprint: buildBlueprint(tower),
    priorities: buildPriorities(tower),
    requiresAnchorRealization: true,
    notes: buildNotes(tower),
  };
}