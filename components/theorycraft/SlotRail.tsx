"use client";

import { useMemo } from "react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { TowerIcon, roman } from "@/components/build-lab/primitives";
import type { CombinationClass } from "@/lib/domain/tower";
import { getTower } from "@/lib/domain/towerCatalog";
import { getTowerProfile } from "@/lib/domain/towerProfileCatalog";
import { TowerSummary } from "@/components/theorycraft/TowerSummary";
import {
  CORE_ROLE_LABEL,
  CORE_ROLE_PRIORITY,
  SUPPORT_ROLE_LABEL,
  type CoreRole,
} from "@/lib/domain/roles";
import {
  useTheoryCraft,
  selectCandidates,
  selectSlotMaxLevel,
  type Slot,
} from "@/components/theorycraft/store";

const KIND_LABEL: Record<Slot["kind"], string> = {
  anchor: "Anchor · Main DPS",
  slow: "Slow",
  optional: "Support",
};

const COMBINATIONS: readonly CombinationClass[] = ["Dual", "Trio", "Quad"];

/** Role → group order key; towers with no core role sort last. */
const ROLE_ORDER: readonly (CoreRole | "support")[] = [
  ...CORE_ROLE_PRIORITY,
  "support",
];

function primaryRole(towerId: string): CoreRole | "support" {
  return getTowerProfile(towerId).coreRoles[0] ?? "support";
}

function roleLabel(role: CoreRole | "support"): string {
  return role === "support"
    ? SUPPORT_ROLE_LABEL
    : CORE_ROLE_LABEL[role];
}

function SlotRow({
  slot,
  index,
  assets,
}: {
  slot: Slot;
  index: number;
  assets: BuildLabAssets;
}) {
  const setTower = useTheoryCraft((s) => s.setTower);
  const setLevel = useTheoryCraft((s) => s.setLevel);
  const removeSlot = useTheoryCraft((s) => s.removeSlot);
  const focusSlot = useTheoryCraft((s) => s.focusSlot);
  const focused = useTheoryCraft((s) => s.focusedSlotId === slot.id);
  const slots = useTheoryCraft((s) => s.slots);

  const candidates = useMemo(
    () => selectCandidates({ slots }, slot.id),
    [slots, slot.id],
  );
  const maxLevel = useMemo(
    () => selectSlotMaxLevel({ slots }, slot.id),
    [slots, slot.id],
  );

  // Group by role first (Main DPS / Slow / Damage Amp / Buff / Support),
  // then by combination — every group still names its Dual/Trio/Quad tag.
  const grouped = useMemo(() => {
    const groups: {
      key: string;
      label: string;
      items: typeof candidates;
    }[] = [];
    for (const role of ROLE_ORDER) {
      for (const combination of COMBINATIONS) {
        const items = candidates.filter(
          (candidate) =>
            candidate.tower.combination === combination &&
            primaryRole(candidate.tower.id) === role,
        );
        if (items.length === 0) continue;
        groups.push({
          key: `${role}-${combination}`,
          label: `${roleLabel(role)} · ${combination}`,
          items,
        });
      }
    }
    return groups;
  }, [candidates]);

  const minLevel = slot.kind === "anchor" ? 2 : 1;
  const levelOptions: number[] = [];
  for (let level = minLevel; level <= Math.max(minLevel, maxLevel); level += 1) {
    levelOptions.push(level);
  }

  const tower = slot.towerId ? getTower(slot.towerId) : null;

  return (
    <li
      className="tc-slot"
      data-focused={focused || undefined}
      data-filled={slot.towerId ? true : undefined}
    >
      <button
        type="button"
        className="tc-slot-head"
        onClick={() => focusSlot(slot.id)}
      >
        <span className="tc-slot-index mono">{index + 1}</span>
        <span className="tc-slot-kind">{KIND_LABEL[slot.kind]}</span>
        {slot.kind === "optional" && (
          <span
            className="tc-slot-remove"
            role="button"
            tabIndex={0}
            aria-label="Remove this slot"
            onClick={(event) => {
              event.stopPropagation();
              removeSlot(slot.id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.stopPropagation();
                removeSlot(slot.id);
              }
            }}
          >
            ✕
          </span>
        )}
      </button>

      <div className="tc-slot-body">
        <span className="tc-slot-portrait-wrap">
          <span
            className="tc-slot-portrait"
            tabIndex={slot.towerId ? 0 : undefined}
            aria-label={
              tower && slot.level
                ? `${tower.name} level ${slot.level} — properties`
                : undefined
            }
          >
            {slot.towerId ? (
              <TowerIcon
                towerId={slot.towerId}
                name={tower?.name ?? slot.towerId}
                assets={assets}
                size={44}
              />
            ) : (
              <span className="tc-slot-portrait-empty">+</span>
            )}
          </span>
          {tower && slot.level && (
            <TowerSummary
              towerId={tower.id}
              level={slot.level}
              assets={assets}
            />
          )}
        </span>

        <div className="tc-slot-controls">
          <label className="tc-field">
            <span className="tc-field-label">Tower</span>
            <select
              className="tc-select"
              value={slot.towerId ?? ""}
              onFocus={() => focusSlot(slot.id)}
              onChange={(event) =>
                event.target.value &&
                setTower(slot.id, event.target.value)
              }
            >
              <option value="" disabled>
                {candidates.length
                  ? "Choose a tower…"
                  : "Nothing fits the remaining budget"}
              </option>
              {grouped.map((group) => (
                <optgroup key={group.key} label={group.label}>
                  {group.items.map((candidate) => (
                    <option
                      key={candidate.tower.id}
                      value={candidate.tower.id}
                    >
                      {candidate.tower.name}
                      {candidate.tower.id !== slot.towerId &&
                      candidate.keystoneCostAtMin > 0
                        ? ` (+${candidate.keystoneCostAtMin})`
                        : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="tc-field tc-field-level">
            <span className="tc-field-label">Level</span>
            <select
              className="tc-select"
              value={slot.level ?? ""}
              disabled={!slot.towerId}
              onFocus={() => focusSlot(slot.id)}
              onChange={(event) =>
                setLevel(slot.id, Number(event.target.value))
              }
            >
              {levelOptions.map((level) => (
                <option key={level} value={level}>
                  {roman(level)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </li>
  );
}

export function SlotRail({ assets }: { assets: BuildLabAssets }) {
  const slots = useTheoryCraft((s) => s.slots);
  const addOptionalSlot = useTheoryCraft((s) => s.addOptionalSlot);
  const reset = useTheoryCraft((s) => s.reset);

  return (
    <div className="tc-rail">
      <ul className="tc-slot-list">
        {slots.map((slot, index) => (
          <SlotRow
            key={slot.id}
            slot={slot}
            index={index}
            assets={assets}
          />
        ))}
      </ul>
      <div className="tc-rail-actions">
        <button
          type="button"
          className="tc-add-tower"
          onClick={addOptionalSlot}
        >
          + Add tower
        </button>
        <button type="button" className="tc-reset" onClick={reset}>
          Reset build
        </button>
      </div>
    </div>
  );
}
