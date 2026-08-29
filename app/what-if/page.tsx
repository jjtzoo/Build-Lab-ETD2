"use client";

import { useEffect, useState } from "react";

import {
  useAppState,
} from "@/components/app-shell/app-state-provider";

import {
  createWhatIfState,
} from "@/components/what-if/what-if-state";

import {
  AllocationEditor,
} from "@/components/what-if/allocation-editor";

import { CandidateEvaluation } from "@/lib/engine/types";

import type { Allocation } from "@/lib/types";

export default function WhatIfPage() {
  const {
    core,
    anchor,
    mode,
    winner,
    setWinner,
    setResults,
    setLegalCount,
  } = useAppState();

  const [scenarioAllocation, setScenarioAllocation] =
  useState<Allocation | null>(
    winner?.allocation
      ? [...winner.allocation]
      : null,
  );

  const [scenarioEvaluation, setScenarioEvaluation] =
    useState<CandidateEvaluation | null>(null);

  const [scenarioLoading, setScenarioLoading] =
    useState(false);

  const [scenarioError, setScenarioError] =
    useState<string | null>(null);

  async function evaluateScenario() {
    if (!scenarioAllocation) {
      return;
    }

    setScenarioLoading(true);
    setScenarioError(null);

    try {
      const res = await fetch(
        "/api/what-if",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            allocation: scenarioAllocation,
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
            : "Scenario evaluation failed.",
        );
      }

      setScenarioEvaluation(
        data.evaluation as CandidateEvaluation,
      );
    } catch (err) {
      console.error(
        "What If evaluation failed:",
        err,
      );

      setScenarioEvaluation(null);

      setScenarioError(
        err instanceof Error
          ? err.message
          : "An unexpected scenario error occurred.",
      );
    } finally {
      setScenarioLoading(false);
    }
  }

  useEffect(() => {
    setScenarioAllocation(
      winner?.allocation
        ? [...winner.allocation]
        : null,
    );

    setScenarioEvaluation(null);
    setScenarioError(null);
  }, [winner?.allocation]);

  function applyScenarioToBuildLab() {
    if (!scenarioEvaluation) {
      return;
    }

    setWinner(scenarioEvaluation);
    setResults([scenarioEvaluation]);
  }

  return (
    <section className="panel">
      <div className="eyebrow">
        WHAT IF LAB
      </div>

      <h1>What If</h1>

      {!winner ? (
        <div
          className="notice"
          style={{ marginTop: 14 }}
        >
          Run the Build Lab optimizer first.
          What If uses the current recommended
          build as its starting point.
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <div className="notice">
            <b>Current Build Lab Build</b>
            <br />
            Core · {core.join(" / ")}
            <br />
            Anchor · {anchor}
            <br />
            Mode · {mode}
          </div>

          <div
            className="grid"
            style={{ marginTop: 14 }}
          >
            <article className="tower">
              <div className="rank">
                CURRENT ALLOCATION
              </div>

              <h2 className="mono">
                {winner.allocation.join(" · ")}
              </h2>

              <div className="muted">
                11-point Build Lab recommendation
              </div>
            </article>

            <article className="tower">
              <div className="rank">
                CURRENT PACKAGE
              </div>

              <div className="chips">
                {winner.towers.map((tower) => (
                  <span
                    className="chip"
                    key={tower.tower.name}
                  >
                    {tower.tower.name} · Lv
                    {tower.tier}
                  </span>
                ))}
              </div>
            </article>
          </div>

          <AllocationEditor
            allocation={scenarioAllocation}
            onChange={setScenarioAllocation}
          />

          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="primary"
              onClick={evaluateScenario}
              disabled={
                scenarioLoading ||
                !scenarioAllocation
              }
            >
              {scenarioLoading
                ? "Evaluating…"
                : "Evaluate Scenario"}
            </button>
          </div>

          {scenarioError && (
            <div
              className="notice warn"
              style={{ marginTop: 12 }}
            >
              <b>Scenario error:</b>{" "}
              {scenarioError}
            </div>
          )}

          {scenarioEvaluation && (
            <section
              className="panel"
              style={{ marginTop: 16 }}
            >
              <div className="eyebrow">
                SCENARIO RESULT
              </div>

              <h2>Evaluated Build</h2>

              <div
                className="grid"
                style={{ marginTop: 14 }}
              >
                <article className="tower">
                  <div className="rank">
                    SCENARIO ALLOCATION
                  </div>

                  <div className="score mono">
                    {scenarioEvaluation.allocation.join(
                      " · ",
                    )}
                  </div>

                  <div className="muted">
                    Package completeness{" "}
                    {Math.round(
                      scenarioEvaluation.package
                        .completeness * 100,
                    )}
                    %
                  </div>
                </article>

                <article className="tower">
                  <div className="rank">
                    SCENARIO PACKAGE
                  </div>

                  <div className="chips">
                    {scenarioEvaluation.towers.map(
                      (tower) => (
                        <span
                          className="chip"
                          key={tower.tower.name}
                        >
                          {tower.tower.name} · Lv
                          {tower.tier}
                        </span>
                      ),
                    )}
                  </div>
                </article>
              </div>

              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="primary"
                  onClick={applyScenarioToBuildLab}
                >
                  Apply Scenario to Build Lab
                </button>
              </div>

            </section>
          )}
        </div>
      )}
    </section>
  );
}