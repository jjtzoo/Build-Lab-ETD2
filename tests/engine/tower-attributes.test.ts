import { describe, expect, it } from "vitest";

import { TOWERS } from "@/lib/data";
import { TOWER_ATTRIBUTE_EVIDENCE_BY_TOWER } from "@/data/tower-attributes";

describe("canonical tower attribute evidence", () => {
  it("covers every catalog tower with qualitative tier evidence and provenance", () => {
    expect(Object.keys(TOWER_ATTRIBUTE_EVIDENCE_BY_TOWER).sort()).toEqual(
      TOWERS.map((tower) => tower.name).sort(),
    );
    expect(TOWER_ATTRIBUTE_EVIDENCE_BY_TOWER.Poison).toMatchObject({
      tiers: { dot: "gold", range: "bronze" },
      confidence: "medium",
      sourceUrl: "https://eletd2.fandom.com/wiki/Poison_Tower",
    });
  });
});
