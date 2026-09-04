"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { getTowerVisual } from "@/lib/tower-visuals";
import { ELEMENT_VISUALS } from "@/lib/element-visuals";

export function TowerVisual({ towerName, size = "small" }: {
  towerName: string;
  size?: "small" | "medium" | "hero";
}) {
  const visual = getTowerVisual(towerName);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const color = visual.recipe[0] ? ELEMENT_VISUALS[visual.recipe[0]].color : "#c6ab75";
  const secondary = visual.recipe[1] ? ELEMENT_VISUALS[visual.recipe[1]].color : color;
  return <div className={`tower-visual tower-visual-${size}`} style={{ "--tower-accent": color, "--tower-secondary": secondary } as CSSProperties}>
    {visual.imageSrc && failedSrc !== visual.imageSrc ? <Image
      src={visual.imageSrc} alt={visual.alt} width={320} height={320}
      sizes={size === "hero" ? "(max-width: 650px) 160px, 240px" : "80px"}
      onError={() => setFailedSrc(visual.imageSrc)}
    /> : <div className="tower-fallback" role="img" aria-label={`${visual.alt} — ${visual.type} emblem; artwork unavailable`}>
      <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
        <path className="visual-orbit" d="M100 13 179 57 179 145 100 190 21 145 21 57Z"/>
        <path className="visual-grid" d="m21 145 79-44 79 44M100 13v177M21 57l158 88M179 57 21 145"/>
        <path className="visual-base" d="m39 135 61-35 61 35-61 36Z"/>
        <path className="visual-base-edge" d="m39 135 61 36 61-36v12l-61 36-61-36Z"/>
        <path className="visual-body" d={visual.variant === 0 ? "m68 122 8-62 24-14 24 14 8 62-32 19Z" : visual.variant === 1 ? "m63 121 14-41-8-20 31-20 31 20-8 20 14 41-37 21Z" : "m65 123 10-72 25-18 25 18 10 72-35 20Z"}/>
        <path className="visual-spire" d="m100 30 22 30-22 17-22-17Z"/>
        <path className="visual-facet" d="m100 77 22-17-6 53-16 10Z"/>
        <path className="visual-line" d="M100 30v93m-22-63 22 17 22-17"/>
      </svg>
      <span className="visual-mark">{visual.fallbackLabel}</span>
      <span className="visual-type">{visual.type} / {visual.recipe.map((element) => ELEMENT_VISUALS[element].short).join(" · ")}</span>
    </div>}
  </div>;
}
