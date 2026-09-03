import { describe, expect, it } from "vitest";

import {
  VALIDATION_CORPUS,
  type ValidationScenario,
} from "@/lib/validation-corpus";
import { createBuildState } from "@/lib/engine/build-state";
import { rankLegalCandidates } from "@/lib/engine/candidate-ranking";
import { rankFuturePaths } from "@/lib/engine/future-path";
import { interpretBuild } from "@/lib/engine/build-interpreter";
import { getLegalNextCandidates } from "@/lib/engine/legal-candidates";
import type { RankedCandidate } from "@/lib/types";

const REQUIRED_ANCHOR_TOWERS = [
  "Plague",
  "Rage",
  "Tsunami",
  "Nuclear",
  "Gravity Cannon",
  "Life Altar",
  "Phantom Zone",
  "Tesla Tree",
  "Doom",
  "Singularity",
  "Archdruid",
  "Shredder",
  "Crystal Spire",
  "Obelisk",
  "Railgun",
] as const;

function candidateFor(
  scenario: ValidationScenario,
  candidates: readonly RankedCandidate[],
  towerName: string,
): RankedCandidate {
  const candidate = candidates.find((item) => item.candidate.towerName === towerName);
  if (!candidate) {
    throw new Error(`${towerName} was not a legal ranked candidate in ${scenario.id}.`);
  }
  return candidate;
}

describe("MVP validation corpus", () => {
  it("covers every required MVP anchor tower with real catalog state", () => {
    const referencedTowers = new Set(
      VALIDATION_CORPUS.flatMap((scenario) => [
        ...scenario.state.selectedTowers.map((tower) => tower.towerName),
        ...(scenario.expectedComponents?.map((expectation) => expectation.candidate) ?? []),
      ]),
    );

    for (const tower of REQUIRED_ANCHOR_TOWERS) {
      expect(referencedTowers).toContain(tower);
    }
  });

  it.each(VALIDATION_CORPUS)("keeps $id reproducible and legal", (scenario) => {
    const build = createBuildState(scenario.state);
    const interpretation = interpretBuild(build);
    const ranking = rankLegalCandidates(build, scenario.intent);
    const legalNames = new Set(getLegalNextCandidates(build).map((candidate) => candidate.towerName));
    if ([
      "dot-sustained",
      "amplification-support",
      "control-package",
      "rage-laser-synergy",
      "windstorm-laser-anti-synergy",
      "near-slot-capacity",
      "intent-aligned-dot",
      "intent-conflicting-boss",
    ].includes(scenario.id)) {
      console.info(JSON.stringify({
        id: scenario.id,
        top: ranking.topRecommendation?.candidate.towerName ?? null,
        topComponents: ranking.topRecommendation?.components.map((component) => (
          `${component.component}:${component.key}:${component.contribution}:${component.confidence}`
        )),
        profiles: interpretation.strategicProfiles.map((profile) => profile.key),
        vulnerabilities: interpretation.vulnerabilities.map((vulnerability) => vulnerability.capability),
        intentAlignment: ranking.intent?.alignment ?? null,
      }));
    }

    expect(build.selectedTowers).toHaveLength(scenario.state.selectedTowers.length);
    expect(ranking.rankedCandidates.every((candidate) => (
      legalNames.has(candidate.candidate.towerName)
    ))).toBe(true);
    expect(ranking.rankedCandidates.map((candidate) => candidate.rank)).toEqual(
      ranking.rankedCandidates.map((_, index) => index + 1),
    );
    expect(ranking.topRecommendation?.candidate.towerName ?? null)
      .toBe(scenario.expectedImmediateTop);

    for (const expectedProfile of scenario.expectedProfiles ?? []) {
      expect(interpretation.strategicProfiles.map((profile) => profile.key)).toContain(expectedProfile);
    }
    for (const expectedVulnerability of scenario.expectedVulnerabilities ?? []) {
      expect(interpretation.vulnerabilities.map((vulnerability) => vulnerability.capability))
        .toContain(expectedVulnerability);
    }
    for (const expectation of scenario.expectedComponents ?? []) {
      const candidate = candidateFor(scenario, ranking.rankedCandidates, expectation.candidate);
      expect(candidate.components).toEqual(expect.arrayContaining([
        expect.objectContaining({ component: expectation.component, key: expectation.key }),
      ]));
    }

    if (scenario.intent) {
      expect(ranking.intent).toBeDefined();
    }
    if (scenario.expectedIntentAlignment) {
      expect(ranking.intent?.alignment).toBe(scenario.expectedIntentAlignment);
    }
    if (scenario.lookahead) {
      const paths = rankFuturePaths(build, scenario.intent);
      expect(paths.paths.every((path) => path.first.rank > 0)).toBe(true);
      expect(paths.bestPath?.first.candidate.towerName ?? null).toBe(
        paths.comparison.bestPathFirstCandidate,
      );
      if (scenario.expectedTwoStepPath) {
        expect(paths.bestPath?.first.candidate.towerName ?? null)
          .toBe(scenario.expectedTwoStepPath.first);
        expect(paths.bestPath?.second?.candidate.towerName ?? null)
          .toBe(scenario.expectedTwoStepPath.second);
      }
    }
  });

  it("represents final-slot paths as explicitly incomplete", () => {
    const scenario = VALIDATION_CORPUS.find((item) => item.id === "near-slot-capacity");
    if (!scenario) throw new Error("Missing the near-slot-capacity validation scenario.");
    const paths = rankFuturePaths(createBuildState(scenario.state));

    expect(paths.paths).not.toHaveLength(0);
    expect(paths.paths.every((path) => path.continuationStatus === "unavailable")).toBe(true);
    expect(paths.paths.every((path) => path.second === null)).toBe(true);
  });
});
