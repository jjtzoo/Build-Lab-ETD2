import type { MechanicsRecord } from "@/lib/types";
import type {
  SynergyEdge,
  SynergyGraph,
  TowerState,
} from "./types";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function mentions(
  values: string[],
  towerName: string,
): boolean {
  const target = normalize(towerName);

  return values.some((value) => {
    const normalized = normalize(value);
    return (
      normalized === target ||
      normalized.includes(target)
    );
  });
}

function explicitEdge(
  from: TowerState,
  to: TowerState,
): SynergyEdge | null {
  const fromMechanics: MechanicsRecord | null =
    from.mechanics;

  const toMechanics: MechanicsRecord | null =
    to.mechanics;

  if (!fromMechanics && !toMechanics) {
    return null;
  }

  const fromName = from.tower.name;
  const toName = to.tower.name;

  const fromSynergies =
    fromMechanics?.synergies ?? [];

  const toSynergies =
    toMechanics?.synergies ?? [];

  const fromAntiSynergies =
    fromMechanics?.anti_synergies ?? [];

  const toAntiSynergies =
    toMechanics?.anti_synergies ?? [];

  if (
    mentions(fromAntiSynergies, toName) ||
    mentions(toAntiSynergies, fromName)
  ) {
    return {
      from: fromName,
      to: toName,
      value: 0,
      realizedValue: 0,
      antiSynergyValue: 1,
      reason: `${fromName} ↔ ${toName}: explicit anti-synergy.`,
      confidence: "HIGH",
    };
  }

  if (
    mentions(fromSynergies, toName) ||
    mentions(toSynergies, fromName)
  ) {
    return {
      from: fromName,
      to: toName,
      value: 1,
      realizedValue: 0,
      antiSynergyValue: 0,
      reason: `${fromName} ↔ ${toName}: explicit researched synergy.`,
      confidence: "HIGH",
    };
  }

  return null;
}

function mechanicalEdge(
  from: TowerState,
  to: TowerState,
): SynergyEdge | null {
  const fromTags =
    from.mechanics?.damage_profile.tags ?? [];

  const toTags =
    to.mechanics?.damage_profile.tags ?? [];

  const fromRoles =
    from.mechanics?.strategic_roles ?? [];

  const toRoles =
    to.mechanics?.strategic_roles ?? [];

  const fromSlow =
    fromRoles.includes("Slow") ||
    fromRoles.includes("Control");

  const toSlow =
    toRoles.includes("Slow") ||
    toRoles.includes("Control");

  const fromRamp =
    from.behavior.ramp === "CONFIRMED" ||
    from.behavior.attackScaling === "CONFIRMED" ||
    fromRoles.includes("Scaling");

  const toRamp =
    to.behavior.ramp === "CONFIRMED" ||
    to.behavior.attackScaling === "CONFIRMED" ||
    toRoles.includes("Scaling");

  const fromDot =
    from.behavior.dot === "CONFIRMED" ||
    fromTags.some(
      (tag) => normalize(tag) === "dot",
    );

  const toDot =
    to.behavior.dot === "CONFIRMED" ||
    toTags.some(
      (tag) => normalize(tag) === "dot",
    );

  const fromAmp =
    from.roles.amplification !== "None";

  const toAmp =
    to.roles.amplification !== "None";

  const fromCoverage =
    from.roles.coverage !== "None";

  const toCoverage =
    to.roles.coverage !== "None";

  const fromExecute =
    from.behavior.execute === "CONFIRMED";

  const toExecute =
    to.behavior.execute === "CONFIRMED";

  if ((fromSlow && toRamp) || (toSlow && fromRamp)) {
    return {
      from: from.tower.name,
      to: to.tower.name,
      value: 1,
      realizedValue: 0,
      antiSynergyValue: 0,
      reason:
        "Control can increase target uptime for scaling damage.",
      confidence: "MEDIUM",
    };
  }

  if ((fromSlow && toDot) || (toSlow && fromDot)) {
    return {
      from: from.tower.name,
      to: to.tower.name,
      value: 1,
      realizedValue: 0,
      antiSynergyValue: 0,
      reason:
        "Control can increase exposure time for damage-over-time effects.",
      confidence: "MEDIUM",
    };
  }

  if (fromAmp && toAmp) {
    return {
      from: from.tower.name,
      to: to.tower.name,
      value: 0,
      realizedValue: 0,
      antiSynergyValue: 0,
      reason:
        "Multiple amplification functions detected; deeper redundancy analysis is deferred.",
      confidence: "LOW",
    };
  }

  if ((fromCoverage && toExecute) || (toCoverage && fromExecute)) {
    return {
      from: from.tower.name,
      to: to.tower.name,
      value: 1,
      realizedValue: 0,
      antiSynergyValue: 0,
      reason:
        "Coverage can distribute targets before execute-based finishing.",
      confidence: "MEDIUM",
    };
  }

  return null;
}

function buildEdge(
  a: TowerState,
  b: TowerState,
): SynergyEdge | null {
  const explicit = explicitEdge(a, b);

  if (explicit) {
    return explicit;
  }

  return mechanicalEdge(a, b);
}

export function buildSynergyGraph(
  states: TowerState[],
): SynergyGraph {
  const nodes = states.map(
    (state) => `${state.tower.name}@${state.tier}`,
  );

  const edges: SynergyEdge[] = [];

  for (let i = 0; i < states.length; i += 1) {
    for (let j = i + 1; j < states.length; j += 1) {
      const edge = buildEdge(states[i], states[j]);

      if (edge) {
        edges.push(edge);
      }
    }
  }

  return {
    nodes,
    edges,
  };
}