"use client";

import { create } from "zustand";

import {
  MAX_ELEMENT_LEVEL,
  totalKeystones,
} from "@/lib/engine/allocation";
import type { ElementAllocation, ElementName } from "@/lib/domain/elements";
import type { PortableBuild } from "@/lib/domain/portableBuild";
import {
  emptyLiveAllocation,
  isSameBuiltRow,
  isTowerLoggable,
  liveTowerMaxLevel,
  liveTowerReachableLevel,
  MAX_KEYSTONES,
  placedCount,
  placementAt,
  type BuiltTower,
  type TowerPlacement,
} from "@/lib/engine/liveGame";
import { canEvolveInto } from "@/lib/domain/towerEvolution";

export type LiveSnapshot = {
  allocation: ElementAllocation;
  /** Ordered pick history — powers undo and "what this pick unlocked". */
  pickLog: ElementName[];
  /** Field rows, identified by tower **and** level (Light I ≠ Light II). */
  built: BuiltTower[];
  /**
   * Summons deliberately skipped. `phase = picks + holds`, so the wave
   * marker stays honest when a player declines a pick their field can't
   * yet answer. See `derivedPhase` in `lib/engine/liveGame.ts`.
   */
  holds: number;
  /** Which cell each placed copy stands on, per map. */
  placements: TowerPlacement[];
};

type LiveState = LiveSnapshot & {
  plan: PortableBuild | null;
  /** Set for one render after a pick, so the UI can show what changed. */
  lastPick: { before: ElementAllocation; after: ElementAllocation } | null;

  spendPick: (element: ElementName) => void;
  undoPick: () => void;
  clearReveal: () => void;
  hold: () => void;
  unhold: () => void;

  addBuilt: (towerId: string, level?: number) => void;
  setBuiltLevel: (
    towerId: string,
    fromLevel: number,
    toLevel: number,
  ) => void;
  setBuiltQuantity: (
    towerId: string,
    level: number,
    quantity: number,
  ) => void;
  removeBuilt: (towerId: string, level: number) => void;
  evolveBuilt: (
    fromTowerId: string,
    level: number,
    toTowerId: string,
  ) => void;

  placeTower: (
    mapId: string,
    towerId: string,
    level: number,
    col: number,
    row: number,
  ) => void;
  unplaceTower: (mapId: string, col: number, row: number) => void;

  setPlan: (plan: PortableBuild | null) => void;
  newGame: () => void;
  hydrate: (snapshot: Partial<LiveSnapshot>) => void;
};

function emptySnapshot(): LiveSnapshot {
  return {
    allocation: emptyLiveAllocation(),
    pickLog: [],
    built: [],
    holds: 0,
    placements: [],
  };
}

/** Clamp a requested level to 1..absolute-max (ignores allocation). */
function clampLevel(towerId: string, level: number): number {
  return Math.max(
    1,
    Math.min(liveTowerMaxLevel(towerId), Math.round(level)),
  );
}

/** Clamp to what the current picks actually support — used when logging. */
function clampReachable(
  towerId: string,
  level: number,
  allocation: ElementAllocation,
): number {
  const reachable = liveTowerReachableLevel(towerId, allocation);
  const ceiling = reachable > 0 ? reachable : liveTowerMaxLevel(towerId);
  return Math.max(1, Math.min(ceiling, Math.round(level)));
}

export const useLiveGame = create<LiveState>((set) => ({
  ...emptySnapshot(),
  plan: null,
  lastPick: null,

  spendPick: (element) =>
    set((state) => {
      if (state.allocation[element] >= MAX_ELEMENT_LEVEL) return state;
      if (totalKeystones(state.allocation) >= MAX_KEYSTONES) return state;
      const after = {
        ...state.allocation,
        [element]: state.allocation[element] + 1,
      };
      return {
        allocation: after,
        pickLog: [...state.pickLog, element],
        lastPick: { before: state.allocation, after },
      };
    }),

  undoPick: () =>
    set((state) => {
      const last = state.pickLog[state.pickLog.length - 1];
      if (!last) return state;
      return {
        allocation: {
          ...state.allocation,
          [last]: Math.max(0, state.allocation[last] - 1),
        },
        pickLog: state.pickLog.slice(0, -1),
        lastPick: null,
      };
    }),

  clearReveal: () => set({ lastPick: null }),

  hold: () => set((state) => ({ holds: state.holds + 1 })),
  unhold: () =>
    set((state) => ({ holds: Math.max(0, state.holds - 1) })),

  addBuilt: (towerId, level) =>
    set((state) => {
      // The tracker mirrors the game — it must not let you log a tower the
      // current keystones can't reach. The UI already hides those; this is
      // the backstop.
      if (!isTowerLoggable(towerId, state.allocation)) return state;

      const lvl = clampReachable(towerId, level ?? 1, state.allocation);
      const existing = state.built.find((entry) =>
        isSameBuiltRow(entry, towerId, lvl),
      );
      if (existing) {
        return {
          built: state.built.map((entry) =>
            isSameBuiltRow(entry, towerId, lvl)
              ? { ...entry, quantity: entry.quantity + 1 }
              : entry,
          ),
        };
      }
      return {
        built: [...state.built, { towerId, level: lvl, quantity: 1 }],
      };
    }),

  setBuiltLevel: (towerId, fromLevel, toLevel) =>
    set((state) => {
      const lvl = clampLevel(towerId, toLevel);
      if (lvl === fromLevel) return state;
      const moving = state.built.find((entry) =>
        isSameBuiltRow(entry, towerId, fromLevel),
      );
      if (!moving) return state;

      const mergeInto = state.built.find((entry) =>
        isSameBuiltRow(entry, towerId, lvl),
      );
      /*
       * Levelling a tower keeps it in its cell — it is the same building,
       * upgraded in place, exactly as evolving it is. Without this the
       * placement stayed pinned to the old level: the map went on drawing
       * a Haste I on the grid while the field held only a Haste II, and
       * the panel offered the copy for placement a second time.
       */
      const placements = state.placements.map((placement) =>
        placement.towerId === towerId && placement.level === fromLevel
          ? { ...placement, level: lvl }
          : placement,
      );

      if (!mergeInto) {
        // No row at the target level — just relabel this one in place.
        return {
          placements,
          built: state.built.map((entry) =>
            isSameBuiltRow(entry, towerId, fromLevel)
              ? { ...entry, level: lvl }
              : entry,
          ),
        };
      }
      // Fold the moving row's count into the existing target row.
      return {
        placements,
        built: state.built
          .filter(
            (entry) => !isSameBuiltRow(entry, towerId, fromLevel),
          )
          .map((entry) =>
            isSameBuiltRow(entry, towerId, lvl)
              ? {
                  ...entry,
                  quantity: entry.quantity + moving.quantity,
                }
              : entry,
          ),
      };
    }),

  setBuiltQuantity: (towerId, level, quantity) =>
    set((state) => {
      // Dropping copies has to drop their cells too, or the map keeps
      // showing towers the field log says you no longer own.
      const keep = Math.max(0, quantity);
      let seen = 0;
      const placements = state.placements.filter((entry) => {
        if (entry.towerId !== towerId || entry.level !== level) return true;
        seen += 1;
        return seen <= keep;
      });

      return {
        placements,
        built:
          keep <= 0
            ? state.built.filter(
                (entry) => !isSameBuiltRow(entry, towerId, level),
              )
            : state.built.map((entry) =>
                isSameBuiltRow(entry, towerId, level)
                  ? { ...entry, quantity: keep }
                  : entry,
              ),
      };
    }),

  removeBuilt: (towerId, level) =>
    set((state) => ({
      built: state.built.filter(
        (entry) => !isSameBuiltRow(entry, towerId, level),
      ),
      placements: state.placements.filter(
        (entry) => !(entry.towerId === towerId && entry.level === level),
      ),
    })),

  /**
   * Upgrade one fielded tower into a bigger one that contains it.
   *
   * Gold needs no special handling: it is derived from what stands on the
   * field, and evolving deducts what was already sunk, so the total to
   * reach a tower is the same by any route. Swapping the row is the whole
   * operation.
   */
  evolveBuilt: (fromTowerId, level, toTowerId) =>
    set((state) => {
      const source = state.built.find((entry) =>
        isSameBuiltRow(entry, fromTowerId, level),
      );
      if (!source) return state;
      if (!canEvolveInto(fromTowerId, toTowerId, level)) return state;
      if (!isTowerLoggable(toTowerId, state.allocation)) return state;

      const drained = state.built
        .map((entry) =>
          isSameBuiltRow(entry, fromTowerId, level)
            ? { ...entry, quantity: entry.quantity - 1 }
            : entry,
        )
        .filter((entry) => entry.quantity > 0);

      const existing = drained.find((entry) =>
        isSameBuiltRow(entry, toTowerId, level),
      );

      // The evolved tower stands where the precursor stood — that
      // permanence is the whole reason to field a cheap tower early and
      // grow it in place rather than pay for the big one outright. Only
      // one copy evolves, so only the first matching placement moves.
      let moved = false;
      const placements = state.placements.map((entry) => {
        if (
          moved ||
          entry.towerId !== fromTowerId ||
          entry.level !== level
        ) {
          return entry;
        }
        moved = true;
        return { ...entry, towerId: toTowerId };
      });

      return {
        placements,
        built: existing
          ? drained.map((entry) =>
              isSameBuiltRow(entry, toTowerId, level)
                ? { ...entry, quantity: entry.quantity + 1 }
                : entry,
            )
          : [...drained, { towerId: toTowerId, level, quantity: 1 }],
      };
    }),

  /**
   * Stand one copy of a fielded tower on a cell.
   *
   * Refused if the cell is taken, or if every copy the field log says you
   * own is already standing somewhere — the map must not be able to
   * invent towers the tracker doesn't think you bought.
   */
  placeTower: (mapId, towerId, level, col, row) =>
    set((state) => {
      if (placementAt(state.placements, mapId, col, row)) return state;

      const owned =
        state.built.find((entry) => isSameBuiltRow(entry, towerId, level))
          ?.quantity ?? 0;
      if (owned <= placedCount(state.placements, towerId, level)) {
        return state;
      }

      return {
        placements: [
          ...state.placements,
          { mapId, towerId, level, col, row },
        ],
      };
    }),

  unplaceTower: (mapId, col, row) =>
    set((state) => ({
      placements: state.placements.filter(
        (entry) =>
          !(entry.mapId === mapId && entry.col === col && entry.row === row),
      ),
    })),

  setPlan: (plan) => set({ plan }),

  newGame: () => set({ ...emptySnapshot(), lastPick: null }),

  hydrate: (snapshot) =>
    set((state) => {
      const built = mergeLegacyBuilt(snapshot.built) ?? state.built;
      return {
        allocation: snapshot.allocation ?? state.allocation,
        pickLog: snapshot.pickLog ?? state.pickLog,
        built,
        holds: snapshot.holds ?? state.holds,
        // Saves written before placements existed simply have none.
        placements: sanePlacements(snapshot.placements, built),
        lastPick: null,
      };
    }),
}));

/**
 * Placements read back off disk, filtered to the ones that still make
 * sense: well-formed, one tower per cell, and never more copies standing
 * than the field log says were bought. A save edited by hand, or written
 * before `built` was trimmed, must not be able to put phantom towers on
 * the map.
 */
function sanePlacements(
  placements: TowerPlacement[] | undefined,
  built: BuiltTower[],
): TowerPlacement[] {
  if (!Array.isArray(placements)) return [];

  const ownedByRow = new Map<string, number>();
  for (const row of built) {
    ownedByRow.set(`${row.towerId}@${row.level}`, row.quantity);
  }

  const takenCells = new Set<string>();
  const usedByRow = new Map<string, number>();
  const out: TowerPlacement[] = [];

  for (const entry of placements) {
    if (
      !entry ||
      typeof entry.mapId !== "string" ||
      typeof entry.towerId !== "string" ||
      !Number.isFinite(entry.col) ||
      !Number.isFinite(entry.row)
    ) {
      continue;
    }
    const level = clampLevel(entry.towerId, entry.level ?? 1);
    const rowKey = `${entry.towerId}@${level}`;
    const cellKey = `${entry.mapId}:${entry.col},${entry.row}`;

    if (takenCells.has(cellKey)) continue;
    const used = usedByRow.get(rowKey) ?? 0;
    if (used >= (ownedByRow.get(rowKey) ?? 0)) continue;

    takenCells.add(cellKey);
    usedByRow.set(rowKey, used + 1);
    out.push({
      mapId: entry.mapId,
      towerId: entry.towerId,
      level,
      col: Math.round(entry.col),
      row: Math.round(entry.row),
    });
  }

  return out;
}

/**
 * A persisted `built` array from before rows were keyed by `(towerId,
 * level)` had at most one row per tower, so it loads unchanged — but a
 * hand-edited or corrupt store could carry duplicates. Fold any
 * same-(tower, level) rows together defensively.
 */
function mergeLegacyBuilt(
  built: BuiltTower[] | undefined,
): BuiltTower[] | undefined {
  if (!built) return undefined;
  const byKey = new Map<string, BuiltTower>();
  for (const entry of built) {
    if (!entry || typeof entry.towerId !== "string") continue;
    const level = clampLevel(entry.towerId, entry.level ?? 1);
    const key = `${entry.towerId}@${level}`;
    const prior = byKey.get(key);
    const quantity = Math.max(0, Math.round(entry.quantity ?? 1));
    if (prior) {
      prior.quantity += quantity;
    } else {
      byKey.set(key, { towerId: entry.towerId, level, quantity });
    }
  }
  return [...byKey.values()].filter((entry) => entry.quantity > 0);
}
