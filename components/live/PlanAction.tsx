"use client";

import { liveTowerLevelLabel } from "@/lib/engine/liveGame";
import type { LivePlanAction } from "@/lib/engine/liveCoaching";
import { useLiveGame } from "./store";

export function PlanAction({ action }: { action: LivePlanAction }) {
  const addBuilt = useLiveGame((s) => s.addBuilt);
  const setBuiltLevel = useLiveGame((s) => s.setBuiltLevel);
  return (
    <button
      type="button"
      className="live-strip-do"
      onClick={() => {
        if (action.fromLevel !== undefined)
          setBuiltLevel(action.towerId, action.fromLevel, action.toLevel);
        else addBuilt(action.towerId, action.toLevel);
      }}
    >
      {action.kind === "upgrade" ? "Upgrade one" : "Log one"}{" "}
      <b>
        {action.towerName} {liveTowerLevelLabel(action.towerId, action.toLevel)}
      </b>
    </button>
  );
}
