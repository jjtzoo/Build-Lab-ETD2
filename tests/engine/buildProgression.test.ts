import { beforeAll, describe, expect, it } from "vitest";

import { ELEMENTS } from "@/lib/domain/elements";

import { getTower } from "@/lib/domain/towerCatalog";

import { getMonoTower, isMonoTowerId } from "@/lib/domain/auxiliaryTowers";

import { maxReachableTowerLevel } from "@/lib/engine/allocation";

import {
  getBestCombinedBuildPlan,
  type CombinedBuildPlan,
} from "@/lib/engine/combinedBuildPlan";

import {
  buildProgression,
  type BuildProgression,
} from "@/lib/engine/buildProgression";

const DUAL_ANCHOR = "ice";
const TRIO_ANCHOR = "laser";

let dualPlan: CombinedBuildPlan;
let trioPlan: CombinedBuildPlan;
let dualProgression: BuildProgression;
let trioProgression: BuildProgression;

beforeAll(() => {
  dualPlan = getBestCombinedBuildPlan(DUAL_ANCHOR)!;
  trioPlan = getBestCombinedBuildPlan(TRIO_ANCHOR)!;
  dualProgression = buildProgression(dualPlan);
  trioProgression = buildProgression(trioPlan);
}, 90_000);

function firstStepWhere(
  progression: BuildProgression,
  predicate: (step: BuildProgression["steps"][number]) => boolean,
): number {
  return progression.steps.findIndex(predicate);
}

function anchorLevelAfter(
  plan: CombinedBuildPlan,
  step: BuildProgression["steps"][number],
): number {
  return maxReachableTowerLevel(
    getTower(plan.anchorTowerId),
    step.allocationAfter,
  );
}

describe("Phase 8B build progression", () => {
  it("1. brings a Dual Anchor to operational (L2) before developed (L3)", () => {
    const anchor = getTower(dualPlan.anchorTowerId);
    expect(anchor.combination).toBe("Dual");

    const operationalAt = firstStepWhere(
      dualProgression,
      (step) => anchorLevelAfter(dualPlan, step) >= 2,
    );
    const developedAt = firstStepWhere(
      dualProgression,
      (step) => anchorLevelAfter(dualPlan, step) >= anchor.maxLevel,
    );

    expect(operationalAt).toBeGreaterThanOrEqual(0);
    expect(operationalAt).toBeLessThan(developedAt);
    // Operational == L2 on a 2-2 allocation of the two recipe elements.
    const opStep = dualProgression.steps[operationalAt];
    for (const element of anchor.recipe) {
      expect(opStep.allocationAfter[element]).toBeGreaterThanOrEqual(2);
    }
  });

  it("2. brings a Trio Anchor to operational (L1) before developed (L2)", () => {
    const anchor = getTower(trioPlan.anchorTowerId);
    expect(anchor.combination).toBe("Trio");

    const operationalAt = firstStepWhere(
      trioProgression,
      (step) => anchorLevelAfter(trioPlan, step) >= 1,
    );
    const developedAt = firstStepWhere(
      trioProgression,
      (step) => anchorLevelAfter(trioPlan, step) >= anchor.maxLevel,
    );

    expect(operationalAt).toBeGreaterThanOrEqual(0);
    expect(operationalAt).toBeLessThan(developedAt);
  });

  it("3. can prioritise core/support before the Anchor is fully developed", () => {
    // Once the Anchor is operational, a slow/damage-amp/buff action
    // that is still pending outranks further Anchor levels.
    const midOrLate = trioProgression.steps.filter(
      (step) =>
        step.milestoneStatus.anchorOperational &&
        !step.milestoneStatus.anchorDeveloped,
    );

    const roleFor = (towerId: string) =>
      trioPlan.normalPlan.baseline.package.roles
        .filter((role) =>
          role.candidates.some((candidate) => candidate.towerId === towerId),
        )
        .map((role) => role.role);

    const anchorNotAlwaysFirst = midOrLate.some(
      (step) =>
        step.primaryAction !== null &&
        step.primaryAction.towerId !== trioPlan.anchorTowerId &&
        roleFor(step.primaryAction.towerId).some((role) =>
          ["slow", "damage-amp", "buff"].includes(role),
        ),
    );

    // Either a support role was prioritised mid-development, or the
    // plan simply had no pending support work at that point — both are
    // legal; what must not happen is the Anchor being forced to max
    // before any support tower is touched.
    const anchorMaxedBeforeAnySupport = (() => {
      const anchorDevelopedAt = firstStepWhere(
        trioProgression,
        (step) => step.milestoneStatus.anchorDeveloped,
      );
      const firstSupportAt = firstStepWhere(
        trioProgression,
        (step) =>
          step.primaryAction !== null &&
          roleFor(step.primaryAction.towerId).some((role) =>
            ["slow", "damage-amp", "buff"].includes(role),
          ),
      );
      return (
        firstSupportAt >= 0 &&
        anchorDevelopedAt >= 0 &&
        firstSupportAt > anchorDevelopedAt
      );
    })();

    expect(anchorNotAlwaysFirst || !anchorMaxedBeforeAnySupport).toBe(true);
  });

  it("4. never recommends a tower action before its allocation is legal", () => {
    for (const progression of [dualProgression, trioProgression]) {
      for (const step of progression.steps) {
        const actions = [
          ...(step.primaryAction ? [step.primaryAction] : []),
          ...step.secondaryActions,
          ...step.newlyLegalOrReachableSelectedTowers,
        ];
        for (const action of actions) {
          const legalLevel = isMonoTowerId(action.towerId)
            ? step.allocationAfter[getMonoTower(action.towerId).element]
            : maxReachableTowerLevel(
                getTower(action.towerId),
                step.allocationAfter,
              );
          expect(action.toLevel).toBeLessThanOrEqual(legalLevel);
        }
      }
    }
  });

  it("4b. brings every role online before pushing any to max", () => {
    // Ordering on role alone let a support tower run to max ahead of the
    // anchor's own upgrade — on a Trio that spends 3,500 gold, the
    // game's priciest single step, on a multiplier while the thing being
    // multiplied sits at a quarter of its damage (every Trio's L1->L2 is
    // a flat 4x). Within a step, operational-level work now always
    // precedes max-level work.
    //
    // This pins the sort only. Which tower reaches max *first overall*
    // is decided a layer up by the keystone route, which can hand a
    // support its elements before the anchor's — see the 3-3 vs 2-2-2
    // question. Not covered here.
    for (const progression of [dualProgression, trioProgression]) {
      for (const step of progression.steps) {
        const actions = [
          ...(step.primaryAction ? [step.primaryAction] : []),
          ...step.secondaryActions,
        ];

        let seenMaxPush = false;
        for (const action of actions) {
          if (isMonoTowerId(action.towerId)) continue;
          const tower = getTower(action.towerId);
          const operational = tower.combination === "Dual" ? 2 : 1;
          const isMaxPush = action.toLevel > operational;

          if (isMaxPush) {
            seenMaxPush = true;
          } else {
            expect(seenMaxPush).toBe(false);
          }
        }
      }
    }
  });

  it("5. produces deterministic EARLY/MID/LATE primary actions", () => {
    const rerun = buildProgression(trioPlan);
    expect(
      rerun.stagePriorities.map((sp) => ({
        stage: sp.stage,
        primary: sp.primaryAction,
        secondary: sp.secondaryActions,
      })),
    ).toEqual(
      trioProgression.stagePriorities.map((sp) => ({
        stage: sp.stage,
        primary: sp.primaryAction,
        secondary: sp.secondaryActions,
      })),
    );
  });

  it("6. every priority tower belongs to the final selected plan", () => {
    for (const [plan, progression] of [
      [dualPlan, dualProgression],
      [trioPlan, trioProgression],
    ] as const) {
      const selected = new Set(plan.normalPlan.selectedTowerIds);
      for (const sp of progression.stagePriorities) {
        const actions = [
          ...(sp.primaryAction && "towerId" in sp.primaryAction
            ? [sp.primaryAction]
            : []),
          ...sp.secondaryActions,
        ];
        for (const action of actions) {
          expect(selected.has(action.towerId) || action.temporaryCarry).toBe(
            true,
          );
        }
      }
    }
  });

  it("6b. starts Laser with Atom and a Light II mono carry before Trickery", () => {
    const atomStep = trioProgression.steps.find((step) =>
      step.newlyLegalOrReachableSelectedTowers.some(
        (action) => action.towerId === "atom" && action.temporaryCarry,
      ),
    );
    const laserStep = trioProgression.steps.find((step) =>
      step.newlyLegalOrReachableSelectedTowers.some(
        (action) => action.towerId === "laser" && action.toLevel === 1,
      ),
    );
    const monoStep = trioProgression.steps.find((step) =>
      step.newlyLegalOrReachableSelectedTowers.some(
        (action) => action.towerId === "mono-light" && action.temporaryCarry,
      ),
    );

    expect(atomStep?.primaryAction).toMatchObject({
      towerId: "atom",
      temporaryCarry: true,
    });
    expect(atomStep?.nextElementAllocation).toBe("Earth");
    expect(monoStep?.primaryAction).toMatchObject({
      towerId: "mono-light",
      toLevel: 2,
      temporaryCarry: true,
    });
    expect(monoStep?.nextElementAllocation).toBe("Light");
    expect(laserStep).toBeDefined();
    expect(trioProgression.steps.indexOf(monoStep!)).toBeLessThan(
      trioProgression.steps.indexOf(laserStep!),
    );
  });

  it("7. reaches exactly the final selected allocation", () => {
    for (const [plan, progression] of [
      [dualPlan, dualProgression],
      [trioPlan, trioProgression],
    ] as const) {
      const target = plan.normalPlan.baseline.routeState.allocation;
      const last = progression.steps.at(-1)!;
      for (const element of ELEMENTS) {
        expect(last.allocationAfter[element]).toBe(target[element]);
      }
      expect(last.milestoneStatus.finalAllocationReached).toBe(true);
    }
  });

  it("8. does not change the final plan it was given", () => {
    const before = JSON.stringify({
      towers: trioPlan.normalPlan.selectedTowerIds,
      allocation: trioPlan.normalPlan.baseline.routeState.allocation,
      endGame: trioPlan.bestEndGamePackage?.package.selections,
    });
    buildProgression(trioPlan);
    const after = JSON.stringify({
      towers: trioPlan.normalPlan.selectedTowerIds,
      allocation: trioPlan.normalPlan.baseline.routeState.allocation,
      endGame: trioPlan.bestEndGamePackage?.package.selections,
    });
    expect(after).toBe(before);
  });

  it("9. encodes no fixed wave assumptions", () => {
    const serialised = JSON.stringify([
      dualProgression,
      trioProgression,
    ]).toLowerCase();
    expect(serialised).not.toContain("wave");
    expect(dualProgression.stagePriorities.map((sp) => sp.stage)).toEqual([
      "EARLY",
      "MID",
      "LATE",
      "END_GAME",
    ]);
  });

  it("10. LATE reaches the allocation that makes the chosen Essence path legal", () => {
    for (const [plan, progression] of [
      [dualPlan, dualProgression],
      [trioPlan, trioProgression],
    ] as const) {
      if (!plan.bestEndGamePackage) {
        continue;
      }
      // The END GAME stage's prerequisite allocation is the final
      // allocation the LATE stage builds to, and the endgame package
      // was resolved from exactly that allocation.
      expect(progression.endGame.allocation).toEqual(
        plan.normalPlan.baseline.routeState.allocation,
      );
      const lateResult = progression.stagePriorities.find(
        (sp) => sp.stage === "LATE",
      )!.resultingAllocation;
      expect(lateResult).toEqual(
        plan.normalPlan.baseline.routeState.allocation,
      );
    }
  });

  it("11. END GAME executes the chosen Essence package", () => {
    for (const [plan, progression] of [
      [dualPlan, dualProgression],
      [trioPlan, trioProgression],
    ] as const) {
      const endStage = progression.stagePriorities.at(-1)!;
      expect(endStage.stage).toBe("END_GAME");

      if (plan.bestEndGamePackage) {
        expect(endStage.primaryAction).toMatchObject({
          action: "execute-endgame-package",
          selections: plan.bestEndGamePackage.package.selections,
        });
        expect(progression.endGame.selections).toEqual(
          plan.bestEndGamePackage.package.selections,
        );
      }
    }
  });
});
