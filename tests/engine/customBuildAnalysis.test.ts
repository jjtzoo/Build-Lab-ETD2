import { describe, expect, it } from "vitest";

import { analyzeCustomBuild } from "@/lib/engine/customBuildAnalysis";

// mushroom = AoE Nature anchor that scales with slow.
// nova = Slow trio (provides enemy-slow).
// rage = single-target tower providing target-isolation + damage-taken-amp,
//        with an empty coreRoles list.
const BUILD = [
  { towerId: "mushroom", level: 3 },
  { towerId: "nova", level: 2 },
  { towerId: "rage", level: 2 },
] as const;

describe("analyzeCustomBuild", () => {
  const analysis = analyzeCustomBuild([...BUILD]);

  it("derives the allocation and keystone total from the placed towers", () => {
    const sum = Object.values(analysis.allocation).reduce(
      (a, b) => a + b,
      0,
    );
    expect(analysis.keystoneCount).toBe(sum);
    expect(analysis.allocation.Nature).toBe(3);
  });

  it("grades the Slow -> anchor synergy relation", () => {
    const novaToMushroom = analysis.synergy.relations.find(
      (relation) =>
        relation.providerId === "nova" &&
        relation.consumerId === "mushroom",
    );
    expect(novaToMushroom).toBeDefined();
    expect(novaToMushroom?.consumerIsAnchor).toBe(true);
    expect(novaToMushroom?.qualification.tier).toBeDefined();
  });

  it("flags the isolation-vs-area tension against the AoE anchor", () => {
    const tension = analysis.tensions.find(
      (entry) =>
        entry.providerId === "rage" &&
        entry.affectedId === "mushroom",
    );
    expect(tension).toBeDefined();
  });

  it("raises a soft isolation-vs-area warning (non-blocking)", () => {
    const warning = analysis.warnings.find(
      (entry) => entry.kind === "isolation-vs-area",
    );
    expect(warning).toBeDefined();
    expect(warning?.towerIds).toContain("rage");
  });

  it("reports missing core roles (damage-amp, buff)", () => {
    const missing = analysis.warnings
      .filter((entry) => entry.kind === "missing-core-role")
      .map((entry) => entry.title);
    expect(missing).toEqual(
      expect.arrayContaining([
        "No Damage Amp tower",
        "No Buff tower",
      ]),
    );
    expect(
      analysis.coreRoles.find((role) => role.role === "slow")
        ?.satisfied,
    ).toBe(true);
  });

  it("marks Fire as an anchor weakness for a Nature anchor", () => {
    const fireRow = analysis.coverage.rows.find(
      (row) => row.defender === "Fire",
    );
    expect(fireRow?.isAnchorWeakness).toBe(true);
  });
});
