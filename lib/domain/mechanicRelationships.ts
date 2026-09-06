import type { MechanicRelationship } from "./mechanicSignals";

export const MECHANIC_RELATIONSHIPS: readonly MechanicRelationship[] = [
  {
    from: "tower-replication",
    to: "tower-replication",
    type: "conditional",
    conditions: ["replication-applicable"],
  },
  {
    from: "kill-generation",
    to: "nearby-enemy-death",
    type: "derived",
    conditions: ["deaths-within-consumer-trigger-area"],
  },
];
