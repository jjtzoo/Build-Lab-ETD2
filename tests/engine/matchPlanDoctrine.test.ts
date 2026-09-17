import { describe, expect, it } from "vitest";
import { CURATED_ANCHORS } from "@/lib/domain/anchorPolicy";
import { isBasicTowerId, isMonoTowerId } from "@/lib/domain/auxiliaryTowers";
import { getTower } from "@/lib/domain/towerCatalog";
import { planToPortableBuild } from "@/components/build-lab/OpenInLive";
import { buildRecommendationSetDto } from "@/lib/engine/buildRecommendationDto";
import { generateMatchPlan } from "@/lib/engine/matchPlan";
import { waveBenchmark } from "@/lib/engine/waveBenchmarks";
import type { MatchPlanPhase } from "@/lib/domain/matchPlan";

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
 * the window is short AND a legal, realistic step could still raise it.
 *
 * "Realistic" matters: the rescue cascade is capped so it never recommends
 * more copies of one tower than there are viable camps to put them in, and a
 * fully maxed, fully saturated field is a legitimate terminal state — a real
 * player is not obligated to keep re-buying Cannons once every camp already
 * has one. See the fleet-copy saturation cap in matchPlan.ts.
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
    // The plans above run on the default difficulty. Since 2026-09-15 that
    // is Hard (the owner's archived zero-leak wins and the calibration
    // captures are Hard games), and on Hard only four curated anchors still
    // fail a window before W21 — down from ten on Very Hard. Shrink as data
    // lands (sell rate, essence timing, ability numbers) and never grow
    // without saying why. The four: solar and disease fail W16 at 62% / 75%
    // with the anchor already up, flooding W18–20 in the high 80s, mushroom
    // W16 at 99% — every one a candidate to leave once the wave model is
    // calibrated (it is ~2× a measured zero-leak win).
    const allowed = new Set(["solar", "disease", "flooding", "mushroom"]);
    const unexpected = plans.flatMap(({ anchor, matchPlan }) =>
      matchPlan.phases
        .slice(0, 4)
        .filter((phase) => phase.survival.status === "fails")
        .filter(() => !allowed.has(anchor))
        .map((phase) => `${anchor} ${phase.label}`),
    );
    expect(unexpected).toEqual([]);
  });

  /** A tower's own recipe elements, or its single element for a mono. */
  function recipeOf(towerId: string): readonly string[] {
    if (isBasicTowerId(towerId)) return [];
    if (isMonoTowerId(towerId))
      return [towerId.slice(5, 6).toUpperCase() + towerId.slice(6)];
    try {
      return getTower(towerId).recipe;
    } catch {
      return [];
    }
  }

  it("never shows a tower whose recipe outruns the allocation acquired by that same window", () => {
    // Every window's own endTowers/endAllocation must agree with each
    // other: a tower fielded by this window's end can only need elements at
    // levels this same window's allocation actually reached — never a level
    // an element hasn't been allocated to yet, whatever order the build's
    // own elements are picked in. This is the generic form of a real report
    // (2026-09-18): a Darkness-first opening appeared to show an Earth
    // tower as already available before Earth had ever been allocated.
    const leaks = plans.flatMap(({ anchor, matchPlan }) =>
      matchPlan.phases.flatMap((phase) =>
        phase.endTowers.flatMap((tower) =>
          recipeOf(tower.towerId).flatMap((element) => {
            const allocated =
              (phase.endAllocation as Record<string, number>)[element] ?? 0;
            return allocated < tower.level
              ? [
                  `${anchor} ${phase.label}: ${tower.towerId} L${tower.level} needs ${element} ${tower.level}, allocation is ${allocated}`,
                ]
              : [];
          }),
        ),
      ),
    );
    expect(leaks).toEqual([]);
  });

  it("never gives one copyId to two different tower instances in the same window", () => {
    // Root cause behind the next test's real report: three independent
    // places mint a fresh copy's ordinal (the rescue cascade, the
    // opportunistic coverage-evolve, the emergency armour repair), and only
    // one of them recorded its choice anywhere the others could see. A
    // coverage-evolve's mono and a same-window rescue copy could mint the
    // identical ordinal and therefore the identical copyId, silently
    // merging two real, separately-cell-placed towers into one array slot
    // the moment anything later matched on that copyId (matchPlan.ts's
    // `nextCopyOrdinal` now checks the live field itself, not just the
    // cache, before handing out an ordinal).
    for (const { anchor, matchPlan } of plans) {
      for (const phase of matchPlan.phases) {
        const seen = new Set<string>();
        for (const tower of phase.endTowers) {
          expect(
            seen.has(tower.copyId),
            `${anchor} ${phase.label}: copyId ${tower.copyId} appears twice in the same window's field`,
          ).toBe(false);
          seen.add(tower.copyId);
        }
      }
    }
  });

  it("never raises a fielded copy's level without a matching build/upgrade/evolve action for that exact copy", () => {
    // A copy's level must come from its own recorded purchase history, never
    // be silently recomputed because an element's allocation happened to
    // rise later — that would let e.g. "Infernal 1" quietly read as
    // "Infernal 2" the moment Fire/Darkness reached level 2, with no gold
    // ever spent on the upgrade. Real report (2026-09-18): three Infernal
    // copies showing level 2 in a wave-46 starting field. The actual cause
    // was the copyId collision above, not allocation-driven leveling — but
    // this is the generic guard against either one: reconstructs every
    // copy's level history from the plan's own actions across every phase,
    // for every anchor and every tower.
    for (const { anchor, matchPlan } of plans) {
      const levelByCopy = new Map<string, number>();
      for (const phase of matchPlan.phases) {
        const actionedLevels = new Map<string, Set<number>>();
        for (const action of phase.actions) {
          if (
            !action.copyId ||
            action.toLevel == null ||
            (action.type !== "build" &&
              action.type !== "upgrade" &&
              action.type !== "evolve")
          )
            continue;
          const set = actionedLevels.get(action.copyId) ?? new Set<number>();
          set.add(action.toLevel);
          actionedLevels.set(action.copyId, set);
        }
        for (const tower of phase.endTowers) {
          const prior = levelByCopy.get(tower.copyId);
          if (prior != null && tower.level > prior) {
            const actioned = actionedLevels.get(tower.copyId);
            expect(
              actioned?.has(tower.level),
              `${anchor} ${phase.label}: ${tower.towerId} (${tower.copyId}) went L${prior}->L${tower.level} with no matching action landing at L${tower.level}`,
            ).toBe(true);
          }
          levelByCopy.set(tower.copyId, tower.level);
        }
      }
    }
  });

  /** Real max level for a fielded copy: mono 3, basic 1, else the catalog. */
  function towerMaxLevel(towerId: string): number {
    if (isMonoTowerId(towerId)) return 3;
    if (isBasicTowerId(towerId)) return 1;
    try {
      return getTower(towerId).maxLevel;
    } catch {
      return 1;
    }
  }

  /**
   * Every fielded damage tower is already at its own maximum level. Once
   * that is true, the only remaining lever is "more copies" — bounded by
   * the saturation cap — so a black-box doctrine test cannot tell a real
   * gap from a genuinely spent-out roster without re-deriving camp counts.
   * Treat a fully leveled roster as a legitimate terminal state.
   */
  function rosterMaxed(phase: MatchPlanPhase): boolean {
    const damageTowers = phase.endTowers.filter(
      (tower) => tower.effect === "damage" || tower.effect === "hybrid",
    );
    return (
      damageTowers.length > 0 &&
      damageTowers.every((tower) => tower.level >= towerMaxLevel(tower.towerId))
    );
  }

  it("never banks more than its own reserve, whether or not a wave is currently short", () => {
    // Gold earned on a window's last wave cannot be spent inside it, so the
    // idle figure excludes that bounty. Every rescue/repair pass only ever
    // fires on a verified deficit, so checking only "short" windows (a wave
    // under 100%) missed the real failure mode entirely: a window that
    // already clears everything, comfortably, still has nothing pulling it
    // to spend once its own finite package queue runs dry — that is
    // matchPlan.ts's surplus-spend pass's whole reason to exist. So every
    // window is checked here, "short" or not, against the same
    // `windowReserve` the engine itself spends down to (a flat reserve
    // before wave 21, then at least the next window's own first-wave
    // bounty) — not "explained" by an unrelated illegal action elsewhere in
    // the plan, which proves nothing about whether a legal, affordable,
    // worthwhile step existed for the gold actually left idle. A fully
    // maxed roster (every fielded damage tower at its real max level) is
    // still the one legitimate terminal state with nothing further to buy.
    //
    // Waves 51–55 (the last window with a verifiable wave total; the two
    // boss windows after it carry HP per creep but no measured creep count)
    // is excluded here. Measured 2026-09-15: at that point every
    // curated anchor's only remaining un-maxed towers are pure support —
    // Blacksmith, Well, Trickery — whose attack level the survival model
    // does not translate into any credited buff on the rest of the field
    // (buffs are not modeled at all yet), so upgrading them moves the
    // verified floor by exactly nothing; the rescue cascade is right to
    // refuse them. That is Match Plan's own documented scope gap, not a
    // planner bug — see the survival-over-economy-fallback note on
    // crediting buffs. (The two boss windows after it do have a real
    // outlet now — the End Game essence layer, confirmed legal from wave
    // 50 (first use) and wave 55 (second) — see the boss-window tests
    // below.)
    const idle = plans.flatMap(({ anchor, matchPlan }) =>
      matchPlan.phases.slice(0, -3).flatMap((phase) => {
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
        // "Explained" means a real, verified blocker is visible: the next
        // queued step is either illegal (a keystone the allocation does not
        // hold) or legal but would breach the reserve above — not "any
        // illegal action happens to exist somewhere in the list", which
        // proves nothing about the gold actually sitting idle (an unrelated
        // illegal action several elements away used to pass this check even
        // while tens of thousands of gold sat untouched).
        const explained =
          phase.actions.some((action) => !action.affordable) ||
          rosterMaxed(phase);
        return explained
          ? []
          : [`${anchor} ${phase.label} idle ${left}g (reserve ${windowReserve}g)`];
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
          : rosterMaxed(phase)
            ? []
            : [
                `${anchor} ${phase.label}: nothing bought and nothing waited on`,
              ];
      }),
    );
    expect(silent).toEqual([]);
  });

  /**
   * The two boss windows (56–60, 61–70) — excluded above because they carry
   * HP per creep but no measured creep count for the "never banks gold" and
   * "surfaces what every window is waiting on" checks. What still holds for
   * them specifically: the essence layer is real now, not a silent gap.
   */
  it("never spends more than two End Game essence uses across the whole plan", () => {
    const overspent = plans.flatMap(({ anchor, matchPlan }) => {
      const picks = matchPlan.phases.flatMap((phase) =>
        phase.actions.filter((action) =>
          action.reason?.startsWith("Essence pick"),
        ),
      );
      return picks.length > 2 ? [`${anchor} used ${picks.length}`] : [];
    });
    expect(overspent).toEqual([]);
  });

  it("boss windows never fall back to the old 'does not model yet' essence text", () => {
    const stale = plans.flatMap(({ anchor, matchPlan }) =>
      matchPlan.phases
        .filter((phase) => phase.id === "56-60" || phase.id === "61-70")
        .flatMap((phase) =>
          phase.risks.some((risk) => risk.includes("does not model yet"))
            ? [`${anchor} ${phase.label}`]
            : [],
        ),
    );
    expect(stale).toEqual([]);
  });
}, 300_000);
