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
  damage_profile: {
    tags: string[];
    single_target_or_multi: string;
    burst: string;
    sustained: string;
    ramp: string;
    stacking: string;
    dot: string;
    execute: string;
    kill_scaling: string;
    attack_scaling: string;
    front_loaded: string;
    back_loaded: string;
    focused: string;
    distributed: string;
    chain_reaction: string;
  };
  control: {
    slow: string;
    hard_cc: string;
    debuff: string;
    hp_manipulation: string;
    execute_threshold: string;
    duration: string;
    coverage: string;
  };
  coverage: {
  profile: string;
  density_scaling: string;
  wave_clear: string;
  boss: string;
  };
  strategic_roles: string[];
  build_position: string;
  synergies: string[];
  anti_synergies: string[];
  dependencies: Record<string, unknown>;
  role_priority: string[];
  sources: string[];
  confidence: string;
};

export type Candidate = {
  allocation: Allocation;
  score: number;
  activeElements: number;
  unlocked: Tower[];
  selected: Tower[];
};
