import { describe, expect, it } from "vitest";

import {
  runBeamSearch,
} from "@/lib/engine/package-search";

import { buildTowerState } from "@/lib/engine/tower-state";
import { evaluateTower } from "@/lib/engine/evaluator-bundle";
import { TOWERS } from "@/lib/data";
import type { Allocation } from "@/lib/types";

describe("package beam search", () => {
  it("can build packages larger than five towers", () => {
    const allocation: Allocation = [
        2,
        2,
        2,
        1,
        2,
        2,
    ];

    const candidates = TOWERS
      .map((tower) =>
        evaluateTower(
          buildTowerState(
            tower,
            allocation,
          ),
        ),
      )
      .filter(
        (bundle) =>
          bundle.state.unlocked &&
          bundle.state.tier > 0,
      );

    const finalists =
      runBeamSearch(
        candidates,
        "Auto",
      );

    expect(finalists.length).toBeGreaterThan(0);

    expect(
      finalists.some(
        (state) =>
          state.set.length > 5,
      ),
    ).toBe(true);
  });

  it("keeps a requested anchor in every finalist", () => {
    const allocation: Allocation = [
        2,
        2,
        2,
        1,
        2,
        2,
    ];

    const candidates = TOWERS
      .map((tower) =>
        evaluateTower(
          buildTowerState(
            tower,
            allocation,
          ),
        ),
      )
      .filter(
        (bundle) =>
          bundle.state.unlocked &&
          bundle.state.tier > 0,
      );

    const finalists =
      runBeamSearch(
        candidates,
        "Howitzer",
      );

    expect(finalists.length).toBeGreaterThan(0);

    for (const state of finalists) {
      expect(
        state.set.some(
          (bundle) =>
            bundle.state.tower.name ===
            "Howitzer",
        ),
      ).toBe(true);
    }
  });
});