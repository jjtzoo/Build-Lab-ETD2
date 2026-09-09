"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

import type { TowerHeroMedia } from "@/components/build-lab/assetResolver";

/**
 * The anchor hero's tower imagery. Prefers recorded in-game footage when
 * a tower has it; otherwise shows the static form art. The video is
 * decorative: muted, looping, `playsInline`, poster-backed, paused while
 * off-screen, and never shown at all under `prefers-reduced-motion`.
 *
 * A tower with no recorded media still renders — the poster falls back to
 * the static form art in `resolveHeroMedia`, and a tower with nothing at
 * all shows a typographic placeholder.
 */
export function TowerMedia({
  media,
  name,
  priority = false,
  sizes = "(max-width: 767px) 92vw, (max-width: 1199px) 60vw, 720px",
}: {
  media: TowerHeroMedia | undefined;
  name: string;
  priority?: boolean;
  sizes?: string;
}) {
  const reduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [canPlay, setCanPlay] = useState(false);

  const hasVideo = Boolean(media?.webm || media?.mp4);
  const showVideo = hasVideo && !reduceMotion;
  const poster = media?.poster ?? null;

  useEffect(() => {
    if (!showVideo) return;
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [showVideo]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !showVideo) return;
    if (visible) {
      const attempt = video.play();
      if (attempt && typeof attempt.catch === "function") {
        attempt.catch(() => {
          /* autoplay refused — poster stays visible */
        });
      }
    } else {
      video.pause();
    }
  }, [visible, showVideo]);

  return (
    <div className="tower-media" ref={containerRef} data-has-video={showVideo || undefined}>
      {showVideo ? (
        <>
          {poster ? (
            <Image
              className="tower-media-poster"
              src={poster}
              alt=""
              fill
              quality={88}
              sizes={sizes}
              priority={priority}
              data-hidden={canPlay && visible ? true : undefined}
            />
          ) : null}
          <video
            ref={videoRef}
            className="tower-media-video"
            muted
            loop
            playsInline
            preload="metadata"
            poster={poster ?? undefined}
            aria-hidden="true"
            data-ready={canPlay ? true : undefined}
            onCanPlay={() => setCanPlay(true)}
          >
            {media?.webm ? <source src={media.webm} type="video/webm" /> : null}
            {media?.mp4 ? <source src={media.mp4} type="video/mp4" /> : null}
          </video>
        </>
      ) : poster ? (
        <Image
          className="tower-media-poster is-static"
          src={poster}
          alt={`${name} tower`}
          fill
          quality={90}
          sizes={sizes}
          priority={priority}
        />
      ) : (
        <span className="tower-media-fallback" aria-hidden="true">
          {name.slice(0, 1)}
        </span>
      )}
      <span className="tower-media-vignette" aria-hidden="true" />
    </div>
  );
}
