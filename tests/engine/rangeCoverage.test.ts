import { describe, expect, it } from "vitest";

import { evaluateRangeCoverage } from "@/lib/engine/rangeCoverage";

describe("evaluateRangeCoverage", () => {
  it("reports no extension when the anchor is the longest-range contributor", () => {
    const result = evaluateRangeCoverage(
      1500,
      [750, 900],
    );

    expect(result).toEqual({
      anchorRange: 1500,
      packageMinRange: 750,
      packageMaxRange: 1500,
      rangeExtensionFromAnchor: 0,
      longerRangeContributorCount: 0,
      hasLongerRangeContributor: false,
    });
  });

  it("detects a longer-range contributor for a short-range anchor", () => {
    const result = evaluateRangeCoverage(
      750,
      [1500],
    );

    expect(result).toEqual({
      anchorRange: 750,
      packageMinRange: 750,
      packageMaxRange: 1500,
      rangeExtensionFromAnchor: 750,
      longerRangeContributorCount: 1,
      hasLongerRangeContributor: true,
    });
  });

  it("counts multiple longer-range contributors", () => {
    const result = evaluateRangeCoverage(
      750,
      [900, 1125, 1500],
    );

    expect(result).toEqual({
      anchorRange: 750,
      packageMinRange: 750,
      packageMaxRange: 1500,
      rangeExtensionFromAnchor: 750,
      longerRangeContributorCount: 3,
      hasLongerRangeContributor: true,
    });
  });

  it("measures improvement from the 625 range outlier without classifying it as weak", () => {
    const result = evaluateRangeCoverage(
      625,
      [900],
    );

    expect(result).toEqual({
      anchorRange: 625,
      packageMinRange: 625,
      packageMaxRange: 900,
      rangeExtensionFromAnchor: 275,
      longerRangeContributorCount: 1,
      hasLongerRangeContributor: true,
    });
  });
});