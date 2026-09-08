"use client";

import Image from "next/image";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import type { ElementName } from "@/lib/domain/elements";
import type { Tower } from "@/lib/domain/tower";

export const gold = (value: number) =>
  `${value.toLocaleString()} g`;

export const readable = (value: string) =>
  value.replaceAll("-", " ");

export function ElementIcon({
  element,
  assets,
  size = 20,
}: {
  element: ElementName;
  assets: BuildLabAssets;
  size?: number;
}) {
  const src = assets.elements[element];
  return src ? (
    <Image
      className="element-icon"
      src={src}
      alt=""
      width={size}
      height={size}
    />
  ) : (
    <span
      className="element-fallback"
      aria-hidden="true"
    />
  );
}

/** Element chip: icon + name, tinted by the element identity color. */
export function ElementBadge({
  element,
  assets,
  size = 18,
}: {
  element: ElementName;
  assets: BuildLabAssets;
  size?: number;
}) {
  return (
    <span
      className="element-badge"
      data-element={element}
    >
      <ElementIcon
        element={element}
        assets={assets}
        size={size}
      />
      {element}
    </span>
  );
}

export function Recipe({
  elements,
  assets,
}: {
  elements: readonly ElementName[];
  assets: BuildLabAssets;
}) {
  return (
    <span className="recipe">
      {elements.map((element) => (
        <ElementBadge
          key={element}
          element={element}
          assets={assets}
        />
      ))}
    </span>
  );
}

export function TowerIcon({
  towerId,
  name,
  assets,
  size = 56,
}: {
  towerId: string;
  name: string;
  assets: BuildLabAssets;
  size?: number;
}) {
  const src = assets.towerIcons[towerId];
  return src ? (
    <Image
      className="tower-icon"
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="tower-icon tower-icon-fallback"
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      {name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)}
    </span>
  );
}

export function TowerArt({
  tower,
  assets,
  decorative = false,
}: {
  tower: Pick<Tower, "id" | "name">;
  assets: BuildLabAssets;
  decorative?: boolean;
}) {
  const src = assets.towerForms[tower.id];
  return (
    <span className="tower-art">
      {src ? (
        <Image
          src={src}
          alt={
            decorative
              ? ""
              : `${tower.name} tower`
          }
          fill
          quality={90}
          sizes="(max-width: 767px) 168px, (max-width: 1199px) 240px, 288px"
          priority={tower.id === "laser"}
        />
      ) : (
        <span
          className="tower-art-fallback"
          aria-hidden="true"
        >
          {tower.name.slice(0, 1)}
        </span>
      )}
    </span>
  );
}

/** Small inline tower reference: icon + name, used in progression rows. */
export function TowerReference({
  towerId,
  name,
  assets,
}: {
  towerId: string;
  name: string;
  assets: BuildLabAssets;
}) {
  return (
    <span className="tower-ref">
      <TowerIcon
        towerId={towerId}
        name={name}
        assets={assets}
        size={26}
      />
      <span>{name}</span>
    </span>
  );
}

/** A labelled figure in the featured build summary. */
export function Metric({
  label,
  value,
  sub,
  strong = false,
}: {
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
}) {
  return (
    <div
      className="metric"
      data-strong={strong || undefined}
    >
      <span className="metric-label">
        {label}
      </span>
      <span className="metric-value mono">
        {value}
      </span>
      {sub && (
        <span className="metric-sub">
          {sub}
        </span>
      )}
    </div>
  );
}

export function MechanicTag({
  tag,
  small = false,
  active,
  onEnter,
  onLeave,
}: {
  tag: string;
  small?: boolean;
  active?: boolean;
  onEnter?: () => void;
  onLeave?: () => void;
}) {
  const interactive = Boolean(onEnter);
  const Comp = interactive ? "button" : "span";
  return (
    <Comp
      className="mechanic-tag"
      data-small={small || undefined}
      data-active={active || undefined}
      type={interactive ? "button" : undefined}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      {tag}
    </Comp>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "info";
}) {
  return (
    <span
      className="status-badge"
      data-tone={tone}
    >
      {children}
    </span>
  );
}
