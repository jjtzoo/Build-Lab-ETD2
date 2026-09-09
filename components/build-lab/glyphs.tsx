"use client";

/**
 * The Build Lab's bespoke visual vocabulary. These are diagrammatic
 * glyphs for game mechanics and damage behaviour — not UI icons. Every
 * glyph is a 24×24 line drawing in `currentColor`, so it inherits the
 * mechanic-family colour or text colour of whatever renders it.
 *
 * Keep them schematic and immediately readable. They must never look
 * like a mobile-game rarity badge.
 */

type GlyphProps = {
  size?: number;
  title?: string;
};

function Svg({
  size = 18,
  title,
  children,
}: GlyphProps & { children: React.ReactNode }) {
  return (
    <svg
      className="glyph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/* ----------------------------------------------------------------
   Damage-shape grammar
   ---------------------------------------------------------------- */

export type DamageShapeKind =
  | "single-target"
  | "aoe"
  | "hybrid"
  | "splash"
  | "chain"
  | "dot"
  | "line"
  | "execute"
  | "ramp";

/** Maps the engine's free-text identity string onto a shape kind. */
export function damageShapeKind(
  identity: string | null | undefined,
): DamageShapeKind | null {
  if (!identity) return null;
  const value = identity.toLowerCase();
  if (value.includes("execute")) return "execute";
  if (value.includes("ramp")) return "ramp";
  if (value.includes("dot")) return "dot";
  if (value.includes("hybrid")) return "hybrid";
  if (value.includes("aoe") || value.includes("area")) return "aoe";
  if (value.includes("single")) return "single-target";
  return null;
}

export function DamageShapeGlyph({
  kind,
  size = 18,
  title,
}: GlyphProps & { kind: DamageShapeKind }) {
  const label = title ?? DAMAGE_SHAPE_LABEL[kind];
  switch (kind) {
    case "single-target":
      return (
        <Svg size={size} title={label}>
          <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="7" opacity="0.5" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" opacity="0.7" />
        </Svg>
      );
    case "aoe":
      return (
        <Svg size={size} title={label}>
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="6" opacity="0.65" />
          <circle cx="12" cy="12" r="10" opacity="0.32" />
        </Svg>
      );
    case "hybrid":
      return (
        <Svg size={size} title={label}>
          <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
          <path d="M12 3a9 9 0 0 1 0 18" opacity="0.7" />
          <path d="M12 6.5a5.5 5.5 0 0 1 0 11" opacity="0.4" />
        </Svg>
      );
    case "splash":
      return (
        <Svg size={size} title={label}>
          <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
          <circle cx="5" cy="8" r="1.4" fill="currentColor" stroke="none" opacity="0.7" />
          <circle cx="19" cy="9" r="1.4" fill="currentColor" stroke="none" opacity="0.7" />
          <circle cx="8" cy="18" r="1.4" fill="currentColor" stroke="none" opacity="0.7" />
          <circle cx="17" cy="17" r="1.4" fill="currentColor" stroke="none" opacity="0.7" />
        </Svg>
      );
    case "chain":
      return (
        <Svg size={size} title={label}>
          <path d="M4 7l5 5-4 3 6 2 4-4" opacity="0.75" />
          <circle cx="4" cy="7" r="1.7" fill="currentColor" stroke="none" />
          <circle cx="11" cy="17" r="1.7" fill="currentColor" stroke="none" />
          <circle cx="19" cy="10" r="1.7" fill="currentColor" stroke="none" />
        </Svg>
      );
    case "dot":
      return (
        <Svg size={size} title={label}>
          <circle cx="12" cy="6" r="2.2" fill="currentColor" stroke="none" />
          <path d="M12 10.5v2M12 15v1.6M12 19v1.4" opacity="0.7" />
          <path d="M8.5 12.5h7M9.5 16h5" opacity="0.35" />
        </Svg>
      );
    case "line":
      return (
        <Svg size={size} title={label}>
          <path d="M4 12h16" />
          <path d="M4 8l0 8" opacity="0.6" />
          <path d="M20 9.5l0 5" opacity="0.6" />
          <path d="M15 10.5l0 3" opacity="0.4" />
        </Svg>
      );
    case "execute":
      return (
        <Svg size={size} title={label}>
          <circle cx="12" cy="8" r="2.2" fill="currentColor" stroke="none" opacity="0.55" />
          <path d="M12 12l4 9-4-3-4 3z" />
        </Svg>
      );
    case "ramp":
      return (
        <Svg size={size} title={label}>
          <path d="M4 19h4v-4h4v-5h4V5h4" />
          <path d="M4 19l16-14" opacity="0.3" />
        </Svg>
      );
  }
}

export const DAMAGE_SHAPE_LABEL: Record<DamageShapeKind, string> = {
  "single-target": "Single target",
  aoe: "Area damage",
  hybrid: "Hybrid",
  splash: "Splash",
  chain: "Chain",
  dot: "Damage over time",
  line: "Line",
  execute: "Execute",
  ramp: "Ramping",
};

/* ----------------------------------------------------------------
   Mechanic-family grammar
   ---------------------------------------------------------------- */

export type MechanicFamily =
  | "buff"
  | "amplification"
  | "control"
  | "positioning"
  | "kill-economy"
  | "replication"
  | "range";

/** The user-facing mechanic tag → its family. */
export const MECHANIC_FAMILY: Record<string, MechanicFamily> = {
  "Attack Damage": "buff",
  "Attack Speed": "buff",
  "Attack Damage Beneficiary": "buff",
  "Attack Speed Beneficiary": "buff",
  "Damage Amp": "amplification",
  "Damage Amp Beneficiary": "amplification",
  "Current HP Removal": "amplification",
  "HP Removal": "amplification",
  "Damage Echo": "amplification",
  Slow: "control",
  "Slow Beneficiary": "control",
  Stun: "control",
  Stasis: "control",
  Isolation: "positioning",
  "Isolation Beneficiary": "positioning",
  Grouping: "positioning",
  Displacement: "positioning",
  "Kill Generation": "kill-economy",
  "Death Trigger": "kill-economy",
  Replication: "replication",
  Range: "range",
};

export function mechanicFamily(tag: string): MechanicFamily {
  return MECHANIC_FAMILY[tag] ?? "buff";
}

export function MechanicGlyph({
  tag,
  size = 16,
  title,
}: GlyphProps & { tag: string }) {
  const family = mechanicFamily(tag);
  const label = title ?? tag;
  switch (family) {
    case "buff":
      // fast-forward wedge — a stat pushed upward
      return (
        <Svg size={size} title={label}>
          <path d="M5 6l7 6-7 6zM13 6l6 6-6 6" />
        </Svg>
      );
    case "amplification":
      // outward-expanding chevrons — an existing effect multiplied
      return (
        <Svg size={size} title={label}>
          <path d="M8 5l5 7-5 7" opacity="0.45" />
          <path d="M12 5l5 7-5 7" opacity="0.75" />
          <path d="M16 5l4 7-4 7" />
        </Svg>
      );
    case "control":
      // a held / stalled orbit
      return (
        <Svg size={size} title={label}>
          <circle cx="12" cy="12" r="7.5" opacity="0.5" />
          <path d="M10 9v6M14 9v6" />
        </Svg>
      );
    case "positioning":
      // two arrows acting on a target line
      return (
        <Svg size={size} title={label}>
          <path d="M12 4v16" opacity="0.4" />
          <path d="M4 8l4 4-4 4" />
          <path d="M20 8l-4 4 4 4" />
        </Svg>
      );
    case "kill-economy":
      // a spark released on a kill
      return (
        <Svg size={size} title={label}>
          <path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M18 6l-3 3M6 18l3-3M18 18l-3-3" />
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
        </Svg>
      );
    case "replication":
      // two offset instances
      return (
        <Svg size={size} title={label}>
          <rect x="4" y="7" width="10" height="10" rx="2" opacity="0.55" />
          <rect x="10" y="4" width="10" height="10" rx="2" />
        </Svg>
      );
    case "range":
      // a measured span
      return (
        <Svg size={size} title={label}>
          <path d="M4 12h16" strokeDasharray="1 3" />
          <path d="M4 8v8M20 8v8" />
        </Svg>
      );
  }
}

export const MECHANIC_FAMILY_LABEL: Record<MechanicFamily, string> = {
  buff: "Stat buff",
  amplification: "Amplification",
  control: "Control",
  positioning: "Positioning",
  "kill-economy": "Kill economy",
  replication: "Replication",
  range: "Range",
};
