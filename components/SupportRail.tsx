"use client";

import { useEffect, useState } from "react";

const KOFI_URL = "https://ko-fi.com/jjtzoo";
const STORAGE_KEY = "etd2:kofi";
const SHOW_AFTER_MS = 90_000;
const SNOOZE_DAYS = 30;

type KofiState = { dismissedAt?: string };

function shouldPrompt(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw) as KofiState;
    if (!parsed.dismissedAt) return true;
    const elapsed = Date.now() - Date.parse(parsed.dismissedAt);
    return elapsed > SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * A quiet, persistent "Support on Ko-fi" pill in the top-right of every
 * page, plus one gentle speech-bubble prompt after a while of use —
 * dismissable, and it stays away for {@link SNOOZE_DAYS} days once closed.
 */
export function SupportRail() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!shouldPrompt()) return;
    const id = window.setTimeout(() => setOpen(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(id);
  }, []);

  function dismiss() {
    setOpen(false);
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          dismissedAt: new Date().toISOString(),
        } satisfies KofiState),
      );
    } catch {
      /* storage unavailable — it just shows again next visit */
    }
  }

  return (
    <div className="support-rail">
      <a
        className="support-pill"
        href={KOFI_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Support the Build Lab on Ko-fi (opens in a new tab)"
      >
        <span className="support-pill-mark" aria-hidden="true">
          ☕
        </span>
        Support on Ko-fi
      </a>

      {open && (
        <div className="support-bubble" role="dialog" aria-label="A note from the maker">
          <button
            type="button"
            className="support-bubble-close"
            onClick={dismiss}
            aria-label="Dismiss"
          >
            ✕
          </button>
          <p>
            The Build Lab is free and has no ads. If it helps your game, a
            coffee covers hosting and keeps it that way.
          </p>
          <a
            className="support-bubble-link"
            href={KOFI_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={dismiss}
          >
            Support on Ko-fi →
          </a>
        </div>
      )}
    </div>
  );
}
