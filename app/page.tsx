"use client";

import { useMemo, useState } from "react";
import type { ElementName } from "@/lib/types";
import type { CandidateEvaluation } from "@/lib/engine/types";

const elements: ElementName[] = [
  "Light",
  "Darkness",
  "Water",
  "Fire",
  "Nature",
  "Earth",
];

function formatScore(score: unknown): string {
  return typeof score === "number" && Number.isFinite(score)
    ? score.toFixed(1)
    : "—";
}

function scorePercent(score: unknown): number {
  return typeof score === "number" && Number.isFinite(score)
    ? Math.max(0, Math.min(100, score))
    : 0;
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

  const [winner, setWinner] = useState<CandidateEvaluation | null>(null);
  const [results, setResults] = useState<CandidateEvaluation[]>([]);
  const [legalCount, setLegalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("Build Lab");

  const alternatives = useMemo(
    () => results.filter((candidate) => candidate !== winner),
    [results, winner],
  );

  function updateCore(index: number, value: ElementName) {
    setCore((prev) =>
      prev.map((element, i) => (i === index ? value : element)),
    );
  }

  async function optimize() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ core }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Optimization request failed.",
        );
      }

      if (!Array.isArray(data.results)) {
        throw new Error("Optimizer returned an invalid result set.");
      }

      const nextResults = data.results as CandidateEvaluation[];

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
      console.error("Optimization failed:", err);

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

  const allocation = winner?.allocation ?? null;

  return (
    <main className="shell">
      <header className="top">
        <div className="brand">
          <div className="logo" />

          <div>
            <b>ELEMENT TD 2 · BUILD LAB</b>
            <span>FULL-STACK RESEARCH & DECISION PLATFORM</span>
          </div>
        </div>

        <span className="eyebrow">V8 DECISION ENGINE</span>
      </header>

      <section className="hero">
        <div className="panel">
          <div className="eyebrow">THE BUILD IS THE DATASET</div>

          <h1>Build Lab</h1>

          <p className="muted">
            Evaluate the complete build, not isolated tower scores.
            V8 reasons through allocation, tower state, package
            function, synergy, opportunity cost, redundancy,
            anti-synergy, and endgame before selecting a winner.
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
            <b>{legalCount || "—"}</b>
            <span>LEGAL CORE ALLOCATIONS</span>
          </div>

          <div className="stat">
            <b>{winner?.towers.length || "—"}</b>
            <span>SELECTED TOWERS</span>
          </div>
        </div>
      </section>

      <nav className="nav">
        {[
          "Build Lab",
          "What If",
          "Allocation Explorer",
          "Core Explorer",
          "Tower Codex",
          "Research",
          "Debug",
        ].map((item) => (
          <button
            key={item}
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      {tab !== "Build Lab" ? (
        <section className="panel">
          <div className="eyebrow">MODULE</div>

          <h2 style={{ margin: "8px 0" }}>{tab}</h2>

          <p className="muted">
            This surface remains reserved while the shared V8 domain
            model is migrated into the remaining modules.
          </p>
        </section>
      ) : (
        <>
          <section className="workspace">
            <aside className="panel">
              <div className="eyebrow">BUILD INPUT</div>

              <h2>Build focus</h2>

              <p className="muted">
                Core defines the ecosystem. Allocation determines
                the actual 11-point strategy.
              </p>

              {core.map((value, index) => (
                <div className="field" key={index}>
                  <label>Core element {index + 1}</label>

                  <select
                    className="select"
                    value={value}
                    onChange={(event) =>
                      updateCore(
                        index,
                        event.target.value as ElementName,
                      )
                    }
                  >
                    {elements.map((element) => (
                      <option key={element}>
                        {element}
                      </option>
                    ))}
                  </select>
                </div>
              ))}

              <button
                className="primary"
                onClick={optimize}
                disabled={loading}
              >
                {loading ? "Evaluating…" : "Optimize build"}
              </button>

              <div style={{ height: 12 }} />

              {error && (
                <div className="notice warn">
                  <b>Evaluation error:</b> {error}
                </div>
              )}

              <div style={{ height: 12 }} />

              <div className="notice">
                V8 keeps UNKNOWN mechanics distinct from confirmed
                evidence and makes the final decision at the complete
                build level.
              </div>
            </aside>

            <section className="panel">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  alignItems: "start",
                }}
              >
                <div>
                  <div className="eyebrow">
                    V8 RECOMMENDATION
                  </div>

                  <h2 style={{ margin: "7px 0" }}>
                    Recommended Build
                  </h2>

                  {winner && (
                    <div className="muted">
                      Core · {winner.core.join(" / ")}
                    </div>
                  )}
                </div>

                {winner && (
                  <div style={{ textAlign: "right" }}>
                    <div className="rank">
                      V8 fine score
                    </div>

                    <div className="score">
                      {formatScore(winner.fineScore)}
                    </div>
                  </div>
                )}
              </div>

              {!winner ? (
                <div
                  className="notice"
                  style={{ marginTop: 16 }}
                >
                  Choose a core and run the optimizer to evaluate a
                  complete V8 build.
                </div>
              ) : (
                <div style={{ marginTop: 16 }}>
                  <div className="notice">
                    {winner.anchor
                      ? `Tower Anchor: ${winner.anchor}.`
                      : "No tower anchor selected."}{" "}
                    Primary DPS is{" "}
                    {winner.package.primaryState
                      ? winner.package.primaryState.tower.name
                      : "not established"}
                    .
                  </div>

                  <div
                    className="grid"
                    style={{ marginTop: 14 }}
                  >
                    <article className="tower">
                      <div className="rank">
                        RECOMMENDED ALLOCATION
                      </div>

                      <h3 className="mono">
                        {winner.allocation.join(" · ")}
                      </h3>

                      <div className="muted">
                        Exactly 11 points
                      </div>

                      <div
                        className="alloc-grid"
                        style={{ marginTop: 12 }}
                      >
                        {elements.map((element, index) => {
                          const level =
                            winner.allocation[index];

                          return (
                            <div
                              className="alloc-card"
                              key={element}
                            >
                              <div className="e">
                                {element}
                              </div>
                              <div className="n">
                                {level}
                              </div>
                              <div className="bar">
                                <i
                                  style={{
                                    width: `${
                                      (level / 3) * 100
                                    }%`,
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </article>

                    <article className="tower">
                      <div className="rank">
                        PACKAGE COMPLETENESS
                      </div>

                      <div className="score">
                        {Math.round(
                          winner.package.completeness * 100,
                        )}
                        %
                      </div>

                      <div className="bar">
                        <i
                          style={{
                            width: `${
                              winner.package.completeness *
                              100
                            }%`,
                          }}
                        />
                      </div>

                      <div
                        className="chips"
                        style={{ marginTop: 12 }}
                      >
                        <span className="chip">
                          Main {roleCount(winner, "main")}
                        </span>
                        <span className="chip">
                          Control{" "}
                          {roleCount(winner, "control")}
                        </span>
                        <span className="chip">
                          Coverage{" "}
                          {roleCount(winner, "cover")}
                        </span>
                        <span className="chip">
                          Amp {roleCount(winner, "amp")}
                        </span>
                        <span className="chip">
                          Range{" "}
                          {roleCount(winner, "range")}
                        </span>
                        <span className="chip">
                          Scaling{" "}
                          {roleCount(winner, "scaling")}
                        </span>
                      </div>
                    </article>
                  </div>
                </div>
              )}
            </section>
          </section>

          {winner && (
            <>
              <section style={{ marginTop: 16 }}>
                <div className="section-title">
                  <div>
                    <div className="eyebrow">
                      PRIMARY PACKAGE
                    </div>

                    <h2>Selected Towers</h2>

                    <div className="sub">
                      Actual tower states contributing to the build.
                    </div>
                  </div>

                  <span className="badge">
                    {winner.towers.length} towers
                  </span>
                </div>

                <div
                  className="grid"
                  style={{ marginTop: 12 }}
                >
                  {winner.towers.map((tower) => (
                    <article
                      className="tower"
                      key={tower.tower.name}
                    >
                      <div className="rank">
                        {tower.tower.type} · LEVEL{" "}
                        {tower.tier}
                      </div>

                      <h3>{tower.tower.name}</h3>

                      <div className="mono muted">
                        {tower.tower.recipe.join(" + ")}
                      </div>

                      <div
                        className="chips"
                        style={{ marginTop: 10 }}
                      >
                        {tower.roles.mainDPS !== "None" && (
                          <span className="chip">
                            Main DPS ·{" "}
                            {tower.roles.mainDPS}
                          </span>
                        )}

                        {tower.roles.subDPS !== "None" && (
                          <span className="chip">
                            Sub-DPS ·{" "}
                            {tower.roles.subDPS}
                          </span>
                        )}

                        {tower.roles.control !== "None" && (
                          <span className="chip">
                            Control ·{" "}
                            {tower.roles.control}
                          </span>
                        )}

                        {tower.roles.coverage !== "None" && (
                          <span className="chip">
                            Coverage ·{" "}
                            {tower.roles.coverage}
                          </span>
                        )}

                        {tower.roles.amplification !== "None" && (
                          <span className="chip">
                            Amplification ·{" "}
                            {tower.roles.amplification}
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section
                className="workspace"
                style={{ marginTop: 16 }}
              >
                <article className="panel">
                  <div className="eyebrow">
                    WHY THIS BUILD
                  </div>

                  <h2>Decision evidence</h2>

                  <div
                    className="grid"
                    style={{ marginTop: 12 }}
                  >
                    <article className="tower">
                      <div className="rank">
                        PRIMARY DPS
                      </div>
                      <h3>
                        {winner.package.primaryState
                          ?.tower.name ?? "Unknown"}
                      </h3>
                      <div className="muted">
                        Score{" "}
                        {formatScore(
                          winner.package.primaryDps,
                        )}
                        {" · "}
                        depth{" "}
                        {formatScore(
                          winner.package.primaryDepth,
                        )}
                      </div>
                    </article>

                    <article className="tower">
                      <div className="rank">
                        SYNERGY
                      </div>
                      <div className="score">
                        {formatScore(
                          winner.synergy.realized,
                        )}
                      </div>

                      {winner.synergy.reasons
                        .slice(0, 3)
                        .map((reason) => (
                          <div
                            className="muted"
                            key={reason}
                            style={{
                              marginTop: 7,
                            }}
                          >
                            {reason}
                          </div>
                        ))}
                    </article>

                    <article className="tower">
                      <div className="rank">
                        OPPORTUNITY COST
                      </div>
                      <div className="score">
                        {formatScore(
                          winner.opportunity.opportunityLoss,
                        )}
                      </div>
                      <div className="muted">
                        Protection ·{" "}
                        {winner.opportunity.protection}
                      </div>
                    </article>

                    <article className="tower">
                      <div className="rank">
                        ENDGAME
                      </div>
                      <div className="score">
                        {formatScore(
                          winner.endgame.score,
                        )}
                      </div>
                      <div className="muted">
                        Essence ·{" "}
                        {winner.endgame.spent}/
                        {winner.endgame.totalEssence}
                      </div>
                    </article>
                  </div>
                </article>

                <article className="panel">
                  <div className="eyebrow">
                    ENDGAME PLAN
                  </div>

                  <h2>Pure / Periodic</h2>

                  <div
                    className="chips"
                    style={{ marginTop: 12 }}
                  >
                    {winner.endgame.availablePure.map(
                      (element) => (
                        <span
                          className="chip"
                          key={element}
                        >
                          Pure {element}
                        </span>
                      ),
                    )}

                    <span className="chip">
                      Periodic ·{" "}
                      {winner.endgame.periodicState}
                    </span>
                  </div>

                  {winner.endgame.reasons
                    .slice(0, 3)
                    .map((reason) => (
                      <div
                        className="muted"
                        key={reason}
                        style={{ marginTop: 8 }}
                      >
                        {reason}
                      </div>
                    ))}
                </article>
              </section>

              <section style={{ marginTop: 16 }}>
                <div className="section-title">
                  <div>
                    <div className="eyebrow">
                      BUILD COMPARISON
                    </div>

                    <h2>Alternatives</h2>

                    <div className="sub">
                      Other finalists from the same V8 evaluation.
                    </div>
                  </div>
                </div>

                {!alternatives.length ? (
                  <div
                    className="notice"
                    style={{ marginTop: 12 }}
                  >
                    No alternate finalists were returned.
                  </div>
                ) : (
                  <div
                    className="grid"
                    style={{ marginTop: 12 }}
                  >
                    {alternatives.slice(0, 4).map(
                      (candidate, index) => (
                        <article
                          className="tower"
                          key={candidate.allocation.join("-")}
                        >
                          <div className="rank">
                            ALTERNATIVE #{index + 1}
                          </div>

                          <h3 className="mono">
                            {candidate.allocation.join(
                              " · ",
                            )}
                          </h3>

                          <div className="score">
                            {formatScore(
                              candidate.fineScore,
                            )}
                          </div>

                          <div className="muted">
                            Package{" "}
                            {Math.round(
                              candidate.package
                                .completeness * 100,
                            )}
                            % · Synergy{" "}
                            {formatScore(
                              candidate.synergy.realized,
                            )}
                          </div>
                        </article>
                      ),
                    )}
                  </div>
                )}
              </section>

              <details
                className="panel"
                style={{ marginTop: 16 }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  V8 Debug
                </summary>

                <div style={{ marginTop: 14 }}>
                  <div className="chips">
                    <span className="chip">
                      Legal ·{" "}
                      {winner.legality.passed
                        ? "PASS"
                        : "FAIL"}
                    </span>

                    <span className="chip">
                      Viability ·{" "}
                      {winner.package.viability
                        ? "PASS"
                        : "FAIL"}
                    </span>

                    <span className="chip">
                      Main DPS ·{" "}
                      {winner.package.primaryDps > 0
                        ? "PASS"
                        : "FAIL"}
                    </span>

                    <span className="chip">
                      Investment ·{" "}
                      {winner.package.primaryDepth >= 1
                        ? "PASS"
                        : "FAIL"}
                    </span>

                    <span className="chip">
                      Package ·{" "}
                      {winner.package.completeness >=
                      0.55
                        ? "PASS"
                        : "FAIL"}
                    </span>
                  </div>

                  <pre
                    style={{
                      marginTop: 14,
                      overflowX: "auto",
                      fontSize: 11,
                    }}
                  >
                    {JSON.stringify(
                      {
                        allocation: winner.allocation,
                        package: winner.package,
                        synergy: winner.synergy,
                        opportunity: winner.opportunity,
                        redundancy: winner.redundancy,
                        antiSynergy:
                          winner.antiSynergy,
                        endgame: winner.endgame,
                        fineScore: winner.fineScore,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </div>
              </details>
            </>
          )}
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
        Element TD 2 Build Lab · V8 independent evaluation architecture
      </footer>
    </main>
  );
}