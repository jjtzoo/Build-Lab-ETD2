import { ELEMENTS, MECHANICS_BY_TOWER, TOWERS } from "@/lib/data";
import type {
  BuildState,
  BuildStateInput,
  ElementAllocation,
  ElementName,
  SelectedTower,
  Tower,
} from "@/lib/types";

export type BuildStateValidationCode =
  | "invalid-state"
  | "unknown-tower"
  | "duplicate-tower"
  | "invalid-level"
  | "slot-limit-exceeded"
  | "invalid-element-allocation"
  | "recipe-requirement-not-met";

export class BuildStateValidationError extends Error {
  constructor(
    readonly code: BuildStateValidationCode,
    message: string,
  ) {
    super(message);
    this.name = "BuildStateValidationError";
  }
}

function cloneAndValidateElementAllocation(
  allocation: ElementAllocation,
): Readonly<ElementAllocation> {
  if (!allocation || typeof allocation !== "object" || Array.isArray(allocation)) {
    throw new BuildStateValidationError(
      "invalid-element-allocation",
      "Element allocation must be an object keyed by every canonical element.",
    );
  }

  const record = allocation as Record<string, unknown>;
  const canonicalElements = new Set<string>(ELEMENTS);
  const unknownElements = Object.keys(record).filter(
    (element) => !canonicalElements.has(element),
  );

  if (unknownElements.length > 0) {
    throw new BuildStateValidationError(
      "invalid-element-allocation",
      `Element allocation contains unknown element(s): ${unknownElements.join(", ")}.`,
    );
  }

  const copy = {} as ElementAllocation;
  for (const element of ELEMENTS) {
    const value = record[element];
    if (!Number.isInteger(value) || typeof value !== "number" || value < 0) {
      throw new BuildStateValidationError(
        "invalid-element-allocation",
        `Element allocation for ${element} must be a non-negative integer.`,
      );
    }
    copy[element] = value;
  }

  return Object.freeze(copy);
}

export function getCatalogTower(towerName: string): Tower {
  const tower = TOWERS.find((candidate) => candidate.name === towerName);
  if (!tower) {
    throw new BuildStateValidationError(
      "unknown-tower",
      `Unknown catalog tower: ${towerName}.`,
    );
  }
  return tower;
}

export function getTowerLevelCeiling(towerName: string): number {
  getCatalogTower(towerName);
  const record = MECHANICS_BY_TOWER.get(towerName);
  if (!record) {
    throw new BuildStateValidationError(
      "unknown-tower",
      `No mechanics record exists for catalog tower: ${towerName}.`,
    );
  }
  return record.max_level;
}

export function isTowerLevelLegal(towerName: string, level: number): boolean {
  if (!Number.isInteger(level) || level < 1) {
    return false;
  }
  return level <= getTowerLevelCeiling(towerName);
}

export function isTowerRecipeSatisfied(
  tower: Tower,
  allocation: Readonly<ElementAllocation>,
): boolean {
  return tower.recipe.every((element) => allocation[element] >= 1);
}

function validateSelectedTower(
  towerName: string,
  level: number,
  allocation: Readonly<ElementAllocation>,
): SelectedTower {
  const tower = getCatalogTower(towerName);
  if (!isTowerLevelLegal(towerName, level)) {
    throw new BuildStateValidationError(
      "invalid-level",
      `${towerName} cannot be selected at level ${level}; its data-defined ceiling is ${getTowerLevelCeiling(towerName)}.`,
    );
  }
  if (!isTowerRecipeSatisfied(tower, allocation)) {
    throw new BuildStateValidationError(
      "recipe-requirement-not-met",
      `${towerName} requires its recipe elements to be allocated at level 1 or higher.`,
    );
  }
  return Object.freeze({ towerName, level });
}

export function createBuildState(input: BuildStateInput): BuildState {
  if (!input || typeof input !== "object") {
    throw new BuildStateValidationError(
      "invalid-state",
      "Build state input must be an object.",
    );
  }
  if (!Array.isArray(input.selectedTowers)) {
    throw new BuildStateValidationError(
      "invalid-state",
      "Build state selectedTowers must be an array.",
    );
  }
  if (!Number.isInteger(input.maxTowerSlots) || input.maxTowerSlots < 0) {
    throw new BuildStateValidationError(
      "invalid-state",
      "Build state maxTowerSlots must be a non-negative integer.",
    );
  }

  const allocation = cloneAndValidateElementAllocation(input.elementAllocation);
  if (input.selectedTowers.length > input.maxTowerSlots) {
    throw new BuildStateValidationError(
      "slot-limit-exceeded",
      "Selected towers exceed the configured tower slot limit.",
    );
  }

  const selectedNames = new Set<string>();
  const selectedTowers = input.selectedTowers.map((selection) => {
    if (!selection || typeof selection !== "object" || typeof selection.towerName !== "string") {
      throw new BuildStateValidationError(
        "invalid-state",
        "Each selected tower must include a towerName string and numeric level.",
      );
    }
    if (selectedNames.has(selection.towerName)) {
      throw new BuildStateValidationError(
        "duplicate-tower",
        `Tower ${selection.towerName} cannot be selected more than once.`,
      );
    }
    selectedNames.add(selection.towerName);
    return validateSelectedTower(selection.towerName, selection.level, allocation);
  });

  return Object.freeze({
    selectedTowers: Object.freeze(selectedTowers),
    elementAllocation: allocation,
    maxTowerSlots: input.maxTowerSlots,
    remainingTowerSlots: input.maxTowerSlots - selectedTowers.length,
  });
}
