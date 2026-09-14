import { describe, expect, it } from "vitest";
import { CURATED_ANCHORS } from "@/lib/domain/anchorPolicy";
import { getTower } from "@/lib/domain/towerCatalog";
import { planToPortableBuild } from "@/components/build-lab/OpenInLive";
import { buildRecommendationSetDto } from "@/lib/engine/buildRecommendationDto";
import { generateMatchPlan } from "@/lib/engine/matchPlan";
import { waveBenchmark } from "@/lib/engine/waveBenchmarks";

/**
 * Doctrine: survival over economy. These run every curated anchor's
 * recommended plan on the traced map, so they are the regression net for the
 * planner as a whole.
 *
 * The survival model is deliberately pessimistic: no buffs, amplifiers,
 * clones, abilities or interest are credited, and 28 of 55 waves carry an
 * ability that is not quantified yet. Under it every recommended package
 * eventually falls short of the 100% damage floor. What the doctrine
 * guarantees is therefore not "never fails" but: the opening is safe, the
 * anchor is fielded on time, and gold is never left idle while a wave in
 * the window is short and a step that lands in time could raise it.
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
      combination: getTower(anchor.towerId).combination,
      matchPlan: generateMatchPlan(planToPortableBuild(plan), {
        mapId: "forest",
      }),
    };
  });

  it("never leaves Waves 1–10 failing for any curated anchor", () => {
    const leaking = plans
      .filter(({ matchPlan }) =>
        matchPlan.phases
          .slice(0, 2)
          .some((phase) => phase.survival.status === "fails"),
      )
      .map(({ anchor }) => anchor);
    expect(leaking).toEqual([]);
  });

  it("fields the anchor on time: a Dual by wave 15, a Trio by wave 25", () => {
    const late = plans.flatMap(({ anchor, combination, matchPlan }) => {
      const deadline = combination === "Dual" ? 2 : 4;
      const fielded = matchPlan.phases[deadline].endTowers.some(
        (tower) => tower.towerId === anchor,
      );
      return fielded ? [] : [anchor];
    });
    expect(late).toEqual([]);
  });

  it("only known-weak anchors fail before wave 21, and none for lack of trying", () => {
    // Measured 2026-09-15 with the pessimistic model above. This set is
    // larger than the one recorded before the survival audit because, until
    // then, any window with an unmodeled ability was skipped by the rescue
    // and never registered as failing. Shrink it as data lands (mono level
    // 2/3 facts confirmed, ability effects quantified, verified persistent
    // buffs credited); never grow it without saying why.
    const allowed = new Set([
      "howitzer",
      "impulse",
      "poison",
      "solar",
      "vapor",
      "disease",
      "flooding",
      "mushroom",
      "quake",
    ]);
    const unexpected = plans.flatMap(({ anchor, matchPlan }) =>
      matchPlan.phases
        .slice(0, 4)
        .filter((phase) => phase.survival.status === "fails")
        .filter(() => !allowed.has(anchor))
        .map((phase) => `${anchor} ${phase.label}`),
    );
    expect(unexpected).toEqual([]);
  });

  it("never banks gold while a wave in the window is short", () => {
    // Gold earned on a window's last wave cannot be spent inside it, so the
    // idle figure excludes that bounty. What is left must be below the
    // cheapest step that would still move a late wave by one percent.
    const idle = plans.flatMap(({ anchor, matchPlan }) =>
      matchPlan.phases.flatMap((phase) => {
        if (phase.endWave == null) return [];
        const short = phase.survival.waves.some(
          (wave) => wave.margin != null && wave.margin < 1,
        );
        if (!short) return [];
        const lastBounty =
          waveBenchmark(phase.endWave, matchPlan.settings.difficulty)
            ?.waveBounty ?? 0;
        const left = phase.economy.phaseEndGold - lastBounty;
        return left > 3_500 ? [`${anchor} ${phase.label} idle ${left}g`] : [];
      }),
    );
    expect(idle).toEqual([]);
  });

  it("surfaces what every window is waiting on or why it cannot be verified", () => {
    const silent = plans.flatMap(({ anchor, matchPlan }) =>
      matchPlan.phases.slice(1, 11).flatMap((phase) => {
        const buys = phase.actions.some(
          (action) => action.affordable && action.cost > 0,
        );
        const waits = phase.actions.some((action) => !action.affordable);
        const explained =
          phase.survival.status !== "unverified" ||
          phase.risks.some((risk) => risk.includes("not quantified"));
        return buys || waits
          ? explained
            ? []
            : [`${anchor} ${phase.label}: unverified without saying why`]
          : [`${anchor} ${phase.label}: nothing bought and nothing waited on`];
      }),
    );
    expect(silent).toEqual([]);
  });
}, 300_000);
