import type { GridPoint, MapConfig, WaveMode } from "@/lib/domain/mapConfig";
import {
  coverageForMode,
  islandIndexOf,
  islands,
  sampleInRange,
  sampleRoute,
  type ModeCoverage,
  type RouteSample,
} from "@/lib/engine/mapPlacement";
import {
  getTowerPlacementFact,
  type RadialPreference,
  type TowerPlacementFact,
} from "@/lib/domain/towerPlacementFacts";

/**
 * What a cell is worth to a *particular* tower.
 *
 * Ranking by route coverage alone cannot answer the question the map is
 * really being asked. Three failures, all of them visible in the game:
 *
 * - A long-ranged tower covers a large share of a folded route from
 *   almost any cell, so candidates tie and the ordering collapses into
 *   whatever order the cells were authored in.
 * - An effect that keeps paying out after it lands — Polar's HP removal,
 *   Nuclear's permanent radiation — is worth more the earlier it is
 *   applied, because what is left of the route is its ceiling. Coverage
 *   is identical for an early and a late cell that see the same amount
 *   of route.
 * - A tower whose effect lands on *towers* (Blacksmith, Well) or which
 *   only pays off while something else is shooting (a 5s slow, Jinx's
 *   damage echo) does not care about route position at all. It cares
 *   about overlapping whatever is already on the field.
 *
 * So the scorer picks its model from the tower's own mechanic, via
 * `data/towerPlacementFacts.v1.json` — which is itself derived from
 * `data/mechanics.json`, not invented here.
 */

export type PlacementKind =
  /** Plain damage: time in range times damage per second. */
  | "uptime"
  /** Damage that wants creeps to arrive already hurt. */
  | "late"
  /** A lasting creep effect, valued by how much of its window lands. */
  | "creep-debuff"
  /** A short creep effect, valued by overlap with placed damage. */
  | "debuff-overlap"
  /** Global buff: route position only values the tower's own attack. */
  | "tower-buff";

export type PlacedTowerRef = {
  cell: GridPoint;
  towerId: string;
  rangeUnits: number;
  /** Damage per second at the level it stands at; 0 for pure support. */
  baseDps: number;
};

export type PlacementValue = {
  kind: PlacementKind;
  /**
   * Comparable between cells *for one tower*, not between towers — each
   * kind is on its own scale.
   */
  score: number;
  /** Single-target damage this cell yields over one run, in HP. */
  damage: number;
  /**
   * For a lasting effect: how many seconds of its window actually land
   * before the creep exits. Null when the tower applies no such effect.
   */
  effectiveWindowSeconds: number | null;
  /**
   * Share of covered time spent in the outer third of the range circle,
   * 0-100.
   *
   * This is the readable form of "a lot of its theoretical range goes to
   * waste": a tower parked at the edge of the map reaches the route only
   * with the far rim of its circle and reads near 100 here, while one
   * beside a bend uses the whole radius. Deliberately stated as a fact
   * rather than as a penalty — rim coverage is waste for a short-range
   * brawler and the entire point for Impulse, whose damage scales with
   * projectile travel. Which of those applies is decided by the tower's
   * own `radialPreference`, not by this number.
   */
  rimSharePercent: number;
  /** Creep-seconds this cell shares with an already-placed damage tower. */
  overlapSeconds: number;
  /**
   * Share of this cell's covered creep-seconds that fall in the back half
   * of the route, 0-100.
   *
   * The measure a back-loaded tower is actually judged on. First and last
   * contact cannot stand in for it: on a route that folds back on itself
   * most cells see creeps both early and late, so their contact midpoint
   * lands near half the run regardless and tells you nothing.
   */
  lateSharePercent: number;
  coverage: ModeCoverage;
  /** Set when the score comes with a caveat the player should read. */
  note: string | null;
};

/**
 * Per-band weights for a tower's stated radial preference, applied to the
 * *share* of covered time in each third of the radius so the multiplier
 * averages 1 for an evenly-spread route.
 */
const RADIAL_WEIGHTS: Record<
  Exclude<RadialPreference, "spread">,
  readonly [number, number, number]
> = {
  any: [1, 1, 1],
  near: [1.35, 1, 0.65],
  far: [0.65, 1, 1.35],
};

/**
 * How well a cell's radial distribution suits the tower.
 *
 * `spread` is its own case: Howitzer's AoE grows with distance while its
 * damage grows as the target closes, so it wants the route to pass both
 * far and near rather than sitting in one band. That is a balance
 * measure, not a weighting — hence the separate branch.
 */
function radialFactor(
  preference: RadialPreference,
  bands: readonly [number, number, number],
): number {
  const total = bands[0] + bands[1] + bands[2];
  if (total <= 0) return 1;

  if (preference === "spread") {
    const inner = bands[0] / total;
    const outer = bands[2] / total;
    const balance =
      inner + outer > 0 ? (2 * Math.min(inner, outer)) / (inner + outer) : 0;
    return 0.75 + 0.5 * balance;
  }

  const weights = RADIAL_WEIGHTS[preference];
  return (
    (bands[0] * weights[0] + bands[1] * weights[1] + bands[2] * weights[2]) /
    total
  );
}

/**
 * Dwell needed before a debuff tower can be relied on to land its effect
 * on a wave. Past this, more time in range adds nothing to the debuff
 * itself — the diminishing return that makes a support tower's best cell
 * different from a damage tower's.
 */
const DEBUFF_APPLICATION_SECONDS = 3;

/**
 * A debuff counts as positional only when its window is a real fraction
 * of the route. A 5s slow lands in full from anywhere, so treating it as
 * front-loaded would invent a preference the geometry does not support;
 * scored as overlap instead, which is what it actually needs.
 */
const POSITIONAL_WINDOW_SHARE = 0.25;

function pickKind(
  fact: TowerPlacementFact,
  routeSeconds: number,
  baseDps: number,
): PlacementKind {
  if (fact.targetsTowers) return "tower-buff";
  if (fact.debuff) {
    const window = fact.debuff.durationSeconds;
    if (window === null || window >= routeSeconds * POSITIONAL_WINDOW_SHARE) {
      return "creep-debuff";
    }
    return "debuff-overlap";
  }
  if (fact.routePreference === "late" && baseDps > 0) return "late";
  return "uptime";
}

export type PlacementValueInput = {
  map: MapConfig;
  cell: GridPoint;
  mode: WaveMode;
  towerId: string;
  rangeUnits: number;
  baseDps: number;
  placed?: readonly PlacedTowerRef[];
  /** Reused across cells when ranking a whole map — see `rankPlacements`. */
  samples?: readonly RouteSample[];
};

export function placementValue(input: PlacementValueInput): PlacementValue {
  const { map, cell, mode, towerId, rangeUnits, baseDps } = input;
  const placed = input.placed ?? [];
  const fact = getTowerPlacementFact(towerId);
  const coverage = coverageForMode(map, cell, rangeUnits, mode);
  const routeSeconds = map.pathDurationSeconds ?? 0;

  const damage = coverage.coveredSeconds * baseDps;

  const rangeCells =
    map.rangeUnitsPerCell > 0 ? rangeUnits / map.rangeUnitsPerCell : 0;
  const bandTotal = coverage.coveredSecondsByBand.reduce((a, b) => a + b, 0);
  const rimSharePercent =
    bandTotal > 0 ? (100 * coverage.coveredSecondsByBand[2]) / bandTotal : 0;

  /*
   * What this cell exposes the tower to, in whatever unit the tower can
   * actually convert. Damage for anything that attacks; time in range for
   * a tower with no attack of its own, where seconds are all there is.
   */
  const exposure = baseDps > 0 ? damage : coverage.coveredSeconds;

  const kind = pickKind(fact, routeSeconds, baseDps);

  /*
   * Both remaining metrics need the route walked rather than solved:
   * overlap is an intersection of two towers' reach, and the late share
   * needs covered time attributed to *when* on the route it happens.
   * Sampled only when one of them can change the answer.
   */
  const dealers = placed.filter((p) => p.baseDps > 0);
  const needsSamples = dealers.length > 0 || kind === "late";
  let overlapSeconds = 0;
  let lateSharePercent = 0;
  if (needsSamples && rangeCells > 0) {
    const samples = input.samples ?? sampleRoute(map, mode);
    const halfway = routeSeconds / 2;
    let covered = 0;
    let late = 0;
    for (const sample of samples) {
      if (!sampleInRange(map, sample, cell, rangeUnits)) continue;
      covered += sample.weightSeconds;
      if (sample.seconds > halfway) late += sample.weightSeconds;
      if (
        dealers.some((p) => sampleInRange(map, sample, p.cell, p.rangeUnits))
      ) {
        overlapSeconds += sample.weightSeconds;
      }
    }
    lateSharePercent = covered > 0 ? (100 * late) / covered : 0;
  }
  const window = fact.debuff
    ? Math.min(
        fact.debuff.durationSeconds ?? Number.POSITIVE_INFINITY,
        coverage.routeRemainingSeconds,
      )
    : null;

  let score = 0;
  let note: string | null = null;

  switch (kind) {
    case "uptime":
      score =
        damage *
        radialFactor(fact.radialPreference, coverage.coveredSecondsByBand);
      break;

    case "late": {
      /*
       * Damage that scales with missing HP is worth more on creeps that
       * have already walked most of the route, so weight by how much of
       * this cell's exposure happens in the back half. A cell that only
       * ever sees fresh creeps is worth 0.6x what it looks like; one that
       * only catches them on the way out, 1.4x.
       */
      score = damage * (0.6 + (0.8 * lateSharePercent) / 100);
      break;
    }

    case "creep-debuff": {
      /*
       * Route position enters as a multiplier on what the tower does
       * anyway, not as the whole score. Scoring the window alone made
       * every cell that sees the route at t=0 tie exactly at the full
       * window, which ranked a cell covering 17% of the route above one
       * covering 24% — a permanent debuff still has to hit creeps to
       * apply, and these towers have attacks of their own.
       *
       * windowFactor is how much of the effect survives the route
       * remaining, against the most any cell on this map could get. For
       * Nuclear's permanent radiation that spans ~0.6-1.0 and does real
       * work; for a 30s effect on a 48s route it pins at 1.0 everywhere,
       * which is the honest answer — see the note below.
       */
      const stated = fact.debuff?.durationSeconds;
      const best = Math.min(stated ?? routeSeconds, routeSeconds);
      const windowFactor = best > 0 ? Math.min(1, (window ?? 0) / best) : 0;
      const application = Math.min(
        1,
        coverage.coveredSeconds / DEBUFF_APPLICATION_SECONDS,
      );
      score = exposure * windowFactor * application;
      if (stated != null && window !== null && window >= stated - 0.5) {
        note =
          `Its full ${stated}s window lands from anywhere on this route, so ` +
          "position isn't the constraint here — reliably reaching the wave is.";
      }
      break;
    }

    case "debuff-overlap": {
      /*
       * A short debuff is worth exactly as much as the damage landing on
       * the creeps carrying it. With nothing placed yet there is nothing
       * to overlap with, so fall back to coverage and say so rather than
       * ranking every cell at zero.
       */
      if (dealers.length === 0) {
        score = exposure;
        note =
          "Scored on coverage only — place a damage tower first and this " +
          "re-ranks on overlapping it, which is what a short debuff needs.";
      } else {
        score = overlapSeconds;
      }
      break;
    }

    case "tower-buff": {
      /*
       * Tower buffs are global. Nearby allies never enter the score. A
       * buff tower that attacks is placed for its own uptime; a pure
       * support ties everywhere and the camp allocator gives it a
       * low-opportunity-cost cell.
       */
      score = damage;
      note =
        baseDps > 0
          ? "Its buff is global; this rank reflects only its own attack coverage."
          : "Its buff is global, so ally proximity is irrelevant; use a low-opportunity-cost cell.";
      break;
    }
  }

  return {
    kind,
    score,
    damage,
    // Always finite when present: a permanent effect's window is capped
    // by the route remaining, not by the effect.
    effectiveWindowSeconds: window,
    rimSharePercent,
    overlapSeconds,
    lateSharePercent,
    coverage,
    note,
  };
}

export type RankedPlacement = {
  cell: GridPoint;
  value: PlacementValue;
};

/**
 * A camp only earns one of the first recommendations if it is competitive
 * with the best camp. This avoids spreading a tower onto an isolated tile
 * that barely touches the route, while preventing six nearly identical
 * recommendations from consuming the same strong plaza.
 */
const VIABLE_CAMP_SCORE_RATIO = 0.65;

function diversifyCamps(
  map: MapConfig,
  entries: readonly RankedPlacement[],
  topN: number,
): RankedPlacement[] {
  if (entries.length <= 1 || topN <= 1) return entries.slice(0, topN);

  const first = entries[0];
  // Buff and short-debuff placement is deliberately a camp decision: their
  // entire value is overlapping the towers already firing. Damage towers,
  // however, lose route coverage when all copies pile into that same camp.
  if (
    first.value.kind === "tower-buff" ||
    first.value.kind === "debuff-overlap" ||
    first.value.score <= 0
  ) {
    return entries.slice(0, topN);
  }

  const mapIslands = islands(map);
  const bestByCamp = new Map<number, RankedPlacement>();
  for (const entry of entries) {
    const camp = islandIndexOf(mapIslands, entry.cell);
    if (camp >= 0 && !bestByCamp.has(camp)) bestByCamp.set(camp, entry);
  }

  const viableCampLeads = [...bestByCamp.values()]
    .filter(
      (entry) =>
        entry.value.coverage.coveredSeconds > 0 &&
        entry.value.score >= first.value.score * VIABLE_CAMP_SCORE_RATIO,
    )
    .sort((a, b) => entries.indexOf(a) - entries.indexOf(b));
  const selected = viableCampLeads.slice(0, topN);
  const selectedCells = new Set(
    selected.map((entry) => `${entry.cell.col},${entry.cell.row}`),
  );

  // After every viable camp has a lead recommendation, raw score resumes so
  // a player who needs several copies can still see the best extra slots.
  for (const entry of entries) {
    if (selected.length >= topN) break;
    const key = `${entry.cell.col},${entry.cell.row}`;
    if (!selectedCells.has(key)) {
      selected.push(entry);
      selectedCells.add(key);
    }
  }
  return selected;
}

/**
 * Every free buildable cell ranked for one tower by its own scorer.
 *
 * The route is sampled once and shared across all cells — the overlap
 * test is the expensive part and it is the same route every time.
 */
export function rankPlacements(
  input: Omit<PlacementValueInput, "cell" | "samples"> & {
    topN?: number;
    occupied?: readonly GridPoint[];
  },
): RankedPlacement[] {
  const { map, mode, topN = 6, occupied = [] } = input;
  const taken = new Set(occupied.map((c) => `${c.col},${c.row}`));
  const fact = getTowerPlacementFact(input.towerId);
  const needsSamples =
    (input.placed ?? []).some((p) => p.baseDps > 0) ||
    fact.routePreference === "late";
  const samples = needsSamples ? sampleRoute(map, mode) : undefined;

  const ranked = map.buildableCells
    .filter((cell) => !taken.has(`${cell.col},${cell.row}`))
    .map((cell) => ({
      cell,
      value: placementValue({ ...input, cell, samples }),
    }))
    .sort((a, b) => {
      if (b.value.score !== a.value.score) return b.value.score - a.value.score;
      /*
       * The support scorers saturate by design: every cell that reaches
       * the same placed tower buffs exactly the same damage, and every
       * cell whose full debuff window lands scores the same window. Those
       * really are equal on their own terms, so the tie-break is what the
       * tower does with the rest of its time — its own damage first, then
       * the longest unbroken stretch, which is what a ramping tower wants.
       */
      if (b.value.damage !== a.value.damage) {
        return b.value.damage - a.value.damage;
      }
      return (
        b.value.coverage.longestRunSeconds - a.value.coverage.longestRunSeconds
      );
    });

  return diversifyCamps(map, ranked, topN);
}
