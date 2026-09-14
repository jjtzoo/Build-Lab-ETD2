import { describe, expect, it } from "vitest";

import { getMap } from "@/lib/domain/mapCatalog";
import type { MapConfig } from "@/lib/domain/mapConfig";
import { getTower } from "@/lib/domain/towerCatalog";
import {
  TOWER_PLACEMENT_FACTS,
  getTowerPlacementFact,
} from "@/lib/domain/towerPlacementFacts";
import { placementValue, rankPlacements } from "@/lib/engine/placementValue";

/**
 * A long straight route with buildable cells beside its start, middle and
 * end. Deliberately not a real map: on a folded route like Forest's, most
 * cells see creeps both early and late, which is a genuine property of
 * that map but useless for locking the model's behaviour.
 *
 * 1 cell/sec along row 0 from col 0 to col 60, so route position and
 * route time are the same number.
 */
function longRouteMap(overrides: Partial<MapConfig> = {}): MapConfig {
  return {
    id: "long",
    name: "Long",
    image: "/maps/test.png",
    imageSize: { w: 100, h: 100 },
    grid: {
      origin: { x: 0, y: 0 },
      colVector: { x: 10, y: 0 },
      rowVector: { x: 0, y: 10 },
    },
    buildableCells: [
      { col: 5, row: 1 },
      { col: 30, row: 1 },
      { col: 55, row: 1 },
    ],
    paths: [
      {
        id: "main",
        points: [
          { col: 0, row: 0 },
          { col: 60, row: 0 },
        ],
        modes: ["standard"],
      },
    ],
    pathDurationSeconds: 60,
    rangeUnitsPerCell: 1,
    ...overrides,
  };
}

const FRONT = { col: 5, row: 1 };
const BACK = { col: 55, row: 1 };

/** Same range and DPS throughout, so only the scorer's model differs. */
const base = {
  map: longRouteMap(),
  mode: "standard" as const,
  rangeUnits: 5,
  baseDps: 100,
};

describe("towerPlacementFacts", () => {
  it("keeps the source text for every non-default row", () => {
    // The whole point of the evidence field: a claim like "Polar wants the
    // front of the route" has to stay traceable to the game data it came
    // from, or it is indistinguishable from a guess.
    const nonDefault = TOWER_PLACEMENT_FACTS.facts.filter(
      (f) =>
        f.debuff !== null ||
        f.routePreference !== "anywhere" ||
        f.radialPreference !== "any" ||
        f.targetsTowers,
    );
    expect(nonDefault.length).toBeGreaterThan(0);
    for (const fact of nonDefault) {
      expect(
        fact.evidence.coreMechanic.length + fact.evidence.buildPosition.length,
      ).toBeGreaterThan(0);
    }
  });

  it("carries the facts the placement model was built around", () => {
    // Read straight out of data/mechanics.json's prose — see
    // scripts/derivePlacementFactsV1.mjs for the derivation.
    expect(getTowerPlacementFact("polar").debuff).toEqual({
      durationSeconds: 30,
      permanentEffect: true,
    });
    // Nuclear states no window and says "permanently", so its effect runs
    // for whatever is left of the route.
    expect(getTowerPlacementFact("nuclear").debuff).toEqual({
      durationSeconds: null,
      permanentEffect: true,
    });
    expect(getTowerPlacementFact("disease").routePreference).toBe("late");
    expect(getTowerPlacementFact("howitzer").radialPreference).toBe("spread");
    expect(getTowerPlacementFact("impulse").radialPreference).toBe("far");
    expect(getTowerPlacementFact("blacksmith").targetsTowers).toBe(true);
  });

  it("refuses to infer a preference from a loose word match", () => {
    // Each of these tripped an earlier, looser derivation: Vapor "splits
    // damage equally", Flamethrower's text mentions Shredder's split, and
    // Railgun and Crystal Spire are tagged "Finisher" without any
    // HP-scaling mechanic. None of them has a placement preference.
    for (const id of ["vapor", "flamethrower", "railgun", "crystal-spire"]) {
      const fact = getTowerPlacementFact(id);
      expect(fact.routePreference).toBe("anywhere");
      expect(fact.debuff).toBeNull();
    }
  });

  it("returns neutral facts for towers outside the catalog", () => {
    // Mono and basic towers carry no mechanic data at all; they must not
    // fall over, and must not claim a preference.
    const fact = getTowerPlacementFact("mono-fire");
    expect(fact.routePreference).toBe("anywhere");
    expect(fact.radialPreference).toBe("any");
    expect(fact.debuff).toBeNull();
    expect(fact.targetsTowers).toBe(false);
  });
});

describe("placementValue — permanent effects front-load", () => {
  it("values a permanent debuff by the route left after contact", () => {
    // Nuclear's radiation never wears off, so its ceiling is however much
    // route the creep has left. That is the case where position is the
    // whole argument, and it must beat an otherwise identical back cell.
    const front = placementValue({ ...base, cell: FRONT, towerId: "nuclear" });
    const back = placementValue({ ...base, cell: BACK, towerId: "nuclear" });

    expect(front.kind).toBe("creep-debuff");
    expect(front.effectiveWindowSeconds).toBeGreaterThan(
      back.effectiveWindowSeconds!,
    );
    expect(front.score).toBeGreaterThan(back.score);
    // Both cells see identical amounts of route, so coverage — the old
    // ranking's only input — cannot tell them apart at all.
    expect(front.coverage.coveredSeconds).toBeCloseTo(
      back.coverage.coveredSeconds,
      6,
    );
  });

  it("clips a fixed window to the route remaining, and no further", () => {
    // Polar's 30s on a 60s route: applied ~2s in the whole window lands,
    // applied ~52s in only ~8s of it does.
    const front = placementValue({ ...base, cell: FRONT, towerId: "polar" });
    const back = placementValue({ ...base, cell: BACK, towerId: "polar" });

    expect(front.effectiveWindowSeconds).toBe(30);
    expect(back.effectiveWindowSeconds).toBeCloseTo(
      back.coverage.routeRemainingSeconds,
      6,
    );
    expect(back.effectiveWindowSeconds!).toBeLessThan(30);
    expect(front.score / back.score).toBeCloseTo(
      30 / back.effectiveWindowSeconds!,
      3,
    );
  });

  it("says so when the route is too short to constrain the window", () => {
    // On Forest a 30s window lands in full from all 120 cells, because the
    // route folds back on itself. Claiming a front-loading preference there
    // would be inventing one — the model has to report the flat answer.
    const forest = getMap("forest");
    const polar = getTower("polar");
    const ranked = rankPlacements({
      map: forest,
      mode: "standard",
      towerId: "polar",
      rangeUnits: polar.stats.range,
      baseDps: polar.stats.damage[1] * polar.stats.attackSpeed,
      topN: 5,
    });
    expect(ranked[0].value.effectiveWindowSeconds).toBe(30);
    expect(ranked[0].value.note).toContain("position isn't the constraint");
  });
});

describe("placementValue — back-loaded damage", () => {
  it("prefers cells that catch creeps in the run's second half", () => {
    const front = placementValue({ ...base, cell: FRONT, towerId: "disease" });
    const back = placementValue({ ...base, cell: BACK, towerId: "disease" });

    expect(back.kind).toBe("late");
    expect(front.lateSharePercent).toBe(0);
    expect(back.lateSharePercent).toBe(100);
    expect(back.score).toBeGreaterThan(front.score);
    // Again identical coverage — the distinction is purely positional.
    expect(front.coverage.coveredSeconds).toBeCloseTo(
      back.coverage.coveredSeconds,
      6,
    );
  });
});

describe("placementValue — radial distribution", () => {
  it("reports rim share, and rates it per the tower's own mechanic", () => {
    // One cell beside the path, one far enough that it only grazes with the
    // rim of the same circle. Impulse scales with projectile travel and
    // wants the far one; a short-range preference wants the near one. Same
    // geometry, opposite verdicts — which is why rim share is reported as
    // a fact and weighted per tower rather than called "waste".
    const map = longRouteMap({
      buildableCells: [
        { col: 30, row: 1 },
        { col: 30, row: 9 },
      ],
    });
    const args = {
      map,
      mode: "standard" as const,
      rangeUnits: 10,
      baseDps: 100,
    };
    const near = placementValue({
      ...args,
      cell: { col: 30, row: 1 },
      towerId: "impulse",
    });
    const rim = placementValue({
      ...args,
      cell: { col: 30, row: 9 },
      towerId: "impulse",
    });

    expect(rim.rimSharePercent).toBeGreaterThan(near.rimSharePercent);
    expect(rim.rimSharePercent).toBeCloseTo(100, 0);
    // Impulse's "far" preference lifts the rim cell's score above what its
    // raw damage alone would earn.
    expect(rim.score / rim.damage).toBeGreaterThan(1);
    expect(near.score / near.damage).toBeLessThan(rim.score / rim.damage);
  });
});

describe("placementValue — support towers", () => {
  const dealer = {
    cell: { col: 30, row: 1 },
    towerId: "railgun",
    rangeUnits: 5,
    baseDps: 1000,
  };

  it("never scores a global tower buff by nearby allied damage", () => {
    const withDealer = placementValue({
      ...base,
      cell: { col: 30, row: 1 },
      towerId: "blacksmith",
      placed: [dealer],
    });
    const away = placementValue({
      ...base,
      cell: BACK,
      towerId: "blacksmith",
      placed: [dealer],
    });

    expect(withDealer.kind).toBe("tower-buff");
    expect(withDealer.score).toBe(withDealer.damage);
    expect(away.score).toBe(away.damage);
    expect(withDealer.note).toContain("global");
    expect(away.note).toContain("global");
  });

  it("explains itself rather than scoring every cell zero", () => {
    const nothingPlaced = placementValue({
      ...base,
      cell: FRONT,
      towerId: "blacksmith",
    });
    expect(nothingPlaced.score).toBe(nothingPlaced.damage);
    expect(nothingPlaced.note).toContain("global");
  });

  it("ranks a short debuff by overlap with placed damage", () => {
    // Nova's 5s slow lands in full wherever it is built, so position is
    // irrelevant — what it needs is to be slowing the creeps something
    // else is shooting.
    const overlapping = placementValue({
      ...base,
      cell: { col: 30, row: 1 },
      towerId: "nova",
      placed: [dealer],
    });
    const elsewhere = placementValue({
      ...base,
      cell: BACK,
      towerId: "nova",
      placed: [dealer],
    });

    expect(overlapping.kind).toBe("debuff-overlap");
    expect(overlapping.overlapSeconds).toBeGreaterThan(0);
    expect(elsewhere.overlapSeconds).toBe(0);
    expect(overlapping.score).toBeGreaterThan(elsewhere.score);
  });

  it("falls back to coverage with a caveat before anything is placed", () => {
    const value = placementValue({ ...base, cell: FRONT, towerId: "nova" });
    expect(value.score).toBeGreaterThan(0);
    expect(value.note).toContain("place a damage tower first");
  });
});

describe("rankPlacements", () => {
  it("leads with each viable camp before recommending extra stacking", () => {
    const map = longRouteMap({
      buildableCells: [
        { col: 5, row: 1 },
        { col: 30, row: 1 },
        { col: 30, row: 2 },
        { col: 31, row: 1 },
        { col: 55, row: 1 },
      ],
    });
    const ranked = rankPlacements({
      map,
      mode: "standard",
      towerId: "atom",
      rangeUnits: 5,
      baseDps: 100,
      topN: 3,
    });

    expect(ranked.map((entry) => entry.cell)).toEqual(
      expect.arrayContaining([
        { col: 5, row: 1 },
        { col: 30, row: 1 },
        { col: 55, row: 1 },
      ]),
    );
  });

  it("skips occupied cells and discriminates on Forest's real data", () => {
    const forest = getMap("forest");
    const howitzer = getTower("howitzer");
    const args = {
      map: forest,
      mode: "standard" as const,
      towerId: "howitzer",
      rangeUnits: howitzer.stats.range,
      baseDps: howitzer.stats.damage[2] * howitzer.stats.attackSpeed,
      topN: 6,
    };

    const ranked = rankPlacements(args);
    expect(ranked).toHaveLength(6);
    expect(ranked[0].value.score).toBeGreaterThan(ranked[5].value.score);

    const best = ranked[0].cell;
    const withoutBest = rankPlacements({ ...args, occupied: [best] });
    expect(
      withoutBest.some(
        (r) => r.cell.col === best.col && r.cell.row === best.row,
      ),
    ).toBe(false);
  });

  it("does not put a long-ranged tower on the map's edge", () => {
    // The original complaint: ranking by coverage percent alone let a
    // 13.7-cell-radius Howitzer sit anywhere, because it covers much of a
    // folded route from almost every cell. Its best spots must now be
    // cells that actually use the radius, not ones that graze with the rim.
    const forest = getMap("forest");
    const howitzer = getTower("howitzer");
    const ranked = rankPlacements({
      map: forest,
      mode: "standard",
      towerId: "howitzer",
      rangeUnits: howitzer.stats.range,
      baseDps: howitzer.stats.damage[2] * howitzer.stats.attackSpeed,
      topN: 6,
    });
    const cols = forest.buildableCells.map((c) => c.col);
    const rows = forest.buildableCells.map((c) => c.row);
    const edge = (c: { col: number; row: number }) =>
      c.col === Math.min(...cols) ||
      c.col === Math.max(...cols) ||
      c.row === Math.min(...rows) ||
      c.row === Math.max(...rows);
    expect(ranked.filter((r) => edge(r.cell))).toHaveLength(0);
  });
});
