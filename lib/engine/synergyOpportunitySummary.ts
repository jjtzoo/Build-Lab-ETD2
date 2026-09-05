import type { SaturationMode } from "@/lib/domain/mechanicSignals";
import type { SaturatedMechanicSynergyMatch } from "@/lib/engine/mechanicSynergy";
import type { DirectSynergyOpportunityComparison } from "@/lib/engine/synergyOpportunity";

export type MechanicContributionSnapshot = {
  fullStrengths: readonly number[];
  diminishedStrengths: readonly number[];
};

export type DirectSynergyOpportunitySummary = {
  consumerTowerId: string;
  signal: string;
  saturation: SaturationMode;

  status: "new-benefit" | "changed-benefit" | "unchanged-benefit";

  strongerSingleBenefit: boolean;
  additionalFullContributionCount: number;
  additionalDiminishedContributionCount: number;

  before: MechanicContributionSnapshot;
  after: MechanicContributionSnapshot;
};

function getGroupKey(
  match: SaturatedMechanicSynergyMatch,
): string {
  return JSON.stringify([
    match.consumerTowerId,
    match.signal,
  ]);
}

function summarizeContributions(
  matches: readonly SaturatedMechanicSynergyMatch[],
): MechanicContributionSnapshot {
  return {
    fullStrengths: matches
      .filter((match) => match.contribution === "full")
      .map((match) => match.effectiveStrength)
      .sort((a, b) => b - a),

    diminishedStrengths: matches
      .filter((match) => match.contribution === "diminished")
      .map((match) => match.effectiveStrength)
      .sort((a, b) => b - a),
  };
}

export function summarizeDirectSynergyOpportunity(
  comparison: DirectSynergyOpportunityComparison,
): readonly DirectSynergyOpportunitySummary[] {
  const groups = new Map<
    string,
    {
      representative: SaturatedMechanicSynergyMatch;
      before: SaturatedMechanicSynergyMatch[];
      after: SaturatedMechanicSynergyMatch[];
    }
  >();

  for (const phase of ["before", "after"] as const) {
    for (const match of comparison[phase]) {
      const key = getGroupKey(match);
      let group = groups.get(key);

      if (!group) {
        group = {
          representative: match,
          before: [],
          after: [],
        };
        groups.set(key, group);
      }

      group[phase].push(match);
    }
  }

  const summaries: DirectSynergyOpportunitySummary[] = [];

  for (const group of groups.values()) {
    const before = summarizeContributions(group.before);
    const after = summarizeContributions(group.after);

    const beforeCount =
      before.fullStrengths.length +
      before.diminishedStrengths.length;

    const afterCount =
      after.fullStrengths.length +
      after.diminishedStrengths.length;

    const unchanged =
      JSON.stringify(before) === JSON.stringify(after);

    const status =
      beforeCount === 0 && afterCount > 0
        ? "new-benefit"
        : unchanged
          ? "unchanged-benefit"
          : "changed-benefit";

    const saturation = group.representative.saturation;

    summaries.push({
      consumerTowerId: group.representative.consumerTowerId,
      signal: group.representative.signal,
      saturation,
      status,

      strongerSingleBenefit:
        saturation === "single" &&
        beforeCount > 0 &&
        (after.fullStrengths[0] ?? 0) >
          (before.fullStrengths[0] ?? 0),

      additionalFullContributionCount: Math.max(
        0,
        after.fullStrengths.length -
          before.fullStrengths.length,
      ),

      additionalDiminishedContributionCount: Math.max(
        0,
        after.diminishedStrengths.length -
          before.diminishedStrengths.length,
      ),

      before,
      after,
    });
  }

  return summaries;
}