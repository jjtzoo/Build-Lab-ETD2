"use client";

import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import {
  ElementBadge,
  ElementIcon,
  TowerIcon,
  roman,
  gold,
} from "@/components/build-lab/primitives";
import { getTower } from "@/lib/domain/towerCatalog";
import { getTowerProfile } from "@/lib/domain/towerProfileCatalog";
import { getTowerMechanicFacts } from "@/lib/domain/towerMechanicFacts";
import {
  DAMAGE_DELIVERY_LABEL,
  DAMAGE_PROFILE_LABEL,
  DAMAGE_SHAPE_LABEL,
  SCALING_TRIGGER_LABEL,
} from "@/lib/domain/attributeLabels";
import { MECHANIC_TAG } from "@/lib/engine/synergyExplanation";
import { CORE_ROLE_LABEL } from "@/lib/domain/roles";
import { resolveNormalTowerCost } from "@/lib/domain/towerEconomics";
import { useTheoryCraft } from "@/components/theorycraft/store";
import { matchupNote, magnitudeText } from "@/components/theorycraft/towerFacts";

export function TowerDescription({
  assets,
}: {
  assets: BuildLabAssets;
}) {
  const slot = useTheoryCraft((s) =>
    s.slots.find((entry) => entry.id === s.focusedSlotId),
  );

  if (!slot || !slot.towerId || !slot.level) {
    return (
      <div className="tc-desc tc-desc-empty">
        <h3>Pick a tower</h3>
        <p>
          Choose a tower for the highlighted slot to see its stats, element
          matchup, role, and the mechanics it brings — at the level you set.
        </p>
      </div>
    );
  }

  const tower = getTower(slot.towerId);
  const profile = getTowerProfile(slot.towerId);
  const level = slot.level;
  const damage = tower.stats.damage[level - 1] ?? tower.stats.damage.at(-1)!;
  const dps = Math.round(damage * tower.stats.attackSpeed);
  const { strong, weak } = matchupNote(tower.damageElement);
  const facts = getTowerMechanicFacts(slot.towerId);
  const cost = resolveNormalTowerCost(slot.towerId, level);

  return (
    <div className="tc-desc">
      <header className="tc-desc-head">
        <TowerIcon
          towerId={tower.id}
          name={tower.name}
          assets={assets}
          size={52}
        />
        <div>
          <h3>
            {tower.name}{" "}
            <span className="mono tc-desc-level">{roman(level)}</span>
          </h3>
          <p className="tc-desc-sub">
            {tower.combination} ·{" "}
            {profile.coreRoles
              .map((role) => CORE_ROLE_LABEL[role])
              .join(" · ") || "Support"}
          </p>
        </div>
      </header>

      <div className="tc-desc-recipe">
        {tower.recipe.map((element) => (
          <ElementBadge key={element} element={element} assets={assets} />
        ))}
      </div>

      <dl className="tc-desc-stats">
        <div>
          <dt>Damage</dt>
          <dd className="mono">{damage.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Attack speed</dt>
          <dd className="mono">{tower.stats.attackSpeed}/s</dd>
        </div>
        <div>
          <dt>DPS (base)</dt>
          <dd className="mono">{dps.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Range</dt>
          <dd className="mono">{tower.stats.range}</dd>
        </div>
        <div>
          <dt>AoE</dt>
          <dd className="mono">
            {tower.stats.aoe > 0 ? tower.stats.aoe : "—"}
          </dd>
        </div>
        <div>
          <dt>Field cost</dt>
          <dd className="mono">{gold(cost.minimumFieldCost)}</dd>
        </div>
      </dl>
      <p className="tc-desc-caveat">
        DPS is base attack only — before element matchup, abilities, and
        support.
      </p>

      <div className="tc-desc-block">
        <h4>Element</h4>
        <p>
          Deals <ElementIcon
            element={tower.damageElement}
            assets={assets}
            size={15}
          />{" "}
          {tower.damageElement} damage.
          {strong && (
            <>
              {" "}
              2× vs <strong>{strong}</strong> armour
            </>
          )}
          {weak && (
            <>
              , 0.5× vs <strong>{weak}</strong> armour
            </>
          )}
          .
        </p>
      </div>

      {profile.offense && (
        <div className="tc-desc-block">
          <h4>Offense</h4>
          <p>
            {DAMAGE_SHAPE_LABEL[profile.offense.damageShape]} ·{" "}
            {DAMAGE_PROFILE_LABEL[profile.offense.damageProfile]} ·{" "}
            {DAMAGE_DELIVERY_LABEL[profile.offense.damageDelivery]}
            {profile.offense.scalingTriggers?.length
              ? ` · ${profile.offense.scalingTriggers
                  .map((trigger) => SCALING_TRIGGER_LABEL[trigger])
                  .join(", ")}`
              : ""}
          </p>
        </div>
      )}

      {(profile.mechanics.provides.length > 0 ||
        profile.mechanics.consumes.length > 0) && (
        <div className="tc-desc-block">
          <h4>Mechanics</h4>
          <ul className="tc-desc-mechanics">
            {profile.mechanics.provides.map((supply) => {
              const fact = facts.find(
                (entry) => entry.signal === supply.signal,
              );
              const magnitude =
                fact?.magnitude?.byLevel[level - 1] ??
                fact?.magnitude?.byLevel.at(-1);
              const duration =
                fact?.durationSeconds?.byLevel[level - 1] ??
                fact?.durationSeconds?.byLevel.at(-1);
              return (
                <li key={`p-${supply.signal}`}>
                  <span className="tc-mech-dir">Provides</span>
                  <span className="tc-mech-name">
                    {MECHANIC_TAG[supply.signal] ?? supply.signal}
                  </span>
                  {magnitude != null && fact?.magnitude && (
                    <span className="mono tc-mech-val">
                      {magnitudeText(fact.magnitude.unit, magnitude)}
                    </span>
                  )}
                  {duration != null && (
                    <span className="mono tc-mech-val">{duration}s</span>
                  )}
                  {fact?.activationRequirement === "active-cast" && (
                    <span className="tc-mech-flag">manual cast</span>
                  )}
                </li>
              );
            })}
            {profile.mechanics.consumes.map((demand) => (
              <li key={`c-${demand.signal}`}>
                <span className="tc-mech-dir tc-mech-dir-in">Wants</span>
                <span className="tc-mech-name">
                  {MECHANIC_TAG[demand.signal] ?? demand.signal}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
