import type {
  RedundancyEvaluation,
  TowerEvaluationBundle,
} from "./types";

type FunctionalRole =
  | "main"
  | "sub"
  | "control"
  | "coverage"
  | "amplification"
  | "range"
  | "scaling"
  | "support";

const ROLE_WEIGHTS: Record<FunctionalRole, number> = {
  main: 2.5,
  sub: 1.8,
  control: 1.8,
  coverage: 1.8,
  amplification: 1.8,
  range: 1.8,
  scaling: 1.8,
  support: 1.8,
};

function addRole(
  counts: Record<string, number>,
  role: FunctionalRole,
): void {
  counts[role] = (counts[role] ?? 0) + 1;
}

export function evaluateRedundancy(
  bundles: TowerEvaluationBundle[],
): RedundancyEvaluation {
  const counts: Record<string, number> = {};

  for (const bundle of bundles) {
    const { roles } = bundle.state;

    if (roles.mainDPS !== "None") {
      addRole(counts, "main");
    }

    if (roles.subDPS !== "None") {
      addRole(counts, "sub");
    }

    if (roles.control !== "None") {
      addRole(counts, "control");
    }

    if (roles.coverage !== "None") {
      addRole(counts, "coverage");
    }

    if (roles.amplification !== "None") {
      addRole(counts, "amplification");
    }

    if (roles.range !== "None") {
      addRole(counts, "range");
    }

    if (roles.scaling !== "None") {
      addRole(counts, "scaling");
    }

    if (roles.support !== "None") {
      addRole(counts, "support");
    }
  }

  const duplicateRoles: Record<string, number> = {};
  let raw = 0;

  for (const [role, count] of Object.entries(counts)) {
    if (count <= 1) {
      continue;
    }

    const duplicateCount = count - 1;
    duplicateRoles[role] = duplicateCount;

    const weight =
      ROLE_WEIGHTS[role as FunctionalRole] ?? 1.8;

    raw += duplicateCount * weight;
  }

  return {
    score: -raw,
    raw,
    duplicateRoles,
    provenance: [
      "TowerState strategic-role overlap",
      "functional diminishing returns",
    ],
  };
}