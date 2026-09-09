import {
  ELEMENTS,
  type ElementAllocation,
  type ElementName,
} from "@/lib/domain/elements";

import {
  getTower,
} from "@/lib/domain/towerCatalog";

import {
  getTowerProfile,
} from "@/lib/domain/towerProfileCatalog";

import type {
  TowerId,
} from "@/lib/domain/tower";

import type {
  CombinedBuildPlan,
} from "@/lib/engine/combinedBuildPlan";

import {
  getEndGameTowerFact,
} from "@/lib/domain/endGameTowerFacts";

import type {
  EndGameTowerId,
} from "@/lib/domain/endGameTower";

import type {
  BuildProgression,
} from "@/lib/engine/buildProgression";

import {
  buildRecommendationSet,
  type PlanComparison,
} from "@/lib/engine/rankedBuildRecommendations";

import {
  explainSynergyRelations,
  groupSynergyByMechanic,
  partitionSynergyRelations,
  synergyTagsForTower,
  type SynergyRelationExplanation,
} from "@/lib/engine/synergyExplanation";

const ROLE_LABEL: Record<string, string> = {
  slow: "Slow",
  "damage-amp": "Damage Amp",
  buff: "Buff",
};

/**
 * Human labels for the mechanic each tower actually provides. The engine
 * keeps a single "damage-amp" role, but Polar removes current HP, Jinx
 * echoes damage, and only Incantation / Corrosion truly amplify — so the
 * UI names the real effect instead of the abstract slot.
 */
const MECHANIC_LABEL: Record<string, string> = {
  "damage-taken-amp": "Damage Amp",
  "damage-echo": "Damage Echo",
  "current-hp-removal": "HP Removal",
  "enemy-slow": "Slow",
  "enemy-stun": "Stun",
  "enemy-stasis": "Stasis",
  "enemy-grouping": "Grouping",
  "enemy-displacement": "Displacement",
  "target-isolation": "Isolation",
  "kill-generation": "Kill Generation",
  "attack-damage-buff": "Attack Damage",
  "attack-speed-buff": "Attack Speed",
  "tower-replication": "Replication",
};

const SHAPE_LABEL: Record<string, string> = {
  "single-target": "Single-target",
  aoe: "AoE",
  hybrid: "Hybrid",
};

const PROFILE_LABEL: Record<string, string> = {
  dot: "DoT",
  execute: "Execute",
  ramp: "Ramping",
};

/**
 * The label shown on a tower card's role line. For the "damage-amp" slot
 * it names the real mechanic; every other slot keeps its plain name.
 */
function displayRoleLabel(
  towerId: TowerId,
  role: string,
): string {
  if (role === "damage-amp") {
    const provided: readonly string[] =
      getTowerProfile(
        towerId,
      ).mechanics.provides.map(
        (entry) => entry.signal,
      );

    for (const signal of [
      "current-hp-removal",
      "damage-echo",
      "damage-taken-amp",
    ]) {
      if (provided.includes(signal)) {
        return MECHANIC_LABEL[signal];
      }
    }
  }

  return ROLE_LABEL[role] ?? role;
}

/**
 * Fixed identity of a tower, independent of why it was picked for this
 * build: its damage shape and the mechanics it brings.
 */
function towerIdentity(towerId: TowerId): {
  damageShape: string | null;
  mechanics: readonly string[];
} {
  const profile = getTowerProfile(towerId);
  const shapeParts: string[] = [];

  if (profile.offense) {
    const shape =
      SHAPE_LABEL[
        profile.offense.damageShape
      ];
    if (shape) shapeParts.push(shape);
    const profileLabel =
      PROFILE_LABEL[
        profile.offense.damageProfile
      ];
    if (profileLabel)
      shapeParts.push(profileLabel);
  }

  return {
    damageShape:
      shapeParts.length > 0
        ? shapeParts.join(" · ")
        : null,
    mechanics:
      profile.mechanics.provides.map(
        (entry) =>
          MECHANIC_LABEL[entry.signal] ??
          entry.signal,
      ),
  };
}

export type PackageTowerDto = {
  id: TowerId;
  name: string;
  combination: string;
  recipe: readonly ElementName[];
  damageElement: string;
  level: number;
  maxLevel: number;
  developmentStatus:
    | "developed"
    | "underdeveloped"
    | "core-target";
  isAnchor: boolean;
  roles: readonly string[];
  minimumFieldCost: number;
  marginalCapital: number;
  purpose: string;
  developmentReason: string | null;
  synergyTags: readonly string[];

  /**
   * What this tower fundamentally is, regardless of why it entered this
   * build — its damage shape and the mechanics it provides. Lets the card
   * show "Isolation · Single-target" for a Rage that only patched a
   * coverage hole this run.
   */
  identity: {
    damageShape: string | null;
    mechanics: readonly string[];
  };

  /**
   * True for the engine's mandatory core package (Anchor plus the towers
   * satisfying Slow / Damage Amp / Buff). Straight from
   * `baseline.package.selectedTowerIds` — not a presentation guess.
   */
  isCore: boolean;

  /**
   * True when this tower is the highest-priority action of one of the
   * progression stages, so the package and the roadmap agree on what
   * matters.
   */
  isProgressionPriority: boolean;
  progressionStage:
    | "EARLY"
    | "MID"
    | "LATE"
    | null;
};

export type CoverageRowDto = {
  defender: ElementName;
  anchorMultiplier: number;
  packageAverageMultiplier: number;
  hasMeaningfulDirectCounter: boolean;
  isAnchorWeakness: boolean;
  covered: boolean;
};

export type TowerActionDto = {
  kind: "build" | "upgrade";
  towerId: TowerId;
  towerName: string;
  toLevel: number;
  roles: readonly string[];
};

export type KeystoneStepDto = {
  element: ElementName;
  from: number;
  to: number;
  /**
   * The tower builds/upgrades this exact allocation step makes legal or
   * reachable — so the roadmap shows *why* the keystone is spent, not just
   * that it is. Straight from
   * `AllocationProgressionStep.newlyLegalOrReachableSelectedTowers`.
   */
  unlocks: readonly TowerActionDto[];
};

export type ProgressionStageDto = {
  stage: "EARLY" | "MID" | "LATE" | "END_GAME";
  headline: string;
  /**
   * The single highest-priority action of the stage, used only to mark the
   * "start here" row inside its keystone group.
   */
  primaryAction: TowerActionDto | null;
  endgameSelections:
    | readonly {
        name: string;
        quantity: number;
      }[]
    | null;
  keystoneSteps: readonly KeystoneStepDto[];
  reason: string;
};

export type EndGameTowerDto = {
  towerId: string;
  name: string;
  element: string;
  quantity: number;
  minimumFieldCost: number;
  sustainedDps: number;
  aoe: number;
  range: number;
  unresolvedFacts: readonly string[];
};

export type EndGamePackageDto = {
  towers: readonly EndGameTowerDto[];
  essenceUses: number;
  minimumAddedCapital: number;
  anchorWeaknessesImproved: number;
  totalSustainedDps: number;
  why: readonly string[];
};

/**
 * The engine's comparison plus display-ready tower names and paired
 * substitutions, so the route explorer can render "Shredder →
 * Singularity" without re-deriving anything.
 */
export type PlanComparisonDto = PlanComparison & {
  removedTowers: readonly {
    id: TowerId;
    name: string;
  }[];
  addedTowers: readonly {
    id: TowerId;
    name: string;
  }[];
  substitutionPairs: readonly {
    from: { id: TowerId; name: string } | null;
    to: { id: TowerId; name: string } | null;
  }[];
};

export type PlanDto = {
  id: string;
  rank: number;
  anchor: {
    id: TowerId;
    name: string;
    combination: string;
  };
  allocation: Record<ElementName, number>;
  keystoneCount: number;
  essenceUses: string;
  package: readonly PackageTowerDto[];
  minimumCapital: {
    normal: number;
    endgameAdded: number | null;
    complete: number | null;
  };
  coverage: {
    rows: readonly CoverageRowDto[];
    hasSingleTarget: boolean;
    hasAoe: boolean;
    rangeMin: number;
    rangeMax: number;
    rangeExtensionFromAnchor: number;
  };
  synergy: {
    tags: readonly string[];
    /** Fair and above — shown in the primary synergy network. */
    relations:
      readonly SynergyRelationExplanation[];
    /** The Situational tail, kept for the "view all" disclosure. */
    secondaryRelations:
      readonly SynergyRelationExplanation[];
    grouped: readonly {
      mechanicTag: string;
      relations:
        readonly SynergyRelationExplanation[];
    }[];
  };
  tensions: readonly {
    providerId: string;
    providerName: string;
    affectedId: string;
    affectedName: string;
    condition: string;
  }[];
  progression: readonly ProgressionStageDto[];
  endGame: {
    best: EndGamePackageDto | null;
    secondBest: EndGamePackageDto | null;
  };
  comparisonToRecommended:
    PlanComparisonDto | null;
};

export type BuildRecommendationSetDto = {
  anchorTowerId: TowerId;
  engineRecommendedPlanId: string;
  plans: readonly PlanDto[];
};

function allocationRecord(
  allocation: ElementAllocation,
): Record<ElementName, number> {
  return Object.fromEntries(
    ELEMENTS.map((element) => [
      element,
      allocation[element],
    ]),
  ) as Record<ElementName, number>;
}

function purposeFor(
  audit: CombinedBuildPlan["normalPlan"]["normalPackageEconomics"]["towerAudits"][number],
  isCore: boolean,
): string {
  if (isCore) {
    return audit.rolePurpose
      .map((entry) =>
        entry.replace(
          "mandatory-core-role:",
          "",
        ),
      )
      .map((entry) =>
        entry === "main-dps"
          ? "Main DPS"
          : displayRoleLabel(
              audit.towerId as TowerId,
              entry,
            ),
      )
      .join(" · ");
  }

  const hasCoverage =
    audit.uniqueStrategicEvidenceAdded.some(
      (entry) =>
        entry.startsWith(
          "critical-element-coverage",
        ),
    );
  const hasSynergy =
    audit.uniqueStrategicEvidenceAdded.some(
      (entry) =>
        entry.startsWith("full-synergy"),
    );
  const hasRange =
    audit.uniqueStrategicEvidenceAdded.some(
      (entry) =>
        entry.startsWith(
          "meaningful-range-extension",
        ),
    );
  const hasOffense =
    audit.rolePurpose.includes(
      "meaningful-offense-at-reachable-level",
    );

  if (hasCoverage && hasSynergy)
    return "Coverage + Synergy";
  if (hasCoverage) return "Coverage";
  if (hasRange) return "Range";
  if (hasSynergy && hasOffense)
    return "Offensive Complement";
  if (hasSynergy) return "Synergy";
  if (hasOffense)
    return "Offensive Complement";
  return "Utility";
}

function developmentReasonFor(
  audit: CombinedBuildPlan["normalPlan"]["normalPackageEconomics"]["towerAudits"][number],
): string | null {
  if (
    audit.developmentStatus !==
    "underdeveloped"
  ) {
    return null;
  }

  const reason =
    audit.explicitDevelopmentReasons[0];
  if (!reason) return null;

  if (
    reason.startsWith(
      "critical-element-coverage:",
    )
  ) {
    return `Selected at L${audit.reachableLevel} for unique ${reason.split(":")[1]} coverage.`;
  }
  if (reason.startsWith("full-synergy:")) {
    const [, consumer, signal] =
      reason.split(":");
    return `L${audit.reachableLevel} is enough to enable its ${signal.replace(/-/g, " ")} interaction with ${getTower(consumer as TowerId).name}.`;
  }
  if (
    reason ===
    "factual-offense-is-meaningful-at-current-level"
  ) {
    return `Its offense is already meaningful at L${audit.reachableLevel}.`;
  }
  return `Kept at L${audit.reachableLevel}: ${reason.replace(/-/g, " ")}.`;
}

function progressionStages(
  progression: BuildProgression,
  rolesByTower: ReadonlyMap<
    string,
    readonly string[]
  >,
): ProgressionStageDto[] {
  const headlines: Record<string, string> = {
    EARLY:
      "Get the Anchor firing and steady the wave.",
    MID: "Develop the Anchor and lock in Slow, Damage Amp, and Buff.",
    LATE: "Finish the package and open the Essence path.",
    END_GAME:
      "Spend both Essence uses on the chosen specialisation.",
  };

  const toAction = (action: {
    action: "build" | "upgrade";
    towerId: string;
    toLevel: number;
  }): TowerActionDto => ({
    kind: action.action,
    towerId: action.towerId as TowerId,
    towerName: getTower(
      action.towerId as TowerId,
    ).name,
    toLevel: action.toLevel,
    roles:
      rolesByTower.get(action.towerId) ?? [],
  });

  return progression.stagePriorities.map(
    (sp) => {
      const primary = sp.primaryAction;
      const stageSteps =
        progression.steps.filter(
          (step) => step.stage === sp.stage,
        );

      return {
        stage: sp.stage,
        headline: headlines[sp.stage] ?? "",
        primaryAction:
          primary && "towerId" in primary
            ? toAction(primary)
            : null,
        endgameSelections:
          primary && "selections" in primary
            ? primary.selections.map((s) => ({
                name: getEndGameTowerFact(
                  s.towerId as EndGameTowerId,
                ).name,
                quantity: s.quantity,
              }))
            : null,
        keystoneSteps: stageSteps.map(
          (step) => ({
            element: step.nextElementAllocation,
            from: step.allocationBefore[
              step.nextElementAllocation
            ],
            to: step.allocationAfter[
              step.nextElementAllocation
            ],
            unlocks:
              step.newlyLegalOrReachableSelectedTowers.map(
                toAction,
              ),
          }),
        ),
        reason: sp.reason,
      };
    },
  );
}

function endGamePackageDto(
  plan: CombinedBuildPlan,
  which: "best" | "secondBest",
): EndGamePackageDto | null {
  const evaluation =
    which === "best"
      ? plan.bestEndGamePackage
      : plan.secondBestEndGamePackage;
  if (!evaluation) return null;

  const towers =
    evaluation.contributions.map(
      (contribution) => ({
        towerId: contribution.towerId,
        name: contribution.fact.name,
        element: contribution.fact.element,
        quantity: contribution.quantity,
        minimumFieldCost:
          contribution.fact
            .minimumFieldCost,
        sustainedDps: Math.round(
          contribution.sustainedDpsPerCopy,
        ),
        aoe: contribution.fact.aoe,
        range: contribution.fact.range,
        unresolvedFacts:
          contribution.unresolvedFacts,
      }),
    );

  const why: string[] = [];
  if (
    evaluation.decision
      .anchorWeaknessesImproved > 0
  ) {
    why.push(
      `Patches ${evaluation.decision.anchorWeaknessesImproved} of the Anchor's own element weakness(es).`,
    );
  }
  why.push(
    `About ${Math.round(evaluation.decision.totalSustainedEngagementDps).toLocaleString()} sustained DPS across both copies over a ${evaluation.engagementSeconds}s engagement.`,
  );
  if (evaluation.decision.aoeCopies > 0) {
    why.push(
      `${evaluation.decision.aoeCopies} AoE copy(ies) for wave clear.`,
    );
  }
  if (
    evaluation.decision.compositeCopies >
    0
  ) {
    why.push(
      "Composite damage keeps a flat rate against every armour type.",
    );
  }
  if (
    evaluation.decision
      .unresolvedFactorCount > 0
  ) {
    why.push(
      `${evaluation.decision.unresolvedFactorCount} ability factor(s) remain unverified and are not counted as damage.`,
    );
  }

  return {
    towers,
    essenceUses:
      evaluation.package.totalEssenceUses,
    minimumAddedCapital:
      evaluation.minimumEndGameOptionCapital,
    anchorWeaknessesImproved:
      evaluation.decision
        .anchorWeaknessesImproved,
    totalSustainedDps: Math.round(
      evaluation.decision
        .totalSustainedEngagementDps,
    ),
    why,
  };
}

function namedTower(towerId: TowerId) {
  return {
    id: towerId,
    name: getTower(towerId).name,
  };
}

/**
 * Pairs removed against added towers positionally so a one-for-one swap
 * reads as "Shredder → Singularity". Uneven counts keep the remainder as
 * one-sided entries rather than inventing a pairing.
 */
function comparisonDto(
  comparison: PlanComparison | null,
): PlanComparisonDto | null {
  if (!comparison) return null;

  const removedTowers =
    comparison.substitutions.removed.map(
      namedTower,
    );
  const addedTowers =
    comparison.substitutions.added.map(
      namedTower,
    );
  const pairCount = Math.max(
    removedTowers.length,
    addedTowers.length,
  );

  return {
    ...comparison,
    removedTowers,
    addedTowers,
    substitutionPairs: Array.from(
      { length: pairCount },
      (_, index) => ({
        from: removedTowers[index] ?? null,
        to: addedTowers[index] ?? null,
      }),
    ),
  };
}

function toPlanDto(
  entry: ReturnType<
    typeof buildRecommendationSet
  >["plans"][number],
): PlanDto {
  const plan = entry.plan;
  const normal = plan.normalPlan;
  const anchorTower = getTower(
    plan.anchorTowerId,
  );
  const coreIds = new Set(
    normal.baseline.package
      .selectedTowerIds,
  );
  const relations =
    explainSynergyRelations(
      normal.evidence,
    );
  const { primary: primaryRelations, secondary: secondaryRelations } =
    partitionSynergyRelations(relations);
  const auditByTower = new Map(
    normal.normalPackageEconomics.towerAudits.map(
      (audit) => [audit.towerId, audit],
    ),
  );

  const rolesByTower = new Map<
    string,
    readonly string[]
  >(
    normal.selectedTowerIds.map((towerId) => [
      towerId,
      towerId === plan.anchorTowerId
        ? ["Main DPS"]
        : normal.baseline.package.roles
            .filter((role) =>
              role.candidates.some(
                (candidate) =>
                  candidate.towerId === towerId,
              ),
            )
            .map((role) =>
              displayRoleLabel(
                towerId as TowerId,
                role.role,
              ),
            ),
    ]),
  );

  // Computed before the package so the tower cards and the roadmap
  // derive "what matters most" from the same structure.
  const progression = progressionStages(
    entry.progression,
    rolesByTower,
  );
  const priorityStageByTower = new Map<
    string,
    "EARLY" | "MID" | "LATE"
  >();
  for (const stage of progression) {
    if (
      stage.stage !== "END_GAME" &&
      stage.primaryAction &&
      !priorityStageByTower.has(
        stage.primaryAction.towerId,
      )
    ) {
      priorityStageByTower.set(
        stage.primaryAction.towerId,
        stage.stage,
      );
    }
  }

  const packageTowers: PackageTowerDto[] =
    [...normal.selectedTowerIds]
      .sort((a, b) => {
        if (a === plan.anchorTowerId)
          return -1;
        if (b === plan.anchorTowerId)
          return 1;
        return a.localeCompare(b);
      })
      .map((towerId) => {
        const tower = getTower(towerId);
        const audit =
          auditByTower.get(towerId)!;
        const isCore =
          coreIds.has(towerId);
        const roles = (
          rolesByTower.get(towerId) ?? []
        ).filter(
          (role) => role !== "Main DPS",
        );
        return {
          id: towerId,
          name: tower.name,
          combination: tower.combination,
          recipe: tower.recipe,
          damageElement:
            tower.damageElement,
          level: audit.reachableLevel,
          maxLevel: audit.maxNormalLevel,
          developmentStatus:
            audit.developmentStatus,
          isAnchor:
            towerId ===
            plan.anchorTowerId,
          roles:
            towerId ===
            plan.anchorTowerId
              ? ["Main DPS"]
              : roles,
          minimumFieldCost:
            audit.minimumFieldCost,
          marginalCapital:
            audit.marginalMinimumCapital,
          purpose: purposeFor(
            audit,
            isCore,
          ),
          developmentReason:
            developmentReasonFor(audit),
          synergyTags:
            synergyTagsForTower(
              primaryRelations,
              towerId,
            ),
          identity: towerIdentity(towerId),
          isCore,
          isProgressionPriority:
            priorityStageByTower.has(towerId),
          progressionStage:
            priorityStageByTower.get(
              towerId,
            ) ?? null,
        } satisfies PackageTowerDto;
      });

  const coverageRows: CoverageRowDto[] =
    normal.evidence.coverage.element.map(
      (row) => ({
        defender: row.defender,
        anchorMultiplier:
          row.anchorMultiplier,
        packageAverageMultiplier: Number(
          row.packageAverageMultiplier.toFixed(
            2,
          ),
        ),
        hasMeaningfulDirectCounter:
          row.hasMeaningfulDirectCounter,
        isAnchorWeakness:
          row.anchorMultiplier === 0.5,
        covered:
          row.anchorMultiplier !== 0.5 ||
          row.hasMeaningfulDirectCounter,
      }),
    );

  const anchorTags = new Set<string>();
  for (const relation of primaryRelations) {
    if (
      relation.providerId ===
        plan.anchorTowerId ||
      relation.consumerId ===
        plan.anchorTowerId
    ) {
      anchorTags.add(
        relation.mechanicTag,
      );
    }
  }

  return {
    id: entry.id,
    rank: entry.rank,
    anchor: {
      id: plan.anchorTowerId,
      name: anchorTower.name,
      combination:
        anchorTower.combination,
    },
    allocation: allocationRecord(
      normal.baseline.routeState
        .allocation,
    ),
    keystoneCount:
      normal.baseline.routeState
        .totalKeystones,
    essenceUses: "2 / 2",
    package: packageTowers,
    minimumCapital: {
      normal:
        plan.minimumNormalPackageCapital,
      endgameAdded:
        plan.minimumEndGameOptionCapital,
      complete:
        plan.minimumCompletePlanCapital,
    },
    coverage: {
      rows: coverageRows,
      hasSingleTarget:
        normal.evidence.coverage
          .damageShape
          .hasSingleTargetCapability,
      hasAoe:
        normal.evidence.coverage
          .damageShape
          .hasAoeCapability,
      rangeMin:
        normal.evidence.coverage.range
          .packageMinRange,
      rangeMax:
        normal.evidence.coverage.range
          .packageMaxRange,
      rangeExtensionFromAnchor:
        normal.evidence.coverage.range
          .rangeExtensionFromAnchor,
    },
    synergy: {
      tags: [...anchorTags].sort(),
      relations: primaryRelations,
      secondaryRelations,
      grouped:
        groupSynergyByMechanic(primaryRelations),
    },
    tensions:
      normal.evidence.synergy.tensions.map(
        (tension) => ({
          providerId:
            tension.providerTowerId,
          providerName: getTower(
            tension.providerTowerId as TowerId,
          ).name,
          affectedId:
            tension.affectedTowerId,
          affectedName: getTower(
            tension.affectedTowerId as TowerId,
          ).name,
          condition: tension.condition,
        }),
      ),
    progression,
    endGame: {
      best: endGamePackageDto(
        plan,
        "best",
      ),
      secondBest: endGamePackageDto(
        plan,
        "secondBest",
      ),
    },
    comparisonToRecommended: comparisonDto(
      entry.comparisonToRecommended,
    ),
  };
}

export function buildRecommendationSetDto(
  anchorTowerId: TowerId,
): BuildRecommendationSetDto {
  const set = buildRecommendationSet(
    anchorTowerId,
  );

  return {
    anchorTowerId: set.anchorTowerId,
    engineRecommendedPlanId:
      set.engineRecommendedPlanId,
    plans: set.plans.map(toPlanDto),
  };
}
