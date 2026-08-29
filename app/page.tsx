"use client";

import { useMemo, useState } from "react";
import { BuildInput } from "@/components/build-lab/build-input";
import type { ElementName } from "@/lib/types";
import type { CandidateEvaluation } from "@/lib/engine/types";
import { Recommendation } from "@/components/build-lab/recommendation";
import { TowerPackage } from "@/components/build-lab/tower-package";
import { DecisionEvidence } from "@/components/build-lab/decision-evidence";
import { Alternatives } from "@/components/build-lab/alternatives";
import { DebugPanel } from "@/components/build-lab/debug-panel";

function formatScore(score: unknown): string {
  return typeof score === "number" && Number.isFinite(score)
    ? score.toFixed(1)
    : "—";
}

function roleCount(
  candidate: CandidateEvaluation,
  role: keyof CandidateEvaluation["package"]["counts"],
): number {
  return candidate.package.counts[role];
}

export default function Home() {
  const [core, setCore] = useState<ElementName[]>([
    "Light",
    "Darkness",
    "Fire",
  ]);
  const [anchor, setAnchor] = useState("Auto");
  const [winner, setWinner] =
    useState<CandidateEvaluation | null>(null);

  const [results, setResults] =
    useState<CandidateEvaluation[]>([]);

  const [legalCount, setLegalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] =
    useState<string | null>(null);

  const alternatives = useMemo(
    () =>
      winner
        ? results.filter(
            (candidate) =>
              candidate !== winner,
          )
        : [],
    [results, winner],
  );

  function updateCore(
    index: number,
    value: ElementName,
  ) {
    setCore((prev) =>
      prev.map((element, i) =>
        i === index ? value : element,
      ),
    );
  }

  async function optimize() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        "/api/optimize",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            core,
            anchor,
          }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Optimization request failed.",
        );
      }

      if (!Array.isArray(data.results)) {
        throw new Error(
          "Optimizer returned an invalid result set.",
        );
      }

      const nextResults =
        data.results as CandidateEvaluation[];

      setResults(nextResults);

      setWinner(
        data.winner
          ? (data.winner as CandidateEvaluation)
          : nextResults[0] ?? null,
      );

      setLegalCount(
        typeof data.legalCount === "number"
          ? data.legalCount
          : 0,
      );
    } catch (err) {
      console.error(
        "Optimization failed:",
        err,
      );

      setResults([]);
      setWinner(null);
      setLegalCount(0);

      setError(
        err instanceof Error
          ? err.message
          : "An unexpected optimization error occurred.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="panel">
          <div className="eyebrow">
            THE BUILD IS THE DATASET
          </div>

          <h1>Build Lab</h1>

          <p className="muted">
            Evaluate the complete build, not
            isolated tower scores. V8 reasons
            through allocation, tower state,
            package function, synergy,
            opportunity cost, redundancy,
            anti-synergy, and endgame before
            selecting a winner.
          </p>
        </div>

        <div className="panel stats">
          <div className="stat">
            <b>50</b>
            <span>CATALOG TOWERS</span>
          </div>

          <div className="stat">
            <b>6</b>
            <span>ELEMENTS</span>
          </div>

          <div className="stat">
            <b>
              {legalCount || "—"}
            </b>
            <span>
              LEGAL CORE ALLOCATIONS
            </span>
          </div>

          <div className="stat">
            <b>
              {winner?.towers.length || "—"}
            </b>
            <span>SELECTED TOWERS</span>
          </div>
        </div>
      </section>

      <section className="workspace">
        <BuildInput
          core={core}
          anchor={anchor}
          onCoreChange={updateCore}
          onAnchorChange={setAnchor}
          onOptimize={optimize}
          loading={loading}
          error={error}
        />

        <Recommendation winner={winner} />
      </section>

      {winner && (
        <>
           <TowerPackage winner={winner} />
          
           <DecisionEvidence winner={winner} />

          <Alternatives
            winner={winner}
            results={results}
          />

          <DebugPanel winner={winner} />
        </>
      )}

      <footer
        className="muted"
        style={{
          fontSize: 11,
          textAlign: "center",
          marginTop: 18,
        }}
      >
        Element TD 2 Build Lab · V8
        independent evaluation architecture
      </footer>
    </main>
  );
}