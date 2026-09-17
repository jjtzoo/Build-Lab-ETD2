import { describe, expect, it } from "vitest";
import type { PlannedTowerState } from "@/lib/domain/matchPlan";
import { CURATED_ANCHORS } from "@/lib/domain/anchorPolicy";
import { planToPortableBuild } from "@/components/build-lab/OpenInLive";
import { getMap } from "@/lib/domain/mapCatalog";
import { buildRecommendationSetDto } from "@/lib/engine/buildRecommendationDto";
import { generateMatchPlan } from "@/lib/engine/matchPlan";
import { resolveLiveTowerCost } from "@/lib/engine/liveGame";
import { evaluatePhaseSurvival } from "@/lib/engine/matchPlanSurvival";
import { waveBenchmark } from "@/lib/engine/waveBenchmarks";

/**
 * Regression net for the rescue-valuation fix (2026-09-17), and its
 * follow-up (2026-09-18) after an independent audit found the first fix's
 * own metric could still be gamed:
 *
 * 2026-09-17: the rescue cascade in matchPlan.ts ranked candidates by
 * `lift / cost`, where `lift` was `currentShortfall - nextShortfall` and
 * `verifiedShortfall` floors every wave's term at zero. Once a candidate
 * closed a window's deficit, any further margin it left on the table was
 * invisible, so a cheap fresh copy that barely cleared a wave always beat
 * an upgrade that cleared the same wave with real headroom to spare —
 * "purgatory" between copying and upgrading, reported live by the owner.
 * Fixed by summing every verified wave's raw margin instead of clipping it.
 *
 * 2026-09-18: that raw sum was itself wrong — it credited a candidate for
 * *every* wave in the window, including ones already comfortably clear
 * before it was added. Wave HP compounds ~1.157x/wave, so the same
 * absolute damage buys a far bigger margin swing on a window's easiest
 * wave than on its hardest, letting a tower that happens to overkill an
 * easy, favorably-matched wave outrank one that actually helps the wave in
 * trouble. Fixed by making the metric deficit-relevant: credit only
 * accrues on a confirmed deficit wave (or, when nothing is
 * confirmed-failing, the window's own weakest wave, verified or not — an
 * unverified wave's margin is still the only number available for it, so a
 * thin one must not be waved through as safe). The same audit found the
 * package queue's own rescue/repair passes never fire once nothing is
 * failing, so a comfortably-passing window could bank unlimited surplus
 * gold once its finite queue ran dry — fixed with a surplus-spend pass
 * using the same candidate machinery and the same deficit-relevant metric,
 * spending down to the same window reserve the rest of the engine uses.
 *
 * The survival combat model in matchPlanSurvival.ts is untouched throughout
 * (its non-stacking redundancy rules were already correct — see the first
 * two tests below). These tests exercise the same production
 * `evaluatePhaseSurvival` function the engine itself calls, replicating its
 * formulas exactly, so they fail if any of them regresses.
 */

const map = getMap("forest");
const cells = map.buildableCells;

function tower(
  towerId: string,
  level: number,
  cell: (typeof cells)[number],
  copyId: string,
  effect: PlannedTowerState["effect"],
): PlannedTowerState {
  return {
    copyId,
    towerId,
    towerName: towerId,
    level,
    quantity: 1,
    purpose: "test",
    roles: effect === "hybrid" || effect === "global-buff" ? ["buff"] : ["main-dps"],
    status: "permanent",
    effect,
    globalBuff: effect === "hybrid" || effect === "global-buff",
    directHitDebuff: false,
    cell,
    cellLabel: null,
    campId: null,
  };
}

const base = {
  map,
  mode: "standard" as const,
  difficulty: "veryHard" as const,
  startWave: 20,
  endWave: 20,
};

function modeledDamage(towers: PlannedTowerState[]): number {
  return evaluatePhaseSurvival({ ...base, towers }).waves[0]!.modeledDamage!;
}

describe("support redundancy — preserved combat-model semantics", () => {
  // Two Howitzers far enough apart (>20 cells; Blacksmith's own aura is
  // ~7.8 cells at map.rangeUnitsPerCell) that a Blacksmith next to one
  // cannot reach the other — two genuinely separate camps.
  const howitzerA = tower("howitzer", 2, cells[0]!, "h-a", "damage");
  const howitzerB = tower("howitzer", 2, cells[106]!, "h-b", "damage");
  // Both within Blacksmith's own aura of howitzerA.
  const blacksmithA = tower("blacksmith", 1, cells[1]!, "bs-a", "hybrid");
  const blacksmithA2 = tower("blacksmith", 1, cells[3]!, "bs-a2", "hybrid");
  // Within Blacksmith's aura of howitzerB only.
  const blacksmithB = tower("blacksmith", 1, cells[105]!, "bs-b", "hybrid");

  it("a second buff copy over an already-buffed group adds only its own damage, never a second buff", () => {
    const withOne = modeledDamage([howitzerA, howitzerB, blacksmithA]);
    const withRedundant = modeledDamage([
      howitzerA,
      howitzerB,
      blacksmithA,
      blacksmithA2,
    ]);
    // Blacksmith is itself a "hybrid" (it deals real damage as well as
    // buffing), so a redundant second copy still adds *something* — but it
    // must be exactly its own solo damage, because the attack-damage-buff
    // signal it also carries does not stack (matchPlanSurvival.ts takes the
    // max across providers, never the sum) and a buff provider can never be
    // the *target* of another buff.
    const secondCopyAlone = modeledDamage([blacksmithA2]);
    expect(withRedundant - withOne).toBeCloseTo(secondCopyAlone, 6);
  });

  it("a second buff copy over a genuinely separate, unbuffed group adds real value beyond its own damage", () => {
    const withOne = modeledDamage([howitzerA, howitzerB, blacksmithA]);
    const withSeparate = modeledDamage([
      howitzerA,
      howitzerB,
      blacksmithA,
      blacksmithB,
    ]);
    const secondCopyAlone = modeledDamage([blacksmithB]);
    // Unlike the redundant case above, this delta must exceed the new
    // copy's own solo damage: the rest is the real attack-damage buff it
    // now applies to howitzerB, which nothing else was covering.
    expect(withSeparate - withOne).toBeGreaterThan(secondCopyAlone);
  });
});

describe("rescue ranking — headroom beats clipped shortfall", () => {
  // Real production numbers from evaluatePhaseSurvival + resolveLiveTowerCost
  // on Very Hard, forest, standard mode, wave 16 — chosen because a single
  // Howitzer 1 fails it while both a fresh second copy and an in-place
  // upgrade to Howitzer 2 clear it, with very different headroom.
  const base = {
    map,
    mode: "standard" as const,
    difficulty: "veryHard" as const,
    startWave: 16,
    endWave: 16,
  };
  const howitzerL1 = tower("howitzer", 1, cells[0]!, "h-1", "damage");
  const howitzerL1Copy = tower("howitzer", 1, cells[1]!, "h-2", "damage");
  const howitzerL2 = tower("howitzer", 2, cells[0]!, "h-1", "damage");

  const costFreshCopy = resolveLiveTowerCost("howitzer", 1);
  const costUpgrade =
    resolveLiveTowerCost("howitzer", 2) - resolveLiveTowerCost("howitzer", 1);

  /** matchPlan.ts's verifiedShortfall, replicated for a single wave. */
  const shortfall = (margin: number) => Math.max(0, 1 - margin);

  it("sets up a real deficit where a fresh copy is cheaper than the upgrade", () => {
    // Sanity check on the scenario itself, so the tests below fail loudly
    // (not silently pass on a vacuous setup) if the combat model or the
    // tower's price curve ever changes.
    expect(costFreshCopy).toBeLessThan(costUpgrade);
    const baseline = evaluatePhaseSurvival({
      ...base,
      towers: [howitzerL1],
    }).waves[0]!;
    expect(baseline.status).not.toBe("unverified");
    expect(baseline.margin ?? 0).toBeLessThan(1);
  });

  it("the old clipped-shortfall metric could not tell the copy and the upgrade apart, so cost alone picked the cheaper copy", () => {
    const baseline = evaluatePhaseSurvival({
      ...base,
      towers: [howitzerL1],
    }).waves[0]!;
    const withCopy = evaluatePhaseSurvival({
      ...base,
      towers: [howitzerL1, howitzerL1Copy],
    }).waves[0]!;
    const withUpgrade = evaluatePhaseSurvival({
      ...base,
      towers: [howitzerL2],
    }).waves[0]!;
    // Both candidates clear the wave...
    expect(withCopy.margin ?? 0).toBeGreaterThanOrEqual(1);
    expect(withUpgrade.margin ?? 0).toBeGreaterThanOrEqual(1);
    const currentShortfall = shortfall(baseline.margin ?? 0);
    const oldLiftCopy = currentShortfall - shortfall(withCopy.margin ?? 0);
    const oldLiftUpgrade = currentShortfall - shortfall(withUpgrade.margin ?? 0);
    // ...so under the old metric their "lift" reads identically...
    expect(oldLiftCopy).toBeCloseTo(oldLiftUpgrade, 6);
    // ...which made the cheaper fresh copy win on efficiency alone, even
    // though the upgrade leaves far more real headroom (asserted next).
    const oldEfficiencyCopy = oldLiftCopy / costFreshCopy;
    const oldEfficiencyUpgrade = oldLiftUpgrade / costUpgrade;
    expect(oldEfficiencyCopy).toBeGreaterThan(oldEfficiencyUpgrade);
  });

  it("the new uncapped margin-sum metric prefers the upgrade once its real headroom is counted", () => {
    const baseline = evaluatePhaseSurvival({
      ...base,
      towers: [howitzerL1],
    }).waves[0]!;
    const withCopy = evaluatePhaseSurvival({
      ...base,
      towers: [howitzerL1, howitzerL1Copy],
    }).waves[0]!;
    const withUpgrade = evaluatePhaseSurvival({
      ...base,
      towers: [howitzerL2],
    }).waves[0]!;
    // marginSum's per-candidate delta, uncapped at 1.0 unlike shortfall.
    const headroomCopy = (withCopy.margin ?? 0) - (baseline.margin ?? 0);
    const headroomUpgrade = (withUpgrade.margin ?? 0) - (baseline.margin ?? 0);
    expect(headroomUpgrade).toBeGreaterThan(headroomCopy);
    const newEfficiencyCopy = headroomCopy / costFreshCopy;
    const newEfficiencyUpgrade = headroomUpgrade / costUpgrade;
    // This is the flip: the pricier upgrade now wins on efficiency because
    // it leaves enough extra headroom to outweigh its extra cost — the
    // exact ordering matchPlan.ts's rescue cascade now uses.
    expect(newEfficiencyUpgrade).toBeGreaterThan(newEfficiencyCopy);
  });
});

describe("rescue ranking — deficit relevance across a real multi-wave window", () => {
  // Waves 16-21 on Very Hard, forest, standard mode — a real 6-wave rescue
  // window (5 phase waves + 1 lookahead, matchPlan.ts's own default). HP
  // compounds across it (wave 18's effective HP is ~2.9x wave 17's), and
  // the six waves carry five different elements, so a real matchup mismatch
  // between the window's easiest and hardest wave is already present in
  // the benchmark data — nothing here is contrived beyond tower placement.
  const base = {
    map,
    mode: "standard" as const,
    difficulty: "veryHard" as const,
    startWave: 16,
    endWave: 21,
  };
  // A single Muck 1 at this cell clears every wave here except 18 (Nature,
  // the window's own hardest by effective HP) — a real, confirmed deficit
  // ("fails", not "unverified"), not a contrived one.
  const anchor = tower("muck", 1, cells[80]!, "anchor", "damage");
  const baseline = evaluatePhaseSurvival({ ...base, towers: [anchor] });
  const deficitWave = baseline.waves[2]!;

  it("sets up one confirmed deficit wave with easier, differently-matched waves around it", () => {
    expect(deficitWave.wave).toBe(18);
    expect(deficitWave.status).toBe("fails");
    expect(deficitWave.margin ?? 0).toBeLessThan(1);
    // Wave 16 (Fire) is both verified and comfortably clear already — the
    // uncapped-but-undifferentiated 2026-09-17 metric would count it.
    expect(baseline.waves[0]!.status).toBe("survives");
    expect(baseline.waves[0]!.margin ?? 0).toBeGreaterThan(1);
  });

  it("an overkill copy on an already-safe, favorably-matched wave cannot beat a copy that targets the real deficit", () => {
    // Water is strong (2x) against wave 16's Fire and neutral against wave
    // 18's Nature — it overkills the wave that was never a problem. Fire is
    // neutral against its own wave 16 and strong (2x) against wave 18 — it
    // is the targeted fix. Same tower tier, same cost, so cost cannot be
    // the deciding factor either way.
    const overkill = tower("mono-water", 1, cells[50]!, "overkill", "damage");
    const targeted = tower("mono-fire", 1, cells[50]!, "targeted", "damage");
    expect(resolveLiveTowerCost("mono-water", 1)).toBe(
      resolveLiveTowerCost("mono-fire", 1),
    );
    const withOverkill = evaluatePhaseSurvival({
      ...base,
      towers: [anchor, overkill],
    });
    const withTargeted = evaluatePhaseSurvival({
      ...base,
      towers: [anchor, targeted],
    });
    // The old, already-fixed-once metric — sum every verified wave's raw
    // margin with no regard for whether that wave ever needed help — is
    // reproduced here from the two full survival results to prove it really
    // would have picked the wrong tower, not just that the new metric picks
    // the right one.
    const oldMarginSum = (result: typeof baseline) =>
      result.waves.reduce(
        (sum, wave) =>
          wave.status === "unverified" ? sum : sum + (wave.margin ?? 0),
        0,
      );
    const oldLiftOverkill = oldMarginSum(withOverkill) - oldMarginSum(baseline);
    const oldLiftTargeted = oldMarginSum(withTargeted) - oldMarginSum(baseline);
    expect(oldLiftOverkill).toBeGreaterThan(oldLiftTargeted);

    // The current, deficit-relevant metric: credit only the wave that was
    // actually confirmed failing.
    const relevantLift = (result: typeof baseline) =>
      (result.waves[2]!.margin ?? 0) - (deficitWave.margin ?? 0);
    const newLiftOverkill = relevantLift(withOverkill);
    const newLiftTargeted = relevantLift(withTargeted);
    expect(newLiftTargeted).toBeGreaterThan(newLiftOverkill);
  });

  it("a cheap, well-targeted new copy can still beat an expensive upgrade of the anchor itself", () => {
    // The opposite direction from the single-wave test above: an upgrade is
    // not owed a win just for being an upgrade. Muck 1→2 lifts wave 18 far
    // more in absolute terms, but at 20x the cost of a single Fire mono —
    // real value per gold still has to be compared.
    const upgradeCost =
      resolveLiveTowerCost("muck", 2) - resolveLiveTowerCost("muck", 1);
    const freshCopyCost = resolveLiveTowerCost("mono-fire", 1);
    expect(upgradeCost).toBeGreaterThan(freshCopyCost * 5);

    const upgraded = tower("muck", 2, cells[80]!, "anchor", "damage");
    const withUpgrade = evaluatePhaseSurvival({ ...base, towers: [upgraded] });
    const freshCopy = tower("mono-fire", 1, cells[50]!, "cand", "damage");
    const withCopy = evaluatePhaseSurvival({
      ...base,
      towers: [anchor, freshCopy],
    });

    const relevantLift = (result: typeof baseline) =>
      (result.waves[2]!.margin ?? 0) - (deficitWave.margin ?? 0);
    const upgradeEfficiency = relevantLift(withUpgrade) / upgradeCost;
    const copyEfficiency = relevantLift(withCopy) / freshCopyCost;
    expect(copyEfficiency).toBeGreaterThan(upgradeEfficiency);
  });
});

describe("surplus spend — a comfortably-passing window still spends toward the reserve", () => {
  // End-to-end through the real public API, on a real curated anchor, so
  // this fails if the surplus-spend pass in matchPlan.ts is ever removed or
  // gated back to "only when something is failing".
  const anchor = CURATED_ANCHORS.find((entry) => entry.towerId === "howitzer")!;
  const set = buildRecommendationSetDto(anchor.towerId);
  const recommended =
    set.plans.find((plan) => plan.id === set.engineRecommendedPlanId) ??
    set.plans[0]!;
  const matchPlan = generateMatchPlan(planToPortableBuild(recommended), {
    mapId: "forest",
  });

  it("spends real gold in a window that already clears every verified wave", () => {
    const surplusActions = matchPlan.phases.flatMap((phase) =>
      phase.actions.filter((action) => action.id.includes(":surplus-spend:")),
    );
    expect(surplusActions.length).toBeGreaterThan(0);
    expect(surplusActions.every((action) => action.affordable)).toBe(true);
    expect(surplusActions.some((action) => action.cost > 0)).toBe(true);
  });

  it("never leaves more than the window's own reserve idle once the package queue and rescue passes are done", () => {
    // Excludes the last three windows: the two boss windows carry HP per
    // creep but no measured creep count, and Waves 51-55's only remaining
    // un-maxed towers are pure support the survival model does not credit a
    // buff for — matchPlanDoctrine.test.ts documents both exclusions.
    const offenders = matchPlan.phases.slice(0, -3).flatMap((phase) => {
      if (phase.endWave == null) return [];
      const lastBounty =
        waveBenchmark(phase.endWave, matchPlan.settings.difficulty)
          ?.waveBounty ?? 0;
      const left = phase.economy.phaseEndGold - lastBounty;
      const windowReserve =
        phase.startWave >= 21
          ? Math.max(
              matchPlan.settings.reserveGold,
              waveBenchmark(phase.startWave, matchPlan.settings.difficulty)
                ?.waveBounty ?? 0,
            )
          : matchPlan.settings.reserveGold;
      if (left <= windowReserve + 0.5) return [];
      const explained = phase.actions.some((action) => !action.affordable);
      return explained ? [] : [`${phase.label} idle ${left}g`];
    });
    expect(offenders).toEqual([]);
  });
});
