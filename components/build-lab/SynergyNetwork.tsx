"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import type { PlanDto } from "@/lib/engine/buildRecommendationDto";
import type { SynergyRelationExplanation } from "@/lib/engine/synergyExplanation";
import { useBuildLab } from "@/components/build-lab/store";
import {
  MechanicGlyph,
  MECHANIC_FAMILY_LABEL,
  mechanicFamily,
  type MechanicFamily,
} from "@/components/build-lab/glyphs";
import {
  MechanicChip,
  QualificationBadge,
} from "@/components/build-lab/primitives";

type NodeRole = "provider" | "consumer";

type GraphNode = {
  id: string;
  name: string;
  role: NodeRole;
  isAnchor: boolean;
  x: number;
  y: number;
};

type GraphEdge = {
  key: string;
  relation: SynergyRelationExplanation;
  family: MechanicFamily;
  from: GraphNode;
  to: GraphNode;
  path: string;
};

const VIEW_W = 1000;
const ROW_H = 92;
const PAD_Y = 54;
const NODE_R = 26;
const COL_L = 150;
const COL_R = VIEW_W - 150;

const TIER_WEIGHT: Record<string, number> = {
  exceptional: 1,
  strong: 0.82,
  efficient: 0.6,
  fair: 0.4,
  situational: 0.28,
};

function layout(relations: readonly SynergyRelationExplanation[]) {
  const outDeg = new Map<string, number>();
  const inDeg = new Map<string, number>();
  const names = new Map<string, string>();
  const anchorIds = new Set<string>();

  for (const r of relations) {
    outDeg.set(r.providerId, (outDeg.get(r.providerId) ?? 0) + 1);
    inDeg.set(r.consumerId, (inDeg.get(r.consumerId) ?? 0) + 1);
    names.set(r.providerId, r.providerName);
    names.set(r.consumerId, r.consumerName);
    if (r.consumerIsAnchor) anchorIds.add(r.consumerId);
  }

  const ids = new Set<string>([...outDeg.keys(), ...inDeg.keys()]);
  const providers: string[] = [];
  const consumers: string[] = [];
  for (const id of ids) {
    const out = outDeg.get(id) ?? 0;
    const inn = inDeg.get(id) ?? 0;
    // A tower that both gives and takes sits on the side it does more of;
    // ties fall to the consumer side unless it never receives anything.
    if (out > inn || (out === inn && inn === 0)) providers.push(id);
    else consumers.push(id);
  }

  const bestTier = (id: string, role: NodeRole) => {
    let best = 5;
    for (const r of relations) {
      const hit = role === "provider" ? r.providerId === id : r.consumerId === id;
      if (!hit) continue;
      best = Math.min(
        best,
        ["exceptional", "strong", "efficient", "fair", "situational"].indexOf(
          r.qualification.tier,
        ),
      );
    }
    return best;
  };

  providers.sort(
    (a, b) =>
      bestTier(a, "provider") - bestTier(b, "provider") ||
      (outDeg.get(b) ?? 0) - (outDeg.get(a) ?? 0) ||
      (names.get(a) ?? "").localeCompare(names.get(b) ?? ""),
  );
  consumers.sort(
    (a, b) =>
      Number(anchorIds.has(b)) - Number(anchorIds.has(a)) ||
      bestTier(a, "consumer") - bestTier(b, "consumer") ||
      (inDeg.get(b) ?? 0) - (inDeg.get(a) ?? 0) ||
      (names.get(a) ?? "").localeCompare(names.get(b) ?? ""),
  );

  const rows = Math.max(providers.length, consumers.length);
  const height = rows * ROW_H + PAD_Y * 2 - (ROW_H - 2 * NODE_R);

  const place = (list: string[], x: number, role: NodeRole): GraphNode[] => {
    const span = height - PAD_Y * 2;
    return list.map((id, i) => ({
      id,
      name: names.get(id) ?? id,
      role,
      isAnchor: anchorIds.has(id),
      x,
      y:
        list.length === 1
          ? height / 2
          : PAD_Y + (span * i) / (list.length - 1),
    }));
  };

  const nodes = [
    ...place(providers, COL_L, "provider"),
    ...place(consumers, COL_R, "consumer"),
  ];
  const nodeById = new Map(nodes.map((n) => [`${n.role}:${n.id}`, n]));

  const edges: GraphEdge[] = relations.map((relation, i) => {
    const from =
      nodeById.get(`provider:${relation.providerId}`) ??
      nodeById.get(`consumer:${relation.providerId}`)!;
    const to =
      nodeById.get(`consumer:${relation.consumerId}`) ??
      nodeById.get(`provider:${relation.consumerId}`)!;
    const dx = (to.x - from.x) * 0.42;
    const path = `M ${from.x + NODE_R} ${from.y} C ${from.x + NODE_R + dx} ${from.y}, ${to.x - NODE_R - dx} ${to.y}, ${to.x - NODE_R} ${to.y}`;
    return {
      key: `${relation.providerId}-${relation.consumerId}-${relation.signal}-${i}`,
      relation,
      family: mechanicFamily(relation.mechanicTag),
      from,
      to,
      path,
    };
  });

  return { nodes, edges, height };
}

function InspectorBody({
  relation,
}: {
  relation: SynergyRelationExplanation;
}) {
  const family = mechanicFamily(relation.mechanicTag);
  return (
    <div className="synergy-inspector-body" data-family={family}>
      <div className="synergy-inspector-flow">
        <span className="synergy-inspector-tower">
          {relation.providerName}
        </span>
        <span className="synergy-inspector-arrow" aria-hidden="true">
          →
        </span>
        <span className="synergy-inspector-tower">
          {relation.consumerName}
        </span>
      </div>
      <div className="synergy-inspector-meta">
        <span className="synergy-inspector-mech">
          <MechanicGlyph tag={relation.mechanicTag} size={15} />
          {relation.mechanicTag}
        </span>
        <QualificationBadge tier={relation.qualification.tier} />
        {relation.availabilityTag !== "Persistent" && (
          <span className="synergy-inspector-avail">
            {relation.availabilityTag}
          </span>
        )}
      </div>
      <p className="synergy-inspector-text">{relation.text}</p>
      <ul className="synergy-inspector-factors">
        {relation.qualification.factors.map((factor) => (
          <li key={factor}>{factor}</li>
        ))}
      </ul>
    </div>
  );
}

export function SynergyNetwork({
  plan,
  assets,
}: {
  plan: PlanDto;
  assets: BuildLabAssets;
}) {
  const reduce = useReducedMotion();
  const setHighlightTower = useBuildLab((s) => s.setHighlightTower);
  const setHighlightMechanic = useBuildLab((s) => s.setHighlightMechanic);
  const highlightTowerId = useBuildLab((s) => s.highlightTowerId);
  const highlightMechanicTag = useBuildLab((s) => s.highlightMechanicTag);

  const [familyFilter, setFamilyFilter] = useState<MechanicFamily | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const relations = plan.synergy.relations;
  const { nodes, edges, height } = useMemo(
    () => layout(relations),
    [relations],
  );

  const families = useMemo(() => {
    const seen = new Map<MechanicFamily, number>();
    for (const r of relations) {
      const f = mechanicFamily(r.mechanicTag);
      seen.set(f, (seen.get(f) ?? 0) + 1);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [relations]);

  if (relations.length === 0) {
    return (
      <section className="lab-section synergy-section">
        <div className="section-rail">
          <span className="section-index mono">06</span>
          <div>
            <h2>Synergy network</h2>
            <p>
              No confirmed mechanic relationship in this package reaches the
              Fair threshold.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const focusTower = highlightTowerId;
  const focusMech = highlightMechanicTag;

  const edgeState = (edge: GraphEdge) => {
    const familyActive = !familyFilter || edge.family === familyFilter;
    const towerActive =
      !focusTower ||
      edge.relation.providerId === focusTower ||
      edge.relation.consumerId === focusTower;
    const mechActive =
      !focusMech || edge.relation.mechanicTag === focusMech;
    const active = familyActive && towerActive && mechActive;
    const anyFocus = Boolean(familyFilter || focusTower || focusMech);
    return {
      active,
      dimmed: anyFocus && !active,
      selected: selectedKey === edge.key,
    };
  };

  const nodeConnected = (node: GraphNode) => {
    for (const edge of edges) {
      const s = edgeState(edge);
      if (s.dimmed) continue;
      if (edge.from.id === node.id || edge.to.id === node.id) return true;
    }
    return false;
  };

  const anyFocus = Boolean(familyFilter || focusTower || focusMech);
  const selected = edges.find((e) => e.key === selectedKey)?.relation ?? null;

  return (
    <section className="lab-section synergy-section">
      <div className="section-rail">
        <span className="section-index mono">06</span>
        <div>
          <h2>Synergy network</h2>
          <p>
            Every confirmed mechanic relationship, ranked. Providers on the
            left feed consumers on the right — hover a tower or a mechanic to
            trace it, select an edge to inspect it.
          </p>
        </div>
      </div>

      <div className="synergy-filters" role="group" aria-label="Filter by mechanic family">
        {families.map(([family, count]) => (
          <MechanicChip
            key={family}
            tag={family}
            family={family}
            label={MECHANIC_FAMILY_LABEL[family]}
            count={count}
            active={familyFilter === family}
            dimmed={familyFilter != null && familyFilter !== family}
            onClick={() =>
              setFamilyFilter((current) =>
                current === family ? null : family,
              )
            }
          />
        ))}
        {familyFilter && (
          <button
            type="button"
            className="synergy-filter-clear"
            onClick={() => setFamilyFilter(null)}
          >
            Clear
          </button>
        )}
      </div>

      <div className="synergy-canvas" data-inspecting={selected ? true : undefined}>
        <div className="synergy-graph-wrap">
          <svg
            className="synergy-graph"
            viewBox={`0 0 ${VIEW_W} ${height}`}
            width="100%"
            role="img"
            aria-label={`Synergy graph: ${nodes.length} towers, ${edges.length} relationships. The full list follows below.`}
            preserveAspectRatio="xMidYMid meet"
          >
            <g className="synergy-edges">
              {edges.map((edge) => {
                const s = edgeState(edge);
                const w =
                  2 + 4 * (TIER_WEIGHT[edge.relation.qualification.tier] ?? 0.4);
                return (
                  <motion.path
                    key={edge.key}
                    d={edge.path}
                    className="synergy-edge"
                    data-family={edge.family}
                    data-active={s.active || undefined}
                    data-dimmed={s.dimmed || undefined}
                    data-selected={s.selected || undefined}
                    style={{ strokeWidth: w }}
                    initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: reduce ? 0 : 0.5, ease: "easeOut" }}
                    tabIndex={0}
                    role="button"
                    aria-label={`${edge.relation.providerName} to ${edge.relation.consumerName}, ${edge.relation.mechanicTag}, ${edge.relation.qualification.tier}`}
                    onClick={() =>
                      setSelectedKey(s.selected ? null : edge.key)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedKey(s.selected ? null : edge.key);
                      }
                    }}
                    onMouseEnter={() =>
                      setHighlightMechanic(edge.relation.mechanicTag)
                    }
                    onMouseLeave={() => setHighlightMechanic(null)}
                  />
                );
              })}
            </g>

            <g className="synergy-nodes">
              {nodes.map((node) => {
                const connected = anyFocus ? nodeConnected(node) : true;
                const isFocus = focusTower === node.id;
                const icon = assets.towerIcons[node.id as keyof typeof assets.towerIcons];
                return (
                  <g
                    key={`${node.role}:${node.id}`}
                    className="synergy-node"
                    data-anchor={node.isAnchor || undefined}
                    data-focus={isFocus || undefined}
                    data-dimmed={anyFocus && !connected ? true : undefined}
                    transform={`translate(${node.x} ${node.y})`}
                    tabIndex={0}
                    role="button"
                    aria-label={`${node.name}${node.isAnchor ? ", anchor" : ""}`}
                    onMouseEnter={() => setHighlightTower(node.id)}
                    onMouseLeave={() => setHighlightTower(null)}
                    onFocus={() => setHighlightTower(node.id)}
                    onBlur={() => setHighlightTower(null)}
                  >
                    <circle className="synergy-node-ring" r={NODE_R + 4} />
                    <clipPath id={`clip-${node.role}-${node.id}`}>
                      <circle r={NODE_R} />
                    </clipPath>
                    {icon ? (
                      <image
                        href={icon}
                        x={-NODE_R}
                        y={-NODE_R}
                        width={NODE_R * 2}
                        height={NODE_R * 2}
                        clipPath={`url(#clip-${node.role}-${node.id})`}
                        preserveAspectRatio="xMidYMid slice"
                      />
                    ) : (
                      <circle className="synergy-node-fallback" r={NODE_R} />
                    )}
                    <circle className="synergy-node-outline" r={NODE_R} fill="none" />
                    <text
                      className="synergy-node-label"
                      x={node.role === "provider" ? -(NODE_R + 12) : NODE_R + 12}
                      y="0.32em"
                      textAnchor={node.role === "provider" ? "end" : "start"}
                    >
                      {node.name}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {selected && (
          <aside className="synergy-inspector" aria-live="polite">
            <button
              type="button"
              className="synergy-inspector-close"
              onClick={() => setSelectedKey(null)}
              aria-label="Close inspector"
            >
              ×
            </button>
            <InspectorBody relation={selected} />
          </aside>
        )}
      </div>

      <details className="synergy-all">
        <summary>
          View all mechanic relationships
          <span className="mono">
            {plan.synergy.relations.length + plan.synergy.secondaryRelations.length}
          </span>
        </summary>
        <ul className="synergy-all-list">
          {[
            ...plan.synergy.relations,
            ...plan.synergy.secondaryRelations,
          ].map((relation, i) => (
            <li
              key={`${relation.providerId}-${relation.consumerId}-${relation.signal}-${i}`}
              className="synergy-all-row"
              data-family={mechanicFamily(relation.mechanicTag)}
              onMouseEnter={() => setHighlightTower(relation.providerId)}
              onMouseLeave={() => setHighlightTower(null)}
            >
              <span className="synergy-all-flow">
                <b>{relation.providerName}</b>
                <span aria-hidden="true">→</span>
                <b>{relation.consumerName}</b>
              </span>
              <span className="synergy-all-mech">
                <MechanicGlyph tag={relation.mechanicTag} size={13} />
                {relation.mechanicTag}
              </span>
              <QualificationBadge
                tier={relation.qualification.tier}
                small
              />
              <p>{relation.text}</p>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
