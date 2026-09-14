"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import type { Tower } from "@/lib/domain/tower";
import type {
  DamageDelivery,
  DamageProfile,
  DamageShape,
  ScalingTriggerMechanic,
} from "@/lib/domain/attributes";
import type { ElementAllocation, ElementName } from "@/lib/domain/elements";
import { TowerMedia } from "@/components/build-lab/TowerMedia";
import {
  CombatFingerprint,
  ElementPips,
  TowerArt,
  roman,
} from "@/components/build-lab/primitives";

export type AnchorItem = Tower & {
  level: number;
  shape: DamageShape | null;
  profile: DamageProfile | null;
  delivery: DamageDelivery | null;
  scaling: readonly ScalingTriggerMechanic[];
  allocation: ElementAllocation;
};

const EASE = [0.32, 0.72, 0, 1] as const;

function NeighborButton({
  item,
  assets,
  direction,
  onSelect,
}: {
  item: AnchorItem;
  assets: BuildLabAssets;
  direction: "prev" | "next";
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="anchor-peek"
      data-direction={direction}
      onClick={onSelect}
      aria-label={`Select ${item.name}`}
      tabIndex={-1}
    >
      <span className="anchor-peek-art">
        <TowerArt tower={item} assets={assets} decorative />
      </span>
      <span className="anchor-peek-name">{item.name}</span>
    </button>
  );
}

export function AnchorSelector({
  anchors,
  index,
  assets,
  requestState,
  onSelect,
  onBuild,
}: {
  anchors: AnchorItem[];
  index: number;
  assets: BuildLabAssets;
  requestState: string;
  onSelect: (next: number) => void;
  onBuild: () => void;
}) {
  const reduce = useReducedMotion();
  const anchor = anchors[index];
  const prev = anchors[(index - 1 + anchors.length) % anchors.length];
  const next = anchors[(index + 1) % anchors.length];

  return (
    <section
      aria-label="Choose an anchor tower"
      className="anchor-section lab-section"
    >
      <div className="section-rail">
        <span className="section-index mono">01</span>
        <div>
          <h2>Anchor</h2>
          <p>
            Your main DPS tower. Everything else in the plan is chosen to
            support it.
          </p>
        </div>
        <label className="anchor-quick-pick" htmlFor="anchor-picker">
          <span>Jump to</span>
          <select
            id="anchor-picker"
            value={anchor.id}
            onChange={(event) =>
              onSelect(anchors.findIndex((a) => a.id === event.target.value))
            }
          >
            {anchors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        className="anchor-hero"
        role="group"
        aria-roledescription="carousel"
        aria-label="Anchor towers"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            onSelect(index + (event.key === "ArrowLeft" ? -1 : 1));
          }
        }}
      >
        <span className="anchor-hero-spotlight" aria-hidden="true" />

        <NeighborButton
          item={prev}
          assets={assets}
          direction="prev"
          onSelect={() => onSelect(index - 1)}
        />

        <AnimatePresence initial={false} mode="wait">
          <motion.article
            key={anchor.id}
            className="anchor-hero-main"
            data-element={anchor.damageElement}
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: reduce ? 0 : 0.34, ease: EASE }}
          >
            <div className="anchor-hero-stage">
              <TowerMedia
                media={assets.towerHero[anchor.id]}
                name={anchor.name}
                priority
              />
              <span className="anchor-hero-tag">Selected anchor</span>
            </div>

            <div className="anchor-hero-identity">
              <div className="anchor-hero-topline">
                <span className="anchor-hero-class">
                  {anchor.combination} tower
                </span>
                <span className="anchor-hero-level mono">
                  LV {roman(anchor.level)}
                </span>
              </div>

              <h3 className="anchor-hero-name">{anchor.name}</h3>

              <ElementPips
                elements={anchor.recipe as readonly ElementName[]}
                assets={assets}
                size={22}
              />

              <CombatFingerprint
                shape={anchor.shape}
                profile={anchor.profile}
                range={anchor.stats.range}
                element={anchor.damageElement as ElementName}
                scaling={anchor.scaling}
                role="Main DPS"
                assets={assets}
              />
            </div>
          </motion.article>
        </AnimatePresence>

        <NeighborButton
          item={next}
          assets={assets}
          direction="next"
          onSelect={() => onSelect(index + 1)}
        />
      </div>

      <div className="carousel-controls">
        <button
          className="arrow-button"
          onClick={() => onSelect(index - 1)}
          aria-label="Previous anchor"
        >
          ←
        </button>
        <span className="mono">
          {String(index + 1).padStart(2, "0")} / {anchors.length}
        </span>
        <button
          className="arrow-button"
          onClick={() => onSelect(index + 1)}
          aria-label="Next anchor"
        >
          →
        </button>
      </div>

      <div className="build-commitment" data-element={anchor.damageElement}>
        <span className="commitment-glow" aria-hidden="true" />
        <div className="commitment-core">
          <span className="commitment-label">Planning core</span>
          <ElementPips
            elements={anchor.recipe as readonly ElementName[]}
            allocation={anchor.allocation}
            assets={assets}
            size={24}
          />
          <span className="commitment-note">
            {anchor.combination === "Dual"
              ? "Simulation baseline — an assumed 3-3 element core."
              : "Simulation baseline — an assumed 2-2-2 element core."}{" "}
            Not your live-game allocation.
          </span>
        </div>

        <button
          type="button"
          className="build-cta"
          onClick={onBuild}
          disabled={requestState === "loading"}
        >
          <span className="build-cta-label">
            {requestState === "loading"
              ? `Planning ${anchor.name}…`
              : `Build around ${anchor.name}`}
          </span>
          <span className="build-cta-arrow" aria-hidden="true">
            →
          </span>
        </button>
      </div>
    </section>
  );
}
