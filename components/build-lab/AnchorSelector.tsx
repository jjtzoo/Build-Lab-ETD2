"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "motion/react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import type { Tower } from "@/lib/domain/tower";
import type { ElementAllocation } from "@/lib/domain/elements";
import {
  Recipe,
  TowerArt,
  readable,
} from "@/components/build-lab/primitives";

export type AnchorItem = Tower & {
  level: number;
  shape: string;
  allocation: ElementAllocation;
};

const EASE = [0.32, 0.72, 0, 1] as const;

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
        <label
          className="anchor-quick-pick"
          htmlFor="anchor-picker"
        >
          <span>Jump to</span>
          <select
            id="anchor-picker"
            value={anchor.id}
            onChange={(event) =>
              onSelect(
                anchors.findIndex(
                  (a) => a.id === event.target.value,
                ),
              )
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
        className="carousel"
        role="region"
        aria-roledescription="carousel"
        aria-label="Anchor towers"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (
            event.key === "ArrowLeft" ||
            event.key === "ArrowRight"
          ) {
            event.preventDefault();
            onSelect(
              index +
                (event.key === "ArrowLeft" ? -1 : 1),
            );
          }
        }}
      >
        <span className="carousel-spotlight" aria-hidden="true" />
        <AnimatePresence initial={false} mode="popLayout">
          {[-1, 0, 1].map((offset) => {
            const item =
              anchors[
                (index + offset + anchors.length) %
                  anchors.length
              ];
            return (
              <motion.div
                key={item.id}
                layout={reduce ? false : "position"}
                className="carousel-slot"
                data-role={
                  offset === 0 ? "selected" : "neighbor"
                }
                initial={
                  reduce
                    ? false
                    : {
                        opacity: 0,
                        scale: 0.94,
                        filter: "blur(3px)",
                      }
                }
                animate={{
                  opacity: offset === 0 ? 1 : 0.44,
                  scale: offset === 0 ? 1 : 0.9,
                  filter: "blur(0px)",
                }}
                exit={
                  reduce
                    ? undefined
                    : {
                        opacity: 0,
                        scale: 0.94,
                        filter: "blur(3px)",
                      }
                }
                transition={{
                  duration: reduce ? 0 : 0.42,
                  ease: EASE,
                }}
              >
                {offset === 0 ? (
                  <article
                    className="anchor-card selected"
                    aria-live="polite"
                  >
                    <span
                      className="anchor-card-glow"
                      aria-hidden="true"
                    />
                    <TowerArt tower={item} assets={assets} />
                    <div className="anchor-copy">
                      <div className="anchor-meta">
                        <span>Selected anchor</span>
                        <span className="level mono">
                          LV {item.level}
                        </span>
                      </div>
                      <div className="anchor-title">
                        <span className="tower-class">
                          {item.combination} tower
                        </span>
                        <h3 className="anchor-name">
                          {item.name}
                        </h3>
                      </div>
                      <Recipe
                        elements={item.recipe}
                        assets={assets}
                      />
                      <div className="anchor-facts">
                        <span>{readable(item.shape)}</span>
                        <span>
                          Range{" "}
                          <b className="mono">
                            {item.stats.range}
                          </b>
                        </span>
                        <span data-element={item.damageElement}>
                          {item.damageElement} damage
                        </span>
                      </div>
                    </div>
                  </article>
                ) : (
                  <button
                    className={`anchor-card neighbor neighbor-${offset < 0 ? "prev" : "next"}`}
                    onClick={() => onSelect(index + offset)}
                    aria-label={`Select ${item.name}, level ${item.level}`}
                    tabIndex={-1}
                  >
                    <TowerArt
                      tower={item}
                      assets={assets}
                      decorative
                    />
                    <span className="neighbor-name">
                      {item.name}
                    </span>
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
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

      <p className="assumption">
        Planning baseline:{" "}
        <span className="mono">
          {anchor.recipe
            .map(
              (element) =>
                `${element} ${anchor.allocation[element]}`,
            )
            .join(" · ")}
        </span>
        . Not your live-game allocation.
      </p>

      <motion.button
        className="build-button"
        onClick={onBuild}
        disabled={requestState === "loading"}
        whileTap={reduce ? undefined : { scale: 0.985 }}
      >
        <span>
          {requestState === "loading"
            ? `Planning ${anchor.name}…`
            : `Build around ${anchor.name}`}
        </span>
        <span className="build-button-icon" aria-hidden="true">
          →
        </span>
      </motion.button>
    </section>
  );
}
