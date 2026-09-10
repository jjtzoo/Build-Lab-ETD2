import type { ElementName } from "./elements";
import type { TowerId } from "./tower";

/**
 * A build in a transport-stable shape that any Build Lab surface can
 * produce and any other can consume — the recommendation flow, the
 * hand-built "theory craft" flow, and (later) the live game tracker.
 * Keep the schema string bumped whenever the shape changes.
 */
export type PortableBuild = {
  schema: "etd2-build/1";
  source: "engine" | "theorycraft";
  anchorTowerId: TowerId;
  towers: readonly { towerId: TowerId; level: number }[];
  allocation: Record<ElementName, number>;
  createdAt: string;
};

/** localStorage key the (future) live game tracker reads for a handed-off build. */
export const PENDING_IMPORT_KEY = "etd2:pending-import";

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
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as PortableBuild).schema !== "etd2-build/1" ||
      typeof (parsed as PortableBuild).anchorTowerId !== "string" ||
      !Array.isArray((parsed as PortableBuild).towers)
    ) {
      return null;
    }
    const build = parsed as PortableBuild;
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
