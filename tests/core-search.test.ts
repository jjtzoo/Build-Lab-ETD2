import { describe, expect, it } from "vitest";

import {
  allCoreCombinations,
} from "@/lib/engine/core-search";

describe("core search", () => {
  it("enumerates all 20 three-element cores", () => {
    const cores =
      allCoreCombinations();

    expect(cores).toHaveLength(20);

    for (const core of cores) {
      expect(core).toHaveLength(3);
      expect(
        new Set(core).size,
      ).toBe(3);
    }
  });
});