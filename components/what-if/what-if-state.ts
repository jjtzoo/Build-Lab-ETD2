import type { Allocation } from "@/lib/types";

export interface WhatIfState {
  allocation: Allocation | null;
}

export function createWhatIfState(
  currentAllocation: Allocation | null,
): WhatIfState {
  return {
    allocation: currentAllocation
      ? [...currentAllocation] as Allocation
      : null,
  };
}

export function resetWhatIf(
  currentAllocation: Allocation | null,
): WhatIfState {
  return createWhatIfState(
    currentAllocation,
  );
}

export function applyWhatIf(
  scenario: WhatIfState,
): Allocation | null {
  return scenario.allocation
    ? [...scenario.allocation] as Allocation
    : null;
}