"use client";

import { create } from "zustand";

import { MAX_ELEMENT_LEVEL, totalKeystones } from "@/lib/engine/allocation";
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
import { liveBuildBlock } from "@/lib/engine/liveAvailability";
import { followsFinalForm, placementKey } from "@/lib/engine/livePlacement";
import {
  isLiveMatchLength,
  type LiveMatchLength,
} from "@/lib/engine/liveEconomy";

export type LiveSnapshot = {
  /** The Element TD 2 length checkpoint used to calibrate the coach's bank estimate. */
  matchLength: LiveMatchLength;
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
  placementCue: { towerId: string; level: number } | null;
  evolutionHistory: {
    built: BuiltTower[];
    placements: TowerPlacement[];
    label: string;
  }[];
  undoEvolution: () => void;
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
    copyKey?: string,
  ) => void;
  setBuiltQuantity: (towerId: string, level: number, quantity: number) => void;
  removeBuilt: (towerId: string, level: number) => void;
  evolveBuilt: (
    fromTowerId: string,
    level: number,
    toTowerId: string,
    copyKey?: string,
  ) => void;
  clearFinalForm: (copyKey: string) => void;

  placeTower: (
    mapId: string,
    towerId: string,
    level: number,
    col: number,
    row: number,
    finalForm?: TowerPlacement["finalForm"],
  ) => void;
  unplaceTower: (mapId: string, col: number, row: number) => void;
  movePlacement: (copyKey: string, col: number, row: number) => void;

  setPlan: (plan: PortableBuild | null) => void;
  setMatchLength: (length: LiveMatchLength) => void;
  newGame: () => void;
  hydrate: (snapshot: Partial<LiveSnapshot>) => void;
};

function emptySnapshot(): LiveSnapshot {
  return {
    matchLength: "full",
    allocation: emptyLiveAllocation(),
    pickLog: [],
    built: [],
    holds: 0,
    placements: [],
  };
}

/** Clamp a requested level to 1..absolute-max (ignores allocation). */
function clampLevel(towerId: string, level: number): number {
  return Math.max(1, Math.min(liveTowerMaxLevel(towerId), Math.round(level)));
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
  placementCue: null,
  evolutionHistory: [],
  undoEvolution: () =>
    set((state) => {
      const previous = state.evolutionHistory.at(-1);
      if (!previous) return state;
      return {
        built: previous.built,
        placements: previous.placements,
        placementCue: null,
        evolutionHistory: state.evolutionHistory.slice(0, -1),
      };
    }),

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
  unhold: () => set((state) => ({ holds: Math.max(0, state.holds - 1) })),

  addBuilt: (towerId, level) =>
    set((state) => {
      // The tracker mirrors the game — it must not let you log a tower the
      // current keystones can't reach. The UI already hides those; this is
      // the backstop.
      if (liveBuildBlock(towerId, state.allocation, state.holds, state.built))
        return state;

      const lvl = clampReachable(towerId, level ?? 1, state.allocation);
      const existing = state.built.find((entry) =>
        isSameBuiltRow(entry, towerId, lvl),
      );
      if (existing) {
        return {
          placementCue: { towerId, level: lvl },
          evolutionHistory: [],
          built: state.built.map((entry) =>
            isSameBuiltRow(entry, towerId, lvl)
              ? { ...entry, quantity: entry.quantity + 1 }
              : entry,
          ),
        };
      }
      return {
        placementCue: { towerId, level: lvl },
        evolutionHistory: [],
        built: [...state.built, { towerId, level: lvl, quantity: 1 }],
      };
    }),

  setBuiltLevel: (towerId, fromLevel, toLevel, copyKey) =>
    set((state) => {
      if (!Number.isFinite(toLevel)) return state;
      const lvl = clampLevel(towerId, toLevel);
      if (lvl === fromLevel) return state;
      if (
        lvl > fromLevel &&
        liveTowerReachableLevel(towerId, state.allocation) < lvl
      )
        return state;
      const moving = state.built.find((entry) =>
        isSameBuiltRow(entry, towerId, fromLevel),
      );
      if (!moving) return state;

      const copy = copyKey
        ? state.placements.find(
            (p) =>
              placementKey(p) === copyKey &&
              isSameBuiltRow(p, towerId, fromLevel),
          )
        : moving.quantity <= placedCount(state.placements, towerId, fromLevel)
          ? state.placements.find((p) => isSameBuiltRow(p, towerId, fromLevel))
          : undefined;
      if (copyKey && !copy) return state;
      if (!followsFinalForm(towerId, lvl, copy?.finalForm)) return state;

      let moved = !copy;
      const placements = state.placements.map((placement) => {
        if (moved || placement !== copy) return placement;
        moved = true;
        return { ...placement, level: lvl };
      });
      const drained = state.built
        .map((entry) =>
          isSameBuiltRow(entry, towerId, fromLevel)
            ? { ...entry, quantity: entry.quantity - 1 }
            : entry,
        )
        .filter((entry) => entry.quantity > 0);
      const mergeInto = drained.some((entry) =>
        isSameBuiltRow(entry, towerId, lvl),
      );
      return {
        placements,
        evolutionHistory: [],
        placementCue: { towerId, level: lvl },
        built: mergeInto
          ? drained.map((entry) =>
              isSameBuiltRow(entry, towerId, lvl)
                ? { ...entry, quantity: entry.quantity + 1 }
                : entry,
            )
          : [...drained, { towerId, level: lvl, quantity: 1 }],
      };
    }),

  setBuiltQuantity: (towerId, level, quantity) =>
    set((state) => {
      // Dropping copies has to drop their cells too, or the map keeps
      // showing towers the field log says you no longer own.
      if (!Number.isFinite(quantity)) return state;
      const keep = Math.max(0, Math.round(quantity));
      const previous = state.built.find((entry) =>
        isSameBuiltRow(entry, towerId, level),
      );
      if (!previous || previous.quantity === keep) return state;
      if (
        keep > previous.quantity &&
        (liveTowerReachableLevel(towerId, state.allocation) < level ||
          liveBuildBlock(
            towerId,
            state.allocation,
            state.holds,
            state.built,
            keep - previous.quantity,
          ))
      )
        return state;
      let seen = 0;
      const placements = state.placements.filter((entry) => {
        if (entry.towerId !== towerId || entry.level !== level) return true;
        seen += 1;
        return seen <= keep;
      });

      return {
        evolutionHistory: [],
        placementCue: keep > previous.quantity ? { towerId, level } : null,
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
      evolutionHistory: [],
      placementCue: null,
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
  evolveBuilt: (fromTowerId, level, toTowerId, copyKey) =>
    set((state) => {
      const source = state.built.find((entry) =>
        isSameBuiltRow(entry, fromTowerId, level),
      );
      if (!source) return state;
      const copy = copyKey
        ? state.placements.find(
            (p) =>
              placementKey(p) === copyKey &&
              isSameBuiltRow(p, fromTowerId, level),
          )
        : source.quantity <= placedCount(state.placements, fromTowerId, level)
          ? state.placements.find((p) => isSameBuiltRow(p, fromTowerId, level))
          : undefined;
      if (copyKey && !copy) return state;
      if (!followsFinalForm(toTowerId, level, copy?.finalForm)) return state;
      if (!canEvolveInto(fromTowerId, toTowerId, level)) return state;
      if (!isTowerLoggable(toTowerId, state.allocation)) return state;
      if (liveTowerReachableLevel(toTowerId, state.allocation) < level)
        return state;

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
      let moved = !copy;
      const placements = state.placements.map((entry) => {
        if (moved || entry !== copy) {
          return entry;
        }
        moved = true;
        return { ...entry, towerId: toTowerId };
      });

      return {
        evolutionHistory: [
          ...state.evolutionHistory,
          {
            built: state.built,
            placements: state.placements,
            label: `${fromTowerId} → ${toTowerId}`,
          },
        ],
        placementCue: { towerId: toTowerId, level },
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
  clearFinalForm: (copyKey) =>
    set((state) => ({
      evolutionHistory: [],
      placements: state.placements.map((p) =>
        placementKey(p) === copyKey ? { ...p, finalForm: undefined } : p,
      ),
    })),

  placeTower: (mapId, towerId, level, col, row, finalForm) =>
    set((state) => {
      if (placementAt(state.placements, mapId, col, row)) return state;
      if (!followsFinalForm(towerId, level, finalForm)) return state;

      const owned =
        state.built.find((entry) => isSameBuiltRow(entry, towerId, level))
          ?.quantity ?? 0;
      if (owned <= placedCount(state.placements, towerId, level)) {
        return state;
      }

      return {
        evolutionHistory: [],
        placements: [
          ...state.placements,
          {
            mapId,
            towerId,
            level,
            col,
            row,
            ...(finalForm ? { finalForm } : {}),
          },
        ],
      };
    }),

  movePlacement: (copyKey, col, row) =>
    set((state) => {
      const copy = state.placements.find((p) => placementKey(p) === copyKey);
      if (
        !copy ||
        !Number.isInteger(col) ||
        !Number.isInteger(row) ||
        placementAt(state.placements, copy.mapId, col, row)
      )
        return state;
      return {
        evolutionHistory: [],
        placements: state.placements.map((p) =>
          p === copy ? { ...p, col, row } : p,
        ),
      };
    }),

  unplaceTower: (mapId, col, row) =>
    set((state) => ({
      evolutionHistory: [],
      placements: state.placements.filter(
        (entry) =>
          !(entry.mapId === mapId && entry.col === col && entry.row === row),
      ),
    })),

  setPlan: (plan) => set({ plan }),
  setMatchLength: (matchLength) => set({ matchLength }),

  newGame: () =>
    set({
      ...emptySnapshot(),
      lastPick: null,
      placementCue: null,
      evolutionHistory: [],
    }),

  hydrate: (snapshot) =>
    set((state) => {
      const built = mergeLegacyBuilt(snapshot.built) ?? state.built;
      return {
        placementCue: null,
        evolutionHistory: [],
        matchLength: isLiveMatchLength(snapshot.matchLength)
          ? snapshot.matchLength
          : state.matchLength,
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
      ...(entry.finalForm &&
      followsFinalForm(entry.towerId, level, entry.finalForm)
        ? { finalForm: entry.finalForm }
        : {}),
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
