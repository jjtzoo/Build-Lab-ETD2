import { ELEMENTS, type ElementName } from "@/lib/domain/elements";
import type {
  ElementMatchupTable,
  ElementMultiplier,
} from "@/lib/domain/elementMatchups";
import { getElementMultiplier } from "@/lib/engine/elementMatchups";

export type ElementCoverageEntry = {
  defender: ElementName;

  /**
   * How the anchor itself performs against this armor element.
   */
  anchorMultiplier: ElementMultiplier;

  /**
   * Equal-weight matchup of the current offensive package.
   *
   * This is intentionally unweighted for now.
   * Later the planner may weight contributors by actual strategic
   * damage contribution.
   */
  packageAverageMultiplier: number;

  /**
   * Whether at least one offensive contributor has a 2x matchup
   * against this armor element.
   */
  hasDirectCounter: boolean;
};

export function evaluateElementCoverage(
  matchups: ElementMatchupTable,
  anchorElement: ElementName,
  supportingOffensiveElements: readonly ElementName[] = [],
): readonly ElementCoverageEntry[] {
  const offensiveElements = [
    anchorElement,
    ...supportingOffensiveElements,
  ];

  return ELEMENTS.map((defender) => {
    const anchorMultiplier = getElementMultiplier(
      matchups,
      anchorElement,
      defender,
    );

    const multipliers = offensiveElements.map((attacker) =>
      getElementMultiplier(matchups, attacker, defender),
    );

    const packageAverageMultiplier =
      multipliers.reduce(
        (total, multiplier) => total + multiplier,
        0,
      ) / multipliers.length;

    return {
      defender,
      anchorMultiplier,
      packageAverageMultiplier,
      hasDirectCounter: multipliers.some(
        (multiplier) => multiplier === 2,
      ),
    };
  });
}