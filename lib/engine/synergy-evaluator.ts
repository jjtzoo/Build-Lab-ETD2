import type {
  SynergyEdge,
  SynergyEvaluation,
  SynergyGraph,
  TowerEvaluationBundle,
} from "./types";

function confidenceWeight(
  confidence: SynergyEdge["confidence"],
): number {
  switch (confidence) {
    case "HIGH":
      return 1;
    case "MEDIUM":
      return 0.82;
    case "LOW":
      return 0.6;
    case "UNKNOWN":
      return 0.45;
  }
}

function edgeIsSupported(
  edge: SynergyEdge,
  bundles: Map<string, TowerEvaluationBundle>,
): boolean {
  const from = bundles.get(edge.from);
  const to = bundles.get(edge.to);

  if (!from || !to) {
    return false;
  }

  return (
    from.state.tier > 0 &&
    to.state.tier > 0
  );
}

export function evaluateSynergy(
  graph: SynergyGraph,
  bundles: TowerEvaluationBundle[],
): SynergyEvaluation {
  const bundleMap = new Map(
    bundles.map((bundle) => [
      bundle.state.tower.name,
      bundle,
    ]),
  );

  const realizedEdges: SynergyEdge[] = [];
  const reasons: string[] = [];

  let realized = 0;
  let anti = 0;

  for (const edge of graph.edges) {
    const supported = edgeIsSupported(edge, bundleMap);

    if (!supported) {
      realizedEdges.push({
        ...edge,
        realizedValue: 0,
      });

      continue;
    }

    const weight = confidenceWeight(edge.confidence);

    if (edge.antiSynergyValue > 0) {
      const realizedAnti =
        edge.antiSynergyValue * weight;

      anti += realizedAnti;

      realizedEdges.push({
        ...edge,
        realizedValue: 0,
        antiSynergyValue: realizedAnti,
      });

      reasons.push(
        `${edge.reason} Anti-synergy realized.`,
      );

      continue;
    }

    if (edge.value > 0) {
      const realizedValue =
        edge.value * weight;

      realized += realizedValue;

      realizedEdges.push({
        ...edge,
        realizedValue,
        antiSynergyValue: 0,
      });

      reasons.push(
        `${edge.reason} Realized at ${realizedValue.toFixed(2)}.`,
      );

      continue;
    }

    realizedEdges.push({
      ...edge,
      realizedValue: 0,
      antiSynergyValue: 0,
    });
  }

  const score = realized - anti;

  const provenance = [
    ...new Set(
      bundles.flatMap((bundle) => [
        ...bundle.state.mechanics?.sources ?? [],
      ]),
    ),
  ];

  const confidence =
    graph.edges.length === 0
      ? "UNKNOWN"
      : graph.edges.every(
            (edge) => edge.confidence === "HIGH",
          )
        ? "HIGH"
        : graph.edges.some(
              (edge) => edge.confidence === "MEDIUM",
            )
          ? "MEDIUM"
          : "LOW";

  return {
    score,
    realized,
    anti,
    edges: realizedEdges,
    reasons,
    confidence,
    provenance,
  };
}