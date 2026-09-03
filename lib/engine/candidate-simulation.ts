import { createBuildState } from "@/lib/engine/build-state";
import { getLegalNextCandidates } from "@/lib/engine/legal-candidates";
import type { BuildState, LegalNextCandidate } from "@/lib/types";

export type CandidateSimulationValidationCode =
  | "invalid-candidate"
  | "illegal-candidate";

export class CandidateSimulationValidationError extends Error {
  constructor(
    readonly code: CandidateSimulationValidationCode,
    message: string,
  ) {
    super(message);
    this.name = "CandidateSimulationValidationError";
  }
}

function candidatesMatch(
  candidate: LegalNextCandidate,
  legalCandidate: LegalNextCandidate,
): boolean {
  return candidate.towerName === legalCandidate.towerName
    && candidate.type === legalCandidate.type
    && candidate.initialLevel === legalCandidate.initialLevel
    && candidate.maxLevel === legalCandidate.maxLevel
    && candidate.recipe.length === legalCandidate.recipe.length
    && candidate.recipe.every((element, index) => element === legalCandidate.recipe[index]);
}

function hasCandidateShape(value: unknown): value is LegalNextCandidate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<LegalNextCandidate>;
  return typeof candidate.towerName === "string"
    && typeof candidate.type === "string"
    && Array.isArray(candidate.recipe)
    && candidate.initialLevel === 1
    && typeof candidate.maxLevel === "number";
}

export function getValidatedLegalCandidate(
  state: BuildState,
  candidate: LegalNextCandidate,
): LegalNextCandidate {
  if (!hasCandidateShape(candidate)) {
    throw new CandidateSimulationValidationError(
      "invalid-candidate",
      "Candidate simulation requires a legal candidate object.",
    );
  }

  const legalCandidate = getLegalNextCandidates(state).find((item) => (
    item.towerName === candidate.towerName
  ));

  if (!legalCandidate || !candidatesMatch(candidate, legalCandidate)) {
    throw new CandidateSimulationValidationError(
      "illegal-candidate",
      `Candidate ${candidate.towerName ?? "<unknown>"} is not legal for the current build state.`,
    );
  }

  return legalCandidate;
}

export function simulateCandidate(
  state: BuildState,
  candidate: LegalNextCandidate,
): BuildState {
  const legalCandidate = getValidatedLegalCandidate(state, candidate);

  return createBuildState({
    selectedTowers: [
      ...state.selectedTowers.map((selection) => ({ ...selection })),
      { towerName: legalCandidate.towerName, level: legalCandidate.initialLevel },
    ],
    elementAllocation: { ...state.elementAllocation },
    maxTowerSlots: state.maxTowerSlots,
  });
}
