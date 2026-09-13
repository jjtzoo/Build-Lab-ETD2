import type { ElementAllocation } from "@/lib/domain/elements";
import { evolutionTargets } from "@/lib/domain/towerEvolution";
import { liveBuildBlock, liveAvailability } from "./liveAvailability";
import { followsFinalForm, LIVE_MAP_TOWERS } from "./livePlacement";
import {
  liveTowerMaxLevel,
  liveTowerReachableLevel,
  resolveLiveTowerCost,
  type BuiltTower,
} from "./liveGame";

export type QueueForm = { towerId: string; level: number };
/** A reservation is only logged as purchased when its placement is confirmed. */
export type PlannedCopy = QueueForm & { id: string; finalForm: QueueForm };

export function validQueueForm(form: QueueForm | undefined): form is QueueForm {
  const tower = LIVE_MAP_TOWERS.find((t) => t.id === form?.towerId);
  return (
    !!tower &&
    !!form &&
    Number.isInteger(form.level) &&
    form.level >= 1 &&
    form.level <= tower.maxLevel
  );
}

export function queuePurchaseBlock(
  form: QueueForm,
  allocation: ElementAllocation,
  holds: number,
  built: readonly BuiltTower[],
  bank: number,
) {
  const block = liveBuildBlock(form.towerId, allocation, holds, built);
  if (block) return block;
  if (liveTowerReachableLevel(form.towerId, allocation) < form.level)
    return "Needs higher element levels";
  const cost = resolveLiveTowerCost(form.towerId, form.level);
  return cost > bank
    ? `Save ${Math.ceil(cost - bank).toLocaleString()} gold`
    : null;
}

export function queueRoots(
  target: QueueForm,
  allocation: ElementAllocation,
  holds: number,
  built: readonly BuiltTower[],
  bank: number,
) {
  return liveAvailability(allocation, holds, built)
    .flatMap((tower) =>
      Array.from({ length: tower.maxLevel }, (_, i) => ({
        towerId: tower.id,
        level: i + 1,
      }))
        .filter(
          (form) =>
            followsFinalForm(form.towerId, form.level, target) &&
            form.level <= target.level,
        )
        .map((form) => ({
          ...form,
          cost: resolveLiveTowerCost(form.towerId, form.level),
          block: queuePurchaseBlock(form, allocation, holds, built, bank),
        })),
    )
    .sort(
      (a, b) =>
        Number(!!a.block) - Number(!!b.block) ||
        a.cost - b.cost ||
        a.towerId.localeCompare(b.towerId),
    );
}

export function queueNextStep(
  current: QueueForm,
  target: QueueForm,
  allocation: ElementAllocation,
  bank: number,
) {
  if (current.towerId === target.towerId && current.level >= target.level)
    return null;
  const steps = evolutionTargets(current.towerId, current.level);
  if (current.level < liveTowerMaxLevel(current.towerId))
    steps.push({ towerId: current.towerId, level: current.level + 1 });
  return (
    steps
      .filter((step) => followsFinalForm(step.towerId, step.level, target))
      .map((step) => {
        const cost = Math.max(
          0,
          resolveLiveTowerCost(step.towerId, step.level) -
            resolveLiveTowerCost(current.towerId, current.level),
        );
        const reachable =
          liveTowerReachableLevel(step.towerId, allocation) >= step.level;
        return { ...step, cost, reachable, affordable: cost <= bank };
      })
      .sort(
        (a, b) =>
          Number(b.reachable) - Number(a.reachable) ||
          Number(b.affordable) - Number(a.affordable) ||
          a.cost - b.cost,
      )[0] ?? null
  );
}
