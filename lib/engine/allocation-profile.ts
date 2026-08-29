import type {
  Allocation,
  ElementName,
  Tower,
} from "@/lib/types";

import {
  ELEMENTS,
  TOWERS,
} from "@/lib/data";

import {
  buildTowerState,
} from "./tower-state";

export type AllocationShape =
  | "DEPTH"
  | "HYBRID"
  | "TRI"
  | "QUAD"
  | "SIX_ELEMENT"
  | "STRUCTURALLY_WEAK";

export interface FunctionalAccess {
  mainDPS: number;
  control: number;
  coverage: number;
  amplification: number;
  range: number;
  scaling: number;
  support: number;
}

export interface DualDepth {
  elements: [
    ElementName,
    ElementName,
  ];
  depth: number;
  towerCount: number;
}

export interface AllocationProfile {
  allocation: Allocation;

  activeElements: number;
  maxElementLevel: number;
  minActiveLevel: number;

  shape: AllocationShape;

  dualDepth: DualDepth[];

  triAccess: number;
  quadAccess: number;
  quadCount: number;

  unlockedTowerCount: number;

  functionalAccess: FunctionalAccess;

  mainDPSTowers: string[];
  controlTowers: string[];
  coverageTowers: string[];
  amplificationTowers: string[];

  structuralWeakness: {
    isWeak: boolean;
    reasons: string[];
  };
}

type TowerState =
  ReturnType<typeof buildTowerState>;

const PROFILE_CACHE =
  new Map<string, AllocationProfile>();

function allocationKey(
  allocation: Allocation,
): string {
  return allocation.join(",");
}

function getLevel(
  allocation: Allocation,
  element: ElementName,
): number {
  const index =
    ELEMENTS.indexOf(element);

  return index >= 0
    ? allocation[index]
    : 0;
}

function isUnlocked(
  tower: Tower,
  allocation: Allocation,
): boolean {
  return tower.recipe.every(
    (element) => {
      return (
        getLevel(
          allocation,
          element,
        ) >=
        (tower.req[element] ?? 1)
      );
    },
  );
}

function getDepth(
  tower: Tower,
  allocation: Allocation,
): number {
  if (tower.recipe.length === 0) {
    return 0;
  }

  return Math.min(
    ...tower.recipe.map(
      (element) =>
        getLevel(
          allocation,
          element,
        ),
    ),
  );
}

function getUnlockedTowers(
  allocation: Allocation,
): Tower[] {
  return TOWERS.filter(
    (tower) =>
      isUnlocked(
        tower,
        allocation,
      ),
  );
}

function buildTowerStates(
  allocation: Allocation,
): TowerState[] {
  return getUnlockedTowers(
    allocation,
  ).map((tower) =>
    buildTowerState(
      tower,
      allocation,
    ),
  );
}

function getRoleTowerNames(
  states: TowerState[],
  role:
    | "mainDPS"
    | "control"
    | "coverage"
    | "amplification"
    | "range"
    | "scaling"
    | "support",
): string[] {
  return states
    .filter(
      (state) =>
        state.roles[role] !==
        "None",
    )
    .map(
      (state) =>
        state.tower.name,
    );
}

function buildDualDepth(
  allocation: Allocation,
): DualDepth[] {
  const entries = new Map<
    string,
    {
      elements: [
        ElementName,
        ElementName,
      ];
      depth: number;
      towerCount: number;
    }
  >();

  for (
    const tower of
    getUnlockedTowers(
      allocation,
    )
  ) {
    if (
      tower.type !== "Dual" ||
      tower.recipe.length !== 2
    ) {
      continue;
    }

    const [
      a,
      b,
    ] = tower.recipe as [
      ElementName,
      ElementName,
    ];

    const ordered: [
      ElementName,
      ElementName,
    ] =
      ELEMENTS.indexOf(a) <
      ELEMENTS.indexOf(b)
        ? [a, b]
        : [b, a];

    const key =
      ordered.join(":");

    const depth =
      getDepth(
        tower,
        allocation,
      );

    const existing =
      entries.get(key);

    if (!existing) {
      entries.set(
        key,
        {
          elements: ordered,
          depth,
          towerCount: 1,
        },
      );

      continue;
    }

    existing.depth =
      Math.max(
        existing.depth,
        depth,
      );

    existing.towerCount += 1;
  }

  return Array.from(
    entries.values(),
  ).sort(
    (a, b) =>
      b.depth - a.depth ||
      b.towerCount -
        a.towerCount,
  );
}

function getFunctionalAccess(
  states: TowerState[],
): FunctionalAccess {
  return {
    mainDPS:
      getRoleTowerNames(
        states,
        "mainDPS",
      ).length,

    control:
      getRoleTowerNames(
        states,
        "control",
      ).length,

    coverage:
      getRoleTowerNames(
        states,
        "coverage",
      ).length,

    amplification:
      getRoleTowerNames(
        states,
        "amplification",
      ).length,

    range:
      getRoleTowerNames(
        states,
        "range",
      ).length,

    scaling:
      getRoleTowerNames(
        states,
        "scaling",
      ).length,

    support:
      getRoleTowerNames(
        states,
        "support",
      ).length,
  };
}

function getStructuralWeakness(
  profile: Omit<
    AllocationProfile,
    | "shape"
    | "structuralWeakness"
  >,
): AllocationProfile[
  "structuralWeakness"
] {
  const reasons: string[] = [];

  if (
    profile.unlockedTowerCount === 0
  ) {
    reasons.push(
      "No towers are unlocked.",
    );
  }

  if (
    profile.functionalAccess
      .mainDPS === 0
  ) {
    reasons.push(
      "No unlocked Main DPS tower is available.",
    );
  }

  if (
    profile.functionalAccess
        .control === 0 &&
    profile.functionalAccess
        .coverage === 0
  ) {
    reasons.push(
      "No unlocked Control or Coverage function is available.",
    );
  }

  if (
    profile.functionalAccess
        .mainDPS === 0 &&
    profile.functionalAccess
        .control === 0 &&
    profile.functionalAccess
        .coverage === 0 &&
    profile.functionalAccess
        .amplification === 0
  ) {
    reasons.push(
      "The unlocked ecosystem lacks the major modeled combat functions.",
    );
  }

  return {
    isWeak:
      reasons.length > 0,
    reasons,
  };
}

function classifyShape(
  profile: Omit<
    AllocationProfile,
    | "shape"
    | "structuralWeakness"
  >,
  structuralWeakness:
    AllocationProfile[
      "structuralWeakness"
    ],
): AllocationShape {
  if (
    profile.activeElements ===
    6
  ) {
    return "SIX_ELEMENT";
  }

  if (
    structuralWeakness.isWeak
  ) {
    return "STRUCTURALLY_WEAK";
  }

  if (
    profile.activeElements <=
      4 &&
    profile.maxElementLevel >=
      3 &&
    profile.minActiveLevel >=
      2
  ) {
    return "DEPTH";
  }

  if (
    profile.quadAccess >= 3 &&
    profile.activeElements >=
      4
  ) {
    return "QUAD";
  }

  if (
    profile.triAccess >= 2 &&
    profile.activeElements >=
      3 &&
    profile.maxElementLevel <=
      2
  ) {
    return "TRI";
  }

  return "HYBRID";
}

export function buildAllocationProfile(
  allocation: Allocation,
): AllocationProfile {
  const key =
    allocationKey(
      allocation,
    );

  const cached =
    PROFILE_CACHE.get(key);

  if (cached) {
    return cached;
  }

  const unlocked =
    getUnlockedTowers(
      allocation,
    );

  const towerStates =
    buildTowerStates(
      allocation,
    );

  const activeElements =
    allocation.filter(
      (level) =>
        level > 0,
    ).length;

  const activeLevels =
    allocation.filter(
      (level) =>
        level > 0,
    );

  const maxElementLevel =
    activeLevels.length > 0
      ? Math.max(
          ...activeLevels,
        )
      : 0;

  const minActiveLevel =
    activeLevels.length > 0
      ? Math.min(
          ...activeLevels,
        )
      : 0;

  const dualDepth =
    buildDualDepth(
      allocation,
    );

  const triAccess =
    unlocked.filter(
      (tower) =>
        tower.type ===
        "Trio",
    ).length;

  const quadAccess =
    unlocked.filter(
      (tower) =>
        tower.type ===
        "Quad",
    ).length;

  const functionalAccess =
    getFunctionalAccess(
      towerStates,
    );

  const mainDPSTowers =
    getRoleTowerNames(
      towerStates,
      "mainDPS",
    );

  const controlTowers =
    getRoleTowerNames(
      towerStates,
      "control",
    );

  const coverageTowers =
    getRoleTowerNames(
      towerStates,
      "coverage",
    );

  const amplificationTowers =
    getRoleTowerNames(
      towerStates,
      "amplification",
    );

  const baseProfile = {
    allocation,

    activeElements,

    maxElementLevel,

    minActiveLevel,

    dualDepth,

    triAccess,

    quadAccess,

    quadCount:
      quadAccess,

    unlockedTowerCount:
      unlocked.length,

    functionalAccess,

    mainDPSTowers,

    controlTowers,

    coverageTowers,

    amplificationTowers,
  };

  const structuralWeakness =
    getStructuralWeakness(
      baseProfile,
    );

  const profile:
    AllocationProfile = {
    ...baseProfile,

    shape:
      classifyShape(
        baseProfile,
        structuralWeakness,
      ),

    structuralWeakness,
  };

  PROFILE_CACHE.set(
    key,
    profile,
  );

  return profile;
}