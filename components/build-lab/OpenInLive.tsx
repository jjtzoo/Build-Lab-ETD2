"use client";

import { useState } from "react";
import type { PlanDto } from "@/lib/engine/buildRecommendationDto";
import {
  encodePortableBuild,
  PORTABLE_BUILD_SCHEMA,
  type PortableBuild,
} from "@/lib/domain/portableBuild";
import { getLiveStorage, liveImportUrl } from "@/lib/domain/liveImport";

/** Query strings much past this stop being reliably shareable. */
const MAX_URL_PAYLOAD = 6000;

/** A recommended plan in the shape every Build Lab surface can read. */
export function planToPortableBuild(plan: PlanDto): PortableBuild {
  return {
    schema: PORTABLE_BUILD_SCHEMA,
    source: "engine",
    anchorTowerId: plan.anchor.id,
    towers: plan.package.map((tower) => ({
      towerId: tower.id,
      level: tower.level,
    })),
    allocation: plan.allocation,
    createdAt: new Date().toISOString(),
    strategy: {
      towers: plan.package.map((t) => ({
        towerId: t.id,
        purpose: t.purpose,
        roles: t.roles,
        synergyTags: t.synergyTags,
      })),
      relations: plan.synergy.relations.map((r) => ({
        providerId: r.providerId,
        consumerId: r.consumerId,
        text: r.text,
      })),
    },
    progression: plan.progression.map((stage) => ({
      stage: stage.stage,
      headline: stage.headline,
      reason: stage.reason,
      primaryAction: stage.primaryAction,
      keystoneSteps: stage.keystoneSteps,
    })),
    coverageWeaknesses: plan.coverage.rows
      .filter((row) => !row.covered)
      .map((row) => row.defender),
    endGame:
      plan.endGame.best?.towers.map((tower) => ({
        name: tower.name,
        quantity: tower.quantity,
      })) ?? [],
  };
}

/**
 * Hands this build to Match Plan. The build always goes through
 * localStorage so the handoff works regardless of size; the URL carries it
 * too when it is short enough to stay shareable.
 */
export function OpenInLive({ plan }: { plan: PlanDto }) {
  const [copied, setCopied] = useState(false);

  function open() {
    const portable = planToPortableBuild(plan);
    window.location.href = liveImportUrl(portable, getLiveStorage());
  }

  async function copyLink() {
    const encoded = encodePortableBuild(planToPortableBuild(plan));
    if (encoded.length > MAX_URL_PAYLOAD) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/match-plan?b=${encoded}`,
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="featured-handoff">
      <button type="button" className="primary-button" onClick={open}>
        Open in Match Plan →
      </button>
      <button type="button" className="secondary-button" onClick={copyLink}>
        {copied ? "Link copied" : "Copy plan link"}
      </button>
      <span className="featured-handoff-note">
        Plan camps, coverage and purchases before the match.
      </span>
    </div>
  );
}
