import type { CandidateEvaluation } from "@/lib/engine/types";

interface TowerPackageProps {
  winner: CandidateEvaluation | null;
}

function formatRecipe(
  recipe: string[],
): string {
  return recipe.length > 0
    ? recipe.join(" + ")
    : "Recipe unavailable";
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
            These towers are actually selected
            and contribute to the recommended
            package.
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
              SELECTED · {tower.tower.type} ·
              LEVEL {tower.tier}
            </div>

            <h3>
              {tower.tower.name}
            </h3>

            <div
              className="muted"
              style={{
                marginTop: 5,
                fontWeight: 600,
              }}
            >
              {tower.tower.type}
            </div>

            <div
              className="mono muted"
              style={{
                marginTop: 7,
              }}
            >
              {formatRecipe(
                tower.tower.recipe,
              )}
            </div>
            
            <div
              className="muted"
              style={{
                marginTop: 7,
              }}
            >
              Damage Element ·{" "}
              {tower.tower.damage ?? "Unknown"}
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

              {tower.roles.range !==
                "None" && (
                <span className="chip">
                  Range ·{" "}
                  {tower.roles.range}
                </span>
              )}

              {tower.roles.scaling !==
                "None" && (
                <span className="chip">
                  Scaling ·{" "}
                  {tower.roles.scaling}
                </span>
              )}

              {tower.roles.support !==
                "None" && (
                <span className="chip">
                  Support ·{" "}
                  {tower.roles.support}
                </span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}