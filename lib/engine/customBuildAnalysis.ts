import { ELEMENTS, type ElementName } from "@/lib/domain/elements";

import type { TowerId } from "@/lib/domain/tower";
import { getTower } from "@/lib/domain/towerCatalog";
import { getTowerProfile } from "@/lib/domain/towerProfileCatalog";
import { getTowerMechanicFacts } from "@/lib/domain/towerMechanicFacts";
import { ELEMENT_MATCHUPS } from "@/lib/domain/elementMatchupCatalog";
import { CORE_ROLE_LABEL, type CoreRole } from "@/lib/domain/roles";

import {
  deriveAllocation,
  totalKeystones,
  type PlacedTower,
} from "@/lib/engine/customBuild";
import {
  findDirectMechanicSynergies,
  applyMechanicSaturation,
} from "@/lib/engine/mechanicSynergy";
import { findConditionalMechanicTensions } from "@/lib/engine/mechanicTension";
import { evaluateElementCoverage } from "@/lib/engine/elementCoverage";
import { evaluateMechanicAvailability } from "@/lib/engine/mechanicAvailability";
import {
  countCoreRoles,
  getCoreRoleStatus,
} from "@/lib/engine/coreRoleDetection";
import {
  buildSynergyRelation,
  sortSynergyRelations,
  partitionSynergyRelations,
  groupSynergyByMechanic,
  type SynergyRelationExplanation,
} from "@/lib/engine/synergyExplanation";
import type { CoverageRowDto } from "@/lib/engine/buildRecommendationDto";

export type CustomBuildWarning = {
  kind:
    | "missing-core-role"
    | "trio-underdeveloped"
    | "isolation-vs-area"
    | "displacement-vs-contact";
  title: string;
  detail: string;
  towerIds: readonly TowerId[];
};

export type CustomBuildAnalysis = {
  allocation: Record<ElementName, number>;
  keystoneCount: number;
  coreRoles: readonly {
    role: CoreRole;
    label: string;
    count: number;
    minimum: number;
    satisfied: boolean;
  }[];
  coverage: {
    rows: readonly CoverageRowDto[];
    hasSingleTarget: boolean;
    hasAoe: boolean;
    anchorRange: number;
    rangeMin: number;
    rangeMax: number;
  };
  synergy: {
    relations: readonly SynergyRelationExplanation[];
    secondaryRelations: readonly SynergyRelationExplanation[];
    grouped: readonly {
      mechanicTag: string;
      relations: readonly SynergyRelationExplanation[];
    }[];
  };
  tensions: readonly {
    providerId: TowerId;
    providerName: string;
    affectedId: TowerId;
    affectedName: string;
    condition: string;
  }[];
  warnings: readonly CustomBuildWarning[];
};

/**
 * Runs the same evidence the recommendation flow shows — element-armour
 * coverage, graded mechanic synergy, conditional tensions, core-role
 * completeness — against a build the player assembled by hand, instead of
 * one the engine searched for. Composed from the low-level primitives; it
 * deliberately does not run the package search or gold economics.
 *
 * `placed[0]` is treated as the anchor.
 */
export function analyzeCustomBuild(
  placed: readonly PlacedTower[],
): CustomBuildAnalysis {
  const anchor = placed[0];
  const anchorTowerId = anchor?.towerId ?? "";
  const levelByTower = new Map(
    placed.map((entry) => [entry.towerId, entry.level]),
  );

  const profiles = placed.map((entry) => getTowerProfile(entry.towerId));

  const allocation = deriveAllocation(placed);

  // ---- Synergy -----------------------------------------------------------
  const saturated = applyMechanicSaturation(
    findDirectMechanicSynergies(profiles),
  );
  const relations = sortSynergyRelations(
    saturated
      .filter((match) => match.contribution !== "ignored")
      .map((match) => {
        const providerLevel = levelByTower.get(match.providerTowerId) ?? 1;
        const fact =
          getTowerMechanicFacts(match.providerTowerId).find(
            (entry) => entry.signal === match.signal,
          ) ?? null;
        const availabilityClass = evaluateMechanicAvailability(
          fact,
          providerLevel,
        ).classification;

        return buildSynergyRelation({
          providerTowerId: match.providerTowerId,
          consumerTowerId: match.consumerTowerId,
          signal: match.signal,
          effectiveStrength: match.effectiveStrength,
          contribution:
            match.contribution === "diminished" ? "diminished" : "full",
          availabilityClass,
          anchorTowerId,
        });
      }),
  );
  const { primary, secondary } = partitionSynergyRelations(relations);

  // ---- Tensions ---------------------------------------------------------
  const tensions = findConditionalMechanicTensions(profiles).map((tension) => ({
    providerId: tension.providerTowerId,
    providerName: getTower(tension.providerTowerId).name,
    affectedId: tension.affectedTowerId,
    affectedName: getTower(tension.affectedTowerId).name,
    condition: tension.condition,
  }));

  // ---- Element coverage ------------------------------------------------
  const anchorProfile = anchorTowerId ? getTowerProfile(anchorTowerId) : null;
  const anchorElement =
    anchorProfile?.offense?.offensiveElement ??
    (anchorTowerId ? getTower(anchorTowerId).damageElement : "Light");
  const supportingElements = placed
    .slice(1)
    .map((entry) => getTowerProfile(entry.towerId))
    .filter((profile) => profile.offense)
    .map((profile) => profile.offense!.offensiveElement);

  const coverageRows: CoverageRowDto[] = evaluateElementCoverage(
    ELEMENT_MATCHUPS,
    anchorElement,
    supportingElements,
  ).map((row) => ({
    defender: row.defender,
    anchorMultiplier: row.anchorMultiplier,
    packageAverageMultiplier: Number(row.packageAverageMultiplier.toFixed(2)),
    hasMeaningfulDirectCounter: row.hasMeaningfulDirectCounter,
    isAnchorWeakness: row.anchorMultiplier === 0.5,
    covered: row.anchorMultiplier !== 0.5 || row.hasMeaningfulDirectCounter,
  }));

  const offensiveTowers = placed.filter(
    (entry) => getTowerProfile(entry.towerId).offense,
  );
  const ranges = offensiveTowers.map(
    (entry) => getTower(entry.towerId).stats.range,
  );
  const shapes = offensiveTowers.map(
    (entry) => getTowerProfile(entry.towerId).offense!.damageShape,
  );

  // ---- Core roles -----------------------------------------------------
  const coreRoles = getCoreRoleStatus(profiles).map((status) => ({
    role: status.role,
    label: CORE_ROLE_LABEL[status.role],
    count: status.count,
    minimum: status.minimum,
    satisfied: status.satisfied,
  }));

  // ---- Soft warnings ------------------------------------------------
  const warnings: CustomBuildWarning[] = [];
  const roleCounts = countCoreRoles(profiles);

  for (const status of coreRoles) {
    if (status.satisfied) continue;
    warnings.push({
      kind: "missing-core-role",
      title: `No ${status.label} tower`,
      detail:
        status.role === "slow"
          ? "A Slow keeps the wave in your damage window — the engine never ships a build without one."
          : `The engine's mandatory core package always includes a ${status.label}. This build has none.`,
      towerIds: [],
    });
  }

  for (const entry of placed.slice(1)) {
    const tower = getTower(entry.towerId);
    if (tower.combination !== "Trio" || entry.level >= 2) {
      continue;
    }
    const profile = getTowerProfile(entry.towerId);
    const solelyFillsARole = profile.coreRoles.some(
      (role) => roleCounts[role] === 1,
    );
    if (solelyFillsARole) continue;
    warnings.push({
      kind: "trio-underdeveloped",
      title: `${tower.name} at Level 1`,
      detail:
        "A discretionary Trio tower earns its slot at Level 2+. The engine won't add one at Level 1 outside a mandatory core role — spend the keystones deepening it or elsewhere.",
      towerIds: [entry.towerId],
    });
  }

  const anchorIsArea =
    anchorProfile?.offense?.damageShape === "aoe" ||
    anchorProfile?.offense?.damageShape === "hybrid";
  if (anchorIsArea) {
    const isolationProviders = placed.filter((entry) =>
      getTowerProfile(entry.towerId).mechanics.provides.some(
        (supply) => supply.signal === "target-isolation",
      ),
    );
    if (isolationProviders.length > 0) {
      warnings.push({
        kind: "isolation-vs-area",
        title: "Isolation on an area anchor",
        detail: `${getTower(anchorTowerId).name} wants a clumped wave. Pulling a creep out of the pack wastes its splash and speeds that creep to the exit — the engine bans isolation towers from area-anchor builds.`,
        towerIds: isolationProviders.map((entry) => entry.towerId),
      });
    }
  }

  // A creep-throwing tower (Archdruid) takes contact away from every tower
  // that ramps on sustained attacks or pays off over duration — the owner
  // saw it nullify the damage towers in live play.
  const throwers = placed.filter((entry) =>
    getTowerProfile(entry.towerId).mechanics.provides.some(
      (supply) => supply.signal === "enemy-displacement",
    ),
  );
  if (throwers.length > 0) {
    const starved = placed.filter((entry) => {
      if (throwers.some((thrower) => thrower.towerId === entry.towerId))
        return false;
      const triggers =
        getTowerProfile(entry.towerId).offense?.scalingTriggers ?? [];
      return (
        triggers.includes("attack-scaling") ||
        triggers.includes("duration-scaling")
      );
    });
    if (starved.length > 0) {
      warnings.push({
        kind: "displacement-vs-contact",
        title: "Thrown creeps starve ramping towers",
        detail: `${throwers.map((entry) => getTower(entry.towerId).name).join(" and ")} throws each hit creep forward to the front of the wave. ${starved.map((entry) => getTower(entry.towerId).name).join(", ")} need${starved.length === 1 ? "s" : ""} the target to stay in reach to ramp or pay off, and a thrown target ends that contact.`,
        towerIds: [...throwers, ...starved].map((entry) => entry.towerId),
      });
    }
  }

  return {
    allocation: Object.fromEntries(
      ELEMENTS.map((element) => [element, allocation[element]]),
    ) as Record<ElementName, number>,
    keystoneCount: totalKeystones(allocation),
    coreRoles,
    coverage: {
      rows: coverageRows,
      hasSingleTarget: shapes.some(
        (shape) => shape === "single-target" || shape === "hybrid",
      ),
      hasAoe: shapes.some((shape) => shape === "aoe" || shape === "hybrid"),
      anchorRange: anchorTowerId ? getTower(anchorTowerId).stats.range : 0,
      rangeMin: ranges.length ? Math.min(...ranges) : 0,
      rangeMax: ranges.length ? Math.max(...ranges) : 0,
    },
    synergy: {
      relations: primary,
      secondaryRelations: secondary,
      grouped: groupSynergyByMechanic(primary),
    },
    tensions,
    warnings,
  };
}
