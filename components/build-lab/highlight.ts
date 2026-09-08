import type { PlanDto } from "@/lib/engine/buildRecommendationDto";
import type { SynergyRelationExplanation } from "@/lib/engine/synergyExplanation";

export type HighlightResolver = {
  active: boolean;
  isTowerActive: (towerId: string) => boolean;
  isTowerDimmed: (towerId: string) => boolean;
  isRelationActive: (
    relation: SynergyRelationExplanation,
  ) => boolean;
  isRelationDimmed: (
    relation: SynergyRelationExplanation,
  ) => boolean;
  isMechanicActive: (tag: string) => boolean;
};

const INERT: HighlightResolver = {
  active: false,
  isTowerActive: () => false,
  isTowerDimmed: () => false,
  isRelationActive: () => false,
  isRelationDimmed: () => false,
  isMechanicActive: () => false,
};

/**
 * Given the visible plan and the current cross-highlight focus, returns
 * predicates the tower deck and synergy network use to emphasise the
 * participants of one relationship and gently recede everything else.
 * Nothing here mutates state.
 */
export function resolveHighlight(
  plan: PlanDto | null,
  highlightTowerId: string | null,
  highlightMechanicTag: string | null,
): HighlightResolver {
  if (
    !plan ||
    (!highlightTowerId && !highlightMechanicTag)
  ) {
    return INERT;
  }

  const relations = plan.synergy.relations;

  // Towers connected to the focus, by any relation.
  const connected = new Set<string>();

  if (highlightTowerId) {
    connected.add(highlightTowerId);
    for (const relation of relations) {
      if (
        relation.providerId ===
          highlightTowerId ||
        relation.consumerId ===
          highlightTowerId
      ) {
        connected.add(relation.providerId);
        connected.add(relation.consumerId);
      }
    }
  }

  if (highlightMechanicTag) {
    for (const relation of relations) {
      if (
        relation.mechanicTag ===
        highlightMechanicTag
      ) {
        connected.add(relation.providerId);
        connected.add(relation.consumerId);
      }
    }
  }

  const relationInFocus = (
    relation: SynergyRelationExplanation,
  ) => {
    if (highlightMechanicTag) {
      return (
        relation.mechanicTag ===
        highlightMechanicTag
      );
    }
    return (
      relation.providerId ===
        highlightTowerId ||
      relation.consumerId ===
        highlightTowerId
    );
  };

  return {
    active: true,
    isTowerActive: (towerId) =>
      connected.has(towerId),
    isTowerDimmed: (towerId) =>
      !connected.has(towerId),
    isRelationActive: relationInFocus,
    isRelationDimmed: (relation) =>
      !relationInFocus(relation),
    isMechanicActive: (tag) =>
      highlightMechanicTag
        ? tag === highlightMechanicTag
        : relations.some(
            (relation) =>
              relation.mechanicTag === tag &&
              (relation.providerId ===
                highlightTowerId ||
                relation.consumerId ===
                  highlightTowerId),
          ),
  };
}
