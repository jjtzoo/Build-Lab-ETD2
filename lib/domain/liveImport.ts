import {
  decodePortableBuild,
  encodePortableBuild,
  PENDING_IMPORT_KEY,
  type PortableBuild,
} from "./portableBuild";
import type { LiveSnapshot } from "@/components/live/store";

export const LIVE_STORAGE_KEY = "etd2:live:v1";
export const LIVE_PLAN_KEY = "etd2:live:plan";

export function getLiveStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function parseStoredPlan(raw: string | null): PortableBuild | null {
  try {
    return raw
      ? decodePortableBuild(encodePortableBuild(JSON.parse(raw)))
      : null;
  } catch {
    return null;
  }
}

export function resolveLiveImport(
  choice: "fresh" | "keep",
  incoming: PortableBuild,
  saved: Partial<LiveSnapshot> | null,
) {
  return { plan: incoming, snapshot: choice === "keep" ? saved : null };
}

/** A consumed URL must not prompt again when the same match is refreshed. */
export function consumeLiveImport(
  storage: Pick<Storage, "removeItem"> | null,
  href: string,
): string {
  try {
    storage?.removeItem(PENDING_IMPORT_KEY);
  } catch {
    /* Storage may be disabled. */
  }
  const url = new URL(href);
  url.searchParams.delete("b");
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Both source pages use a full document navigation; long builds use storage. */
export function liveImportUrl(
  plan: PortableBuild,
  storage: Pick<Storage, "setItem"> | null,
) {
  const encoded = encodePortableBuild(plan);
  let stored = false;
  try {
    if (storage) {
      storage.setItem(PENDING_IMPORT_KEY, JSON.stringify(plan));
      stored = true;
    }
  } catch {
    /* URL remains a fallback. */
  }
  return stored && encoded.length > 6000 ? "/live" : `/live?b=${encoded}`;
}
