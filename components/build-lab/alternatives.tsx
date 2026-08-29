import type { CandidateEvaluation } from "@/lib/engine/types";

interface AlternativesProps {
  winner: CandidateEvaluation | null;
  results: CandidateEvaluation[];
}

function formatScore(score: unknown): string {
  return typeof score === "number" &&
    Number.isFinite(score)
    ? score.toFixed(1)
    : "—";
}

export function Alternatives({
  winner,
  results,
}: AlternativesProps) {
  if (!winner) {
    return null;
  }

  const alternatives = results.filter(
    (candidate) => candidate !== winner,
  );

  return (
    <section
      style={{
        marginTop: 16,
      }}
    >
      <div className="section-title">
        <div>
          <div className="eyebrow">
            BUILD COMPARISON
          </div>

          <h2>Alternatives</h2>

          <div className="sub">
            Other finalists from the same V8
            evaluation.
          </div>
        </div>
      </div>

      {!alternatives.length ? (
        <div
          className="notice"
          style={{
            marginTop: 12,
          }}
        >
          No alternate finalists were
          returned.
        </div>
      ) : (
        <div
          className="grid"
          style={{
            marginTop: 12,
          }}
        >
          {alternatives
            .slice(0, 4)
            .map((candidate, index) => (
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
            ))}
        </div>
      )}
    </section>
  );
}