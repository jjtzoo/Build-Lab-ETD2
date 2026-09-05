import type { DamageShape } from "@/lib/domain/attributes";

export type DamageShapeCoverageMeasurement = {
  anchorShape: DamageShape;

  singleTargetCount: number;
  aoeCount: number;
  hybridCount: number;

  hasSingleTargetCapability: boolean;
  hasAoeCapability: boolean;

  hasComplementaryShape: boolean;
};

export function evaluateDamageShapeCoverage(
  anchorShape: DamageShape,
  supportingShapes: readonly DamageShape[] = [],
): DamageShapeCoverageMeasurement {
  const packageShapes = [
    anchorShape,
    ...supportingShapes,
  ];

  const singleTargetCount = packageShapes.filter(
    (shape) => shape === "single-target",
  ).length;

  const aoeCount = packageShapes.filter(
    (shape) => shape === "aoe",
  ).length;

  const hybridCount = packageShapes.filter(
    (shape) => shape === "hybrid",
  ).length;

  const hasSingleTargetCapability =
    singleTargetCount > 0 || hybridCount > 0;

  const hasAoeCapability =
    aoeCount > 0 || hybridCount > 0;

  let hasComplementaryShape: boolean;

  switch (anchorShape) {
    case "single-target":
      hasComplementaryShape =
        aoeCount > 0 || hybridCount > 0;
      break;

    case "aoe":
      hasComplementaryShape =
        singleTargetCount > 0 || hybridCount > 0;
      break;

    case "hybrid":
      hasComplementaryShape = true;
      break;
  }

  return {
    anchorShape,

    singleTargetCount,
    aoeCount,
    hybridCount,

    hasSingleTargetCapability,
    hasAoeCapability,

    hasComplementaryShape,
  };
}