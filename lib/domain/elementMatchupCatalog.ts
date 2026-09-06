import elementMatchupCatalogData from "@/data/elementMatchups.v1.json";

import type {
  ElementMatchupCatalog,
  ElementMatchupTable,
} from "./elementMatchups";

export const ELEMENT_MATCHUP_CATALOG =
  elementMatchupCatalogData as unknown as ElementMatchupCatalog;

export const ELEMENT_MATCHUPS:
  ElementMatchupTable =
    ELEMENT_MATCHUP_CATALOG.matchups;