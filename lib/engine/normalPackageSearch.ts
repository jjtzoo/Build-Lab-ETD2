import type {
  MechanicSignal,
  MechanicStrength,
} from "@/lib/domain/mechanicSignals";

import type {
  TowerId,
} from "@/lib/domain/tower";

import {
  getTowerProfile,
} from "@/lib/domain/towerProfileCatalog";

import type {
  ElementMatchupTable,
} from "@/lib/domain/elementMatchups";

import {
  ELEMENT_MATCHUPS,
} from "@/lib/domain/elementMatchupCatalog";

import type {
  AnchorPackageEvaluation,
} from "@/lib/engine/anchorPackageEvaluations";

import {
  evaluateSelectedPackageEvidence,
  type CorePackageEvidence,
} from "@/lib/engine/corePackageEvidence";

import {
  findDirectMechanicSynergies,
} from "@/lib/engine/mechanicSynergy";

import type {
  MechanicAvailabilityClass,
} from "@/lib/engine/mechanicAvailability";

import type {
  ResolvedTowerContribution,
} from "@/lib/engine/resolvedTowerContribution";

import {
  minimumNormalPackageCapital,
} from "@/lib/engine/normalPackageEconomics";

type JustificationKind =
  | "element-coverage"
  | "damage-shape"
  | "range"
  | "anchor-interaction"
  | "core-consumer"
  | "core-provider";

export type JustificationAtom = {
  key: string;
  kind: JustificationKind;
};

export type NormalPackageCandidate = {
  towerId: TowerId;
  reachableLevel: number;
  directJustifications:
    readonly JustificationAtom[];
  futureEndpointSignature:
    readonly string[];
  meaningfulOffense: boolean;
  baseDps: number;
  range: number;
  minimumFieldCost: number;
  availabilityRank: number;
  tensionDelta: number;
};

export type VerifiedPairEdge = {
  providerTowerId: TowerId;
  consumerTowerId: TowerId;
  signal: MechanicSignal;
  effectiveStrength: MechanicStrength;
};

export type NormalPackageJustificationGraph = {
  unlockedNonCoreTowerCount: number;
  candidatesBeforeDominance:
    readonly NormalPackageCandidate[];
  candidates:
    readonly NormalPackageCandidate[];
  removedAsDominatedTowerIds:
    readonly TowerId[];
  pairEdges:
    readonly VerifiedPairEdge[];
};

export type NormalPackageSearchDiagnostics = {
  contextsSearched: number;
  unlockedNonCoreTowers: number;
  maximumUnlockedNonCoreTowers: number;
  irrelevantTowersFiltered: number;
  candidatesAfterJustificationFiltering: number;
  maximumCandidatesAfterJustificationFiltering:
    number;
  candidatesRemovedByDominance: number;
  verifiedPairEdges: number;
  maximumVerifiedPairEdges: number;
  packagesEvaluated: number;
  cacheHits: number;
  branchesPruned: number;
  maximumRecursionDepth: number;
  maximumFrontierSize: number;
  truncationStatus: false;
};

export type NormalPackageSearchResult = {
  postCoreTowerIds:
    readonly TowerId[];
  selectedTowerIds:
    readonly TowerId[];
  evidence: CorePackageEvidence;
};

type EvidenceCache = Map<
  string,
  CorePackageEvidence
>;

const AVAILABILITY_RANK:
  Readonly<Record<
    MechanicAvailabilityClass,
    number
  >> = {
  unknown: 0,
  "burst-window": 1,
  triggered: 2,
  periodic: 2,
  ramping: 2,
  "effectively-continuous": 3,
};

function canonicalTowerIds(
  towerIds: readonly TowerId[],
): readonly TowerId[] {
  return [...new Set(towerIds)]
    .sort((a, b) =>
      a.localeCompare(b),
    );
}

function packageKey(
  towerIds: readonly TowerId[],
): string {
  return canonicalTowerIds(
    towerIds,
  ).join("|");
}

function reachableLevelsFor(
  baseline: AnchorPackageEvaluation,
): ReadonlyMap<TowerId, number> {
  return new Map(
    baseline.routeState
      .availableTowers
      .map((entry) => [
        entry.tower.id,
        entry.maxLevel,
      ] as const),
  );
}

function evaluateWithCache(
  baseline: AnchorPackageEvaluation,
  selectedTowerIds:
    readonly TowerId[],
  matchups: ElementMatchupTable,
  cache: EvidenceCache,
  diagnostics:
    NormalPackageSearchDiagnostics,
): CorePackageEvidence {
  const canonical =
    canonicalTowerIds(
      selectedTowerIds,
    );

  const key =
    packageKey(canonical);

  const cached =
    cache.get(key);

  if (cached) {
    diagnostics.cacheHits += 1;
    return cached;
  }

  const evidence =
    evaluateSelectedPackageEvidence(
      baseline.package
        .anchorTowerId,
      canonical,
      matchups,
      reachableLevelsFor(
        baseline,
      ),
    );

  cache.set(key, evidence);
  diagnostics.packagesEvaluated += 1;
  return evidence;
}

function applicableKey(
  match: CorePackageEvidence[
    "synergy"
  ]["applicable"][number],
): string {
  return [
    match.providerTowerId,
    match.consumerTowerId,
    match.signal,
    match.contribution,
  ].join(":");
}

function fullMechanicStrength(
  evidence: CorePackageEvidence,
  consumerTowerId: TowerId,
  signal: string,
): number {
  return evidence.synergy
    .applicable
    .filter(
      (match) =>
        match.consumerTowerId ===
          consumerTowerId &&
        match.signal === signal &&
        match.contribution ===
          "full",
    )
    .reduce(
      (best, match) =>
        Math.max(
          best,
          match.effectiveStrength,
        ),
      0,
    );
}

function providerHasConsumer(
  evidence: CorePackageEvidence,
  providerTowerId: TowerId,
  signal: string,
): boolean {
  return evidence.synergy
    .applicable
    .some(
      (match) =>
        match.providerTowerId ===
          providerTowerId &&
        match.signal === signal &&
        match.contribution ===
          "full",
    );
}

function coverageJustifications(
  before: CorePackageEvidence,
  after: CorePackageEvidence,
): JustificationAtom[] {
  const atoms:
    JustificationAtom[] = [];

  for (const afterEntry of
    after.coverage.element) {
    const beforeEntry =
      before.coverage.element.find(
        (entry) =>
          entry.defender ===
          afterEntry.defender,
      );

    if (
      beforeEntry?.anchorMultiplier ===
        0.5 &&
      !beforeEntry
        .hasMeaningfulDirectCounter &&
      afterEntry
        .hasMeaningfulDirectCounter
    ) {
      atoms.push({
        key:
          `element:${afterEntry.defender}`,
        kind: "element-coverage",
      });
    }
  }

  if (
    !before.coverage
      .damageShape
      .hasMeaningfulComplementaryShape &&
    after.coverage
      .damageShape
      .hasMeaningfulComplementaryShape
  ) {
    atoms.push({
      key: "damage-shape",
      kind: "damage-shape",
    });
  }

  if (
    after.coverage.range
      .meaningfulRangeExtensionFromAnchor >
    before.coverage.range
      .meaningfulRangeExtensionFromAnchor
  ) {
    atoms.push({
      key: "range-extension",
      kind: "range",
    });
  }

  return atoms;
}

function mechanicJustifications(
  before: CorePackageEvidence,
  after: CorePackageEvidence,
  candidateTowerId: TowerId,
  coreTowerIds:
    ReadonlySet<TowerId>,
): JustificationAtom[] {
  const atoms:
    JustificationAtom[] = [];

  const beforeMatches =
    new Set(
      before.synergy
        .applicable
        .map(applicableKey),
    );

  for (const match of
    after.synergy.applicable) {
    if (
      match.contribution !== "full" ||
      match.effectiveStrength < 3 ||
      beforeMatches.has(
        applicableKey(match),
      ) ||
      (
        match.providerTowerId !==
          candidateTowerId &&
        match.consumerTowerId !==
          candidateTowerId
      )
    ) {
      continue;
    }

    if (
      match.providerTowerId ===
        before.anchorTowerId ||
      match.consumerTowerId ===
        before.anchorTowerId
    ) {
      if (
        match.providerTowerId ===
          candidateTowerId &&
        fullMechanicStrength(
          before,
          match.consumerTowerId,
          match.signal,
        ) >= match.effectiveStrength
      ) {
        continue;
      }

      atoms.push({
        key:
          `anchor:${match.consumerTowerId}:${match.signal}`,
        kind: "anchor-interaction",
      });
      continue;
    }

    if (
      match.providerTowerId ===
      candidateTowerId
    ) {
      const beforeStrength =
        fullMechanicStrength(
          before,
          match.consumerTowerId,
          match.signal,
        );

      if (
        match.effectiveStrength >
        beforeStrength
      ) {
        atoms.push({
          key:
            `consumer:${match.consumerTowerId}:${match.signal}`,
          kind: "core-consumer",
        });
      }
    } else if (
      coreTowerIds.has(
        match.providerTowerId,
      ) &&
      !providerHasConsumer(
        before,
        match.providerTowerId,
        match.signal,
      ) &&
      after
        .meaningfulOffensiveContributorTowerIds
        .includes(
          candidateTowerId,
        )
    ) {
      atoms.push({
        key:
          `provider:${match.providerTowerId}:${match.signal}`,
        kind: "core-provider",
      });
    }
  }

  return atoms;
}

function marginalJustifications(
  before: CorePackageEvidence,
  after: CorePackageEvidence,
  candidateTowerId: TowerId,
  coreTowerIds:
    ReadonlySet<TowerId>,
): readonly JustificationAtom[] {
  const byKey =
    new Map<string, JustificationAtom>();

  for (const atom of [
    ...coverageJustifications(
      before,
      after,
    ),
    ...mechanicJustifications(
      before,
      after,
      candidateTowerId,
      coreTowerIds,
    ),
  ]) {
    byKey.set(atom.key, atom);
  }

  return [...byKey.values()]
    .sort((a, b) =>
      a.key.localeCompare(b.key),
    );
}

function futureEndpointSignature(
  contribution:
    ResolvedTowerContribution,
): readonly string[] {
  return [
    ...contribution
      .mechanicsAvailableAtLevel
      .provides
      .map((entry) =>
        `p:${entry.signal}:${entry.strength}`,
      ),
    ...contribution
      .mechanicsAvailableAtLevel
      .consumes
      .map((entry) =>
        `c:${entry.signal}:${entry.strength}:${entry.saturation}`,
      ),
    ...contribution
      .supportedAbilityFacts
      .map((fact) =>
        `a:${fact.signal}:${fact.availability.classification}`,
      ),
  ].sort();
}

function candidateAvailabilityRank(
  contribution:
    ResolvedTowerContribution,
): number {
  if (
    contribution
      .supportedAbilityFacts
      .length === 0
  ) {
    return 0;
  }

  return Math.min(
    ...contribution
      .supportedAbilityFacts
      .map((fact) =>
        AVAILABILITY_RANK[
          fact.availability
            .classification
        ],
      ),
  );
}

function setContainsAll(
  superset: ReadonlySet<string>,
  subset: readonly string[],
): boolean {
  return subset.every((value) =>
    superset.has(value),
  );
}

function endpointStrengths(
  endpoints: readonly string[],
): ReadonlyMap<string, number> {
  const result =
    new Map<string, number>();

  for (const endpoint of endpoints) {
    const parts = endpoint.split(":");
    const strengthIndex =
      parts[0] === "p" ? 2 : 2;
    const semanticKey = [
      parts[0],
      parts[1],
      ...(parts[0] === "c"
        ? [parts[3]]
        : []),
    ].join(":");

    result.set(
      semanticKey,
      Number(parts[strengthIndex]),
    );
  }

  return result;
}

function endpointsDominate(
  a: NormalPackageCandidate,
  b: NormalPackageCandidate,
): boolean {
  const aEndpoints =
    endpointStrengths(
      a.futureEndpointSignature,
    );
  const bEndpoints =
    endpointStrengths(
      b.futureEndpointSignature,
    );

  for (const [key, strength]
    of bEndpoints) {
    if (
      (aEndpoints.get(key) ?? 0) <
      strength
    ) {
      return false;
    }
  }

  return true;
}

export function normalPackageCandidateDominates(
  a: NormalPackageCandidate,
  b: NormalPackageCandidate,
): boolean {
  const aAtoms =
    new Set(
      a.directJustifications
        .map((atom) => atom.key),
    );

  if (
    !setContainsAll(
      aAtoms,
      b.directJustifications
        .map((atom) => atom.key),
    ) ||
    !endpointsDominate(a, b) ||
    a.meaningfulOffense <
      b.meaningfulOffense ||
    a.baseDps < b.baseDps ||
    a.range < b.range ||
    a.minimumFieldCost >
      b.minimumFieldCost ||
    a.availabilityRank <
      b.availabilityRank ||
    a.tensionDelta >
      b.tensionDelta
  ) {
    return false;
  }

  return (
    aAtoms.size >
      b.directJustifications.length ||
    a.futureEndpointSignature
      .length >
      b.futureEndpointSignature
        .length ||
    a.baseDps > b.baseDps ||
    a.range > b.range ||
    a.minimumFieldCost <
      b.minimumFieldCost ||
    a.availabilityRank >
      b.availabilityRank ||
    a.tensionDelta <
      b.tensionDelta
  );
}

function pairEdgeKey(
  edge: VerifiedPairEdge,
): string {
  return [
    edge.providerTowerId,
    edge.consumerTowerId,
    edge.signal,
  ].join(":");
}

function discoverPairEdges(
  towerIds: readonly TowerId[],
): readonly VerifiedPairEdge[] {
  const edges =
    new Map<string, VerifiedPairEdge>();

  for (
    let left = 0;
    left < towerIds.length;
    left += 1
  ) {
    for (
      let right = left + 1;
      right < towerIds.length;
      right += 1
    ) {
      const profiles = [
        getTowerProfile(
          towerIds[left],
        ),
        getTowerProfile(
          towerIds[right],
        ),
      ];

      for (const match of
        findDirectMechanicSynergies(
          profiles,
        )) {
        if (
          match.effectiveStrength < 3
        ) {
          continue;
        }

        const edge:
          VerifiedPairEdge = {
          providerTowerId:
            match.providerTowerId,
          consumerTowerId:
            match.consumerTowerId,
          signal:
            match.signal as
              MechanicSignal,
          effectiveStrength:
            match.effectiveStrength,
        };

        edges.set(
          pairEdgeKey(edge),
          edge,
        );
      }
    }
  }

  return [...edges.values()]
    .sort((a, b) =>
      pairEdgeKey(a)
        .localeCompare(
          pairEdgeKey(b),
        ),
    );
}

export function buildNormalPackageJustificationGraph(
  baseline: AnchorPackageEvaluation,
  matchups:
    ElementMatchupTable =
      ELEMENT_MATCHUPS,
): NormalPackageJustificationGraph {
  const diagnostics =
    emptyNormalPackageSearchDiagnostics();
  const cache: EvidenceCache =
    new Map([
      [
        packageKey(
          baseline.package
            .selectedTowerIds,
        ),
        baseline.evidence,
      ],
    ]);

  const selected =
    new Set(
      baseline.package
        .selectedTowerIds,
    );

  const unlocked =
    baseline.routeState
      .availableTowers
      .filter((entry) =>
        !selected.has(
          entry.tower.id,
        ),
      );

  const anchorDamageShape =
    getTowerProfile(
      baseline.routeState.anchorTowerId,
    ).offense?.damageShape ?? null;
  const anchorIsAreaShaped =
    anchorDamageShape === "aoe" ||
    anchorDamageShape === "hybrid";

  /*
   * Doctrine, two exclusions applied before any candidate work:
   *
   * 1. A Trio tower (canonical maxLevel 2) is not worth a discretionary
   *    package slot at L1 — the freed allocation is always better spent
   *    elsewhere. A Trio may only enter as a developed L2 tower.
   *
   * 2. A target-isolation tower (Rage, Gravity Cannon) pulls one creep
   *    out of the pack and speeds it toward the exit. That directly
   *    fights an AoE / hybrid Anchor, whose whole value is hitting the
   *    grouped wave, so it cannot be a discretionary addition for an
   *    area-shaped Anchor. Single-target Anchors — Laser especially,
   *    which loses damage per nearby creep — still get it, and want it.
   *
   * Mandatory-core towers are already in `selected` and reach this
   * function through the core package, not as candidates, so neither
   * exclusion can touch the core.
   */
  const eligible =
    unlocked.filter((entry) => {
      if (
        entry.tower.combination ===
          "Trio" &&
        entry.maxLevel < 2
      ) {
        return false;
      }

      if (
        anchorIsAreaShaped &&
        getTowerProfile(entry.tower.id)
          .mechanics.provides.some(
            (supply) =>
              supply.signal ===
              "target-isolation",
          )
      ) {
        return false;
      }

      return true;
    });

  const rawDescriptors =
    eligible.map((entry) => {
      const after =
        evaluateWithCache(
          baseline,
          [
            ...baseline.package
              .selectedTowerIds,
            entry.tower.id,
          ],
          matchups,
          cache,
          diagnostics,
        );

      const contribution =
        after.resolvedContributions
          .find((candidate) =>
            candidate.towerId ===
            entry.tower.id,
          );

      if (!contribution) {
        throw new Error(
          `Missing resolved candidate contribution: ${entry.tower.id}`,
        );
      }

      return {
        towerId: entry.tower.id,
        reachableLevel:
          entry.maxLevel,
        directJustifications:
          marginalJustifications(
            baseline.evidence,
            after,
            entry.tower.id,
            selected,
          ),
        futureEndpointSignature:
          futureEndpointSignature(
            contribution,
          ),
        meaningfulOffense:
          after
            .meaningfulOffensiveContributorTowerIds
            .includes(
              entry.tower.id,
            ),
        baseDps:
          contribution
            .factualStatsAtLevel
            .baseDps,
        range:
          contribution
            .factualStatsAtLevel
            .range,
        minimumFieldCost:
          contribution.economics
            .minimumFieldCost,
        availabilityRank:
          candidateAvailabilityRank(
            contribution,
          ),
        tensionDelta:
          after.synergy.tensions
            .length -
          baseline.evidence
            .synergy.tensions
            .length,
      } satisfies NormalPackageCandidate;
    });

  const rawPairEdges =
    discoverPairEdges(
      rawDescriptors.map(
        (entry) => entry.towerId,
      ),
    );

  const directlyJustifiedIds =
    new Set(
      rawDescriptors
        .filter((candidate) =>
          candidate
            .directJustifications
            .length > 0,
        )
        .map((candidate) =>
          candidate.towerId,
        ),
    );

  const meaningfulOffenseIds =
    new Set(
      rawDescriptors
        .filter((candidate) =>
          candidate
            .meaningfulOffense,
        )
        .map((candidate) =>
          candidate.towerId,
        ),
    );

  /*
   * A contextual pair extends an already justified candidate, or is a
   * defining pair-only seed whose consumer is a real offensive endpoint.
   * This prevents the existence of a generic buff/slow signal from pulling
   * every underdeveloped unlocked attacker into the graph.
   */
  const usablePairEdges =
    rawPairEdges.filter((edge) =>
      directlyJustifiedIds.has(
        edge.consumerTowerId,
      ) ||
      (
        !directlyJustifiedIds.has(
          edge.providerTowerId,
        ) &&
        !directlyJustifiedIds.has(
          edge.consumerTowerId,
        ) &&
        edge.effectiveStrength === 4 &&
        meaningfulOffenseIds.has(
          edge.consumerTowerId,
        )
      ),
    );

  const incident =
    new Set<TowerId>(
      usablePairEdges.flatMap(
        (edge) => [
          edge.providerTowerId,
          edge.consumerTowerId,
        ],
      ),
    );

  const justified =
    rawDescriptors.filter(
      (candidate) =>
        candidate
          .directJustifications
          .length > 0 ||
        incident.has(
          candidate.towerId,
        ),
    );

  const dominated =
    new Set<TowerId>();

  for (const candidate of justified) {
    for (const alternative of justified) {
      if (
        candidate.towerId ===
          alternative.towerId
      ) {
        continue;
      }

      if (
        normalPackageCandidateDominates(
          alternative,
          candidate,
        )
      ) {
        dominated.add(
          candidate.towerId,
        );
        break;
      }
    }
  }

  const candidates =
    justified
      .filter((candidate) =>
        !dominated.has(
          candidate.towerId,
        ),
      )
      .sort((a, b) =>
        a.towerId.localeCompare(
          b.towerId,
        ),
      );

  const retainedIds =
    new Set(
      candidates.map(
        (candidate) =>
          candidate.towerId,
      ),
    );

  return {
    unlockedNonCoreTowerCount:
      unlocked.length,
    candidatesBeforeDominance:
      justified,
    candidates,
    removedAsDominatedTowerIds:
      [...dominated].sort(),
    pairEdges:
      usablePairEdges.filter(
        (edge) =>
          retainedIds.has(
            edge.providerTowerId,
          ) &&
          retainedIds.has(
            edge.consumerTowerId,
          ),
      ),
  };
}

export function normalPackageContextSignature(
  baseline: AnchorPackageEvaluation,
  evidence: CorePackageEvidence,
): string {
  const anchorId =
    baseline.package
      .anchorTowerId;

  const weakness =
    evidence.coverage.element
      .filter((entry) =>
        entry.anchorMultiplier ===
          0.5,
      )
      .map((entry) =>
        `${entry.defender}:${Number(
          entry.hasMeaningfulDirectCounter,
        )}`,
      );

  const mechanicStrengths =
    new Map<string, number>();

  for (const match of
    evidence.synergy.applicable) {
    if (
      match.contribution !== "full"
    ) {
      continue;
    }

    const key = [
      match.signal,
      Number(
        match.providerTowerId ===
          anchorId ||
        match.consumerTowerId ===
          anchorId,
      ),
    ].join(":");

    mechanicStrengths.set(
      key,
      Math.max(
        mechanicStrengths.get(key) ??
          0,
        match.effectiveStrength,
      ),
    );
  }

  const mechanics =
    [...mechanicStrengths]
      .map(([key, strength]) =>
        `${key}:${strength}`,
      )
      .sort();

  const endpoints = [
    ...new Set(
      evidence.resolvedContributions
        .flatMap((entry) =>
          futureEndpointSignature(
            entry,
          ),
        ),
    ),
  ].sort();

  return JSON.stringify({
    weakness,
    shape:
      evidence.coverage
        .damageShape
        .hasMeaningfulComplementaryShape,
    range:
      evidence.coverage.range
        .meaningfulRangeExtensionFromAnchor,
    mechanics,
    endpoints,
    tensionCount:
      evidence.synergy.tensions
        .length,
    minimumNormalPackageCapital:
      minimumNormalPackageCapital(
        evidence.resolvedContributions,
      ),
  });
}

function compareSearchDecisionVectors(
  a: readonly number[],
  b: readonly number[],
): number {
  for (
    let index = 0;
    index < a.length;
    index += 1
  ) {
    if (a[index] > b[index]) {
      return -1;
    }
    if (a[index] < b[index]) {
      return 1;
    }
  }

  return 0;
}

const searchDecisionVectorMemo =
  new WeakMap<
    AnchorPackageEvaluation,
    WeakMap<
      CorePackageEvidence,
      readonly number[]
    >
  >();

function searchDecisionVector(
  baseline: AnchorPackageEvaluation,
  evidence: CorePackageEvidence,
): readonly number[] {
  let byEvidence =
    searchDecisionVectorMemo.get(
      baseline,
    );

  if (!byEvidence) {
    byEvidence = new WeakMap();
    searchDecisionVectorMemo.set(
      baseline,
      byEvidence,
    );
  }

  const memoized =
    byEvidence.get(evidence);

  if (memoized) {
    return memoized;
  }

  const vector =
    computeSearchDecisionVector(
      baseline,
      evidence,
    );

  byEvidence.set(evidence, vector);
  return vector;
}

function computeSearchDecisionVector(
  baseline: AnchorPackageEvaluation,
  evidence: CorePackageEvidence,
): readonly number[] {
  const anchorId =
    baseline.package
      .anchorTowerId;
  const applicable =
    evidence.synergy.applicable
      .filter((match) =>
        match.contribution !==
          "ignored",
      );
  const anchor =
    applicable.filter((match) =>
      match.providerTowerId ===
        anchorId ||
      match.consumerTowerId ===
        anchorId,
    );
  const full =
    applicable.filter((match) =>
      match.contribution === "full",
    );

  const availabilityFor = (
    providerTowerId: TowerId,
    signal: string,
  ): MechanicAvailabilityClass =>
    evidence.resolvedContributions
      .find((entry) =>
        entry.towerId ===
          providerTowerId,
      )
      ?.supportedAbilityFacts
      .find((fact) =>
        fact.signal === signal,
      )
      ?.availability.classification ??
    "unknown";

  const strengthFor = (
    classes:
      readonly MechanicAvailabilityClass[],
  ) =>
    full
      .filter((match) =>
        classes.includes(
          availabilityFor(
            match.providerTowerId,
            match.signal,
          ),
        ),
      )
      .reduce(
        (total, match) =>
          total +
          match.effectiveStrength,
        0,
      );

  const covered =
    evidence.coverage.element
      .filter((entry) =>
        entry.anchorMultiplier ===
          0.5 &&
        entry
          .hasMeaningfulDirectCounter,
      ).length;
  const remaining =
    evidence.coverage.element
      .filter((entry) =>
        entry.anchorMultiplier ===
          0.5 &&
        !entry
          .hasMeaningfulDirectCounter,
      ).length;

  const dimensions = [
    anchor.some((match) =>
      match.contribution === "full" &&
      match.effectiveStrength === 4,
    ) &&
    !baseline.evidence.synergy
      .applicable.some((match) =>
        (
          match.providerTowerId ===
            anchorId ||
          match.consumerTowerId ===
            anchorId
        ) &&
        match.contribution === "full" &&
        match.effectiveStrength === 4,
      ),
    covered >
      baseline.evidence.coverage
        .element
        .filter((entry) =>
          entry.anchorMultiplier ===
            0.5 &&
          entry
            .hasMeaningfulDirectCounter,
        ).length,
    evidence.coverage.damageShape
      .hasMeaningfulComplementaryShape &&
      !baseline.evidence.coverage
        .damageShape
        .hasMeaningfulComplementaryShape,
    evidence.coverage.range
      .meaningfulRangeExtensionFromAnchor >
      baseline.evidence.coverage
        .range
        .meaningfulRangeExtensionFromAnchor,
  ].filter(Boolean).length;

  return [
    anchor.filter((match) =>
      match.contribution === "full" &&
      match.effectiveStrength === 4,
    ).length,
    dimensions,
    anchor.filter((match) =>
      match.contribution === "full" &&
      match.effectiveStrength >= 3,
    ).length,
    strengthFor([
      "effectively-continuous",
    ]),
    covered,
    evidence.coverage.damageShape
      .hasMeaningfulComplementaryShape
      ? 1
      : 0,
    full.reduce(
      (total, match) =>
        total +
        match.effectiveStrength,
      0,
    ),
    strengthFor([
      "periodic",
      "triggered",
      "burst-window",
      "ramping",
    ]),
    evidence.coverage.range
      .meaningfulRangeExtensionFromAnchor,
    applicable
      .filter((match) =>
        match.contribution ===
          "diminished",
      )
      .reduce(
        (total, match) =>
          total +
          match.effectiveStrength,
        0,
      ),
    strengthFor(["unknown"]),
    -remaining,
    -evidence.synergy.tensions
      .length,
    -evidence.selectedTowerIds
      .length,
  ];
}

function compareSearchStates(
  baseline: AnchorPackageEvaluation,
  a: {
    postCoreTowerIds:
      readonly TowerId[];
    evidence: CorePackageEvidence;
  },
  b: {
    postCoreTowerIds:
      readonly TowerId[];
    evidence: CorePackageEvidence;
  },
): number {
  const aVector =
    searchDecisionVector(
      baseline,
      a.evidence,
    );
  const bVector =
    searchDecisionVector(
      baseline,
      b.evidence,
    );

  const strategicComparison =
    compareSearchDecisionVectors(
      aVector,
      bVector,
    );

  if (strategicComparison !== 0) {
    return strategicComparison;
  }

  return packageKey(
    a.postCoreTowerIds,
  ).localeCompare(
    packageKey(
      b.postCoreTowerIds,
    ),
  );
}

const futurePotentialEndpointsMemo =
  new WeakMap<
    CorePackageEvidence,
    ReadonlySet<string>
  >();

function futurePotentialEndpoints(
  state: {
    postCoreTowerIds:
      readonly TowerId[];
    evidence: CorePackageEvidence;
  },
): ReadonlySet<string> {
  // Pure in (postCoreTowerIds, evidence); the evidence object is
  // interned by the package-evaluation cache and, for a fixed core,
  // determines the post-core set, so memoising by evidence identity is
  // sound and collapses the O(frontier^2) dominance loop cost.
  const memoized =
    futurePotentialEndpointsMemo.get(
      state.evidence,
    );

  if (memoized) {
    return memoized;
  }

  const selected = new Set(
    state.postCoreTowerIds,
  );
  const endpoints = new Set(
    state.evidence.resolvedContributions
      .filter((entry) =>
        selected.has(entry.towerId),
      )
      .flatMap((entry) =>
        futureEndpointSignature(entry),
      ),
  );

  futurePotentialEndpointsMemo.set(
    state.evidence,
    endpoints,
  );
  return endpoints;
}

export function normalPackageContextDominates(
  a: AnchorPackageEvaluation,
  b: AnchorPackageEvaluation,
): boolean {
  const aVector =
    searchDecisionVector(
      a,
      a.evidence,
    );
  const bVector =
    searchDecisionVector(
      b,
      b.evidence,
    );

  const strategicComparison =
    compareSearchDecisionVectors(
      aVector,
      bVector,
    );

  if (strategicComparison === 0) {
    const aCapital =
      minimumNormalPackageCapital(
        a.evidence
          .resolvedContributions,
      );
    const bCapital =
      minimumNormalPackageCapital(
        b.evidence
          .resolvedContributions,
      );

    if (
      aCapital > bCapital ||
      (aCapital === bCapital &&
        packageKey(
          a.package.selectedTowerIds,
        ) >
          packageKey(
            b.package.selectedTowerIds,
          ))
    ) {
      return false;
    }
  } else if (strategicComparison > 0) {
    return false;
  }

  const allEndpoints = (
    evidence: CorePackageEvidence,
  ) =>
    new Set(
      evidence.resolvedContributions
        .flatMap((entry) =>
          futureEndpointSignature(
            entry,
          ),
        ),
    );

  const aPotential =
    allEndpoints(a.evidence);
  const bPotential =
    allEndpoints(b.evidence);

  return [...bPotential]
    .every((endpoint) =>
      aPotential.has(endpoint),
    );
}

function stateDominates(
  baseline: AnchorPackageEvaluation,
  a: {
    postCoreTowerIds:
      readonly TowerId[];
    evidence: CorePackageEvidence;
  },
  b: {
    postCoreTowerIds:
      readonly TowerId[];
    evidence: CorePackageEvidence;
  },
): boolean {
  const aVector =
    searchDecisionVector(
      baseline,
      a.evidence,
    );
  const bVector =
    searchDecisionVector(
      baseline,
      b.evidence,
    );

  const strategicComparison =
    compareSearchDecisionVectors(
      aVector,
      bVector,
    );

  if (strategicComparison === 0) {
    // Break a strategic tie by capital, then deterministically by
    // package key, so exactly one of two otherwise-equal states
    // dominates and the search frontier does not accumulate
    // duplicates.
    const aCapital =
      minimumNormalPackageCapital(
        a.evidence
          .resolvedContributions,
      );
    const bCapital =
      minimumNormalPackageCapital(
        b.evidence
          .resolvedContributions,
      );

    if (
      aCapital > bCapital ||
      (aCapital === bCapital &&
        packageKey(a.postCoreTowerIds) >
          packageKey(
            b.postCoreTowerIds,
          ))
    ) {
      return false;
    }
  } else if (strategicComparison > 0) {
    return false;
  }

  const aPotential =
    futurePotentialEndpoints(a);
  const bPotential =
    futurePotentialEndpoints(b);

  return [...bPotential]
    .every((endpoint) =>
      aPotential.has(endpoint),
    );
}

function candidatePairEdges(
  graph:
    NormalPackageJustificationGraph,
  towerId: TowerId,
  selected:
    ReadonlySet<TowerId>,
): readonly VerifiedPairEdge[] {
  return graph.pairEdges.filter(
    (edge) =>
      (
        edge.providerTowerId ===
          towerId &&
        selected.has(
          edge.consumerTowerId,
        )
      ) ||
      (
        edge.consumerTowerId ===
          towerId &&
        selected.has(
          edge.providerTowerId,
        )
      ),
  );
}

function hasVerifiedPairGain(
  before: CorePackageEvidence,
  after: CorePackageEvidence,
  towerId: TowerId,
  graph:
    NormalPackageJustificationGraph,
): boolean {
  const selectedBefore =
    new Set(
      before.selectedTowerIds,
    );

  return candidatePairEdges(
    graph,
    towerId,
    selectedBefore,
  ).some((edge) => {
    const provider =
      graph.candidates.find(
        (candidate) =>
          candidate.towerId ===
          edge.providerTowerId,
      );
    const consumer =
      graph.candidates.find(
        (candidate) =>
          candidate.towerId ===
          edge.consumerTowerId,
      );
    const pairOnly =
      provider
        ?.directJustifications
        .length === 0 &&
      consumer
        ?.directJustifications
        .length === 0;

    if (
      !pairOnly &&
      towerId !==
        edge.providerTowerId
    ) {
      return false;
    }

    if (
      fullMechanicStrength(
        before,
        edge.consumerTowerId,
        edge.signal,
      ) >= edge.effectiveStrength
    ) {
      return false;
    }

    return after.synergy.applicable
      .some((match) =>
        match.providerTowerId ===
          edge.providerTowerId &&
        match.consumerTowerId ===
          edge.consumerTowerId &&
        match.signal ===
          edge.signal &&
        match.contribution ===
          "full" &&
        match.effectiveStrength >=
          edge.effectiveStrength,
      );
  });
}

function introducesUncompensatedTension(
  before: CorePackageEvidence,
  after: CorePackageEvidence,
  reasons:
    readonly JustificationAtom[],
): boolean {
  if (
    after.synergy.tensions.length <=
    before.synergy.tensions.length
  ) {
    return false;
  }

  return !reasons.some(
    (reason) =>
      reason.kind ===
        "element-coverage" ||
      reason.kind ===
        "damage-shape" ||
      reason.kind ===
        "anchor-interaction",
  );
}

function transitionIsJustified(
  before: CorePackageEvidence,
  after: CorePackageEvidence,
  towerId: TowerId,
  graph:
    NormalPackageJustificationGraph,
  coreTowerIds:
    ReadonlySet<TowerId>,
): boolean {
  const reasons =
    marginalJustifications(
      before,
      after,
      towerId,
      coreTowerIds,
    );

  const pairGain =
    hasVerifiedPairGain(
      before,
      after,
      towerId,
      graph,
    );

  if (
    reasons.length === 0 &&
    !pairGain
  ) {
    return false;
  }

  return !introducesUncompensatedTension(
    before,
    after,
    reasons,
  );
}

function packageIsMinimal(
  baseline: AnchorPackageEvaluation,
  result: NormalPackageSearchResult,
  graph:
    NormalPackageJustificationGraph,
  matchups: ElementMatchupTable,
  cache: EvidenceCache,
  diagnostics:
    NormalPackageSearchDiagnostics,
): boolean {
  const coreTowerIds =
    new Set(
      baseline.package
        .selectedTowerIds,
    );

  for (const towerId of
    result.postCoreTowerIds) {
    const withoutIds =
      result.selectedTowerIds
        .filter((selectedId) =>
          selectedId !== towerId,
        );

    const without =
      evaluateWithCache(
        baseline,
        withoutIds,
        matchups,
        cache,
        diagnostics,
      );

    if (
      !transitionIsJustified(
        without,
        result.evidence,
        towerId,
        graph,
        coreTowerIds,
      )
    ) {
      return false;
    }
  }

  return true;
}

export function emptyNormalPackageSearchDiagnostics():
  NormalPackageSearchDiagnostics {
  return {
    contextsSearched: 0,
    unlockedNonCoreTowers: 0,
    maximumUnlockedNonCoreTowers: 0,
    irrelevantTowersFiltered: 0,
    candidatesAfterJustificationFiltering:
      0,
    maximumCandidatesAfterJustificationFiltering:
      0,
    candidatesRemovedByDominance: 0,
    verifiedPairEdges: 0,
    maximumVerifiedPairEdges: 0,
    packagesEvaluated: 0,
    cacheHits: 0,
    branchesPruned: 0,
    maximumRecursionDepth: 0,
    maximumFrontierSize: 0,
    truncationStatus: false,
  };
}

export function mergeNormalPackageSearchDiagnostics(
  target: NormalPackageSearchDiagnostics,
  source: NormalPackageSearchDiagnostics,
): void {
  target.contextsSearched +=
    source.contextsSearched;
  target.unlockedNonCoreTowers +=
    source.unlockedNonCoreTowers;
  target.maximumUnlockedNonCoreTowers =
    Math.max(
      target.maximumUnlockedNonCoreTowers,
      source.maximumUnlockedNonCoreTowers,
    );
  target.irrelevantTowersFiltered +=
    source.irrelevantTowersFiltered;
  target.candidatesAfterJustificationFiltering +=
    source.candidatesAfterJustificationFiltering;
  target.maximumCandidatesAfterJustificationFiltering =
    Math.max(
      target.maximumCandidatesAfterJustificationFiltering,
      source.maximumCandidatesAfterJustificationFiltering,
    );
  target.candidatesRemovedByDominance +=
    source.candidatesRemovedByDominance;
  target.verifiedPairEdges +=
    source.verifiedPairEdges;
  target.maximumVerifiedPairEdges =
    Math.max(
      target.maximumVerifiedPairEdges,
      source.maximumVerifiedPairEdges,
    );
  target.packagesEvaluated +=
    source.packagesEvaluated;
  target.cacheHits += source.cacheHits;
  target.branchesPruned +=
    source.branchesPruned;
  target.maximumRecursionDepth =
    Math.max(
      target.maximumRecursionDepth,
      source.maximumRecursionDepth,
    );
  target.maximumFrontierSize =
    Math.max(
      target.maximumFrontierSize,
      source.maximumFrontierSize,
    );
}

/**
 * Searches one fixed allocation/core context.
 *
 * Towers enter only through a current justification atom or a verified
 * mechanic edge. Canonical monotone expansion prevents permutation work;
 * package evidence and equivalent future states are cached separately.
 */
export function searchNormalPackagesForBaseline(
  baseline: AnchorPackageEvaluation,
  matchups:
    ElementMatchupTable =
      ELEMENT_MATCHUPS,
): {
  results:
    readonly NormalPackageSearchResult[];
  graph:
    NormalPackageJustificationGraph;
  diagnostics:
    NormalPackageSearchDiagnostics;
} {
  const diagnostics =
    emptyNormalPackageSearchDiagnostics();
  const graph =
    buildNormalPackageJustificationGraph(
      baseline,
      matchups,
    );

  diagnostics.contextsSearched = 1;
  diagnostics.unlockedNonCoreTowers =
    graph.unlockedNonCoreTowerCount;
  diagnostics.maximumUnlockedNonCoreTowers =
    graph.unlockedNonCoreTowerCount;
  diagnostics.irrelevantTowersFiltered =
    graph.unlockedNonCoreTowerCount -
    graph.candidatesBeforeDominance
      .length;
  diagnostics.candidatesAfterJustificationFiltering =
    graph.candidates.length;
  diagnostics.maximumCandidatesAfterJustificationFiltering =
    graph.candidates.length;
  diagnostics.candidatesRemovedByDominance =
    graph.removedAsDominatedTowerIds
      .length;
  diagnostics.verifiedPairEdges =
    graph.pairEdges.length;
  diagnostics.maximumVerifiedPairEdges =
    graph.pairEdges.length;

  const cache: EvidenceCache =
    new Map([
      [
        packageKey(
          baseline.package
            .selectedTowerIds,
        ),
        baseline.evidence,
      ],
    ]);

  type SearchState = {
    postCoreTowerIds:
      readonly TowerId[];
    evidence: CorePackageEvidence;
  };

  type SearchAtom = {
    key: string;
    priority: number;
    repairs:
      readonly (readonly TowerId[])[];
    edge?: VerifiedPairEdge;
  };

  const needPriority:
    Readonly<Record<
      JustificationKind,
      number
    >> = {
    "anchor-interaction": 0,
    "element-coverage": 1,
    "damage-shape": 2,
    range: 3,
    "core-consumer": 4,
    "core-provider": 5,
  };

  const directAtoms =
    new Map<
      string,
      {
        kind: JustificationKind;
        towerIds: TowerId[];
      }
    >();

  for (const candidate of
    graph.candidates) {
    for (const atom of
      candidate.directJustifications) {
      const existing =
        directAtoms.get(atom.key) ?? {
          kind: atom.kind,
          towerIds: [],
        };
      existing.towerIds.push(
        candidate.towerId,
      );
      directAtoms.set(
        atom.key,
        existing,
      );
    }
  }

  const atoms: SearchAtom[] =
    [...directAtoms]
      .map(([key, value]) => ({
        key,
        priority:
          needPriority[value.kind],
        repairs:
          value.towerIds
            .sort()
            .map((towerId) =>
              [towerId] as const,
            ),
      }));

  const candidatesById =
    new Map(
      graph.candidates.map(
        (candidate) => [
          candidate.towerId,
          candidate,
        ] as const,
      ),
    );

  const contextualPairRepairs =
    new Map<
      MechanicSignal,
      (readonly TowerId[])[]
    >();

  for (const edge of graph.pairEdges) {
    const consumer =
      candidatesById.get(
        edge.consumerTowerId,
      );

    if (
      consumer &&
      consumer.directJustifications
        .length > 0
    ) {
      const repairs =
        contextualPairRepairs.get(
          edge.signal,
        ) ?? [];
      repairs.push([
          edge.providerTowerId,
          edge.consumerTowerId,
        ]);
      contextualPairRepairs.set(
        edge.signal,
        repairs,
      );
    }
  }

  for (const [signal, repairs]
    of contextualPairRepairs) {
    atoms.push({
      key: `pair:${signal}`,
      priority: 6,
      repairs,
    });
  }

  const pairOnlyEdges =
    graph.pairEdges.filter(
      (edge) =>
        candidatesById.get(
          edge.providerTowerId,
        )?.directJustifications
          .length === 0 &&
        candidatesById.get(
          edge.consumerTowerId,
        )?.directJustifications
          .length === 0,
    );

  if (pairOnlyEdges.length > 0) {
    atoms.push({
      key: "pair-only-defining",
      priority: 7,
      repairs:
        pairOnlyEdges.map((edge) => [
          edge.providerTowerId,
          edge.consumerTowerId,
        ]),
    });
  }

  atoms.sort((a, b) =>
    a.priority - b.priority ||
    a.key.localeCompare(b.key),
  );

  let frontier: SearchState[] = [{
    postCoreTowerIds: [],
    evidence: baseline.evidence,
  }];

  for (const atom of atoms) {
    const nextByPackage =
      new Map<string, SearchState>();

    for (const state of frontier) {
      nextByPackage.set(
        packageKey(
          state.postCoreTowerIds,
        ),
        state,
      );

      const selected =
        new Set(
          state.postCoreTowerIds,
        );

      for (const repair of
        atom.repairs) {
        if (
          repair.every((towerId) =>
            selected.has(towerId),
          )
        ) {
          continue;
        }

        /*
         * A contextual pair supports a consumer that already entered for
         * an earlier core need. Pair-only seeds are the explicit exception.
         */
        if (
          atom.priority === 6 &&
          !selected.has(
            repair[1],
          )
        ) {
          diagnostics.branchesPruned += 1;
          continue;
        }

        const childPostCore =
          canonicalTowerIds([
            ...state.postCoreTowerIds,
            ...repair,
          ]);
        const childSelected =
          canonicalTowerIds([
            ...baseline.package
              .selectedTowerIds,
            ...childPostCore,
          ]);
        const childEvidence =
          evaluateWithCache(
            baseline,
            childSelected,
            matchups,
            cache,
            diagnostics,
          );

        if (
          childEvidence.synergy
            .tensions.length >
          state.evidence.synergy
            .tensions.length
        ) {
          diagnostics.branchesPruned += 1;
          continue;
        }

        if (atom.priority <= 5) {
          const candidateId =
            repair[0];
          const reasons =
            marginalJustifications(
              state.evidence,
              childEvidence,
              candidateId,
              new Set(
                baseline.package
                  .selectedTowerIds,
              ),
            );

          if (
            !reasons.some(
              (reason) =>
                reason.key === atom.key,
            )
          ) {
            diagnostics.branchesPruned += 1;
            continue;
          }
        } else {
          const edgeApplies =
            graph.pairEdges.some(
              (edge) =>
                repair.includes(
                  edge.providerTowerId,
                ) &&
                repair.includes(
                  edge.consumerTowerId,
                ) &&
                childEvidence.synergy
                  .applicable
                  .some((match) =>
                    match.providerTowerId ===
                      edge.providerTowerId &&
                    match.consumerTowerId ===
                      edge.consumerTowerId &&
                    match.signal ===
                      edge.signal &&
                    match.contribution ===
                      "full",
                  ),
            );

          if (!edgeApplies) {
            diagnostics.branchesPruned += 1;
            continue;
          }
        }

        nextByPackage.set(
          packageKey(childPostCore),
          {
            postCoreTowerIds:
              childPostCore,
            evidence: childEvidence,
          },
        );
      }
    }

    const ordered =
      [...nextByPackage.values()]
        .sort((a, b) =>
          compareSearchStates(
            baseline,
            a,
            b,
          ),
        );
    const nonDominated:
      SearchState[] = [];

    for (const state of ordered) {
      if (
        nonDominated.some(
          (existing) =>
            stateDominates(
              baseline,
              existing,
              state,
            ),
        )
      ) {
        diagnostics.branchesPruned += 1;
        continue;
      }

      for (
        let index =
          nonDominated.length - 1;
        index >= 0;
        index -= 1
      ) {
        if (
          stateDominates(
            baseline,
            state,
            nonDominated[index],
          )
        ) {
          nonDominated.splice(
            index,
            1,
          );
          diagnostics.branchesPruned += 1;
        }
      }

      nonDominated.push(state);
    }

    frontier = nonDominated;
    diagnostics.maximumFrontierSize =
      Math.max(
        diagnostics
          .maximumFrontierSize,
        frontier.length,
      );
    diagnostics.maximumRecursionDepth =
      Math.max(
        diagnostics
          .maximumRecursionDepth,
        ...frontier.map(
          (state) =>
            state.postCoreTowerIds
              .length,
        ),
      );
  }

  const results = [{
    postCoreTowerIds:
      [] as readonly TowerId[],
    selectedTowerIds:
      canonicalTowerIds(
        baseline.package
          .selectedTowerIds,
      ),
    evidence: baseline.evidence,
  }, ...frontier.map(
    (state) => ({
      postCoreTowerIds:
        state.postCoreTowerIds,
      selectedTowerIds:
        canonicalTowerIds([
          ...baseline.package
            .selectedTowerIds,
          ...state.postCoreTowerIds,
        ]),
      evidence: state.evidence,
    }),
  )];

  const minimized =
    new Map<
      string,
      NormalPackageSearchResult
    >();

  for (const result of results) {
    let current = result;
    let changed = true;

    while (changed) {
      changed = false;

      for (const towerId of [
        ...current.postCoreTowerIds,
      ].reverse()) {
        const withoutPostCore =
          current.postCoreTowerIds
            .filter((selectedId) =>
              selectedId !== towerId,
            );
        const withoutSelected =
          canonicalTowerIds([
            ...baseline.package
              .selectedTowerIds,
            ...withoutPostCore,
          ]);
        const withoutEvidence =
          evaluateWithCache(
            baseline,
            withoutSelected,
            matchups,
            cache,
            diagnostics,
          );

        if (
          transitionIsJustified(
            withoutEvidence,
            current.evidence,
            towerId,
            graph,
            new Set(
              baseline.package
                .selectedTowerIds,
            ),
          )
        ) {
          continue;
        }

        current = {
          postCoreTowerIds:
            withoutPostCore,
          selectedTowerIds:
            withoutSelected,
          evidence: withoutEvidence,
        };
        diagnostics.branchesPruned += 1;
        changed = true;
        break;
      }
    }

    minimized.set(
      packageKey(
        current.postCoreTowerIds,
      ),
      current,
    );
  }

  const minimal =
    [...minimized.values()].filter((result) =>
      packageIsMinimal(
        baseline,
        result,
        graph,
        matchups,
        cache,
        diagnostics,
      ),
    );

  return {
    results: minimal,
    graph,
    diagnostics,
  };
}
