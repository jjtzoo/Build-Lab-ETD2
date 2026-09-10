"use client";

import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { ElementIcon, roman } from "@/components/build-lab/primitives";
import { getTower } from "@/lib/domain/towerCatalog";
import { getTowerProfile } from "@/lib/domain/towerProfileCatalog";
import { getTowerMechanicFacts } from "@/lib/domain/towerMechanicFacts";
import {
  DAMAGE_PROFILE_LABEL,
  DAMAGE_SHAPE_LABEL,
} from "@/lib/domain/attributeLabels";
import { MECHANIC_TAG } from "@/lib/engine/synergyExplanation";
import { CORE_ROLE_LABEL, SUPPORT_ROLE_LABEL } from "@/lib/domain/roles";
import { matchupNote, magnitudeText } from "@/components/theorycraft/towerFacts";

/**
 * Condensed tower identity shown on hover / focus of a slot's icon — a
 * quick glance without moving the main description panel off another slot.
 */
export function TowerSummary({
  towerId,
  level,
  assets,
}: {
  towerId: string;
  level: number;
  assets: BuildLabAssets;
}) {
  const tower = getTower(towerId);
  const profile = getTowerProfile(towerId);
  const damage =
    tower.stats.damage[level - 1] ?? tower.stats.damage.at(-1)!;
  const dps = Math.round(damage * tower.stats.attackSpeed);
  const { strong, weak } = matchupNote(tower.damageElement);
  const facts = getTowerMechanicFacts(towerId);

  const roleText =
    profile.coreRoles.map((role) => CORE_ROLE_LABEL[role]).join(" · ") ||
    SUPPORT_ROLE_LABEL;
  const shapeText = profile.offense
    ? [
        DAMAGE_SHAPE_LABEL[profile.offense.damageShape],
        DAMAGE_PROFILE_LABEL[profile.offense.damageProfile],
      ].join(" · ")
    : null;

  return (
    <div className="tc-summary" role="tooltip">
      <div className="tc-summary-head">
        <strong>{tower.name}</strong>
        <span className="mono">{roman(level)}</span>
      </div>
      <p className="tc-summary-line">
        {tower.combination} · {roleText}
      </p>
      <p className="tc-summary-recipe">
        {tower.recipe.map((element) => (
          <ElementIcon
            key={element}
            element={element}
            assets={assets}
            size={14}
          />
        ))}
        <span>
          <ElementIcon
            element={tower.damageElement}
            assets={assets}
            size={14}
          />
          {tower.damageElement}
        </span>
      </p>
      <p className="tc-summary-line">
        {strong && `2× ${strong}`}
        {strong && weak && " · "}
        {weak && `0.5× ${weak}`}
      </p>
      {shapeText && <p className="tc-summary-line">{shapeText}</p>}
      <p className="tc-summary-line mono">
        {damage.toLocaleString()} dmg · {dps.toLocaleString()} DPS
      </p>
      {profile.mechanics.provides.length > 0 && (
        <p className="tc-summary-mechs">
          {profile.mechanics.provides.map((supply) => {
            const fact = facts.find(
              (entry) => entry.signal === supply.signal,
            );
            const magnitude =
              fact?.magnitude?.byLevel[level - 1] ??
              fact?.magnitude?.byLevel.at(-1);
            return (
              <span key={supply.signal} className="tc-summary-chip">
                {MECHANIC_TAG[supply.signal] ?? supply.signal}
                {magnitude != null && fact?.magnitude
                  ? ` ${magnitudeText(fact.magnitude.unit, magnitude)}`
                  : ""}
              </span>
            );
          })}
        </p>
      )}
    </div>
  );
}
