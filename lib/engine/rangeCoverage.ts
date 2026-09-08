export type RangeCoverageMeasurement = {
  anchorRange: number;

  packageMinRange: number;
  packageMaxRange: number;

  rangeExtensionFromAnchor: number;

  longerRangeContributorCount: number;
  hasLongerRangeContributor: boolean;

  meaningfulRangeExtensionFromAnchor: number;
  hasMeaningfulLongerRangeContributor: boolean;
};

export function evaluateRangeCoverage(
  anchorRange: number,
  supportingRanges: readonly number[] = [],
  meaningfulSupportingRanges:
    readonly number[] =
      supportingRanges,
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

  const meaningfulMaxRange =
    Math.max(
      anchorRange,
      ...meaningfulSupportingRanges,
    );

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

    meaningfulRangeExtensionFromAnchor:
      Math.max(
        0,
        meaningfulMaxRange -
          anchorRange,
      ),
    hasMeaningfulLongerRangeContributor:
      meaningfulMaxRange >
      anchorRange,
  };
}
