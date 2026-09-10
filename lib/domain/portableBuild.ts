import type { ElementName } from "./elements";
import type { TowerId } from "./tower";

/**
 * A build in a transport-stable shape that any Build Lab surface can
 * produce and any other can consume — the recommendation flow, the
 * hand-built "theory craft" flow, and the live game tracker.
 *
 * Schema history:
 * - v1: anchor + towers + allocation. Still accepted by the decoder.
 * - v2: adds optional coaching fields (`progression`, `coverageWeaknesses`,
 *   `endGame`). Build Lab fills them from its engine plan; Theory Craft
 *   omits them (no engine plan) and Live Tracking then coaches in
 *   standalone / core-role mode.
 */

export type PortableStage = "EARLY" | "MID" | "LATE" | "END_GAME";

export type PortableTowerAction = {
  kind: "build" | "upgrade";
  towerId: TowerId;
  towerName: string;
  toLevel: number;
  roles: readonly string[];
};

export type PortableKeystoneStep = {
  element: ElementName;
  from: number;
  to: number;
  unlocks: readonly PortableTowerAction[];
};

export type PortableProgressionStage = {
  stage: PortableStage;
  headline: string;
  reason: string;
  primaryAction: PortableTowerAction | null;
  keystoneSteps: readonly PortableKeystoneStep[];
};

export type PortableBuild = {
  schema: "etd2-build/1" | "etd2-build/2";
  source: "engine" | "theorycraft";
  anchorTowerId: TowerId;
  towers: readonly { towerId: TowerId; level: number }[];
  allocation: Record<ElementName, number>;
  createdAt: string;

  /** v2, optional — present only for `source: "engine"`. */
  progression?: readonly PortableProgressionStage[];
  /** v2, optional — armour elements the plan leaves uncovered. */
  coverageWeaknesses?: readonly ElementName[];
  /** v2, optional — the plan's End Game selections. */
  endGame?: readonly { name: string; quantity: number }[];
};

/** localStorage key the live game tracker reads for a handed-off build. */
export const PENDING_IMPORT_KEY = "etd2:pending-import";

export const PORTABLE_BUILD_SCHEMA = "etd2-build/2" as const;

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(input, "utf-8").toString("base64");
  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(input: string): string {
  const base64 = input
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(input.length / 4) * 4, "=");
  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) =>
      char.charCodeAt(0),
    );
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(base64, "base64").toString("utf-8");
}

export function encodePortableBuild(build: PortableBuild): string {
  return toBase64Url(JSON.stringify(build));
}

export function decodePortableBuild(
  encoded: string,
): PortableBuild | null {
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const build = parsed as PortableBuild;
    if (
      (build.schema !== "etd2-build/1" &&
        build.schema !== "etd2-build/2") ||
      typeof build.anchorTowerId !== "string" ||
      !Array.isArray(build.towers)
    ) {
      return null;
    }
    if (
      build.towers.some(
        (entry) =>
          typeof entry.towerId !== "string" ||
          typeof entry.level !== "number",
      )
    ) {
      return null;
    }
    return build;
  } catch {
    return null;
  }
}
