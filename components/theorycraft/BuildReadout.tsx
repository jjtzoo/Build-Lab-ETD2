"use client";

import { useMemo } from "react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import {
  ElementIcon,
  QualificationBadge,
  StatusBadge,
} from "@/components/build-lab/primitives";
import { ELEMENTS } from "@/lib/domain/elements";
import {
  analyzeCustomBuild,
  type CustomBuildAnalysis,
} from "@/lib/engine/customBuildAnalysis";
import {
  useTheoryCraft,
  selectPlaced,
} from "@/components/theorycraft/store";


function multiplierLabel(value: number): string {
  if (value === 2) return "2×";
  if (value === 0.5) return "0.5×";
  return "1×";
}

export function BuildReadout({ assets }: { assets: BuildLabAssets }) {
  const slots = useTheoryCraft((s) => s.slots);
  const placed = useMemo(() => selectPlaced({ slots }), [slots]);
  const hasAnchor = placed.length > 0;

  const analysis: CustomBuildAnalysis | null = useMemo(
    () => (hasAnchor ? analyzeCustomBuild(placed) : null),
    [placed, hasAnchor],
  );

  if (!analysis) {
    return (
      <section className="tc-readout lab-section">
        <div className="section-rail">
          <span className="section-index mono">02</span>
          <div>
            <h3>Build read-out</h3>
            <p>Add an anchor to analyse the build.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="tc-readout lab-section">
      <div className="section-rail">
        <span className="section-index mono">02</span>
        <div>
          <h3>Build read-out</h3>
          <p>
            The same evidence the recommendation flow uses — run against the
            build you assembled.
          </p>
        </div>
      </div>

      {analysis.warnings.length > 0 && (
        <ul className="tc-warnings">
          {analysis.warnings.map((warning, index) => (
            <li key={index} className="tc-warning">
              <StatusBadge tone="warn">Advisory</StatusBadge>
              <div>
                <strong>{warning.title}</strong>
                <span>{warning.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="tc-readout-grid">
        <div className="tc-card">
          <h4>Core roles</h4>
          <ul className="tc-roles">
            {analysis.coreRoles.map((role) => (
              <li key={role.role} data-ok={role.satisfied || undefined}>
                <span>{role.label}</span>
                <span className="mono">
                  {role.satisfied ? `✓ ${role.count}` : "—"}
                </span>
              </li>
            ))}
          </ul>
          <p className="tc-card-note">
            {analysis.coverage.hasSingleTarget &&
            analysis.coverage.hasAoe
              ? "Single-target and area damage both covered."
              : analysis.coverage.hasAoe
                ? "Area damage only — no single-target finisher."
                : analysis.coverage.hasSingleTarget
                  ? "Single-target only — thin against dense waves."
                  : ""}
          </p>
        </div>

        <div className="tc-card">
          <h4>Element coverage</h4>
          <ul className="tc-coverage">
            {analysis.coverage.rows.map((row) => (
              <li
                key={row.defender}
                data-weak={row.isAnchorWeakness || undefined}
                data-covered={row.covered || undefined}
              >
                <ElementIcon
                  element={row.defender}
                  assets={assets}
                  size={16}
                />
                <span>{row.defender}</span>
                <span className="mono">
                  {multiplierLabel(row.anchorMultiplier)}
                </span>
                <span className="tc-coverage-tag">
                  {row.isAnchorWeakness
                    ? row.hasMeaningfulDirectCounter
                      ? "patched"
                      : "weak"
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="tc-card">
        <h4>Synergy ({analysis.synergy.relations.length})</h4>
        {analysis.synergy.relations.length === 0 ? (
          <p className="tc-card-note">
            No confirmed mechanic relationships between these towers yet.
          </p>
        ) : (
          <ul className="tc-synergy">
            {analysis.synergy.relations.map((relation, index) => (
              <li key={index}>
                <QualificationBadge
                  tier={relation.qualification.tier}
                  small
                />
                <span className="tc-synergy-text">{relation.text}</span>
              </li>
            ))}
          </ul>
        )}
        {analysis.synergy.secondaryRelations.length > 0 && (
          <p className="tc-card-note">
            + {analysis.synergy.secondaryRelations.length} situational
            interaction
            {analysis.synergy.secondaryRelations.length > 1 ? "s" : ""}.
          </p>
        )}
      </div>

      {analysis.tensions.length > 0 && (
        <div className="tc-card">
          <h4>Tensions</h4>
          <ul className="tc-tensions">
            {analysis.tensions.map((tension, index) => (
              <li key={index}>
                <strong>
                  {tension.providerName} / {tension.affectedName}
                </strong>
                <span>{tension.condition}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export { ELEMENTS };
