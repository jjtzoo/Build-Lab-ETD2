import type { TowerState } from "./types";
import type { EvaluatorEvidence } from "./types";

export function evaluateRoles(
  state: TowerState,
): EvaluatorEvidence {
  const { roles, mechanics } = state;

  const reasons: string[] = [];
  const signals: string[] = [];

  if (roles.mainDPS !== "None") {
    reasons.push(`Main DPS role: ${roles.mainDPS}.`);
    signals.push("mainDPS");
  }

  if (roles.subDPS !== "None") {
    reasons.push(`Sub-DPS role: ${roles.subDPS}.`);
    signals.push("subDPS");
  }

  if (roles.control !== "None") {
    reasons.push(`Control role: ${roles.control}.`);
    signals.push("control");
  }

  if (roles.coverage !== "None") {
    reasons.push(`Coverage role: ${roles.coverage}.`);
    signals.push("coverage");
  }

  if (roles.amplification !== "None") {
    reasons.push(`Amplification role: ${roles.amplification}.`);
    signals.push("amplification");
  }

  if (roles.range !== "None") {
    reasons.push(`Range role: ${roles.range}.`);
    signals.push("range");
  }

  if (roles.scaling !== "None") {
    reasons.push(`Scaling role: ${roles.scaling}.`);
    signals.push("scaling");
  }

  if (roles.support !== "None") {
    reasons.push(`Support role: ${roles.support}.`);
    signals.push("support");
  }

  if (mechanics?.role_priority?.length) {
    signals.push(...mechanics.role_priority);
  }

  const hasAnyRole = signals.length > 0;

  return {
    evaluator: "package",
    score: null,
    status: hasAnyRole ? "CONFIRMED" : "UNKNOWN",
    confidence: mechanics ? "HIGH" : "UNKNOWN",
    reasons,
    signals,
    provenance: mechanics?.sources ?? [],
  };
}