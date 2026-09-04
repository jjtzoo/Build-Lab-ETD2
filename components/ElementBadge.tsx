import type { CSSProperties } from "react";
import { ELEMENT_VISUALS } from "@/lib/element-visuals";
import type { ElementName } from "@/lib/types";

export function ElementBadge({ element, depth }: { element: ElementName; depth?: number }) {
  const visual = ELEMENT_VISUALS[element];
  return <span className="element-badge" style={{ "--element": visual.color } as CSSProperties}>
    <span aria-hidden="true">{visual.symbol}</span>{element}{depth !== undefined && <b key={depth}>{depth}</b>}
  </span>;
}

export function RecipeBadges({ recipe }: { recipe: readonly ElementName[] }) {
  return <div className="recipe-badges" aria-label={`Recipe: ${recipe.join(", ")}`}>
    {recipe.map((element) => <ElementBadge key={element} element={element}/>)}
  </div>;
}
