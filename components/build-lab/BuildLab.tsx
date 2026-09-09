"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { motion } from "motion/react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import {
  resolvePreviewPlan,
  resolveVisiblePlan,
  useBuildLab,
} from "@/components/build-lab/store";
import {
  AnchorSelector,
  type AnchorItem,
} from "@/components/build-lab/AnchorSelector";
import { FeaturedBuild } from "@/components/build-lab/FeaturedBuild";
import { RouteDetailModal } from "@/components/build-lab/AlternativeRoutes";
import { BuildProgression } from "@/components/build-lab/BuildProgression";
import { TowerPackage } from "@/components/build-lab/TowerPackage";
import { CoverageAnalysis } from "@/components/build-lab/CoverageAnalysis";
import { SynergyNetwork } from "@/components/build-lab/SynergyNetwork";

export function BuildLab({
  anchors,
  assets,
}: {
  anchors: AnchorItem[];
  names: Record<string, string>;
  assets: BuildLabAssets;
}) {
  const request = useRef<AbortController | null>(
    null,
  );
  const sequence = useRef(0);

  const anchorId = useBuildLab((s) => s.anchorId);
  const requestState = useBuildLab(
    (s) => s.requestState,
  );
  const error = useBuildLab((s) => s.error);
  const recommendationSet = useBuildLab(
    (s) => s.recommendationSet,
  );
  const activePlanId = useBuildLab(
    (s) => s.activePlanId,
  );
  const previewPlanId = useBuildLab(
    (s) => s.previewPlanId,
  );
  const engineRecommendedPlanId = useBuildLab(
    (s) => s.engineRecommendedPlanId,
  );
  const setAnchor = useBuildLab(
    (s) => s.setAnchor,
  );
  const startRequest = useBuildLab(
    (s) => s.startRequest,
  );
  const failRequest = useBuildLab(
    (s) => s.failRequest,
  );
  const receiveRecommendationSet = useBuildLab(
    (s) => s.receiveRecommendationSet,
  );

  const index = Math.max(
    0,
    anchors.findIndex((a) => a.id === anchorId),
  );
  const anchor = anchors[index];

  const visiblePlan = useMemo(
    () =>
      resolveVisiblePlan({
        recommendationSet,
        activePlanId,
      }),
    [recommendationSet, activePlanId],
  );

  // Hovering a route does not swap the page; it surfaces the delta.
  const previewedPlan = useMemo(
    () =>
      resolvePreviewPlan({
        recommendationSet,
        activePlanId,
        previewPlanId,
      }),
    [
      recommendationSet,
      activePlanId,
      previewPlanId,
    ],
  );

  const alternatives = useMemo(
    () =>
      (recommendationSet?.plans ?? []).filter(
        (plan) => plan.id !== activePlanId,
      ),
    [recommendationSet, activePlanId],
  );

  useEffect(
    () => () => request.current?.abort(),
    [],
  );

  function select(next: number) {
    request.current?.abort();
    sequence.current += 1;
    const normalized =
      (next + anchors.length) % anchors.length;
    setAnchor(anchors[normalized].id);
  }

  async function build() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = ++sequence.current;
    startRequest();
    try {
      const response = await fetch(
        "/api/optimize",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            anchorTowerId: anchor.id,
          }),
          signal: controller.signal,
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error ||
            "The planner could not complete this build.",
        );
      if (current !== sequence.current) return;
      receiveRecommendationSet(data);
    } catch (err) {
      if (
        controller.signal.aborted ||
        current !== sequence.current
      )
        return;
      failRequest(
        err instanceof Error
          ? err.message
          : "Connection failed. Please try again.",
      );
    }
  }

  const engineRank =
    recommendationSet?.plans.find(
      (p) => p.id === engineRecommendedPlanId,
    )?.rank ?? 1;
  const activeRank =
    recommendationSet?.plans.find(
      (p) => p.id === activePlanId,
    )?.rank ?? 1;

  return (
    <main
      className="lab-shell"
      data-previewing={
        previewedPlan ? true : undefined
      }
    >
      <span
        className="lab-grain"
        aria-hidden="true"
      />
      <a href="#build-result" className="skip-link">
        Skip to build result
      </a>

      <header className="lab-header">
        <Link href="/" className="wordmark">
          ELEMENT TD 2 <span>BUILD LAB</span>
        </Link>
        <span className="header-note">
          Strategy planner
        </span>
      </header>

      <div className="intro">
        <div>
          <p className="eyebrow">Build Lab</p>
          <h1>
            Plan the whole build around one
            anchor.
          </h1>
          <p>
            Pick your main DPS tower. The engine
            returns a complete, defensible plan —
            support towers, keystone route,
            coverage, synergy, and End Game
            specialisation.
          </p>
        </div>
      </div>

      <AnchorSelector
        anchors={anchors}
        index={index}
        assets={assets}
        requestState={requestState}
        onSelect={select}
        onBuild={build}
      />

      <div
        id="build-result"
        className="result-region"
        aria-busy={requestState === "loading"}
      >
        <div
          role="status"
          aria-live="polite"
          className="sr-only"
        >
          {requestState === "loading"
            ? "Planning your build."
            : requestState === "ready"
              ? `Build ready for ${anchor.name}.`
              : ""}
        </div>

        {requestState === "empty" && (
          <div className="empty-state lab-section">
            <h3>
              Your anchor sets the direction.
            </h3>
            <p>
              Build around {anchor.name} to see
              its recommended package, keystone
              route, and End Game options.
            </p>
          </div>
        )}

        {requestState === "loading" && (
          <div
            className="tower-deck skeleton-deck lab-section"
            aria-hidden="true"
          >
            {Array.from(
              { length: 8 },
              (_, i) => (
                <div
                  className="skeleton"
                  key={i}
                >
                  <span />
                  <span />
                  <span />
                </div>
              ),
            )}
          </div>
        )}

        {requestState === "error" && (
          <div
            className="empty-state lab-section"
            role="alert"
          >
            <h3>Could not plan this build</h3>
            <p>{error}</p>
            <button
              className="secondary-button"
              onClick={build}
            >
              Try again
            </button>
          </div>
        )}

        {requestState === "ready" &&
          visiblePlan &&
          recommendationSet && (
            <>
              <FeaturedBuild
                plan={visiblePlan}
                activeRank={activeRank}
                engineRank={engineRank}
                alternatives={alternatives}
                assets={assets}
              />
              <BuildProgression
                plan={visiblePlan}
                assets={assets}
              />
              <TowerPackage
                plan={visiblePlan}
                previewPlan={previewedPlan}
                assets={assets}
              />
              <CoverageAnalysis
                plan={visiblePlan}
                assets={assets}
              />
              <SynergyNetwork
                plan={visiblePlan}
                assets={assets}
              />

              {visiblePlan.tensions.length >
                0 && (
                <section className="lab-section tensions-section">
                  <div className="section-rail">
                    <span className="section-index mono">
                      07
                    </span>
                    <div>
                      <h3>Tensions</h3>
                      <p>
                        Conditional mechanic
                        conflicts to watch when
                        placing this build.
                      </p>
                    </div>
                  </div>
                  <ul className="tensions-list">
                    {visiblePlan.tensions.map(
                      (tension, i) => (
                        <li key={i}>
                          <strong>
                            {
                              tension.providerName
                            }{" "}
                            /{" "}
                            {
                              tension.affectedName
                            }
                          </strong>
                          <span>
                            {tension.condition}
                          </span>
                        </li>
                      ),
                    )}
                  </ul>
                </section>
              )}
              <RouteDetailModal
                plans={recommendationSet.plans}
              />
            </>
          )}
      </div>

      <footer className="lab-footer">
        <div className="footer-primary">
          <span className="footer-product">
            Element TD 2 Build Lab
          </span>
          <span>
            Recommendations explain a plan.
            Placement and execution remain
            yours.
          </span>
        </div>
        <div className="footer-signature">
          <span className="signature-label">
            Designed &amp; built by
          </span>
          <span className="signature-name">
            JJ Toledo
          </span>
          <span className="signature-ign mono">
            jjtzoo
          </span>
        </div>
      </footer>
    </main>
  );
}
