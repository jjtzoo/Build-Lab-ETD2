import { describe, expect, it } from "vitest";

import {
  deriveEffectiveElementAllocation,
  deriveMinimumElementAllocation,
  emptyElementAllocation,
} from "@/lib/engine/derived-allocation";
import { createBuildState } from "@/lib/engine/build-state";
import type { ElementAllocation, SelectedTowerInput } from "@/lib/types";

function selected(...towers: SelectedTowerInput[]): SelectedTowerInput[] {
  return towers;
}

function allocation(overrides: Partial<ElementAllocation> = {}): ElementAllocation {
  return { ...emptyElementAllocation(), ...overrides };
}

describe("derived element allocation", () => {
  it("derives Bloom's minimum Light and Nature allocation", () => {
    expect(deriveMinimumElementAllocation(selected({ towerName: "Bloom", level: 1 }))).toEqual(
      allocation({ Light: 1, Nature: 1 }),
    );
  });

  it("uses the maximum shared depth instead of adding requirements", () => {
    expect(deriveMinimumElementAllocation(selected(
      { towerName: "Bloom", level: 1 },
      { towerName: "Trickery", level: 1 },
      { towerName: "Ethereal", level: 1 },
      { towerName: "Disease", level: 1 },
    ))).toEqual(allocation({ Light: 1, Darkness: 1, Nature: 1 }));
  });

  it("raises every Ethereal recipe element when its level increases", () => {
    expect(deriveMinimumElementAllocation(selected({ towerName: "Ethereal", level: 2 }))).toEqual(
      allocation({ Light: 2, Darkness: 2, Nature: 2 }),
    );
  });

  it("recomputes from the complete remaining build when a tower is removed", () => {
    const beforeRemoval = deriveMinimumElementAllocation(selected(
      { towerName: "Bloom", level: 1 },
      { towerName: "Ethereal", level: 2 },
    ));
    const afterRemoval = deriveMinimumElementAllocation(selected(
      { towerName: "Bloom", level: 1 },
    ));

    expect(beforeRemoval).toEqual(allocation({ Light: 2, Darkness: 2, Nature: 2 }));
    expect(afterRemoval).toEqual(allocation({ Light: 1, Nature: 1 }));
  });

  it("never lets optional allocation reduce the effective required allocation", () => {
    const required = allocation({ Light: 2, Darkness: 2, Nature: 2 });
    const manual = allocation({ Light: 0, Darkness: 5, Nature: 1, Fire: 3 });

    expect(deriveEffectiveElementAllocation(required, manual)).toEqual(
      allocation({ Light: 2, Darkness: 5, Nature: 2, Fire: 3 }),
    );
  });

  it("creates a valid API BuildState for the normal tower-selection flow", () => {
    const towers = selected(
      { towerName: "Bloom", level: 1 },
      { towerName: "Trickery", level: 1 },
      { towerName: "Ethereal", level: 1 },
      { towerName: "Disease", level: 1 },
    );
    const effective = deriveEffectiveElementAllocation(
      deriveMinimumElementAllocation(towers),
      emptyElementAllocation(),
    );

    expect(createBuildState({
      selectedTowers: towers,
      elementAllocation: effective,
      maxTowerSlots: 10,
    }).elementAllocation).toEqual(allocation({ Light: 1, Darkness: 1, Nature: 1 }));
  });
});
