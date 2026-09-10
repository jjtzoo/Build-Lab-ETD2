"use client";

import { create } from "zustand";

import {
  MAX_ELEMENT_LEVEL,
  maxReachableTowerLevel,
  totalKeystones,
} from "@/lib/engine/allocation";
import { getTower } from "@/lib/domain/towerCatalog";
import type { ElementAllocation, ElementName } from "@/lib/domain/elements";
import type { PortableBuild } from "@/lib/domain/portableBuild";
import {
  emptyLiveAllocation,
  isEndGameTowerId,
  MAX_KEYSTONES,
  type BuiltTower,
} from "@/lib/engine/liveGame";

export type LiveSnapshot = {
  allocation: ElementAllocation;
  pickLog: ElementName[];
  built: BuiltTower[];
  waveNote: number | null;
};

type LiveState = LiveSnapshot & {
  plan: PortableBuild | null;
  /** Set for one render after a pick, so the UI can flash what changed. */
  lastPick: { before: ElementAllocation; after: ElementAllocation } | null;

  spendPick: (element: ElementName) => void;
  undoPick: () => void;
  clearReveal: () => void;

  addBuilt: (towerId: string, level?: number) => void;
  setBuiltLevel: (towerId: string, level: number) => void;
  setBuiltQuantity: (towerId: string, quantity: number) => void;
  removeBuilt: (towerId: string) => void;

  setPlan: (plan: PortableBuild | null) => void;
  setWaveNote: (wave: number | null) => void;
  newGame: () => void;
  hydrate: (snapshot: Partial<LiveSnapshot>) => void;
};

function emptySnapshot(): LiveSnapshot {
  return {
    allocation: emptyLiveAllocation(),
    pickLog: [],
    built: [],
    waveNote: null,
  };
}

/** Max level of a tower the player could actually have, for a sane default. */
function defaultBuiltLevel(
  towerId: string,
  allocation: ElementAllocation,
): number {
  if (isEndGameTowerId(towerId)) return 1;
  const reachable = maxReachableTowerLevel(getTower(towerId), allocation);
  return Math.max(1, reachable);
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

  addBuilt: (towerId, level) =>
    set((state) => {
      const existing = state.built.find(
        (entry) => entry.towerId === towerId,
      );
      if (existing) {
        return {
          built: state.built.map((entry) =>
            entry.towerId === towerId
              ? { ...entry, quantity: entry.quantity + 1 }
              : entry,
          ),
        };
      }
      return {
        built: [
          ...state.built,
          {
            towerId,
            level: level ?? defaultBuiltLevel(towerId, state.allocation),
            quantity: 1,
          },
        ],
      };
    }),

  setBuiltLevel: (towerId, level) =>
    set((state) => ({
      built: state.built.map((entry) => {
        if (entry.towerId !== towerId) return entry;
        const cap = isEndGameTowerId(towerId)
          ? 1
          : getTower(towerId).maxLevel;
        return {
          ...entry,
          level: Math.max(1, Math.min(cap, level)),
        };
      }),
    })),

  setBuiltQuantity: (towerId, quantity) =>
    set((state) => ({
      built:
        quantity <= 0
          ? state.built.filter((entry) => entry.towerId !== towerId)
          : state.built.map((entry) =>
              entry.towerId === towerId
                ? { ...entry, quantity }
                : entry,
            ),
    })),

  removeBuilt: (towerId) =>
    set((state) => ({
      built: state.built.filter((entry) => entry.towerId !== towerId),
    })),

  setPlan: (plan) => set({ plan }),
  setWaveNote: (waveNote) => set({ waveNote }),

  newGame: () => set({ ...emptySnapshot(), lastPick: null }),

  hydrate: (snapshot) =>
    set((state) => ({
      allocation: snapshot.allocation ?? state.allocation,
      pickLog: snapshot.pickLog ?? state.pickLog,
      built: snapshot.built ?? state.built,
      waveNote: snapshot.waveNote ?? state.waveNote,
      lastPick: null,
    })),
}));
