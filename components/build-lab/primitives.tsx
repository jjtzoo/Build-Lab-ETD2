"use client";

import Image from "next/image";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import type { ElementName } from "@/lib/domain/elements";
import type { Tower } from "@/lib/domain/tower";
import {
  MechanicGlyph,
  mechanicFamily,
} from "@/components/build-lab/glyphs";
import type { SynergyQualificationTier } from "@/lib/engine/synergyQualification";

export const gold = (value: number) =>
  `${value.toLocaleString()} g`;

export const readable = (value: string) =>
  value.replaceAll("-", " ");

const ROMAN = ["", "I", "II", "III", "IV", "V"] as const;

/** Tower / allocation level as a roman numeral, e.g. 2 → "II". */
export const roman = (level: number) =>
  ROMAN[level] ?? String(level);

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

/**
 * Element composition as icon + roman-numeral level pips. Used wherever
 * an allocation or a recipe is shown — the hero, the commitment module,
 * tower cards. `allocation` is optional: without it, only the icons
 * render (a plain recipe).
 */
export function ElementPips({
  elements,
  allocation,
  assets,
  size = 20,
}: {
  elements: readonly ElementName[];
  allocation?: Partial<Record<ElementName, number>>;
  assets: BuildLabAssets;
  size?: number;
}) {
  return (
    <span className="element-pips">
      {elements.map((element) => (
        <span
          className="element-pip"
          key={element}
          data-element={element}
        >
          <ElementIcon
            element={element}
            assets={assets}
            size={size}
          />
          {allocation && allocation[element] != null && (
            <b className="mono element-pip-level">
              {roman(allocation[element] as number)}
            </b>
          )}
        </span>
      ))}
    </span>
  );
}

const TIER_LABEL: Record<SynergyQualificationTier, string> = {
  exceptional: "Exceptional",
  strong: "Strong",
  efficient: "Efficient",
  fair: "Fair",
  situational: "Situational",
};

/** Ranked synergy qualification, coloured by tier. */
export function QualificationBadge({
  tier,
  small = false,
}: {
  tier: SynergyQualificationTier;
  small?: boolean;
}) {
  return (
    <span
      className="qualification-badge"
      data-tier={tier}
      data-small={small || undefined}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}

/**
 * A mechanic tag rendered with its family glyph and family colour.
 * Interactive when `onEnter` is supplied (used as a network filter).
 */
export function MechanicChip({
  tag,
  active,
  dimmed,
  count,
  onEnter,
  onLeave,
  small = false,
}: {
  tag: string;
  active?: boolean;
  dimmed?: boolean;
  count?: number;
  onEnter?: () => void;
  onLeave?: () => void;
  small?: boolean;
}) {
  const interactive = Boolean(onEnter);
  const Comp = interactive ? "button" : "span";
  return (
    <Comp
      className="mechanic-chip"
      data-family={mechanicFamily(tag)}
      data-active={active || undefined}
      data-dimmed={dimmed || undefined}
      data-small={small || undefined}
      type={interactive ? "button" : undefined}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      <MechanicGlyph tag={tag} size={small ? 13 : 15} />
      <span>{tag}</span>
      {count != null && (
        <span className="mechanic-chip-count mono">{count}</span>
      )}
    </Comp>
  );
}

/**
 * A compact radial range readout. Shows the recommendation's range as a
 * filled arc against a reference (usually the anchor's own range), so
 * "1125" reads as a relationship, not a bare number. This is an
 * explanatory visualisation — not a placement simulator — so the scale
 * is deliberately loose and unlabelled beyond the two values.
 */
export function RangeDial({
  range,
  reference,
  referenceLabel = "anchor",
  max = 1600,
  size = 68,
}: {
  range: number;
  reference?: number;
  referenceLabel?: string;
  max?: number;
  size?: number;
}) {
  const ceiling = Math.max(max, range, reference ?? 0);
  const r = 26;
  const circ = 2 * Math.PI * r;
  const frac = Math.min(1, range / ceiling);
  const refFrac =
    reference != null ? Math.min(1, reference / ceiling) : null;

  return (
    <span
      className="range-dial"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <circle
          className="range-dial-track"
          cx="32"
          cy="32"
          r={r}
          fill="none"
        />
        {refFrac != null && (
          <circle
            className="range-dial-ref"
            cx="32"
            cy="32"
            r={r}
            fill="none"
            strokeDasharray={`${circ * refFrac} ${circ}`}
            transform="rotate(-90 32 32)"
          />
        )}
        <circle
          className="range-dial-value"
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeDasharray={`${circ * frac} ${circ}`}
          transform="rotate(-90 32 32)"
        />
      </svg>
      <span className="range-dial-center mono">{range}</span>
      {reference != null && (
        <span className="range-dial-caption">
          {range >= reference ? "+" : ""}
          {range - reference} vs {referenceLabel}
        </span>
      )}
    </span>
  );
}
