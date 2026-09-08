import { describe, expect, it } from "vitest";

import { evaluateDamageShapeCoverage } from "@/lib/engine/damageShapeCoverage";

describe("evaluateDamageShapeCoverage", () => {
  it("reports no complementary shape for a single-target-only package", () => {
    const result = evaluateDamageShapeCoverage(
      "single-target",
    );

    expect(result).toEqual({
      anchorShape: "single-target",

      singleTargetCount: 1,
      aoeCount: 0,
      hybridCount: 0,

      hasSingleTargetCapability: true,
      hasAoeCapability: false,

      hasComplementaryShape: false,
      hasMeaningfulComplementaryShape:
        false,
    });
  });

  it("detects AoE as complementary to a single-target anchor", () => {
    const result = evaluateDamageShapeCoverage(
      "single-target",
      ["aoe"],
    );

    expect(result).toEqual({
      anchorShape: "single-target",

      singleTargetCount: 1,
      aoeCount: 1,
      hybridCount: 0,

      hasSingleTargetCapability: true,
      hasAoeCapability: true,

      hasComplementaryShape: true,
      hasMeaningfulComplementaryShape:
        true,
    });
  });

  it("treats hybrid as complementary to an AoE anchor", () => {
    const result = evaluateDamageShapeCoverage(
      "aoe",
      ["hybrid"],
    );

    expect(result).toEqual({
      anchorShape: "aoe",

      singleTargetCount: 0,
      aoeCount: 1,
      hybridCount: 1,

      hasSingleTargetCapability: true,
      hasAoeCapability: true,

      hasComplementaryShape: true,
      hasMeaningfulComplementaryShape:
        true,
    });
  });

  it("treats a hybrid anchor as having both coarse damage capabilities", () => {
    const result = evaluateDamageShapeCoverage(
      "hybrid",
    );

    expect(result).toEqual({
      anchorShape: "hybrid",

      singleTargetCount: 0,
      aoeCount: 0,
      hybridCount: 1,

      hasSingleTargetCapability: true,
      hasAoeCapability: true,

      hasComplementaryShape: true,
      hasMeaningfulComplementaryShape:
        true,
    });
  });

  it("keeps insignificant shape access technical rather than meaningful", () => {
    const result =
      evaluateDamageShapeCoverage(
        "single-target",
        ["aoe"],
        [],
      );

    expect(result)
      .toMatchObject({
        hasComplementaryShape: true,
        hasMeaningfulComplementaryShape:
          false,
      });
  });
});
