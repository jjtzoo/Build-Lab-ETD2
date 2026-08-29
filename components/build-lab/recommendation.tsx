import type { CandidateEvaluation } from "@/lib/engine/types";

interface RecommendationProps {
  winner: CandidateEvaluation | null;
}

const elements = [
  "Light",
  "Darkness",
  "Water",
  "Fire",
  "Nature",
  "Earth",
] as const;

function formatScore(score: unknown): string {
  return typeof score === "number" &&
    Number.isFinite(score)
    ? score.toFixed(1)
    : "—";
}

function roleCount(
  candidate: CandidateEvaluation,
  role: keyof CandidateEvaluation["package"]["counts"],
): number {
  return candidate.package.counts[role];
}

export function Recommendation({
  winner,
}: RecommendationProps) {
  return (
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

          <h2
            style={{
              margin: "7px 0",
            }}
          >
            Recommended Build
          </h2>

          {winner && (
            <div className="muted">
              Core · {winner.core.join(" / ")}
            </div>
          )}
        </div>

        {winner && (
          <div
            style={{
              textAlign: "right",
            }}
          >
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
          style={{
            marginTop: 16,
          }}
        >
          Choose a core and run the
          optimizer to evaluate a complete
          V8 build.
        </div>
      ) : (
        <div
          style={{
            marginTop: 16,
          }}
        >
          <div className="notice">
            {winner.anchor && winner.anchor !== "Auto" ? (
              (() => {
                const anchorTower = winner.towers.find(
                  (tower) =>
                    tower.tower.name === winner.anchor,
                );

                return anchorTower ? (
                  <>
                    <b>Tower Anchor:</b>{" "}
                    {anchorTower.tower.name} · Level{" "}
                    {anchorTower.tier}
                    <br />
                    <span className="muted">
                      Anchor is preserved in the selected
                      package.
                    </span>
                  </>
                ) : (
                  <>
                    <b>Tower Anchor:</b>{" "}
                    {winner.anchor}
                    <br />
                    <span className="muted">
                      Requested anchor was not found in
                      the selected package.
                    </span>
                  </>
                );
              })()
            ) : (
              <>
                <b>Tower Anchor:</b> Auto
                <br />
                <span className="muted">
                  V8 selected the package anchor
                  automatically.
                </span>
              </>
            )}

            <br />

            Primary DPS is{" "}
            {winner.package.primaryState
              ? winner.package.primaryState.tower.name
              : "not established"}
  .
</div>

          <div
            className="grid"
            style={{
              marginTop: 14,
            }}
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
                style={{
                  marginTop: 12,
                }}
              >
                {winner.allocation.map(
                  (level, index) => (
                    <div
                      className="alloc-card"
                      key={elements[index]}
                    >
                      <div className="e">
                        {elements[index]}
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

                      <div
                        className="small"
                        style={{
                          marginTop: 6,
                        }}
                      >
                        {level === 3
                          ? "MAX"
                          : level === 0
                            ? "—"
                            : `LEVEL ${level}`}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </article>

            <article className="tower">
              <div className="rank">
                PACKAGE COMPLETENESS
              </div>

              <div className="score">
                {Math.round(
                  winner.package
                    .completeness * 100,
                )}
                %
              </div>

              <div className="bar">
                <i
                  style={{
                    width: `${
                      winner.package
                        .completeness * 100
                    }%`,
                  }}
                />
              </div>

              <div
                className="chips"
                style={{
                  marginTop: 12,
                }}
              >
                <span className="chip">
                  Main{" "}
                  {roleCount(
                    winner,
                    "main",
                  )}
                </span>

                <span className="chip">
                  Control{" "}
                  {roleCount(
                    winner,
                    "control",
                  )}
                </span>

                <span className="chip">
                  Coverage{" "}
                  {roleCount(
                    winner,
                    "cover",
                  )}
                </span>

                <span className="chip">
                  Amp{" "}
                  {roleCount(
                    winner,
                    "amp",
                  )}
                </span>

                <span className="chip">
                  Range{" "}
                  {roleCount(
                    winner,
                    "range",
                  )}
                </span>

                <span className="chip">
                  Scaling{" "}
                  {roleCount(
                    winner,
                    "scaling",
                  )}
                </span>

                <span className="chip">
                  Support{" "}
                  {roleCount(
                    winner,
                    "support",
                  )}
                </span>
              </div>
            </article>
          </div>
        </div>
      )}
    </section>
  );
}