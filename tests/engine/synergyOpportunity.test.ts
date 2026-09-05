import { describe, expect, it } from "vitest";

import type { MechanicStrength } from "@/lib/domain/mechanicSignals";
import type { TowerProfile } from "@/lib/domain/towerProfile";
import { evaluateDirectSynergyOpportunity } from "@/lib/engine/synergyOpportunity";

function makeProvider(
  towerId: string,
  strength: MechanicStrength,
): TowerProfile {
  return {
    towerId,
    coreRoles: [],
    mechanics: {
      provides: [{ signal: "target-isolation", strength }],
      consumes: [],
    },
  };
}

const consumer: TowerProfile = {
  towerId: "consumer",
  coreRoles: [],
  mechanics: {
    provides: [],
    consumes: [
      {
        signal: "target-isolation",
        strength: 4,
        saturation: "single",
      },
    ],
  },
};

describe("evaluateDirectSynergyOpportunity", () => {
  it("finds a candidate providing a missing mechanic", () => {
    const result = evaluateDirectSynergyOpportunity(
      [consumer],
      makeProvider("candidate", 3),
    );

    expect(result.candidateTowerId).toBe("candidate");
    expect(result.before).toEqual([]);
    expect(result.after).toHaveLength(1);
    expect(result.after[0]).toMatchObject({
      providerTowerId: "candidate",
      consumerTowerId: "consumer",
      effectiveStrength: 3,
      contribution: "full",
    });
  });

  it("finds a candidate benefiting from an existing provider", () => {
    const result = evaluateDirectSynergyOpportunity(
      [makeProvider("existing-provider", 3)],
      consumer,
    );

    expect(result.before).toEqual([]);
    expect(result.after).toHaveLength(1);
    expect(result.after[0]).toMatchObject({
      providerTowerId: "existing-provider",
      consumerTowerId: "consumer",
      effectiveStrength: 3,
      contribution: "full",
    });
  });

  it("preserves stronger existing supply under single saturation", () => {
    const result = evaluateDirectSynergyOpportunity(
      [consumer, makeProvider("existing-provider", 4)],
      makeProvider("candidate", 2),
    );

    expect(result.before[0]).toMatchObject({
      providerTowerId: "existing-provider",
      effectiveStrength: 4,
      contribution: "full",
    });

    expect(result.after).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerTowerId: "existing-provider",
          contribution: "full",
        }),
        expect.objectContaining({
          providerTowerId: "candidate",
          contribution: "ignored",
        }),
      ]),
    );
    expect(result.after).toHaveLength(2);
  });

  it("shows a stronger candidate replacing existing supply", () => {
    const result = evaluateDirectSynergyOpportunity(
      [consumer, makeProvider("existing-provider", 2)],
      makeProvider("candidate", 4),
    );

    expect(result.before[0]).toMatchObject({
      providerTowerId: "existing-provider",
      effectiveStrength: 2,
      contribution: "full",
    });

    expect(result.after).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerTowerId: "candidate",
          effectiveStrength: 4,
          contribution: "full",
        }),
        expect.objectContaining({
          providerTowerId: "existing-provider",
          contribution: "ignored",
        }),
      ]),
    );
    expect(result.after).toHaveLength(2);
  });

  it("preserves equal full strength when tie ordering changes the provider", () => {
    const result = evaluateDirectSynergyOpportunity(
      [consumer, makeProvider("z-existing", 3)],
      makeProvider("a-candidate", 3),
    );

    const fullBefore = result.before.filter(
      (match) => match.contribution === "full",
    );
    const fullAfter = result.after.filter(
      (match) => match.contribution === "full",
    );

    expect(fullBefore).toHaveLength(1);
    expect(fullAfter).toHaveLength(1);
    expect(fullBefore[0].providerTowerId).toBe("z-existing");
    expect(fullAfter[0].providerTowerId).toBe("a-candidate");
    expect(fullBefore[0].effectiveStrength).toBe(3);
    expect(fullAfter[0].effectiveStrength).toBe(3);
  });

  it("keeps existing findings unchanged for an unrelated candidate", () => {
    const unrelated: TowerProfile = {
      towerId: "unrelated",
      coreRoles: [],
      mechanics: {
        provides: [{ signal: "enemy-grouping", strength: 4 }],
        consumes: [],
      },
    };

    const result = evaluateDirectSynergyOpportunity(
      [consumer, makeProvider("existing-provider", 3)],
      unrelated,
    );

    expect(result.before).toHaveLength(1);
    expect(result.after).toEqual(result.before);
  });

  it("does not mutate the selected package or candidate", () => {
    const selected = [consumer, makeProvider("existing-provider", 2)];
    const candidate = makeProvider("candidate", 4);
    const originalSelected = structuredClone(selected);
    const originalCandidate = structuredClone(candidate);

    evaluateDirectSynergyOpportunity(selected, candidate);

    expect(selected).toEqual(originalSelected);
    expect(candidate).toEqual(originalCandidate);
  });

  it("rejects a candidate already selected", () => {
    expect(() =>
      evaluateDirectSynergyOpportunity([consumer], consumer),
    ).toThrow("Candidate is already selected: consumer");
  });

  it("rejects duplicate selected tower IDs", () => {
    expect(() =>
      evaluateDirectSynergyOpportunity(
        [consumer, { ...consumer }],
        makeProvider("candidate", 3),
      ),
    ).toThrow("Duplicate selected tower profile: consumer");
  });

  it("handles an empty selected package", () => {
    const result = evaluateDirectSynergyOpportunity([], consumer);

    expect(result).toEqual({
      candidateTowerId: "consumer",
      before: [],
      after: [],
    });
  });
});