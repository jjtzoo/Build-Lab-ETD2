import type { Allocation, ElementName } from "@/lib/types";
import { ELEMENTS } from "@/lib/data";
import type { DecisionGate } from "./types";

const MIN_TOTAL_ALLOCATION = 11;
const MIN_ELEMENT_LEVEL = 0;
const MAX_ELEMENT_LEVEL = 3;

export function evaluateLegality(
  allocation: Allocation,
  core: ElementName[],
): DecisionGate {
  const total = allocation.reduce((sum, level) => sum + level, 0);

  if (allocation.some(
    (level) => level < MIN_ELEMENT_LEVEL || level > MAX_ELEMENT_LEVEL,
  )) {
    return {
      name: "legality",
      passed: false,
      reason: "Allocation contains an element level outside the legal 0-3 range.",
    };
  }

  if (total !== MIN_TOTAL_ALLOCATION) {
    return {
      name: "legality",
      passed: false,
      reason: `Allocation uses ${total} points; exactly ${MIN_TOTAL_ALLOCATION} are required.`,
    };
  }

  const missingCore = core.filter(
    (element) => allocation[ELEMENTS.indexOf(element)] < 1,
  );

  if (missingCore.length > 0) {
    return {
      name: "legality",
      passed: false,
      reason: `Core elements must have at least Lv1: ${missingCore.join(", ")}.`,
    };
  }

  return {
    name: "legality",
    passed: true,
    reason: "Allocation satisfies the current V8 legality rules.",
  };
}