export type RangeCoverageMeasurement = {
  anchorRange: number;

  packageMinRange: number;
  packageMaxRange: number;

  rangeExtensionFromAnchor: number;

  longerRangeContributorCount: number;
  hasLongerRangeContributor: boolean;
};

export function evaluateRangeCoverage(
  anchorRange: number,
  supportingRanges: readonly number[] = [],
): RangeCoverageMeasurement {
  const packageRanges = [
    anchorRange,
    ...supportingRanges,
  ];

  const packageMinRange = Math.min(
    ...packageRanges,
  );

  const packageMaxRange = Math.max(
    ...packageRanges,
  );

  const longerRangeContributorCount =
    supportingRanges.filter(
      (range) => range > anchorRange,
    ).length;

  return {
    anchorRange,

    packageMinRange,
    packageMaxRange,

    rangeExtensionFromAnchor: Math.max(
      0,
      packageMaxRange - anchorRange,
    ),

    longerRangeContributorCount,
    hasLongerRangeContributor:
      longerRangeContributorCount > 0,
  };
}