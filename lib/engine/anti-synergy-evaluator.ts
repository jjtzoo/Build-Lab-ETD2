import type {
  AntiSynergyEvaluation,
  SynergyGraph,
} from "./types";

export function evaluateAntiSynergy(
  graph: SynergyGraph,
): AntiSynergyEvaluation {
  const reasons: string[] = [];
  const provenance = new Set<string>();

  let raw = 0;

  for (const edge of graph.edges) {
    if (edge.antiSynergyValue <= 0) {
      continue;
    }

    const value = edge.antiSynergyValue;

    raw += value;

    reasons.push(
      `${edge.reason} Anti-synergy value: ${value.toFixed(2)}.`,
    );
  }

  for (const edge of graph.edges) {
    if (edge.antiSynergyValue > 0) {
      provenance.add(
        `${edge.from} ↔ ${edge.to}`,
      );
    }
  }

  return {
    score: -raw,
    raw,
    reasons,
    provenance: [
      ...provenance,
    ],
  };
}