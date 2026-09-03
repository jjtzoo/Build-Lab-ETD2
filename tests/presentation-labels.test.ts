import { describe, expect, it } from "vitest";

import {
  humanizeEngineText,
  labelCapability,
  labelStrategicProfile,
} from "@/lib/presentation-labels";

describe("presentation labels", () => {
  it("turns canonical profile and capability keys into player-facing labels", () => {
    expect(labelStrategicProfile("replicationNetwork")).toBe("Replication / Network");
    expect(labelStrategicProfile("executionFinisher")).toBe("Execution / Finisher");
    expect(labelCapability("attackSpeedScaling")).toBe("Attack-Speed Scaling");
    expect(labelCapability("abilityCharge")).toBe("Ability / Charge");
  });

  it("does not expose raw camelCase keys in humanized presentation text", () => {
    const text = humanizeEngineText(
      "replicationNetwork improves attackSpeedScaling for bossSingleTarget.",
    );

    expect(text).toBe("Replication / Network improves Attack-Speed Scaling for Boss / Single Target.");
    expect(text).not.toMatch(/replicationNetwork|attackSpeedScaling|bossSingleTarget/);
  });
});
