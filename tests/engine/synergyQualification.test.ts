import { describe, expect, it } from "vitest";

import type { MechanicAvailabilityClass } from "@/lib/engine/mechanicAvailability";
import {
  isPrimaryNetworkTier,
  qualifySynergyRelation,
  type SynergyQualificationInput,
} from "@/lib/engine/synergyQualification";

function input(
  overrides: Partial<SynergyQualificationInput> = {},
): SynergyQualificationInput {
  return {
    signal: "attack-damage-buff",
    effectiveStrength: 3,
    contribution: "full",
    availabilityClass: "effectively-continuous",
    consumerIsAnchor: false,
    ...overrides,
  };
}

describe("qualifySynergyRelation", () => {
  it("grades a full persistent stat buff to a non-anchor support tower as Fair", () => {
    const result = qualifySynergyRelation(
      input({
        signal: "attack-damage-buff",
        effectiveStrength: 4,
        availabilityClass: "effectively-continuous",
        consumerIsAnchor: false,
      }),
    );

    expect(result.tier).toBe("fair");
    expect(result.factors.join(" ")).toMatch(/not an amplifier/i);
  });

  it("lets a full-magnitude persistent stat buff to the anchor reach Strong, but no higher", () => {
    const result = qualifySynergyRelation(
      input({
        signal: "attack-speed-buff",
        effectiveStrength: 4,
        availabilityClass: "effectively-continuous",
        consumerIsAnchor: true,
      }),
    );

    expect(result.tier).toBe("strong");
  });

  it("grades a persistent full-strength amplifier on the anchor as Exceptional", () => {
    const result = qualifySynergyRelation(
      input({
        signal: "damage-taken-amp",
        effectiveStrength: 4,
        contribution: "full",
        availabilityClass: "effectively-continuous",
        consumerIsAnchor: true,
      }),
    );

    expect(result.tier).toBe("exceptional");
    expect(result.factors.join(" ")).toMatch(/defining/i);
  });

  it("keeps the same amplifier on a non-anchor consumer at Strong", () => {
    const result = qualifySynergyRelation(
      input({
        signal: "damage-taken-amp",
        effectiveStrength: 4,
        contribution: "full",
        availabilityClass: "effectively-continuous",
        consumerIsAnchor: false,
      }),
    );

    expect(result.tier).toBe("strong");
  });

  it("treats an isolation partner the anchor scales on as a defining interaction", () => {
    const result = qualifySynergyRelation(
      input({
        signal: "target-isolation",
        effectiveStrength: 4,
        contribution: "full",
        availabilityClass: "effectively-continuous",
        consumerIsAnchor: true,
      }),
    );

    expect(result.tier).toBe("exceptional");
  });

  it("steps a relationship down when it is only active in a burst window", () => {
    const persistent = qualifySynergyRelation(
      input({
        signal: "damage-taken-amp",
        effectiveStrength: 3,
        availabilityClass: "effectively-continuous",
        consumerIsAnchor: false,
      }),
    );
    const bursty = qualifySynergyRelation(
      input({
        signal: "damage-taken-amp",
        effectiveStrength: 3,
        availabilityClass: "burst-window",
        consumerIsAnchor: false,
      }),
    );

    expect(persistent.tier).toBe("strong");
    expect(bursty.tier).toBe("efficient");
    expect(bursty.factors.join(" ")).toMatch(/burst window/i);
  });

  it("caps a shared (diminished) contribution at Fair", () => {
    const result = qualifySynergyRelation(
      input({
        signal: "target-isolation",
        effectiveStrength: 4,
        contribution: "diminished",
        availabilityClass: "effectively-continuous",
        consumerIsAnchor: true,
      }),
    );

    expect(result.tier).toBe("fair");
  });

  it("caps range (path-distance) utility at Fair", () => {
    const result = qualifySynergyRelation(
      input({
        signal: "path-distance",
        effectiveStrength: 4,
        availabilityClass: "effectively-continuous",
        consumerIsAnchor: true,
      }),
    );

    expect(result.tier).toBe("fair");
  });

  it("caps an unverified-uptime relationship at Efficient and records the gap", () => {
    const result = qualifySynergyRelation(
      input({
        signal: "damage-taken-amp",
        effectiveStrength: 4,
        availabilityClass: "unknown" as MechanicAvailabilityClass,
        consumerIsAnchor: true,
      }),
    );

    expect(result.tier).toBe("efficient");
    expect(result.factors.join(" ")).toMatch(/not verified/i);
  });

  it("demotes a weak-magnitude stat buff to the Situational tail", () => {
    const result = qualifySynergyRelation(
      input({
        signal: "attack-damage-buff",
        effectiveStrength: 2,
        availabilityClass: "effectively-continuous",
        consumerIsAnchor: false,
      }),
    );

    expect(result.tier).toBe("situational");
    expect(isPrimaryNetworkTier(result.tier)).toBe(false);
  });

  it("keeps Fair and above in the primary network", () => {
    expect(isPrimaryNetworkTier("exceptional")).toBe(true);
    expect(isPrimaryNetworkTier("strong")).toBe(true);
    expect(isPrimaryNetworkTier("efficient")).toBe(true);
    expect(isPrimaryNetworkTier("fair")).toBe(true);
    expect(isPrimaryNetworkTier("situational")).toBe(false);
  });
});
