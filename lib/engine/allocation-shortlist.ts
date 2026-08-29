import type {
  Allocation,
  ElementName,
} from "@/lib/types";

import {
  legalAllocations,
} from "./allocation";

import {
  buildAllocationProfile,
} from "./allocation-profile";

import {
  buildAnchorProfile,
} from "./anchor-profile";

const DEFAULT_LIMIT = 32;

const ELEMENTS: ElementName[] = [
  "Light",
  "Darkness",
  "Water",
  "Fire",
  "Nature",
  "Earth",
];

interface RankedAllocation {
  allocation: Allocation;
  score: number;
  priority: number;
}

function getLevel(
  allocation: Allocation,
  element: ElementName,
): number {
  const index =
    ELEMENTS.indexOf(
      element,
    );

  return index >= 0
    ? allocation[index]
    : 0;
}

function anchorRealizationScore(
  allocation: Allocation,
  anchor: string,
): number {
  if (
    anchor === "Auto"
  ) {
    return 0;
  }

  const profile =
    buildAnchorProfile(
      anchor,
    );

  if (
    profile.kind === "AUTO" ||
    !profile.blueprint
  ) {
    return 0;
  }

  const targetLevels =
    Object.entries(
      profile.blueprint
        .targetLevels,
    );

  if (
    targetLevels.length === 0
  ) {
    return 0;
  }

  const ratios =
    targetLevels.map(
      ([element, target]) => {
        if (
          !target ||
          target <= 0
        ) {
          return 1;
        }

        return Math.min(
          1,
          getLevel(
            allocation,
            element as ElementName,
          ) / target,
        );
      },
    );

  return Math.min(
    ...ratios,
  );
}

function structuralScore(
  allocation: Allocation,
  anchor: string,
): number {
  const profile =
    buildAllocationProfile(
      allocation,
    );

  /*
   * This is a pruning heuristic only.
   * It does not decide the final winner.
   *
   * The values reward useful structural
   * signals already exposed by AllocationProfile.
   */
  let score = 0;

  /*
   * Preserve viable ecosystems.
   */
  if (
    profile.functionalAccess
      .mainDPS > 0
  ) {
    score += 20;
  }

  if (
    profile.functionalAccess
        .control > 0 ||
    profile.functionalAccess
        .coverage > 0
  ) {
    score += 16;
  }

  if (
    profile.functionalAccess
      .amplification > 0
  ) {
    score += 6;
  }

  /*
   * Prefer meaningful depth.
   */
  score +=
    profile.maxElementLevel *
    4;

  const maxDualDepth =
    profile.dualDepth.length > 0
      ? Math.max(
          ...profile.dualDepth.map(
            (dual) =>
              dual.depth,
          ),
        )
      : 0;

  score +=
    maxDualDepth * 5;

  /*
   * Preserve access to larger ecosystems.
   *
   * These are deliberately small pruning
   * signals, not final-value bonuses.
   */
  score +=
    profile.triAccess * 1.5;

  score +=
    profile.quadAccess * 2;

  /*
   * Penalize structural weakness only for
   * ordering. We explicitly keep some weak
   * allocations in the shortlist below.
   */
  if (
    profile.structuralWeakness
      .isWeak
  ) {
    score -= 12;
  }

  /*
   * Explicit anchors get their own generic
   * blueprint-realization signal.
   */
  if (
    anchor !== "Auto"
  ) {
    score +=
      anchorRealizationScore(
        allocation,
        anchor,
      ) * 30;
  }

  return score;
}

function allocationPriority(
  allocation: Allocation,
  anchor: string,
): number {
  const profile =
    buildAllocationProfile(
      allocation,
    );

  const anchorScore =
    anchor === "Auto"
      ? 0
      : anchorRealizationScore(
          allocation,
          anchor,
        );

  /*
   * Explicit anchor-ready allocations always
   * receive preservation priority.
   */
  if (
    anchor !== "Auto" &&
    anchorScore >= 0.999
  ) {
    return 1000;
  }

  /*
   * Preserve genuine deep allocations by
   * looking directly at the allocation shape.
   *
   * A 3/3 pair means the build has made a
   * real Level-3 investment in two elements.
   */
  const sortedLevels =
    [...allocation].sort(
      (a, b) => b - a,
    );

  if (
    sortedLevels[0] === 3 &&
    sortedLevels[1] === 3
  ) {
    return 500;
  }

  /*
   * Preserve Quad-oriented ecosystems.
   */
  if (
    profile.quadAccess > 0
  ) {
    return 400;
  }

  /*
   * Preserve Tri-oriented ecosystems.
   */
  if (
    profile.triAccess > 0
  ) {
    return 300;
  }

  /*
   * Preserve broad allocations.
   */
  if (
    profile.activeElements >=
    5
  ) {
    return 200;
  }

  /*
   * Preserve concentrated allocations
   * even when they do not contain a 3/3 pair.
   */
  if (
    profile.activeElements <=
    3
  ) {
    return 100;
  }

  return 0;
}

function dedupe(
  allocations: Allocation[],
): Allocation[] {
  const seen =
    new Set<string>();

  const result:
    Allocation[] = [];

  for (
    const allocation of
    allocations
  ) {
    const key =
      allocation.join(",");

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    result.push(
      allocation,
    );
  }

  return result;
}

export function getAllocationShortlist(
  core: ElementName[],
  anchor = "Auto",
  limit = DEFAULT_LIMIT,
): Allocation[] {
  if (
    limit <= 0
  ) {
    return [];
  }

  const allocations =
    legalAllocations(
      core,
    );

  if (
    allocations.length <=
    limit
  ) {
    return allocations;
  }

  const ranked:
    RankedAllocation[] =
    allocations.map(
      (allocation) => ({
        allocation,
        score:
          structuralScore(
            allocation,
            anchor,
          ),
        priority:
          allocationPriority(
            allocation,
            anchor,
          ),
      }),
    );

  ranked.sort(
    (a, b) =>
      b.priority -
        a.priority ||
      b.score -
        a.score ||
      a.allocation
        .join(",")
        .localeCompare(
          b.allocation
            .join(","),
        ),
  );

  const selected:
    Allocation[] = [];

  /*
   * Always preserve the strongest
   * allocation for each structural priority.
   */
  for (
    const priority of [
      1000,
      500,
      400,
      300,
      200,
      100,
      0,
    ]
  ) {
    const entry =
      ranked.find(
        (item) =>
          item.priority ===
          priority,
      );

    if (
      entry
    ) {
      selected.push(
        entry.allocation,
      );
    }
  }

  /*
   * Keep the top-scoring candidates
   * for the expensive V8 stage.
   */
  for (
    const item of ranked
  ) {
    if (
      selected.length >=
      limit
    ) {
      break;
    }

    selected.push(
      item.allocation,
    );
  }

  return dedupe(
    selected,
  ).slice(
    0,
    limit,
  );
}