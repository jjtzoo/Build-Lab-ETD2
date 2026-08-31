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

function towerSetKey(
  candidate: CandidateEvaluation,
): string {
  return candidate.towers
    .map((tower) => tower.tower.name)
    .sort()
    .join("|");
}

function formatRecipe(
  recipe: string[],
): string {
  return recipe.length > 0
    ? recipe.join(" + ")
    : "Recipe unavailable";
}

function roleLabels(
  candidate: CandidateEvaluation,
): string[] {
  const roles = new Set<string>();

  for (const tower of candidate.towers) {
    if (tower.roles.mainDPS !== "None") {
      roles.add(
        `Main DPS · ${tower.roles.mainDPS}`,
      );
    }

    if (tower.roles.subDPS !== "None") {
      roles.add(
        `Sub-DPS · ${tower.roles.subDPS}`,
      );
    }

    if (tower.roles.control !== "None") {
      roles.add(
        `Control · ${tower.roles.control}`,
      );
    }

    if (tower.roles.coverage !== "None") {
      roles.add(
        `Coverage · ${tower.roles.coverage}`,
      );
    }

    if (
      tower.roles.amplification !==
      "None"
    ) {
      roles.add(
        `Amplification · ${tower.roles.amplification}`,
      );
    }

    if (tower.roles.range !== "None") {
      roles.add(
        `Range · ${tower.roles.range}`,
      );
    }

    if (tower.roles.scaling !== "None") {
      roles.add(
        `Scaling · ${tower.roles.scaling}`,
      );
    }

    if (tower.roles.support !== "None") {
      roles.add(
        `Support · ${tower.roles.support}`,
      );
    }
  }

  return [...roles];
}

export function Alternatives({
  winner,
  results,
}: AlternativesProps) {
  if (!winner) {
    return null;
  }

  const alternatives: CandidateEvaluation[] = [];

  const seenPackageKeys = new Set<string>();

  const winnerKey = towerSetKey(winner);

  seenPackageKeys.add(winnerKey);

  for (const candidate of results) {
    if (candidate === winner) {
      continue;
    }

    const key = towerSetKey(candidate);

    if (seenPackageKeys.has(key)) {
      continue;
    }

    seenPackageKeys.add(key);
    alternatives.push(candidate);

    if (alternatives.length >= 4) {
      break;
    }
  }

  const selectedTowerNames =
    new Set(
      winner.towers.map(
        (tower) => tower.tower.name,
      ),
    );

  const honorableMentions =
    (winner.availableTowers ?? [])
      .filter(
        (tower) =>
          !selectedTowerNames.has(
            tower.tower.name,
          ),
      )
      .filter(
        (tower) =>
          tower.tier > 0 &&
          (
            tower.roles.mainDPS !== "None" ||
            tower.roles.subDPS !== "None" ||
            tower.roles.control !== "None" ||
            tower.roles.coverage !== "None" ||
            tower.roles.amplification !==
              "None" ||
            tower.roles.range !== "None" ||
            tower.roles.scaling !== "None" ||
            tower.roles.support !== "None"
          ),
      )
      .sort(
        (a, b) =>
          b.tier - a.tier ||
          b.tower.recipe.length -
            a.tower.recipe.length ||
          a.tower.name.localeCompare(
            b.tower.name,
          ),
      )
      .slice(0, 6);

  const mentions = honorableMentions;

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

          <h2>
            Alternatives &
            Honorable Mentions
          </h2>

          <div className="sub">
            Strong competing packages and
            notable towers that were evaluated
            but not selected.
          </div>
        </div>
      </div>

      {alternatives.length > 0 && (
        <>
          <div
            className="eyebrow"
            style={{
              marginTop: 16,
            }}
          >
            ALTERNATIVE PATHS
          </div>

          <div
            className="grid"
            style={{
              marginTop: 10,
            }}
          >
            {alternatives
              .slice(0, 4)
              .map((candidate, index) => (
                <article
                  className="tower"
                  key={candidate.allocation.join(
                    "-",
                  )}
                >
                  <div className="rank">
                    ALTERNATIVE #
                    {index + 1}
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

                  <div
                    className="muted"
                    style={{
                      marginTop: 10,
                      fontWeight: 600,
                    }}
                  >
                    Package
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                    }}
                  >
                    {candidate.towers.map(
                      (tower) => (
                        <div
                          key={
                            tower.tower.name
                          }
                          style={{
                            padding:
                              "7px 0",
                            borderTop:
                              "1px solid var(--border)",
                          }}
                        >
                          <div>
                            <strong>
                              {
                                tower.tower
                                  .name
                              }
                            </strong>
                            <span className="muted">
                              {" · "}
                              {
                                tower.tower
                                  .type
                              }
                              {" · Lv"}
                              {tower.tier}
                            </span>
                          </div>

                          <div
                            className="mono muted"
                            style={{
                              marginTop: 3,
                              fontSize: 12,
                            }}
                          >
                            {formatRecipe(
                              tower.tower
                                .recipe,
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
                        </div>
                      ),
                    )}
                  </div>

                  {roleLabels(
                    candidate,
                  ).length > 0 && (
                    <div
                      className="chips"
                      style={{
                        marginTop: 9,
                      }}
                    >
                      {roleLabels(
                        candidate,
                      )
                        .slice(0, 4)
                        .map((role) => (
                          <span
                            className="chip"
                            key={role}
                          >
                            {role}
                          </span>
                        ))}
                    </div>
                  )}
                </article>
              ))}
          </div>
        </>
      )}

      <div
        className="eyebrow"
        style={{
          marginTop: 20,
        }}
      >
        HONORABLE MENTIONS
      </div>

      <div
        className="sub"
        style={{
          marginTop: 5,
        }}
      >
        Unlocked towers that can still contribute
        to the build, but were not selected for the
        main package.
      </div>

      {!mentions.length ? (
        <div
          className="notice"
          style={{
            marginTop: 10,
          }}
        >
          No additional towers were surfaced
          from the alternate finalists.
        </div>
      ) : (
        <div
          className="grid"
          style={{
            marginTop: 10,
          }}
        >
          {mentions.map(
            (tower) => (
              <article
                className="tower"
                key={tower.tower.name}
              >
                <div className="rank">
                  HONORABLE MENTION
                </div>

                <h3>
                  {tower.tower.name}
                </h3>

                <div className="muted">
                  {tower.tower.type} ·
                  Level {tower.tier}
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
                    marginTop: 9,
                  }}
                >
                </div>

                <div
                  className="chips"
                  style={{
                    marginTop: 9,
                  }}
                >
                  {tower.roles.mainDPS !==
                    "None" && (
                    <span className="chip">
                      Main DPS ·{" "}
                      {
                        tower.roles
                          .mainDPS
                      }
                    </span>
                  )}

                  {tower.roles.subDPS !==
                    "None" && (
                    <span className="chip">
                      Sub-DPS ·{" "}
                      {
                        tower.roles
                          .subDPS
                      }
                    </span>
                  )}

                  {tower.roles.control !==
                    "None" && (
                    <span className="chip">
                      Control ·{" "}
                      {
                        tower.roles
                          .control
                      }
                    </span>
                  )}

                  {tower.roles.coverage !==
                    "None" && (
                    <span className="chip">
                      Coverage ·{" "}
                      {
                        tower.roles
                          .coverage
                      }
                    </span>
                  )}

                  {tower.roles.amplification !==
                    "None" && (
                    <span className="chip">
                      Amplification ·{" "}
                      {
                        tower.roles
                          .amplification
                      }
                    </span>
                  )}

                  {tower.roles.range !==
                    "None" && (
                    <span className="chip">
                      Range ·{" "}
                      {
                        tower.roles
                          .range
                      }
                    </span>
                  )}

                  {tower.roles.scaling !==
                    "None" && (
                    <span className="chip">
                      Scaling ·{" "}
                      {
                        tower.roles
                          .scaling
                      }
                    </span>
                  )}

                  {tower.roles.support !==
                    "None" && (
                    <span className="chip">
                      Support ·{" "}
                      {
                        tower.roles
                          .support
                      }
                    </span>
                  )}
                </div>
              </article>
            ),
          )}
        </div>
      )}
    </section>
  );
}