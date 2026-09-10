"use client";

import { create } from "zustand";

import { ELEMENTS, type ElementAllocation } from "@/lib/domain/elements";
import { getTower, TOWERS } from "@/lib/domain/towerCatalog";
import { getTowerProfile } from "@/lib/domain/towerProfileCatalog";
import { CURATED_ANCHORS } from "@/lib/domain/anchorPolicy";
import type { Tower } from "@/lib/domain/tower";
import {
  deriveAllocation,
  emptyAllocation,
  maxFittingLevel,
  keystoneCost,
  totalKeystones,
  type PlacedTower,
} from "@/lib/engine/customBuild";

export type SlotKind = "anchor" | "slow" | "optional";

export type Slot = {
  id: string;
  kind: SlotKind;
  towerId: string | null;
  level: number | null;
};

/** Slow-role towers, from the canonical profiles. */
export const SLOW_TOWER_IDS: readonly string[] = TOWERS.filter((tower) =>
  getTowerProfile(tower.id).coreRoles.includes("slow"),
).map((tower) => tower.id);

const ANCHOR_TOWER_IDS: readonly string[] = CURATED_ANCHORS.map(
  (anchor) => anchor.towerId,
);

function makeSlot(kind: SlotKind): Slot {
  return {
    id:
      kind === "optional"
        ? `opt-${Math.random().toString(36).slice(2, 9)}`
        : kind,
    kind,
    towerId: null,
    level: null,
  };
}

const INITIAL_SLOTS: Slot[] = [makeSlot("anchor"), makeSlot("slow")];

type TheoryCraftState = {
  slots: Slot[];
  focusedSlotId: string | null;

  setTower: (slotId: string, towerId: string) => void;
  setLevel: (slotId: string, level: number) => void;
  addOptionalSlot: () => void;
  removeSlot: (slotId: string) => void;
  focusSlot: (slotId: string | null) => void;
  reset: () => void;
  loadPlaced: (placed: readonly PlacedTower[]) => void;
};

/** Minimum level a slot's tower may sit at (anchors never below 2). */
function minLevelForKind(kind: SlotKind): number {
  return kind === "anchor" ? 2 : 1;
}

function defaultLevel(
  kind: SlotKind,
  tower: Tower,
  base: ElementAllocation,
): number {
  const fit = maxFittingLevel(tower, base);
  const floor = minLevelForKind(kind);
  if (kind === "anchor") {
    // Anchor is picked first; if nothing else constrains it, sit at the
    // assumed anchor depth (Dual 3 / Trio 2).
    const assumed = tower.combination === "Trio" ? 2 : 3;
    return Math.min(tower.maxLevel, Math.max(floor, fit || assumed));
  }
  return Math.max(1, fit || 1) < floor ? floor : Math.max(1, fit || 1);
}

/** Allocation from every placed slot except `exceptId`. */
function baseAllocationExcluding(
  slots: readonly Slot[],
  exceptId: string,
): ElementAllocation {
  const placed = slots
    .filter(
      (slot) =>
        slot.id !== exceptId &&
        slot.towerId != null &&
        slot.level != null,
    )
    .map((slot) => ({ towerId: slot.towerId!, level: slot.level! }));
  return placed.length ? deriveAllocation(placed) : emptyAllocation();
}

export const useTheoryCraft = create<TheoryCraftState>((set) => ({
  slots: INITIAL_SLOTS,
  focusedSlotId: "anchor",

  setTower: (slotId, towerId) =>
    set((state) => {
      const tower = getTower(towerId);
      const base = baseAllocationExcluding(state.slots, slotId);
      return {
        slots: state.slots.map((slot) =>
          slot.id === slotId
            ? {
                ...slot,
                towerId,
                level: defaultLevel(slot.kind, tower, base),
              }
            : slot,
        ),
        focusedSlotId: slotId,
      };
    }),

  setLevel: (slotId, level) =>
    set((state) => ({
      slots: state.slots.map((slot) => {
        if (slot.id !== slotId || slot.towerId == null) return slot;
        const tower = getTower(slot.towerId);
        const clamped = Math.max(
          minLevelForKind(slot.kind),
          Math.min(tower.maxLevel, level),
        );
        return { ...slot, level: clamped };
      }),
    })),

  addOptionalSlot: () =>
    set((state) => {
      const slot = makeSlot("optional");
      return {
        slots: [...state.slots, slot],
        focusedSlotId: slot.id,
      };
    }),

  removeSlot: (slotId) =>
    set((state) => {
      const target = state.slots.find((slot) => slot.id === slotId);
      if (!target || target.kind !== "optional") return state;
      const slots = state.slots.filter((slot) => slot.id !== slotId);
      return {
        slots,
        focusedSlotId:
          state.focusedSlotId === slotId
            ? "anchor"
            : state.focusedSlotId,
      };
    }),

  focusSlot: (slotId) => set({ focusedSlotId: slotId }),

  reset: () =>
    set({
      slots: [makeSlot("anchor"), makeSlot("slow")],
      focusedSlotId: "anchor",
    }),

  loadPlaced: (placed) =>
    set(() => {
      if (placed.length === 0) {
        return {
          slots: [makeSlot("anchor"), makeSlot("slow")],
          focusedSlotId: "anchor",
        };
      }
      const [anchor, ...rest] = placed;
      const slowIndex = rest.findIndex((entry) =>
        SLOW_TOWER_IDS.includes(entry.towerId),
      );
      const slow = slowIndex >= 0 ? rest[slowIndex] : null;
      const optional =
        slowIndex >= 0
          ? rest.filter((_, index) => index !== slowIndex)
          : rest;

      const slots: Slot[] = [
        { ...makeSlot("anchor"), towerId: anchor.towerId, level: anchor.level },
        {
          ...makeSlot("slow"),
          towerId: slow?.towerId ?? null,
          level: slow?.level ?? null,
        },
        ...optional.map((entry) => ({
          ...makeSlot("optional"),
          towerId: entry.towerId,
          level: entry.level,
        })),
      ];
      return { slots, focusedSlotId: "anchor" };
    }),
}));

// ---- selectors -------------------------------------------------------

export function selectPlaced(
  state: Pick<TheoryCraftState, "slots">,
): PlacedTower[] {
  return state.slots
    .filter((slot) => slot.towerId != null && slot.level != null)
    .map((slot) => ({ towerId: slot.towerId!, level: slot.level! }));
}

export function selectAllocation(
  state: Pick<TheoryCraftState, "slots">,
): ElementAllocation {
  const placed = selectPlaced(state);
  return placed.length ? deriveAllocation(placed) : emptyAllocation();
}

export function selectKeystonesUsed(
  state: Pick<TheoryCraftState, "slots">,
): number {
  return totalKeystones(selectAllocation(state));
}

/** Deepest level the slot's current tower can reach given the other slots. */
export function selectSlotMaxLevel(
  state: Pick<TheoryCraftState, "slots">,
  slotId: string,
): number {
  const slot = state.slots.find((entry) => entry.id === slotId);
  if (!slot || slot.towerId == null) return 0;
  const base = baseAllocationExcluding(state.slots, slotId);
  return maxFittingLevel(getTower(slot.towerId), base);
}

export type SlotCandidate = {
  tower: Tower;
  maxLevel: number;
  keystoneCostAtMin: number;
};

/** Towers offerable in `slotId`, honouring the 11-keystone budget. */
export function selectCandidates(
  state: Pick<TheoryCraftState, "slots">,
  slotId: string,
): SlotCandidate[] {
  const slot = state.slots.find((entry) => entry.id === slotId);
  if (!slot) return [];

  const base = baseAllocationExcluding(state.slots, slotId);
  const placedElsewhere = new Set(
    state.slots
      .filter((entry) => entry.id !== slotId && entry.towerId != null)
      .map((entry) => entry.towerId as string),
  );

  const pool: readonly string[] =
    slot.kind === "anchor"
      ? ANCHOR_TOWER_IDS
      : slot.kind === "slow"
        ? SLOW_TOWER_IDS
        : TOWERS.map((tower) => tower.id);

  const floor = minLevelForKind(slot.kind);

  return pool
    .filter((towerId) => !placedElsewhere.has(towerId))
    .map((towerId) => getTower(towerId))
    .map((tower) => ({
      tower,
      maxLevel: maxFittingLevel(tower, base),
      keystoneCostAtMin: keystoneCost(tower, base, floor),
    }))
    .filter((candidate) => candidate.maxLevel >= floor)
    .sort(
      (a, b) =>
        a.keystoneCostAtMin - b.keystoneCostAtMin ||
        a.tower.name.localeCompare(b.tower.name),
    );
}

export { ELEMENTS };
