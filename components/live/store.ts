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
  type BuiltTower,
} from "@/lib/engine/liveGame";

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
      if (!mergeInto) {
        // No row at the target level — just relabel this one in place.
        return {
          built: state.built.map((entry) =>
            isSameBuiltRow(entry, towerId, fromLevel)
              ? { ...entry, level: lvl }
              : entry,
          ),
        };
      }
      // Fold the moving row's count into the existing target row.
      return {
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
    set((state) => ({
      built:
        quantity <= 0
          ? state.built.filter(
              (entry) => !isSameBuiltRow(entry, towerId, level),
            )
          : state.built.map((entry) =>
              isSameBuiltRow(entry, towerId, level)
                ? { ...entry, quantity }
                : entry,
            ),
    })),

  removeBuilt: (towerId, level) =>
    set((state) => ({
      built: state.built.filter(
        (entry) => !isSameBuiltRow(entry, towerId, level),
      ),
    })),

  setPlan: (plan) => set({ plan }),

  newGame: () => set({ ...emptySnapshot(), lastPick: null }),

  hydrate: (snapshot) =>
    set((state) => ({
      allocation: snapshot.allocation ?? state.allocation,
      pickLog: snapshot.pickLog ?? state.pickLog,
      built: mergeLegacyBuilt(snapshot.built) ?? state.built,
      holds: snapshot.holds ?? state.holds,
      lastPick: null,
    })),
}));

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
