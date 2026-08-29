import { describe, expect, it } from "vitest";
import { optimize } from "@/lib/engine/allocation";
import { optimizeV8 } from "@/lib/engine/v8-optimizer";

describe("V8 optimizer", () => {
  it("evaluates candidates through the V8 pipeline", () => {
    const result = optimizeV8([
      "Light",
      "Darkness",
      "Water",
    ]);

    expect(result.evaluations.length).toBeGreaterThan(
      0,
    );
    expect(result.finalists.length).toBeGreaterThan(
      0,
    );
    expect(result.winner).not.toBeNull();
  });

  it("does not replace the legacy optimizer", () => {
    const legacy = optimize([
      "Light",
      "Darkness",
      "Water",
    ]);

    const v8 = optimizeV8([
      "Light",
      "Darkness",
      "Water",
    ]);

    expect(legacy.length).toBeGreaterThan(0);
    expect(v8.evaluations.length).toBeGreaterThan(0);
  });

  it("respects a requested tower anchor", () => {
    const result = optimizeV8(
      [
        "Light",
        "Darkness",
        "Water",
      ],
      "Nuclear",
    );

    expect(result.evaluations.length).toBeGreaterThan(
      0,
    );
    expect(result.winner).not.toBeNull();

    expect(
      result.winner?.anchor,
    ).toBe("Nuclear");

    expect(
      result.winner?.towers.some(
        (tower) => tower.tower.name === "Nuclear",
      ),
    ).toBe(true);
  });
});