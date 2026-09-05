import type {
  ElementMatchupTable,
  ElementMultiplier,
} from "@/lib/domain/elementMatchups";
import type { ElementName } from "@/lib/domain/elements";

export function getElementMultiplier(
  matchups: ElementMatchupTable,
  attacker: ElementName,
  defender: ElementName,
): ElementMultiplier {
  return matchups[attacker][defender];
}