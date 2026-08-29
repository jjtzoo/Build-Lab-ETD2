import type { TowerState, TowerEvaluationBundle } from "./types";
import { evaluateRoles } from "./role-evaluator";
import { evaluateDps } from "./dps-evaluator";
import { evaluateControl } from "./control-evaluator";
import { evaluateCoverage } from "./coverage-evaluator";
import { evaluateAmplification } from "./amplification-evaluator";
import { evaluateRange } from "./range-evaluator";
import { evaluateScaling } from "./scaling-evaluator";

export function evaluateTower(
  state: TowerState,
): TowerEvaluationBundle {
  return {
    state,
    role: evaluateRoles(state),
    dps: evaluateDps(state),
    control: evaluateControl(state),
    coverage: evaluateCoverage(state),
    amplification: evaluateAmplification(state),
    range: evaluateRange(state),
    scaling: evaluateScaling(state),
  };
}