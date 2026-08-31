import type { CandidateEvaluation } from "@/lib/engine/types";

interface DecisionEvidenceProps {
  winner: CandidateEvaluation | null;
}

function formatScore(score: unknown): string {
  return typeof score === "number" &&
    Number.isFinite(score)
    ? score.toFixed(1)
    : "—";
}

export function DecisionEvidence({
  winner,
}: DecisionEvidenceProps) {
  if (!winner) {
    return null;
  }

  return (
    <section
      className="workspace"
      style={{
        marginTop: 16,
      }}
    >
      <article className="panel">
        <div className="eyebrow">
          WHY THIS BUILD
        </div>

        <h2>Decision evidence</h2>

        <div
          className="grid"
          style={{
            marginTop: 12,
          }}
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
              .map((reason, index) => (
                <div
                  className="muted"
                  key={`${reason}-${index}`}
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
          style={{
            marginTop: 12,
          }}
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
          .map((reason, index) => (
            <div
              className="muted"
              key={`${reason}-${index}`}
              style={{
                marginTop: 8,
              }}
            >
              {reason}
            </div>
          ))}
      </article>
    </section>
  );
}