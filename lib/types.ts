export type ElementName = "Light" | "Darkness" | "Water" | "Fire" | "Nature" | "Earth";
export type Allocation = [number, number, number, number, number, number];

export type Tower = {
  name: string;
  type: "Dual" | "Trio" | "Quad";
  recipe: ElementName[];
  role: string;
  utility: string;
  damage: string;
  damageId: number | null;
  req: Record<ElementName, number>;
};

export type MechanicsRecord = {
  tower: string;
  recipe: ElementName[];
  type: string;
  max_level: number;
  source_catalog_role: string;
  source_catalog_utility: string;
  stats: Record<string, unknown>;
  core_mechanic: string;
  strategic_roles: string[];
  build_position: string;
  synergies: string[];
  anti_synergies: string[];
  dependencies: Record<string, unknown>;
  confidence: string;
};

export type Candidate = {
  allocation: Allocation;
  score: number;
  activeElements: number;
  unlocked: Tower[];
  selected: Tower[];
};
