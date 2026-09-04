"use client";

import { useEffect, useState } from "react";
import { ELEMENTS } from "@/lib/data";
import { ElementBadge } from "./ElementBadge";

export const ANALYSIS_STAGES = [
  "Reading tower architecture", "Detecting strategic profiles", "Identifying gaps and vulnerabilities",
  "Simulating legal candidates", "Evaluating intent alignment", "Evaluating future paths", "Ranking recommendations",
] as const;

export function AnalysisLoader({ loading, twoStep }: { loading: boolean; twoStep: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Date.now() - started), 500);
    return () => window.clearInterval(timer);
  }, [loading]);
  if (!loading) return null;
  const stages = ANALYSIS_STAGES.filter((stage) => twoStep || stage !== "Evaluating future paths");
  const active = Math.min(Math.floor(elapsed / 700), stages.length - 1);
  return <section className="panel analysis-loader" aria-busy="true" aria-label="Analyzing build">
    <div className="eyebrow">BUILD ANALYSIS</div><h2>Finding your next advantage.</h2>
    <p className="muted" role="status">{elapsed > 7000 ? "Still evaluating your build. Recommendations will appear as soon as they are ready." : "Comparing the possibilities in your current build."}</p>
    <div className="analysis-orbit" aria-hidden="true"><span>ET</span><i/><i/><i/></div>
    <div className="analysis-elements">{ELEMENTS.map((element) => <ElementBadge key={element} element={element}/>)}</div>
    <ol className="analysis-stages">{stages.map((stage, index) => <li key={stage} className={index === active ? "stage-active" : ""}><span>{String(index + 1).padStart(2, "0")}</span>{stage}</li>)}</ol>
    <p className="small muted analysis-caption">Analysis workflow · {Math.floor(elapsed / 1000)}s elapsed<br/>Stage highlights illustrate the process, not live server progress.</p>
  </section>;
}
