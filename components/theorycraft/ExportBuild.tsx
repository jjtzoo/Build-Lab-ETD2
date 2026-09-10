"use client";

import { useMemo, useState } from "react";
import { ELEMENTS } from "@/lib/domain/elements";
import {
  encodePortableBuild,
  PENDING_IMPORT_KEY,
  type PortableBuild,
} from "@/lib/domain/portableBuild";
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
    schema: "etd2-build/1",
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

  const url = useMemo(() => {
    if (placed.length === 0) return "";
    const portable = buildPortable(placed, allocation);
    const encoded = encodePortableBuild(portable);
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/theorycraft?b=${encoded}`;
  }, [placed, allocation]);

  if (placed.length === 0) return null;

  async function copy() {
    try {
      const portable = buildPortable(placed, allocation);
      window.localStorage.setItem(
        PENDING_IMPORT_KEY,
        JSON.stringify(portable),
      );
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="tc-export lab-section">
      <div className="section-rail">
        <span className="section-index mono">03</span>
        <div>
          <h3>Export build</h3>
          <p>
            Share a link that rebuilds this exact plan. The live game
            tracker will read it too.
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
        <button
          type="button"
          className="tc-export-copy"
          onClick={copy}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </section>
  );
}
