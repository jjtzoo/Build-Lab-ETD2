import type { Allocation, Tower } from "@/lib/types";
import { buildTowerState } from "./tower-state";
import type { TowerState } from "./types";

export interface PackageRequirements {
  requiresMainDPS: boolean;
  requiresControlOrCoverage: boolean;
  recommendedAmplification: boolean;
  recommendedSupport: boolean;
}

export interface PackageRequirementResult {
  viable: boolean;

  requirements: PackageRequirements;

  satisfied: {
    mainDPS: boolean;
    controlOrCoverage: boolean;
    amplification: boolean;
    support: boolean;
  };

  missing: string[];

  completeness: number;

  towers: TowerState[];

  provenance: string[];
}

const DEFAULT_REQUIREMENTS: PackageRequirements = {
  requiresMainDPS: true,
  requiresControlOrCoverage: true,
  recommendedAmplification: true,
  recommendedSupport: false,
};

export function getPackageRequirements(): PackageRequirements {
  return {
    ...DEFAULT_REQUIREMENTS,
  };
}

function buildTowerStates(
  allocation: Allocation,
  towers: Tower[],
): TowerState[] {
  return towers.map((tower) =>
    buildTowerState(tower, allocation),
  );
}

function hasRole(
  towers: TowerState[],
  role:
    | "mainDPS"
    | "control"
    | "coverage"
    | "amplification"
    | "support",
): boolean {
  return towers.some(
    (tower) =>
      tower.roles[role] !== "None",
  );
}

export function evaluatePackageRequirements(
  allocation: Allocation,
  towers: Tower[],
  requirements = getPackageRequirements(),
): PackageRequirementResult {
  const states = buildTowerStates(
    allocation,
    towers,
  );

  const mainDPS = hasRole(
    states,
    "mainDPS",
  );

  const control = hasRole(
    states,
    "control",
  );

  const coverage = hasRole(
    states,
    "coverage",
  );

  const amplification = hasRole(
    states,
    "amplification",
  );

  const support = hasRole(
    states,
    "support",
  );

  const controlOrCoverage =
    control || coverage;

  const missing: string[] = [];

  if (
    requirements.requiresMainDPS &&
    !mainDPS
  ) {
    missing.push("Main DPS");
  }

  if (
    requirements.requiresControlOrCoverage &&
    !controlOrCoverage
  ) {
    missing.push("Control or Coverage");
  }

  if (
    requirements.recommendedAmplification &&
    !amplification
  ) {
    missing.push("Amplification");
  }

  if (
    requirements.recommendedSupport &&
    !support
  ) {
    missing.push("Support");
  }

  const requiredChecks = [
    requirements.requiresMainDPS,
    requirements.requiresControlOrCoverage,
  ].filter(Boolean).length;

  const satisfiedRequiredChecks = [
    requirements.requiresMainDPS
      ? mainDPS
      : true,
    requirements.requiresControlOrCoverage
      ? controlOrCoverage
      : true,
  ].filter(Boolean).length;

  const recommendedChecks = [
    requirements.recommendedAmplification,
    requirements.recommendedSupport,
  ].filter(Boolean).length;

  const satisfiedRecommendedChecks = [
    requirements.recommendedAmplification
      ? amplification
      : true,
    requirements.recommendedSupport
      ? support
      : true,
  ].filter(Boolean).length;

  const totalChecks =
    requiredChecks + recommendedChecks;

  const satisfiedChecks =
    satisfiedRequiredChecks +
    satisfiedRecommendedChecks;

  const completeness =
    totalChecks === 0
      ? 1
      : satisfiedChecks / totalChecks;

  const viable =
    (!requirements.requiresMainDPS ||
      mainDPS) &&
    (!requirements.requiresControlOrCoverage ||
      controlOrCoverage);

  return {
    viable,

    requirements,

    satisfied: {
      mainDPS,
      controlOrCoverage,
      amplification,
      support,
    },

    missing,

    completeness,

    towers: states,

    provenance: [
      "TowerState role evidence",
      "Package structural requirements",
    ],
  };
}