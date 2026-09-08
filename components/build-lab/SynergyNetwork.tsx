"use client";

import type { PlanDto } from "@/lib/engine/buildRecommendationDto";
import type { SynergyRelationExplanation } from "@/lib/engine/synergyExplanation";
import { useBuildLab } from "@/components/build-lab/store";
import { resolveHighlight } from "@/components/build-lab/highlight";
import { MechanicTag } from "@/components/build-lab/primitives";

/**
 * Broad category each mechanic tag rolls up into, so 20+ relationships
 * still read at a glance.
 */
const CATEGORY: Record<string, string> = {
  "Attack Damage": "Damage buffs",
  "Attack Speed": "Damage buffs",
  "Damage Amp": "Amplification",
  "Current HP Removal": "Amplification",
  Slow: "Control",
  Stun: "Control",
  Stasis: "Control",
  Grouping: "Positioning",
  Isolation: "Positioning",
  Displacement: "Positioning",
  "Kill Generation": "Kill economy",
  "Death Trigger": "Kill economy",
  "Damage Echo": "Kill economy",
  Replication: "Other",
  Range: "Other",
};

function Relationship({
  relation,
}: {
  relation: SynergyRelationExplanation;
}) {
  const setHighlightTower = useBuildLab(
    (s) => s.setHighlightTower,
  );
  const highlightTowerId = useBuildLab(
    (s) => s.highlightTowerId,
  );
  const highlightMechanicTag = useBuildLab(
    (s) => s.highlightMechanicTag,
  );

  const active =
    highlightMechanicTag === relation.mechanicTag ||
    highlightTowerId === relation.providerId ||
    highlightTowerId === relation.consumerId;
  const dimmed =
    (highlightTowerId !== null ||
      highlightMechanicTag !== null) &&
    !active;

  return (
    <div
      className="synergy-relation"
      data-active={active || undefined}
      data-dimmed={dimmed || undefined}
      onMouseEnter={() =>
        setHighlightTower(relation.providerId)
      }
      onMouseLeave={() => setHighlightTower(null)}
    >
      <div className="synergy-relation-flow">
        <span
          className="synergy-node source"
          onMouseEnter={() =>
            setHighlightTower(relation.providerId)
          }
        >
          {relation.providerName}
        </span>
        <span
          className="synergy-arrow"
          aria-hidden="true"
        >
          →
        </span>
        <span
          className="synergy-node target"
          onMouseEnter={() =>
            setHighlightTower(relation.consumerId)
          }
        >
          {relation.consumerName}
        </span>
      </div>
      <div className="synergy-relation-meta">
        <span className="synergy-effect">
          {relation.mechanicTag}
        </span>
        {relation.availabilityTag !==
          "Persistent" && (
          <span className="synergy-avail">
            {relation.availabilityTag}
          </span>
        )}
        {relation.contribution ===
          "diminished" && (
          <span className="synergy-avail">
            Shared
          </span>
        )}
      </div>
      <p className="synergy-explanation">
        {relation.text}
      </p>
    </div>
  );
}

export function SynergyNetwork({
  plan,
}: {
  plan: PlanDto;
}) {
  const highlightTowerId = useBuildLab(
    (s) => s.highlightTowerId,
  );
  const highlightMechanicTag = useBuildLab(
    (s) => s.highlightMechanicTag,
  );
  const setHighlightMechanic = useBuildLab(
    (s) => s.setHighlightMechanic,
  );
  const highlight = resolveHighlight(
    plan,
    highlightTowerId,
    highlightMechanicTag,
  );

  if (plan.synergy.relations.length === 0) {
    return (
      <section className="lab-section synergy-section">
        <div className="section-rail">
          <span className="section-index mono">
            06
          </span>
          <div>
            <h2>Synergy network</h2>
            <p>
              No confirmed mechanic relationships in this package&apos;s
              evidence.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const categories = new Map<
    string,
    typeof plan.synergy.grouped
  >();
  for (const group of plan.synergy.grouped) {
    const key =
      CATEGORY[group.mechanicTag] ?? "Other";
    categories.set(key, [
      ...(categories.get(key) ?? []),
      group,
    ]);
  }

  return (
    <section className="lab-section synergy-section">
      <div className="section-rail">
        <span className="section-index mono">06</span>
        <div>
          <h2>Synergy network</h2>
          <p>
            Confirmed mechanic relationships in this package. Hover a
            tag or a tower to trace what it connects to.
          </p>
        </div>
      </div>

      <div className="synergy-tagcloud">
        {plan.synergy.tags.map((tag) => (
          <MechanicTag
            key={tag}
            tag={tag}
            active={highlight.isMechanicActive(
              tag,
            )}
            onEnter={() =>
              setHighlightMechanic(tag)
            }
            onLeave={() =>
              setHighlightMechanic(null)
            }
          />
        ))}
      </div>

      <div className="synergy-categories">
        {[...categories.entries()].map(
          ([category, groups]) => (
            <div
              className="synergy-category"
              key={category}
            >
              <h4>{category}</h4>
              {groups.map((group) => (
                <div
                  className="synergy-mechanic-group"
                  key={group.mechanicTag}
                >
                  <span className="synergy-mechanic-name">
                    {group.mechanicTag}
                  </span>
                  <div className="synergy-relation-grid">
                    {group.relations.map(
                      (relation, i) => (
                        <Relationship
                          key={`${relation.providerId}-${relation.consumerId}-${i}`}
                          relation={relation}
                        />
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
          ),
        )}
      </div>
    </section>
  );
}
