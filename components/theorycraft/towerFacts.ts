import { ELEMENTS, type ElementName } from "@/lib/domain/elements";
import { ELEMENT_MATCHUPS } from "@/lib/domain/elementMatchupCatalog";

/** The one element a damage element hits for 2x and the one it hits for 0.5x. */
export function matchupNote(element: ElementName): {
  strong: ElementName | null;
  weak: ElementName | null;
} {
  const row = ELEMENT_MATCHUPS[element];
  let strong: ElementName | null = null;
  let weak: ElementName | null = null;
  for (const defender of ELEMENTS) {
    if (row[defender] === 2) strong = defender;
    if (row[defender] === 0.5) weak = defender;
  }
  return { strong, weak };
}

/** Human text for a mechanic-fact magnitude value at its unit. */
export function magnitudeText(unit: string, value: number): string {
  switch (unit) {
    case "percent":
    case "percent-damage":
      return `${value}%`;
    case "percent-speed-increase":
      return `+${value}% speed`;
    case "seconds":
      return `${value}s`;
    default:
      return String(value);
  }
}
