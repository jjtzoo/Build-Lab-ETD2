import type { CandidateEvaluation } from "@/lib/engine/types";

interface DebugPanelProps {
  winner: CandidateEvaluation | null;
}

export function DebugPanel({
  winner,
}: DebugPanelProps) {
  if (!winner) {
    return null;
  }

  return (
    <details
      className="panel"
      style={{
        marginTop: 16,
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 700,
        }}
      >
        V8 Debug
      </summary>

      <div
        style={{
          marginTop: 14,
        }}
      >
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
  );
}