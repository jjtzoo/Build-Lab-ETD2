import type {
  ElementMatchupTable,
} from "@/lib/domain/elementMatchups";

import {
  NORMAL_TOWER_COST_SEMANTICS,
  resolveNormalTowerCost,
  type NormalTowerCostSemantics,
} from "@/lib/domain/towerEconomics";

import type {
  TowerId,
} from "@/lib/domain/tower";

import type {
  AnchorPackageEvaluation,
} from "@/lib/engine/anchorPackageEvaluations";

import {
  evaluateSelectedPackageEvidence,
  type CorePackageEvidence,
} from "@/lib/engine/corePackageEvidence";

import type {
  ResolvedTowerContribution,
} from "@/lib/engine/resolvedTowerContribution";

export type NormalTowerDevelopmentStatus =
  | "developed"
  | "underdeveloped"
  | "core-target";

export type SelectedNormalTowerEconomics = {
  towerId: TowerId;
  reachableLevel: number;
  maxNormalLevel: number;
  developmentStatus:
    NormalTowerDevelopmentStatus;
  minimumFieldCost: number;
};

export type NormalTowerEconomicAudit =
  SelectedNormalTowerEconomics & {
    rolePurpose: readonly string[];
    marginalMinimumCapital: number;
    uniqueStrategicEvidenceAdded:
      readonly string[];
    evidenceStrengthened:
      readonly string[];
    uniqueFutureEndpoints:
      readonly string[];
    explicitDevelopmentReasons:
      readonly string[];
    leaveOneOutConsequences:
      readonly string[];
  };

export type NormalPackageEconomics = {
  currency: "gold";
  costSemantics:
    NormalTowerCostSemantics;
  minimumNormalPackageCapital: number;
  selectedTowers:
    readonly SelectedNormalTowerEconomics[];
  towerAudits:
    readonly NormalTowerEconomicAudit[];
  postCoreTowerAudits:
    readonly NormalTowerEconomicAudit[];
};

type EvidenceDelta = {
  added: readonly string[];
  strengthened: readonly string[];
};

function contributionFor(
  evidence: CorePackageEvidence,
  towerId: TowerId,
): ResolvedTowerContribution {
  const contribution =
    evidence.resolvedContributions
      .find((entry) =>
        entry.towerId === towerId,
      );

  if (!contribution) {
    throw new Error(
      `Missing resolved contribution for economic audit: ${towerId}.`,
    );
  }

  return contribution;
}

export function normalTowerDevelopmentStatus(
  contribution:
    ResolvedTowerContribution,
  isCoreTarget: boolean,
): NormalTowerDevelopmentStatus {
  if (isCoreTarget) {
    return "core-target";
  }

  return contribution.reachableLevel ===
    contribution.maxNormalLevel
    ? "developed"
    : "underdeveloped";
}

const capitalMemo = new WeakMap<
  readonly ResolvedTowerContribution[],
  number
>();

export function minimumNormalPackageCapital(
  contributions:
    readonly ResolvedTowerContribution[],
): number {
  const memoized =
    capitalMemo.get(contributions);

  if (memoized !== undefined) {
    return memoized;
  }

  // Each contribution already carries its verified cumulative field
  // cost in `.economics`; sum those directly rather than re-resolving.
  const total = contributions.reduce(
    (sum, contribution) =>
      sum +
      contribution.economics
        .minimumFieldCost,
    0,
  );

  capitalMemo.set(contributions, total);
  return total;
}

function mechanicStrengths(
  evidence: CorePackageEvidence,
): ReadonlyMap<string, number> {
  const strengths =
    new Map<string, number>();

  for (const match of
    evidence.synergy.applicable) {
    if (
      match.contribution !== "full"
    ) {
      continue;
    }

    const key = [
      match.consumerTowerId,
      match.signal,
    ].join(":");

    strengths.set(
      key,
      Math.max(
        strengths.get(key) ?? 0,
        match.effectiveStrength,
      ),
    );
  }

  return strengths;
}

function evidenceDelta(
  without: CorePackageEvidence,
  withTower: CorePackageEvidence,
): EvidenceDelta {
  const added: string[] = [];
  const strengthened: string[] = [];

  for (const afterEntry of
    withTower.coverage.element) {
    const beforeEntry =
      without.coverage.element.find(
        (entry) =>
          entry.defender ===
            afterEntry.defender,
      );

    if (
      afterEntry.anchorMultiplier ===
        0.5 &&
      afterEntry
        .hasMeaningfulDirectCounter &&
      !beforeEntry
        ?.hasMeaningfulDirectCounter
    ) {
      added.push(
        `critical-element-coverage:${afterEntry.defender}`,
      );
    }
  }

  if (
    withTower.coverage.damageShape
      .hasMeaningfulComplementaryShape &&
    !without.coverage.damageShape
      .hasMeaningfulComplementaryShape
  ) {
    added.push(
      "meaningful-damage-shape-complement",
    );
  }

  const beforeRange =
    without.coverage.range
      .meaningfulRangeExtensionFromAnchor;
  const afterRange =
    withTower.coverage.range
      .meaningfulRangeExtensionFromAnchor;

  if (afterRange > beforeRange) {
    (beforeRange === 0
      ? added
      : strengthened
    ).push(
      `meaningful-range-extension:${beforeRange}->${afterRange}`,
    );
  }

  const beforeMechanics =
    mechanicStrengths(without);
  const afterMechanics =
    mechanicStrengths(withTower);

  for (const [key, strength]
    of afterMechanics) {
    const beforeStrength =
      beforeMechanics.get(key) ?? 0;

    if (strength <= beforeStrength) {
      continue;
    }

    (beforeStrength === 0
      ? added
      : strengthened
    ).push(
      `full-synergy:${key}:${beforeStrength}->${strength}`,
    );
  }

  return {
    added: [...new Set(added)].sort(),
    strengthened:
      [...new Set(strengthened)].sort(),
  };
}

function endpointSignatures(
  contribution:
    ResolvedTowerContribution,
): readonly string[] {
  return [
    ...contribution
      .mechanicsAvailableAtLevel
      .provides.map((entry) =>
        `provider:${entry.signal}:${entry.strength}`,
      ),
    ...contribution
      .mechanicsAvailableAtLevel
      .consumes.map((entry) =>
        `consumer:${entry.signal}:${entry.strength}:${entry.saturation}`,
      ),
  ].sort();
}

function uniqueFutureEndpoints(
  towerId: TowerId,
  evidence: CorePackageEvidence,
): readonly string[] {
  const target =
    contributionFor(
      evidence,
      towerId,
    );
  const otherEndpoints =
    new Set(
      evidence.resolvedContributions
        .filter((entry) =>
          entry.towerId !== towerId,
        )
        .flatMap(endpointSignatures),
    );

  return endpointSignatures(target)
    .filter((endpoint) =>
      !otherEndpoints.has(endpoint),
    );
}

function rolePurpose(
  towerId: TowerId,
  evidence: CorePackageEvidence,
  delta: EvidenceDelta,
): readonly string[] {
  const purposes = [
    ...delta.added,
    ...delta.strengthened,
  ];

  if (
    evidence
      .meaningfulOffensiveContributorTowerIds
      .includes(towerId)
  ) {
    purposes.push(
      "meaningful-offense-at-reachable-level",
    );
  }

  return [...new Set(purposes)].sort();
}

function explicitDevelopmentReasons(
  towerId: TowerId,
  evidence: CorePackageEvidence,
  delta: EvidenceDelta,
): readonly string[] {
  const reasons = [
    ...delta.added.filter(
      (entry) =>
        entry.startsWith(
          "critical-element-coverage:",
        ) ||
        entry ===
          "meaningful-damage-shape-complement" ||
        entry.startsWith(
          "full-synergy:",
        ),
    ),
    ...delta.strengthened.filter(
      (entry) =>
        entry.startsWith(
          "full-synergy:",
        ),
    ),
  ];

  if (
    evidence
      .meaningfulOffensiveContributorTowerIds
      .includes(towerId)
  ) {
    reasons.push(
      "factual-offense-is-meaningful-at-current-level",
    );
  }

  return [...new Set(reasons)].sort();
}

export function evaluateNormalPackageEconomics(
  baseline: AnchorPackageEvaluation,
  evidence: CorePackageEvidence,
  matchups: ElementMatchupTable,
): NormalPackageEconomics {
  const coreTowerIds =
    new Set(
      baseline.package
        .selectedTowerIds,
    );
  const reachableLevels =
    new Map(
      baseline.routeState
        .availableTowers.map(
          (entry) => [
            entry.tower.id,
            entry.maxLevel,
          ] as const,
        ),
    );

  const selectedTowers =
    evidence.resolvedContributions
      .map((contribution) => ({
        towerId:
          contribution.towerId,
        reachableLevel:
          contribution.reachableLevel,
        maxNormalLevel:
          contribution.maxNormalLevel,
        developmentStatus:
          normalTowerDevelopmentStatus(
            contribution,
            coreTowerIds.has(
              contribution.towerId,
            ),
          ),
        minimumFieldCost:
          resolveNormalTowerCost(
            contribution.towerId,
            contribution.reachableLevel,
          ).minimumFieldCost,
      }))
      .sort((a, b) =>
        a.towerId.localeCompare(
          b.towerId,
        ),
      );

  const towerAudits =
    selectedTowers
      .map((entry) => {
        if (
          coreTowerIds.has(
            entry.towerId,
          )
        ) {
          const mandatoryPurposes =
            entry.towerId ===
              baseline.package
                .anchorTowerId
              ? [
                  "mandatory-core-role:main-dps",
                ]
              : baseline.package.roles
                  .filter((role) =>
                    role.candidates.some(
                      (candidate) =>
                        candidate.towerId ===
                          entry.towerId,
                    ),
                  )
                  .map((role) =>
                    `mandatory-core-role:${role.role}`,
                  );

          return {
            ...entry,
            rolePurpose:
              mandatoryPurposes,
            marginalMinimumCapital:
              entry.minimumFieldCost,
            uniqueStrategicEvidenceAdded:
              mandatoryPurposes,
            evidenceStrengthened: [],
            uniqueFutureEndpoints:
              uniqueFutureEndpoints(
                entry.towerId,
                evidence,
              ),
            explicitDevelopmentReasons:
              mandatoryPurposes,
            leaveOneOutConsequences: [
              ...mandatoryPurposes.map(
                (value) =>
                  `invalidates:${value}`,
              ),
              `reduces-minimum-capital-by:${entry.minimumFieldCost}`,
            ],
          } satisfies NormalTowerEconomicAudit;
        }

        const withoutTowerIds =
          evidence.selectedTowerIds
            .filter((towerId) =>
              towerId !==
                entry.towerId,
            );
        const without =
          evaluateSelectedPackageEvidence(
            baseline.package
              .anchorTowerId,
            withoutTowerIds,
            matchups,
            reachableLevels,
          );
        const delta =
          evidenceDelta(
            without,
            evidence,
          );
        const endpoints =
          uniqueFutureEndpoints(
            entry.towerId,
            evidence,
          );
        const purposes =
          rolePurpose(
            entry.towerId,
            evidence,
            delta,
          );
        const developmentReasons =
          explicitDevelopmentReasons(
            entry.towerId,
            evidence,
            delta,
          );
        const leaveOneOutConsequences = [
          ...delta.added.map(
            (value) =>
              `loses:${value}`,
          ),
          ...delta.strengthened.map(
            (value) =>
              `weakens:${value}`,
          ),
          `reduces-minimum-capital-by:${entry.minimumFieldCost}`,
        ];

        return {
          ...entry,
          rolePurpose: purposes,
          marginalMinimumCapital:
            entry.minimumFieldCost,
          uniqueStrategicEvidenceAdded:
            delta.added,
          evidenceStrengthened:
            delta.strengthened,
          uniqueFutureEndpoints:
            endpoints,
          explicitDevelopmentReasons:
            developmentReasons,
          leaveOneOutConsequences,
        } satisfies NormalTowerEconomicAudit;
      });

  const postCoreTowerAudits =
    towerAudits.filter((entry) =>
      !coreTowerIds.has(
        entry.towerId,
      ),
    );

  return {
    currency: "gold",
    costSemantics:
      NORMAL_TOWER_COST_SEMANTICS,
    minimumNormalPackageCapital:
      selectedTowers.reduce(
        (total, entry) =>
          total +
          entry.minimumFieldCost,
        0,
      ),
    selectedTowers,
    towerAudits,
    postCoreTowerAudits,
  };
}
