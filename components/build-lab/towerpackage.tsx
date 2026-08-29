import type { CandidateEvaluation } from "@/lib/engine/types";

interface TowerPackageProps {
  winner: CandidateEvaluation | null;
}

export function TowerPackage({
  winner,
}: TowerPackageProps) {
  if (!winner) {
    return null;
  }

  return (
    <section
      style={{
        marginTop: 16,
      }}
    >
      <div className="section-title">
        <div>
          <div className="eyebrow">
            PRIMARY PACKAGE
          </div>

          <h2>Selected Towers</h2>

          <div className="sub">
            Actual tower states contributing
            to the build.
          </div>
        </div>

        <span className="badge">
          {winner.towers.length} towers
        </span>
      </div>

      <div
        className="grid"
        style={{
          marginTop: 12,
        }}
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
              style={{
                marginTop: 10,
              }}
            >
              {tower.roles.mainDPS !==
                "None" && (
                <span className="chip">
                  Main DPS ·{" "}
                  {tower.roles.mainDPS}
                </span>
              )}

              {tower.roles.subDPS !==
                "None" && (
                <span className="chip">
                  Sub-DPS ·{" "}
                  {tower.roles.subDPS}
                </span>
              )}

              {tower.roles.control !==
                "None" && (
                <span className="chip">
                  Control ·{" "}
                  {tower.roles.control}
                </span>
              )}

              {tower.roles.coverage !==
                "None" && (
                <span className="chip">
                  Coverage ·{" "}
                  {tower.roles.coverage}
                </span>
              )}

              {tower.roles.amplification !==
                "None" && (
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
  );
}