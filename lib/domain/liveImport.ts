import {
  decodePortableBuild,
  encodePortableBuild,
  PENDING_IMPORT_KEY,
  type PortableBuild,
} from "./portableBuild";
import type { LiveSnapshot } from "@/components/live/store";

export const LIVE_STORAGE_KEY = "etd2:live:v1";
export const LIVE_PLAN_KEY = "etd2:live:plan";
export const MATCH_PLAN_PATH = "/match-plan";

/**
 * Above this, a URL is unsafe to hand to a clipboard/chat link (some clients
 * truncate or choke on very long pasted URLs) — see `MAX_URL_PAYLOAD` in
 * `OpenInLive.tsx`, which is about shareability, not correctness.
 *
 * This is a different, much larger cap: the ceiling for our own in-app
 * navigation URL. Below it, the build travels in the `?b=` query param, so
 * the match-plan page can decode and render it synchronously on first
 * paint — no localStorage round-trip, no flash of the empty state. Only a
 * build bigger than real packages ever produce falls back to the
 * localStorage-only handoff.
 */
const MAX_NAVIGATION_URL_PAYLOAD = 32_000;

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
  return stored && encoded.length > MAX_NAVIGATION_URL_PAYLOAD
    ? MATCH_PLAN_PATH
    : `${MATCH_PLAN_PATH}?b=${encoded}`;
}
