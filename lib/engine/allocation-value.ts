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
  buildAllocationProfile,
} from "./allocation-profile";

import {
  buildTowerState,
} from "./tower-state";

export type TowerDeltaKind =
  | "UNLOCKED"
  | "LOCKED"
  | "DEEPENED"
  | "SHALLOWER"
  | "UNCHANGED";

export interface TowerDelta {
  name: string;
  type: Tower["type"];
  kind: TowerDeltaKind;
  beforeTier: number;
  afterTier: number;
}

export interface FunctionalDelta {
  mainDPS: number;
  control: number;
  coverage: number;
  amplification: number;
  range: number;
  scaling: number;
  support: number;
}

export interface EcosystemDelta {
  activeElements: number;

  triAccess: number;
  quadAccess: number;
  quadCount: number;

  functionalAccess: FunctionalDelta;
}

export interface PointMove {
  from: ElementName;
  to: ElementName;
}

export type MarginalValueCharacter =
  | "DEPTH_GAIN"
  | "ECOSYSTEM_EXPANSION"
  | "FUNCTIONAL_GAIN"
  | "TRADEOFF"
  | "NEUTRAL";

export interface MarginalValueSummary {
  character: MarginalValueCharacter;

  unlockedCount: number;
  lockedCount: number;

  deepenedCount: number;
  shallowerCount: number;

  triAccessDelta: number;
  quadAccessDelta: number;
  quadCountDelta: number;

  functionalGains: string[];
  functionalLosses: string[];

  dualDepthGains: {
    elements: [ElementName, ElementName];
    delta: number;
  }[];

  dualDepthLosses: {
    elements: [ElementName, ElementName];
    delta: number;
  }[];
}

export interface AllocationValueComparison {
  before: Allocation;
  after: Allocation;

  move: PointMove;

  towerDeltas: TowerDelta[];

  unlockedTowers: string[];
  lockedTowers: string[];
  deepenedTowers: string[];
  shallowerTowers: string[];

  ecosystem: {
    before: EcosystemDelta;
    after: EcosystemDelta;
    delta: EcosystemDelta;
  };

  dualDepthChanges: {
    elements: [ElementName, ElementName];
    beforeDepth: number;
    afterDepth: number;
    delta: number;
  }[];

  marginalValue: MarginalValueSummary;

  marginalEvidence: string[];

  provenance: string[];
}

function elementIndex(
  element: ElementName,
): number {
  return ELEMENTS.indexOf(
    element,
  );
}

function cloneAllocation(
  allocation: Allocation,
): Allocation {
  return [
    ...allocation,
  ] as Allocation;
}

function applyPointMove(
  allocation: Allocation,
  move: PointMove,
): Allocation {
  const fromIndex =
    elementIndex(
      move.from,
    );

  const toIndex =
    elementIndex(
      move.to,
    );

  if (
    fromIndex < 0 ||
    toIndex < 0
  ) {
    throw new Error(
      `Invalid elemental point move: ${move.from} -> ${move.to}`,
    );
  }

  if (
    fromIndex ===
    toIndex
  ) {
    throw new Error(
      "Point move source and destination must differ.",
    );
  }

  const next =
    cloneAllocation(
      allocation,
    );

  if (
    next[fromIndex] <= 0
  ) {
    throw new Error(
      `Cannot remove a point from ${move.from} because its current level is 0.`,
    );
  }

  if (
    next[toIndex] >= 3
  ) {
    throw new Error(
      `Cannot add a point to ${move.to} because its current level is already 3.`,
    );
  }

  next[fromIndex] -= 1;
  next[toIndex] += 1;

  return next;
}

function getTowerStates(
  allocation: Allocation,
) {
  return TOWERS.map(
    (tower) =>
      buildTowerState(
        tower,
        allocation,
      ),
  );
}

function getTowerDelta(
  tower: Tower,
  before: Allocation,
  after: Allocation,
): TowerDelta {
  const beforeState =
    buildTowerState(
      tower,
      before,
    );

  const afterState =
    buildTowerState(
      tower,
      after,
    );

  let kind:
    TowerDeltaKind =
    "UNCHANGED";

  if (
    !beforeState.unlocked &&
    afterState.unlocked
  ) {
    kind = "UNLOCKED";
  } else if (
    beforeState.unlocked &&
    !afterState.unlocked
  ) {
    kind = "LOCKED";
  } else if (
    afterState.tier >
    beforeState.tier
  ) {
    kind = "DEEPENED";
  } else if (
    afterState.tier <
    beforeState.tier
  ) {
    kind = "SHALLOWER";
  }

  return {
    name: tower.name,
    type: tower.type,
    kind,
    beforeTier:
      beforeState.tier,
    afterTier:
      afterState.tier,
  };
}

function getFunctionalDelta(
  before: ReturnType<
    typeof buildAllocationProfile
  >,
  after: ReturnType<
    typeof buildAllocationProfile
  >,
): FunctionalDelta {
  return {
    mainDPS:
      after.functionalAccess
        .mainDPS -
      before.functionalAccess
        .mainDPS,

    control:
      after.functionalAccess
        .control -
      before.functionalAccess
        .control,

    coverage:
      after.functionalAccess
        .coverage -
      before.functionalAccess
        .coverage,

    amplification:
      after.functionalAccess
        .amplification -
      before.functionalAccess
        .amplification,

    range:
      after.functionalAccess
        .range -
      before.functionalAccess
        .range,

    scaling:
      after.functionalAccess
        .scaling -
      before.functionalAccess
        .scaling,

    support:
      after.functionalAccess
        .support -
      before.functionalAccess
        .support,
  };
}

function getEcosystemSnapshot(
  profile: ReturnType<
    typeof buildAllocationProfile
  >,
): EcosystemDelta {
  return {
    activeElements:
      profile.activeElements,

    triAccess:
      profile.triAccess,

    quadAccess:
      profile.quadAccess,

    quadCount:
      profile.quadCount,

    functionalAccess: {
      mainDPS:
        profile.functionalAccess
          .mainDPS,

      control:
        profile.functionalAccess
          .control,

      coverage:
        profile.functionalAccess
          .coverage,

      amplification:
        profile.functionalAccess
          .amplification,

      range:
        profile.functionalAccess
          .range,

      scaling:
        profile.functionalAccess
          .scaling,

      support:
        profile.functionalAccess
          .support,
    },
  };
}

function getEcosystemDelta(
  before: EcosystemDelta,
  after: EcosystemDelta,
): EcosystemDelta {
  return {
    activeElements:
      after.activeElements -
      before.activeElements,

    triAccess:
      after.triAccess -
      before.triAccess,

    quadAccess:
      after.quadAccess -
      before.quadAccess,

    quadCount:
      after.quadCount -
      before.quadCount,

    functionalAccess: {
      mainDPS:
        after.functionalAccess
          .mainDPS -
        before.functionalAccess
          .mainDPS,

      control:
        after.functionalAccess
          .control -
        before.functionalAccess
          .control,

      coverage:
        after.functionalAccess
          .coverage -
        before.functionalAccess
          .coverage,

      amplification:
        after.functionalAccess
          .amplification -
        before.functionalAccess
          .amplification,

      range:
        after.functionalAccess
          .range -
        before.functionalAccess
          .range,

      scaling:
        after.functionalAccess
          .scaling -
        before.functionalAccess
          .scaling,

      support:
        after.functionalAccess
          .support -
        before.functionalAccess
          .support,
    },
  };
}

function getDualDepthChanges(
  before: ReturnType<
    typeof buildAllocationProfile
  >,
  after: ReturnType<
    typeof buildAllocationProfile
  >,
): AllocationValueComparison[
  "dualDepthChanges"
] {
  const allKeys =
    new Set(
      [
        ...before.dualDepth,
        ...after.dualDepth,
      ].map(
        (entry) =>
          entry.elements.join(
            ":",
          ),
      ),
    );

  return Array.from(
    allKeys,
  )
    .map(
      (key) => {
        const beforeEntry =
          before.dualDepth.find(
            (entry) =>
              entry.elements.join(
                ":",
              ) === key,
          );

        const afterEntry =
          after.dualDepth.find(
            (entry) =>
              entry.elements.join(
                ":",
              ) === key,
          );

        const elements =
          beforeEntry?.elements ??
          afterEntry?.elements;

        if (!elements) {
          return null;
        }

        const beforeDepth =
          beforeEntry?.depth ??
          0;

        const afterDepth =
          afterEntry?.depth ??
          0;

        return {
          elements,
          beforeDepth,
          afterDepth,
          delta:
            afterDepth -
            beforeDepth,
        };
      },
    )
    .filter(
      (
        entry,
      ): entry is NonNullable<
        typeof entry
      > =>
        entry !== null,
    )
    .filter(
      (entry) =>
        entry.delta !== 0,
    )
    .sort(
      (a, b) =>
        Math.abs(
          b.delta,
        ) -
        Math.abs(
          a.delta,
        ),
    );
}

function buildMarginalValueSummary(
  comparison: Omit<
    AllocationValueComparison,
    "marginalValue" | "marginalEvidence"
  >,
): MarginalValueSummary {
  const {
    ecosystem,
    unlockedTowers,
    lockedTowers,
    deepenedTowers,
    shallowerTowers,
    dualDepthChanges,
  } = comparison;

  const functionalGains: string[] =
    [];

  const functionalLosses: string[] =
    [];

  for (
    const [
      role,
      delta,
    ] of Object.entries(
      ecosystem.delta
        .functionalAccess,
    )
  ) {
    if (
      delta > 0
    ) {
      functionalGains.push(
        role,
      );
    }

    if (
      delta < 0
    ) {
      functionalLosses.push(
        role,
      );
    }
  }

  const dualDepthGains =
    dualDepthChanges
      .filter(
        (change) =>
          change.delta > 0,
      )
      .map(
        (change) => ({
          elements:
            change.elements,
          delta:
            change.delta,
        }),
      );

  const dualDepthLosses =
    dualDepthChanges
      .filter(
        (change) =>
          change.delta < 0,
      )
      .map(
        (change) => ({
          elements:
            change.elements,
          delta:
            Math.abs(
              change.delta,
            ),
        }),
      );

  const gains =
    unlockedTowers.length +
    deepenedTowers.length +
    Math.max(
      0,
      ecosystem.delta
        .triAccess,
    ) +
    Math.max(
      0,
      ecosystem.delta
        .quadAccess,
    ) +
    functionalGains.length +
    dualDepthGains.length;

  const losses =
    lockedTowers.length +
    shallowerTowers.length +
    Math.max(
      0,
      -ecosystem.delta
        .triAccess,
    ) +
    Math.max(
      0,
      -ecosystem.delta
        .quadAccess,
    ) +
    functionalLosses.length +
    dualDepthLosses.length;

  let character:
    MarginalValueCharacter;

  if (
    gains === 0 &&
    losses === 0
  ) {
    character = "NEUTRAL";
  } else if (
    losses > 0 &&
    gains > 0
  ) {
    character = "TRADEOFF";
  } else if (
    dualDepthGains.length > 0 ||
    deepenedTowers.length > 0
  ) {
    character = "DEPTH_GAIN";
  } else if (
    ecosystem.delta.triAccess > 0 ||
    ecosystem.delta.quadAccess > 0 ||
    ecosystem.delta.quadCount > 0 ||
    ecosystem.delta.activeElements > 0
  ) {
    character =
      "ECOSYSTEM_EXPANSION";
  } else if (
    functionalGains.length > 0
  ) {
    character =
      "FUNCTIONAL_GAIN";
  } else {
    character = "TRADEOFF";
  }

  return {
    character,

    unlockedCount:
      unlockedTowers.length,

    lockedCount:
      lockedTowers.length,

    deepenedCount:
      deepenedTowers.length,

    shallowerCount:
      shallowerTowers.length,

    triAccessDelta:
      ecosystem.delta
        .triAccess,

    quadAccessDelta:
      ecosystem.delta
        .quadAccess,

    quadCountDelta:
      ecosystem.delta
        .quadCount,

    functionalGains,

    functionalLosses,

    dualDepthGains,

    dualDepthLosses,
  };
}

function buildMarginalEvidence(
  comparison: Omit<
    AllocationValueComparison,
    "marginalValue"
    | "marginalEvidence"
  >,
): string[] {
  const evidence: string[] =
    [];

  if (
    comparison.unlockedTowers
      .length > 0
  ) {
    evidence.push(
      `Point move unlocked ${comparison.unlockedTowers.length} tower(s): ${comparison.unlockedTowers.join(", ")}.`,
    );
  }

  if (
    comparison.lockedTowers
      .length > 0
  ) {
    evidence.push(
      `Point move removed access to ${comparison.lockedTowers.length} tower(s): ${comparison.lockedTowers.join(", ")}.`,
    );
  }

  if (
    comparison.deepenedTowers
      .length > 0
  ) {
    evidence.push(
      `Point move deepened ${comparison.deepenedTowers.length} tower(s): ${comparison.deepenedTowers.join(", ")}.`,
    );
  }

  if (
    comparison.shallowerTowers
      .length > 0
  ) {
    evidence.push(
      `Point move reduced ${comparison.shallowerTowers.length} tower(s): ${comparison.shallowerTowers.join(", ")}.`,
    );
  }

  if (
    comparison.ecosystem
      .delta.quadCount !==
    0
  ) {
    evidence.push(
      `Quad ecosystem changed by ${comparison.ecosystem.delta.quadCount}.`,
    );
  }

  if (
    comparison.ecosystem
      .delta.triAccess !==
    0
  ) {
    evidence.push(
      `Tri access changed by ${comparison.ecosystem.delta.triAccess}.`,
    );
  }

  const functionalChanges =
    Object.entries(
      comparison.ecosystem
        .delta
        .functionalAccess,
    ).filter(
      ([, delta]) =>
        delta !== 0,
    );

  for (
    const [
      role,
      delta,
    ] of functionalChanges
  ) {
    evidence.push(
      `${role} access changed by ${delta}.`,
    );
  }

  for (
    const change of
    comparison.dualDepthChanges
  ) {
    evidence.push(
      `${change.elements.join(" + ")} depth changed from ${change.beforeDepth} to ${change.afterDepth}.`,
    );
  }

  return evidence;
}

export function compareAllocationPointMove(
  allocation: Allocation,
  move: PointMove,
): AllocationValueComparison {
  const after =
    applyPointMove(
      allocation,
      move,
    );

  const beforeProfile =
    buildAllocationProfile(
      allocation,
    );

  const afterProfile =
    buildAllocationProfile(
      after,
    );

  const towerDeltas =
    TOWERS.map(
      (tower) =>
        getTowerDelta(
          tower,
          allocation,
          after,
        ),
    ).filter(
      (delta) =>
        delta.kind !==
        "UNCHANGED",
    );

  const unlockedTowers =
    towerDeltas
      .filter(
        (delta) =>
          delta.kind ===
          "UNLOCKED",
      )
      .map(
        (delta) =>
          delta.name,
      );

  const lockedTowers =
    towerDeltas
      .filter(
        (delta) =>
          delta.kind ===
          "LOCKED",
      )
      .map(
        (delta) =>
          delta.name,
      );

  const deepenedTowers =
    towerDeltas
      .filter(
        (delta) =>
          delta.kind ===
          "DEEPENED",
      )
      .map(
        (delta) =>
          delta.name,
      );

  const shallowerTowers =
    towerDeltas
      .filter(
        (delta) =>
          delta.kind ===
          "SHALLOWER",
      )
      .map(
        (delta) =>
          delta.name,
      );

  const beforeEcosystem =
    getEcosystemSnapshot(
      beforeProfile,
    );

  const afterEcosystem =
    getEcosystemSnapshot(
      afterProfile,
    );

  const ecosystemDelta =
    getEcosystemDelta(
      beforeEcosystem,
      afterEcosystem,
    );

  const dualDepthChanges =
    getDualDepthChanges(
      beforeProfile,
      afterProfile,
    );

  const baseComparison = {
    before: allocation,

    after,

    move,

    towerDeltas,

    unlockedTowers,

    lockedTowers,

    deepenedTowers,

    shallowerTowers,

    ecosystem: {
      before:
        beforeEcosystem,

      after:
        afterEcosystem,

      delta:
        ecosystemDelta,
    },

    dualDepthChanges,

    provenance: [
      "Allocation transition",
      "Allocation Profile",
      "TowerState recipe depth and unlock state",
    ],
  };

  return {
    ...baseComparison,

    marginalValue:
      buildMarginalValueSummary(
        baseComparison,
      ),

    marginalEvidence:
      buildMarginalEvidence(
        baseComparison,
      ),
  };
}