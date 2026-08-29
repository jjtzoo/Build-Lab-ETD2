import { describe, expect, it } from "vitest";

import { optimizeV8 } from "@/lib/engine/v8-optimizer";

describe("anchor allocation behavior", () => {
  it("keeps the requested anchor meaningful in the winning build", () => {
    const result = optimizeV8(
      [
        "Darkness",
        "Earth",
        "Fire",
      ],
      "Howitzer",
    );

    expect(result.winner).not.toBeNull();

    const winner = result.winner!;

    const anchor = winner.towers.find(
      (tower) =>
        tower.tower.name === "Howitzer",
    );

    expect(anchor).toBeDefined();
    expect(anchor!.tier).toBeGreaterThan(0);
  });
});