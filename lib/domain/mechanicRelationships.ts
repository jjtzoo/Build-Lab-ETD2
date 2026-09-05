import type {
  MechanicRelationship,
} from "./mechanicSignals";

export const MECHANIC_RELATIONSHIPS:
  readonly MechanicRelationship[] = [
    {
      from: "kill-generation",
      to: "nearby-enemy-death",
      type: "derived",
      conditions: [
        "deaths-within-consumer-trigger-area",
      ],
    },
  ];