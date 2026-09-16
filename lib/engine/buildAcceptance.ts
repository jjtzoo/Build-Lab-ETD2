import type { PortableBuild } from "@/lib/domain/portableBuild";
import { getTower } from "@/lib/domain/towerCatalog";
import { getTowerProfile } from "@/lib/domain/towerProfileCatalog";
import { ELEMENT_MATCHUPS } from "@/lib/domain/elementMatchupCatalog";
import { evaluateElementCoverage } from "@/lib/engine/elementCoverage";

/**
 * Below this, a build has no discretionary damage role at all beyond the
 * anchor itself — not "thin," genuinely degenerate. Calibrated against
 * every CURATED_ANCHORS package's own recommended plan: the leanest real,
 * proven-winning build (Bloom, a zero-leak win to wave 61) still carries 2
 * distinct damage-tower types in its package, on top of the early mono
 * towers Match Plan's own opening/coverage logic always adds regardless of
 * what's in `build.towers`. A floor of 2 rejects only a build with
 * nothing but the anchor itself, without touching any legitimate anchor.
 */
const MINIMUM_DAMAGE_TOWER_TYPES = 2;

/**
 * Every one of the 22 curated anchors' own recommended packages leaves 1-2
 * armor colors both below-neutral and uncountered — no real package
 * matches every color, and that is not a defect. The worst legitimate
 * package observed leaves 2; a floor of 3 catches a package meaningfully
 * worse than every audited anchor without flagging any of them.
 */
const MAXIMUM_UNCOVERED_COLORS = 2;

export type BuildAcceptanceFailure = {
  kind: "too-few-damage-towers" | "weak-element-coverage";
  detail: string;
};

export type BuildAcceptanceVerdict = {
  accepted: boolean;
  failures: readonly BuildAcceptanceFailure[];
};

/**
 * The minimum bar a build must clear before Match Plan will generate a
 * wave-by-wave plan for it at all — independent of whether that plan then
 * survives every wave. A build below this bar (too few damage roles, or
 * an armor color the whole package leaves uncountered) is not a "hard
 * build," it is one the rescue/survival machinery was never designed to
 * reason about, and would silently generate a plan that reads as
 * legitimate advice. Damage-shape (AoE) adequacy is deliberately NOT a
 * check here — that gap belongs to the package search itself
 * (lib/engine/buildPlanner.ts, lib/engine/normalPackageSearch.ts), which
 * should never recommend a package this thin in the first place, rather
 * than Match Plan rejecting one after the fact.
 */
export function evaluateBuildAcceptance(
  build: PortableBuild,
): BuildAcceptanceVerdict {
  const distinctTowerIds = [
    ...new Set(build.towers.map((tower) => tower.towerId)),
  ];

  const offensiveTowerIds = distinctTowerIds.filter((towerId) => {
    try {
      return getTowerProfile(towerId).offense != null;
    } catch {
      return false;
    }
  });

  const failures: BuildAcceptanceFailure[] = [];

  if (offensiveTowerIds.length < MINIMUM_DAMAGE_TOWER_TYPES) {
    failures.push({
      kind: "too-few-damage-towers",
      detail: `This build has ${offensiveTowerIds.length} distinct damage-dealing tower type${offensiveTowerIds.length === 1 ? "" : "s"} (${MINIMUM_DAMAGE_TOWER_TYPES} minimum). Match Plan's rescue and saturation logic assumes a real package to sequence, not a handful of towers.`,
    });
  }

  const anchorProfile = (() => {
    try {
      return getTowerProfile(build.anchorTowerId);
    } catch {
      return null;
    }
  })();
  const anchorElement =
    anchorProfile?.offense?.offensiveElement ??
    (() => {
      try {
        return getTower(build.anchorTowerId).damageElement;
      } catch {
        return "Light" as const;
      }
    })();
  const supportingElements = offensiveTowerIds
    .filter((towerId) => towerId !== build.anchorTowerId)
    .map((towerId) => getTowerProfile(towerId).offense!.offensiveElement);

  const coverageRows = evaluateElementCoverage(
    ELEMENT_MATCHUPS,
    anchorElement,
    supportingElements,
  );
  const uncoveredColors = coverageRows.filter(
    (row) =>
      row.packageAverageMultiplier < 1 && !row.hasMeaningfulDirectCounter,
  );
  if (uncoveredColors.length > MAXIMUM_UNCOVERED_COLORS) {
    failures.push({
      kind: "weak-element-coverage",
      detail: `${uncoveredColors.length} armor colors (${uncoveredColors.map((row) => row.defender).join(", ")}) have no meaningful counter anywhere in this package.`,
    });
  }

  return { accepted: failures.length === 0, failures };
}
