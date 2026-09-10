"use client";

import { useEffect, useState } from "react";

const KOFI_URL = "https://ko-fi.com/jjtzoo";
const STORAGE_KEY = "etd2:kofi";
const SHOW_AFTER_MS = 90_000;
const SNOOZE_DAYS = 30;

type KofiState = { dismissedAt?: string };

function HeartMark() {
  return (
    <svg
      className="support-mark"
      viewBox="0 0 16 16"
      width="12"
      height="12"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M8 13.4 2.9 8.5A3.1 3.1 0 0 1 2.6 4.3 3 3 0 0 1 7 4l1 1 1-1a3 3 0 0 1 4.4.3 3.1 3.1 0 0 1-.3 4.2Z" />
    </svg>
  );
}

/**
 * Inline "Support on Ko-fi" link — sits in the page header, not floating.
 * Pair it with a single {@link SupportRail} mounted once at the app root
 * for the delayed corner note.
 */
export function SupportLink({ className }: { className?: string }) {
  return (
    <a
      className={className ? `support-link ${className}` : "support-link"}
      href={KOFI_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Support the Build Lab on Ko-fi (opens in a new tab)"
    >
      <HeartMark />
      Support on Ko-fi
    </a>
  );
}

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
 * One quiet Ko-fi note in the bottom corner after a while of use —
 * dismissable, and it stays away for {@link SNOOZE_DAYS} days once closed.
 * The always-visible ask is the header {@link SupportLink}, not this.
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

  if (!open) return null;

  return (
    <div className="support-rail">
      <div
        className="support-bubble"
        role="dialog"
        aria-label="A note from the maker"
      >
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
    </div>
  );
}
