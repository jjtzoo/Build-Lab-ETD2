import { describe, expect, it } from "vitest";

import type {
  MechanicStrength,
  SaturationMode,
} from "@/lib/domain/mechanicSignals";
import type { TowerProfile } from "@/lib/domain/towerProfile";
import { evaluateDirectSynergyOpportunity } from "@/lib/engine/synergyOpportunity";
import { summarizeDirectSynergyOpportunity } from "@/lib/engine/synergyOpportunitySummary";

// Minimal fixtures test mechanic relationships, not full tower data.
function makeProvider(
  towerId: string,
  strength: MechanicStrength,
): TowerProfile {
  return {
    towerId,
    coreRoles: [],
    mechanics: {
      provides: [
        { signal: "target-isolation", strength },
      ],
      consumes: [],
    },
  };
}

function makeConsumer(
  towerId: string,
  strength: MechanicStrength = 4,
  saturation: SaturationMode = "single",
): TowerProfile {
  return {
    towerId,
    coreRoles: [],
    mechanics: {
      provides: [],
      consumes: [
        {
          signal: "target-isolation",
          strength,
          saturation,
        },
      ],
    },
  };
}

function summarize(
  selected: readonly TowerProfile[],
  candidate: TowerProfile,
) {
  return summarizeDirectSynergyOpportunity(
    evaluateDirectSynergyOpportunity(selected, candidate),
  );
}

describe("summarizeDirectSynergyOpportunity", () => {
  it("reports Rage's benefits to Laser and Incantation separately", () => {
    const result = summarize(
      [
        makeConsumer("laser", 4),
        makeConsumer("incantation", 3),
      ],
      makeProvider("rage", 4),
    );

    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          consumerTowerId: "laser",
          signal: "target-isolation",
          status: "new-benefit",
          strongerSingleBenefit: false,
          additionalFullContributionCount: 1,
          after: {
            fullStrengths: [4],
            diminishedStrengths: [],
          },
        }),
        expect.objectContaining({
          consumerTowerId: "incantation",
          signal: "target-isolation",
          status: "new-benefit",
          strongerSingleBenefit: false,
          additionalFullContributionCount: 1,
          after: {
            fullStrengths: [3],
            diminishedStrengths: [],
          },
        }),
      ]),
    );
  });

  it("does not invent Incantation's benefit when it is not selected", () => {
    const otherAmp: TowerProfile = {
      towerId: "other-amp",
      coreRoles: ["damage-amp"],
      mechanics: {
        provides: [
          { signal: "damage-taken-amp", strength: 4 },
        ],
        consumes: [],
      },
    };

    const result = summarize(
      [makeConsumer("laser"), otherAmp],
      makeProvider("rage", 4),
    );

    expect(result).toHaveLength(1);
    expect(result[0].consumerTowerId).toBe("laser");
  });

  it("reports stronger single supply without counting an extra full contribution", () => {
    const result = summarize(
      [
        makeConsumer("consumer"),
        makeProvider("existing", 2),
      ],
      makeProvider("candidate", 4),
    );

    expect(result[0]).toMatchObject({
      status: "changed-benefit",
      strongerSingleBenefit: true,
      additionalFullContributionCount: 0,
      additionalDiminishedContributionCount: 0,
      before: {
        fullStrengths: [2],
        diminishedStrengths: [],
      },
      after: {
        fullStrengths: [4],
        diminishedStrengths: [],
      },
    });
  });

  it("reports unchanged benefit when an equal provider wins the tie", () => {
    const result = summarize(
      [
        makeConsumer("consumer"),
        makeProvider("z-existing", 3),
      ],
      makeProvider("a-candidate", 3),
    );

    expect(result[0]).toMatchObject({
      status: "unchanged-benefit",
      strongerSingleBenefit: false,
      additionalFullContributionCount: 0,
      additionalDiminishedContributionCount: 0,
    });
    expect(result[0].after).toEqual(result[0].before);
  });

  it("reports unchanged benefit for weaker single supply", () => {
    const result = summarize(
      [
        makeConsumer("consumer"),
        makeProvider("existing", 4),
      ],
      makeProvider("candidate", 2),
    );

    expect(result[0].status).toBe("unchanged-benefit");
    expect(result[0].after).toEqual(result[0].before);
  });

  it("uses effective strength when the consumer limits the benefit", () => {
    const result = summarize(
      [
        makeConsumer("consumer", 3),
        makeProvider("existing", 3),
      ],
      makeProvider("candidate", 4),
    );

    expect(result[0]).toMatchObject({
      status: "unchanged-benefit",
      strongerSingleBenefit: false,
      after: {
        fullStrengths: [3],
        diminishedStrengths: [],
      },
    });
  });

  it("reports an additional diminished contribution", () => {
    const result = summarize(
      [
        makeConsumer("consumer", 4, "diminishing"),
        makeProvider("existing", 4),
      ],
      makeProvider("candidate", 2),
    );

    expect(result[0]).toMatchObject({
      status: "changed-benefit",
      strongerSingleBenefit: false,
      additionalFullContributionCount: 0,
      additionalDiminishedContributionCount: 1,
      before: {
        fullStrengths: [4],
        diminishedStrengths: [],
      },
      after: {
        fullStrengths: [4],
        diminishedStrengths: [2],
      },
    });
  });

  it("preserves provider replacement evidence under diminishing saturation", () => {
    const result = summarize(
      [
        makeConsumer("consumer", 4, "diminishing"),
        makeProvider("existing", 2),
      ],
      makeProvider("candidate", 4),
    );

    expect(result[0]).toMatchObject({
      status: "changed-benefit",
      strongerSingleBenefit: false,
      additionalFullContributionCount: 0,
      additionalDiminishedContributionCount: 1,
      before: {
        fullStrengths: [2],
        diminishedStrengths: [],
      },
      after: {
        fullStrengths: [4],
        diminishedStrengths: [2],
      },
    });
  });

  it("reports an additional full contribution under repeatable saturation", () => {
    const result = summarize(
      [
        makeConsumer("consumer", 4, "repeatable"),
        makeProvider("existing", 4),
      ],
      makeProvider("candidate", 2),
    );

    expect(result[0]).toMatchObject({
      status: "changed-benefit",
      additionalFullContributionCount: 1,
      additionalDiminishedContributionCount: 0,
      after: {
        fullStrengths: [4, 2],
        diminishedStrengths: [],
      },
    });
  });

  it("reports a new benefit when the candidate is the consumer", () => {
    const result = summarize(
      [makeProvider("existing", 4)],
      makeConsumer("candidate", 3),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      consumerTowerId: "candidate",
      status: "new-benefit",
      after: {
        fullStrengths: [3],
        diminishedStrengths: [],
      },
    });
  });

  it("returns no summaries when there are no matching interactions", () => {
    expect(
      summarize([], makeProvider("candidate", 4)),
    ).toEqual([]);
  });
});