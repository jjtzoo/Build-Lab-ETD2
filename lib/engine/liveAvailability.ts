import type { ElementAllocation } from "@/lib/domain/elements";
import {
  derivedPhase,
  endGameReadiness,
  isEndGameTowerId,
  isTowerLoggable,
  loggableTowers,
  type BuiltTower,
} from "./liveGame";

export function liveBuildBlock(
  towerId: string,
  allocation: ElementAllocation,
  holds: number,
  built: readonly BuiltTower[],
  quantity = 1,
): string | null {
  if (!isTowerLoggable(towerId, allocation))
    return "Missing element requirements";
  if (!isEndGameTowerId(towerId)) return null;
  const readiness = endGameReadiness(
    allocation,
    null,
    derivedPhase(allocation, holds),
    built,
  );
  if (!readiness.essenceAvailable) return "Essence arrives in waves 51–55";
  if (readiness.essenceSpent + quantity > readiness.essenceAvailable)
    return "All Essence spent";
  return null;
}

export function liveAvailability(
  allocation: ElementAllocation,
  holds: number,
  built: readonly BuiltTower[],
) {
  return loggableTowers(allocation).map((tower) => ({
    ...tower,
    blockedReason: liveBuildBlock(tower.id, allocation, holds, built),
  }));
}
