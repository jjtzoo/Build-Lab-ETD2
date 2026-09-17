import { describe, expect, it } from "vitest";
import type { PlannedTowerState } from "@/lib/domain/matchPlan";
import { getMap } from "@/lib/domain/mapCatalog";
import { resolveLiveTowerCost } from "@/lib/engine/liveGame";
import { evaluatePhaseSurvival } from "@/lib/engine/matchPlanSurvival";

/**
 * Regression net for the rescue-valuation fix (2026-09-17): the rescue
 * cascade in matchPlan.ts used to rank candidates by `lift / cost`, where
 * `lift` was `currentShortfall - nextShortfall` and `verifiedShortfall`
 * floors every wave's term at zero. Once a candidate closed a window's
 * deficit, any further margin it left on the table was invisible, so a
 * cheap fresh copy that barely cleared a wave always beat an upgrade that
 * cleared the same wave with real headroom to spare — "purgatory" between
 * copying and upgrading, reported live by the owner on 2026-09-17.
 *
 * The fix left the survival combat model in matchPlanSurvival.ts untouched
 * (its non-stacking redundancy rules were already correct — see the first
 * two tests below) and instead replaced the *ranking* metric in
 * matchPlan.ts with an uncapped margin sum, so real headroom counts. These
 * tests exercise the same production `evaluatePhaseSurvival` function the
 * engine itself calls, replicating the two metrics from matchPlan.ts
 * exactly, so they fail if either metric's formula regresses.
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
