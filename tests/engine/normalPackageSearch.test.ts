import {
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  getTower,
} from "@/lib/domain/towerCatalog";

import {
  evaluateAnchorPackages,
  type AnchorPackageEvaluation,
} from "@/lib/engine/anchorPackageEvaluations";

import {
  buildNormalPackageJustificationGraph,
  searchNormalPackagesForBaseline,
  type NormalPackageJustificationGraph,
  type NormalPackageSearchResult,
} from "@/lib/engine/normalPackageSearch";

type SearchFixture = {
  baseline: AnchorPackageEvaluation;
  graph:
    NormalPackageJustificationGraph;
  results:
    readonly NormalPackageSearchResult[];
};

function finalDevelopedBaselines(
  anchorTowerId: string,
) {
  return evaluateAnchorPackages(
    anchorTowerId,
  ).filter(
    (baseline) =>
      baseline.routeState
        .totalKeystones === 11 &&
      baseline.package
        .coreDeveloped,
  );
}

function fixtureWhere(
  anchorTowerId: string,
  predicate: (
    baseline:
      AnchorPackageEvaluation,
    graph:
      NormalPackageJustificationGraph,
  ) => boolean,
): SearchFixture {
  for (const baseline of
    finalDevelopedBaselines(
      anchorTowerId,
    )) {
    const graph =
      buildNormalPackageJustificationGraph(
        baseline,
      );

    if (!predicate(baseline, graph)) {
      continue;
    }

    return {
      baseline,
      graph,
      results:
        searchNormalPackagesForBaseline(
          baseline,
        ).results,
    };
  }

  throw new Error(
    `Missing Phase 5B fixture for ${anchorTowerId}.`,
  );
}

function selectedQuadCount(
  result: NormalPackageSearchResult,
): number {
  return result.selectedTowerIds
    .filter((towerId) =>
      getTower(towerId)
        .combination === "Quad",
    ).length;
}

let laserPairFixture:
  SearchFixture;
let astralPairFixture:
  SearchFixture;
let laserNarrowFixture:
  SearchFixture;
let iceFixture:
  SearchFixture;
let infernalFixture:
  SearchFixture;

beforeAll(() => {
  // A rich Laser context: enough justified candidates to exercise
  // variable package size, multi-Quad support, and isolation-provider
  // de-duplication. (Trio towers are only candidates here at L2 — an
  // L1 Trio is never a discretionary package addition.)
  laserPairFixture = fixtureWhere(
    "laser",
    (_baseline, graph) => {
      const ids = graph.candidates.map(
        (candidate) => candidate.towerId,
      );

      return (
        graph.candidates.length >= 8 &&
        ids.includes("phantom-zone") &&
        ids.includes("rage")
      );
    },
  );

  // A surviving pair-only interaction: Singularity (Quad) groups for
  // Runic (Trio at L2), and neither tower carries a direct
  // justification on its own.
  astralPairFixture = fixtureWhere(
    "astral",
    (_baseline, graph) => {
      const candidates = new Map(
        graph.candidates.map(
          (candidate) => [
            candidate.towerId,
            candidate,
          ],
        ),
      );

      return graph.pairEdges.some(
        (edge) =>
          edge.providerTowerId ===
            "singularity" &&
          edge.consumerTowerId ===
            "runic" &&
          candidates.get("singularity")
            ?.directJustifications
            .length === 0 &&
          candidates.get("runic")
            ?.directJustifications
            .length === 0,
      );
    },
  );

  laserNarrowFixture = fixtureWhere(
    "laser",
    (baseline) =>
      baseline.routeState
        .availableTowers.length === 11,
  );

  iceFixture = fixtureWhere(
    "ice",
    (_baseline, graph) =>
      graph.candidates.some(
        (candidate) =>
          candidate.towerId ===
            "lightning",
      ),
  );

  infernalFixture = fixtureWhere(
    "infernal",
    (baseline) =>
      baseline.routeState
        .availableTowers.some(
          (entry) =>
            entry.tower.id ===
              "runic" &&
            entry.maxLevel === 1,
        ),
  );
});

describe(
  "Phase 5B need-directed normal package search",
  () => {
    it("excludes irrelevant unlocked towers before package search", () => {
      expect(
        laserPairFixture.graph
          .candidatesBeforeDominance
          .length,
      ).toBeLessThan(
        laserPairFixture.graph
          .unlockedNonCoreTowerCount,
      );
    });

    it("preserves unique future interaction endpoints during dominance", () => {
      expect(
        astralPairFixture.graph
          .removedAsDominatedTowerIds,
      ).not.toContain("singularity");
      expect(
        astralPairFixture.graph
          .removedAsDominatedTowerIds,
      ).not.toContain("runic");
    });

    it("discovers pair-only Singularity and Runic synergy", () => {
      expect(
        astralPairFixture.results.some(
          (result) =>
            result.postCoreTowerIds
              .includes("singularity") &&
            result.postCoreTowerIds
              .includes("runic"),
        ),
      ).toBe(true);
    });

    it("does not let candidate dominance erase Ice and Lightning behavior", () => {
      const lightning =
        iceFixture.graph.candidates
          .find((candidate) =>
            candidate.towerId ===
              "lightning",
          );

      expect(lightning)
        .toBeDefined();
      expect(
        lightning!
          .directJustifications
          .some((atom) =>
            atom.kind ===
              "damage-shape",
          ),
      ).toBe(true);
    });

    it("rejects meaningless underdeveloped Infernal coverage", () => {
      const runic =
        infernalFixture.graph
          .candidatesBeforeDominance
          .find((candidate) =>
            candidate.towerId ===
              "runic",
          );

      expect(
        runic?.directJustifications
          .some((atom) =>
            atom.kind ===
              "element-coverage" ||
            atom.kind ===
              "damage-shape",
          ) ?? false,
      ).toBe(false);
    });

    it("keeps Laser and Phantom Zone discoverable", () => {
      expect(
        laserPairFixture.results.some(
          (result) =>
            result.selectedTowerIds
              .includes(
                "phantom-zone",
              ),
        ),
      ).toBe(true);
    });

    it("allows both four-tower and six-plus-tower packages", () => {
      expect(
        laserPairFixture.results.some(
          (result) =>
            result.selectedTowerIds
              .length === 4,
        ),
      ).toBe(true);
      expect(
        laserPairFixture.results.some(
          (result) =>
            result.selectedTowerIds
              .length >= 6,
        ),
      ).toBe(true);
    });

    it("supports zero, one, and multiple selected Quads when justified", () => {
      const results = [
        ...laserNarrowFixture.results,
        ...laserPairFixture.results,
      ];
      const counts =
        results.map(selectedQuadCount);

      expect(counts).toContain(0);
      expect(counts).toContain(1);
      expect(
        counts.some((count) =>
          count >= 2,
        ),
      ).toBe(true);
    });

    it("does not retain tension-producing package branches", () => {
      for (const result of
        laserPairFixture.results) {
        expect(
          result.evidence.synergy
            .tensions.length,
        ).toBe(
          laserPairFixture.baseline
            .evidence.synergy
            .tensions.length,
        );
      }
    });

    it("does not select redundant isolation providers", () => {
      for (const result of
        laserPairFixture.results) {
        const isolationProviders = [
          "gravity-cannon",
          "phantom-zone",
          "rage",
        ].filter((towerId) =>
          result.postCoreTowerIds
            .includes(towerId),
        );

        expect(
          isolationProviders.length,
        ).toBeLessThanOrEqual(1);
      }
    });

    it("is deterministic", () => {
      const rerun =
        searchNormalPackagesForBaseline(
          laserNarrowFixture
            .baseline,
        ).results;

      expect(
        rerun.map((result) =>
          result.postCoreTowerIds,
        ),
      ).toEqual(
        laserNarrowFixture.results
          .map((result) =>
            result.postCoreTowerIds,
          ),
      );
    });
  },
);
