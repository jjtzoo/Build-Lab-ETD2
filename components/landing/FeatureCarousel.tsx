"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "motion/react";

export type CarouselItem = {
  id: string;
  eyebrow: string;
  title: string;
  blurb: string;
  href: string;
  cta: string;
  badge?: string;
  preview: ReactNode;
};

const AUTO_MS = 5200;

const POS = [
  { x: "0%", scale: 1, rotateY: 0, opacity: 1, zIndex: 3, blur: 0 },
  { x: "56%", scale: 0.78, rotateY: -24, opacity: 0.3, zIndex: 1, blur: 4 },
  { x: "-56%", scale: 0.78, rotateY: 24, opacity: 0.3, zIndex: 1, blur: 4 },
];

export function FeatureCarousel({
  items,
}: {
  items: readonly CarouselItem[];
}) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();
  const n = items.length;

  const go = useCallback(
    (dir: 1 | -1) => setActive((a) => (a + dir + n) % n),
    [n],
  );

  useEffect(() => {
    if (paused || reduce) return;
    const id = window.setInterval(() => {
      setActive((a) => (a + 1) % n);
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [paused, reduce, n]);

  const dragging = useRef(false);

  return (
    <div
      className="fc"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        className="fc-stage"
        role="group"
        aria-roledescription="carousel"
        aria-label="Build Lab tools"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") go(1);
          if (event.key === "ArrowLeft") go(-1);
        }}
      >
        {items.map((item, i) => {
          const pos = (i - active + n) % n;
          const p = POS[pos] ?? POS[0];
          const isFront = pos === 0;

          const body = (
            <>
              <div className="fc-preview" aria-hidden="true">
                {item.preview}
              </div>
              <div className="fc-meta">
                <p className="fc-eyebrow">
                  {item.eyebrow}
                  {item.badge && (
                    <span className="fc-badge">{item.badge}</span>
                  )}
                </p>
                <h3>{item.title}</h3>
                <p className="fc-blurb">{item.blurb}</p>
                {isFront && (
                  <span className="fc-cta">{item.cta} →</span>
                )}
              </div>
            </>
          );

          return (
            <motion.div
              key={item.id}
              className="fc-card"
              data-front={isFront || undefined}
              style={{ zIndex: p.zIndex }}
              initial={false}
              animate={{
                x: p.x,
                scale: p.scale,
                rotateY: reduce ? 0 : p.rotateY,
                opacity: p.opacity,
                filter: `blur(${reduce ? 0 : p.blur}px)`,
              }}
              transition={
                reduce
                  ? { duration: 0.2 }
                  : { type: "spring", stiffness: 240, damping: 28 }
              }
              drag={isFront ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.16}
              onDragStart={() => {
                dragging.current = true;
              }}
              onDragEnd={(_event, info) => {
                window.setTimeout(() => {
                  dragging.current = false;
                }, 0);
                if (info.offset.x < -64) go(1);
                else if (info.offset.x > 64) go(-1);
              }}
            >
              {isFront ? (
                <a
                  className="fc-card-inner"
                  href={item.href}
                  onClickCapture={(event) => {
                    if (dragging.current) event.preventDefault();
                  }}
                >
                  {body}
                </a>
              ) : (
                <button
                  type="button"
                  className="fc-card-inner"
                  aria-label={`Show ${item.title}`}
                  tabIndex={-1}
                  onClick={() => setActive(i)}
                >
                  {body}
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="fc-controls">
        <button
          type="button"
          className="fc-arrow"
          aria-label="Previous"
          onClick={() => go(-1)}
        >
          ‹
        </button>
        <div className="fc-dots" role="tablist" aria-label="Choose a tool">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={item.title}
              className="fc-dot"
              data-on={i === active || undefined}
              onClick={() => setActive(i)}
            />
          ))}
        </div>
        <button
          type="button"
          className="fc-arrow"
          aria-label="Next"
          onClick={() => go(1)}
        >
          ›
        </button>
      </div>
    </div>
  );
}
