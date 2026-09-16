"use client";

import { useMemo, useState } from "react";
import { ELEMENTS } from "@/lib/domain/elements";
import {
  encodePortableBuild,
  PORTABLE_BUILD_SCHEMA,
  type PortableBuild,
} from "@/lib/domain/portableBuild";
import { getLiveStorage, liveImportUrl } from "@/lib/domain/liveImport";
import { evaluateBuildAcceptance } from "@/lib/engine/buildAcceptance";
import {
  useTheoryCraft,
  selectPlaced,
  selectAllocation,
} from "@/components/theorycraft/store";

export function buildPortable(
  placed: readonly { towerId: string; level: number }[],
  allocation: Record<string, number>,
): PortableBuild {
  return {
    schema: PORTABLE_BUILD_SCHEMA,
    source: "theorycraft",
    anchorTowerId: placed[0]?.towerId ?? "",
    towers: placed.map((entry) => ({
      towerId: entry.towerId,
      level: entry.level,
    })),
    allocation: Object.fromEntries(
      ELEMENTS.map((element) => [element, allocation[element] ?? 0]),
    ) as PortableBuild["allocation"],
    createdAt: new Date().toISOString(),
  };
}

export function ExportBuild() {
  const slots = useTheoryCraft((s) => s.slots);
  const placed = useMemo(() => selectPlaced({ slots }), [slots]);
  const allocation = useMemo(() => selectAllocation({ slots }), [slots]);
  const [copied, setCopied] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);

  const url = useMemo(() => {
    if (placed.length === 0) return "";
    const portable = buildPortable(placed, allocation);
    const encoded = encodePortableBuild(portable);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/theorycraft?b=${encoded}`;
  }, [placed, allocation]);

  if (placed.length === 0) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function openInLive() {
    const portable = buildPortable(placed, allocation);
    // Checked here, at the moment a hand-built lineup is about to leave
    // Theory Craft, rather than inside Match Plan itself — Match Plan's
    // own engine functions stay usable with any input (including the
    // minimal fixtures a lot of its own tests construct); only a real
    // player's export should ever be turned away.
    const acceptance = evaluateBuildAcceptance(portable);
    if (!acceptance.accepted) {
      setRejection(acceptance.failures.map((failure) => failure.detail).join(" "));
      return;
    }
    setRejection(null);
    window.location.href = liveImportUrl(portable, getLiveStorage());
  }

  return (
    <section className="tc-export lab-section">
      <div className="section-rail">
        <span className="section-index mono">03</span>
        <div>
          <h3>Take it with you</h3>
          <p>
            Share a link that rebuilds this exact plan, or carry it into a live
            game.
          </p>
        </div>
      </div>
      <div className="tc-export-row">
        <input
          className="tc-export-url mono"
          readOnly
          value={url}
          onFocus={(event) => event.target.select()}
          aria-label="Shareable build link"
        />
        <button type="button" className="tc-export-copy" onClick={copy}>
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <div className="tc-export-actions">
        <button type="button" className="primary-button" onClick={openInLive}>
          Open in Match Plan →
        </button>
        <span className="tc-export-note">
          Match Plan turns this lineup into phase snapshots, camps and a safe
          purchase sequence.
        </span>
      </div>
      {rejection && <p className="tc-export-rejection">{rejection}</p>}
    </section>
  );
}
