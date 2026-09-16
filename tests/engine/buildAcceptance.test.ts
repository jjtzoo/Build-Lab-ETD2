import { describe, expect, it } from "vitest";
import type { PortableBuild } from "@/lib/domain/portableBuild";
import { CURATED_ANCHORS } from "@/lib/domain/anchorPolicy";
import { evaluateBuildAcceptance } from "@/lib/engine/buildAcceptance";
import { buildRecommendationSetDto } from "@/lib/engine/buildRecommendationDto";
import { planToPortableBuild } from "@/components/build-lab/OpenInLive";

const singleTowerBuild: PortableBuild = {
  schema: "etd2-build/2",
  source: "theorycraft",
  anchorTowerId: "infernal",
  towers: [{ towerId: "infernal", level: 3 }],
  allocation: { Light: 0, Darkness: 3, Water: 0, Fire: 3, Nature: 0, Earth: 0 },
  createdAt: "2026-09-16T00:00:00.000Z",
};

describe("evaluateBuildAcceptance", () => {
  it("rejects a build with no discretionary damage role at all", () => {
    const verdict = evaluateBuildAcceptance(singleTowerBuild);
    expect(verdict.accepted).toBe(false);
    expect(verdict.failures.map((f) => f.kind)).toContain(
      "too-few-damage-towers",
    );
  });

  it("accepts Infernal's own recommended package", () => {
    const set = buildRecommendationSetDto("infernal");
    const plan =
      set.plans.find((p) => p.id === set.engineRecommendedPlanId) ??
      set.plans[0];
    const verdict = evaluateBuildAcceptance(planToPortableBuild(plan!));
    expect(verdict.accepted).toBe(true);
    expect(verdict.failures).toEqual([]);
  });

  // The armor-matchup cycle (each element beats exactly one, loses to
  // exactly one) makes 3+ simultaneously-uncovered weak colors very hard
  // to construct from any real package — even a single-element offense
  // only ever produces 1. This regression test is the actual guarantee
  // that matters: every one of Build Lab's own curated recommendations
  // must clear the bar, not a synthetic worst case.
  it("every curated anchor's own recommended package clears the bar", () => {
    const rejected = CURATED_ANCHORS.flatMap((anchor) => {
      const set = buildRecommendationSetDto(anchor.towerId);
      const plan =
        set.plans.find((p) => p.id === set.engineRecommendedPlanId) ??
        set.plans[0];
      const verdict = evaluateBuildAcceptance(planToPortableBuild(plan!));
      return verdict.accepted
        ? []
        : [
            `${anchor.towerId}: ${verdict.failures.map((f) => f.kind).join(",")}`,
          ];
    });
    expect(rejected).toEqual([]);
  });
});
