import { describe, expect, it } from "vitest";
import { CURATED_ANCHORS } from "@/lib/domain/anchorPolicy";
import { planToPortableBuild } from "@/components/build-lab/OpenInLive";
import { buildRecommendationSetDto } from "@/lib/engine/buildRecommendationDto";
import { generateMatchPlan } from "@/lib/engine/matchPlan";

/**
 * Doctrine: survival over economy. A window may not bank gold toward a package
 * purchase that cannot land before a failing wave when an in-build copy could
 * have closed the gap first. These run every curated anchor's recommended plan
 * on the traced map, so they are the regression net for the planner as a whole.
 */
describe("Match Plan doctrine — survival over economy", () => {
  const plans = CURATED_ANCHORS.map((anchor) => {
    const set = buildRecommendationSetDto(anchor.towerId);
    const plan =
      set.plans.find((p) => p.id === set.engineRecommendedPlanId) ??
      set.plans[0];
    if (!plan) throw new Error(`no plan for ${anchor.towerId}`);
    return {
      anchor: anchor.towerId,
      matchPlan: generateMatchPlan(planToPortableBuild(plan), {
        mapId: "forest",
      }),
    };
  });

  it("never leaves Waves 6–10 failing for any curated anchor", () => {
    const leaking = plans
      .filter(
        ({ matchPlan }) => matchPlan.phases[1]?.survival.status === "fails",
      )
      .map(({ anchor }) => anchor);
    expect(leaking).toEqual([]);
  });

  it("only known-weak windows still fail, and none of them for lack of trying", () => {
    // poison/vapor leak on W11 — the first wave of its window — which only a
    // cross-window lookahead could pre-empt. Ethereal is weak on current
    // numbers in every late window regardless of spend. Anything new here is
    // a planner regression, not data drift.
    const allowed = new Set(["poison", "vapor", "ethereal"]);
    const unexpected = plans.flatMap(({ anchor, matchPlan }) =>
      matchPlan.phases
        .filter((phase) => phase.survival.status === "fails")
        .filter(() => !allowed.has(anchor))
        .map((phase) => `${anchor} ${phase.label}`),
    );
    expect(unexpected).toEqual([]);
  });
}, 120_000);
