"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CurrentBuild, TowerSelector } from "@/components/CurrentBuild";
import { ElementBadge } from "@/components/ElementBadge";
import { RecommendationResults } from "@/components/Recommendations";

import {
  createBuildLabIntent,
  DEFAULT_TWO_STEP_PLANNING,
  type BuildDirection,
} from "@/lib/build-lab-intent";
import { TOWERS } from "@/lib/data";
import { getTowerLevelCeiling } from "@/lib/engine/build-state";
import {
  deriveEffectiveElementAllocation,
  deriveMinimumElementAllocation,
  emptyElementAllocation,
} from "@/lib/engine/derived-allocation";
import {
  humanizeEngineText,
  labelCapability,
  labelEngineKey,
  labelRankingComponent,
  labelStrategicProfile,
} from "@/lib/presentation-labels";
import type {
  Candidate,
  ElementAllocation,
  ElementName,
  SelectedTowerInput,
  SequentialRecommendationResponse,
  SerializedRankedCandidate,
  StrategicProfileKey,
} from "@/lib/types";

const elements: ElementName[] = ["Light", "Darkness", "Water", "Fire", "Nature", "Earth"];

const towerOptions = TOWERS.map((tower) => Object.freeze({
  name: tower.name,
  type: tower.type,
  recipe: tower.recipe,
  maxLevel: getTowerLevelCeiling(tower.name),
}));

const strategicProfileOptions: readonly Readonly<{
  key: StrategicProfileKey;
  label: string;
}>[] = [
  { key: "dot", label: labelStrategicProfile("dot") },
  { key: "burst", label: labelStrategicProfile("burst") },
  { key: "sustainedDps", label: labelStrategicProfile("sustainedDps") },
  { key: "aoeWaveClear", label: labelStrategicProfile("aoeWaveClear") },
  { key: "bossSingleTarget", label: labelStrategicProfile("bossSingleTarget") },
  { key: "control", label: labelStrategicProfile("control") },
  { key: "support", label: labelStrategicProfile("support") },
  { key: "scaling", label: labelStrategicProfile("scaling") },
  { key: "economy", label: labelStrategicProfile("economy") },
  { key: "replicationNetwork", label: labelStrategicProfile("replicationNetwork") },
  { key: "isolation", label: labelStrategicProfile("isolation") },
  { key: "executionFinisher", label: labelStrategicProfile("executionFinisher") },
];

function DiagnosticComponentList({
  title,
  components,
}: {
  title: string;
  components: SerializedRankedCandidate["components"];
}) {
  return <div className="diagnostic-component-group">
    <h4>{title}</h4>
    {components.length === 0 ? <p className="muted small">No supported components.</p> : <ul className="component-list">
      {components.map((component, index) => <li key={`${component.component}-${component.key}-${index}`}>
        <span className={component.contribution > 0 ? "positive" : component.contribution < 0 ? "negative" : "neutral"}>
          {component.contribution > 0 ? "+" : ""}{component.contribution}
        </span>
        <span><b>{labelRankingComponent(component.component)}</b> · {labelEngineKey(component.key)} · {component.confidence} confidence<br/>{humanizeEngineText(component.reason.detail)}</span>
      </li>)}
    </ul>}
  </div>;
}

function CandidateDiagnostic({ recommendation }: { recommendation: SerializedRankedCandidate }) {
  const baseComponents = recommendation.components.filter((component) => (
    !component.component.startsWith("intent-") && component.component !== "focal-tower-support"
  ));
  const intentComponents = recommendation.components.filter((component) => (
    component.component.startsWith("intent-") || component.component === "focal-tower-support"
  ));

  return <article className="recommendation diagnostic-card">
    <div className="recommendation-head">
      <div>
        <div className="rank">CANDIDATE #{recommendation.rank}</div>
        <h3>{recommendation.candidate.towerName}</h3>
      </div>
      <div className="recommendation-value">
        <b>{recommendation.contextualValue}</b>
        <span>CONTEXTUAL VALUE</span>
        <em>{recommendation.confidence} evidence confidence</em>
      </div>
    </div>
    <div className="diagnostic-component-grid">
      <DiagnosticComponentList title="Base contextual components" components={baseComponents}/>
      <DiagnosticComponentList title="Intent components" components={intentComponents}/>
    </div>
  </article>;
}

export default function Home() {
  const [core, setCore] = useState<ElementName[]>(["Light", "Darkness", "Fire"]);
  const [results, setResults] = useState<Candidate[]>([]);
  const [legalCount, setLegalCount] = useState(0);
  const [allocationLoading, setAllocationLoading] = useState(false);
  const [allocationError, setAllocationError] = useState<string | null>(null);
  const [tab, setTab] = useState("Build Lab");

  const [selectedTowers, setSelectedTowers] = useState<SelectedTowerInput[]>([]);
  const [manualElementAllocation, setManualElementAllocation] = useState<ElementAllocation>(emptyElementAllocation);
  const [maxTowerSlots, setMaxTowerSlots] = useState(10);
  const [buildDirection, setBuildDirection] = useState<BuildDirection>("engine");
  const [focalTower, setFocalTower] = useState("");
  const [intentPriority, setIntentPriority] = useState<"explore" | "balanced" | "maximum-depth">("balanced");
  const [preferredProfile, setPreferredProfile] = useState<StrategicProfileKey | "">("");
  const [intentMode, setIntentMode] = useState<"normal" | "explore">("normal");
  const [twoStepPlanning, setTwoStepPlanning] = useState(DEFAULT_TWO_STEP_PLANNING);
  const [recommendationResult, setRecommendationResult] = useState<SequentialRecommendationResponse | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const [buildNotice, setBuildNotice] = useState("");
  useEffect(() => () => activeRequest.current?.abort(), []);

  const summary = useMemo(() => results[0], [results]);
  const availableTowers = useMemo(() => {
    const selectedNames = new Set(selectedTowers.map((tower) => tower.towerName));
    return towerOptions.filter((tower) => !selectedNames.has(tower.name));
  }, [selectedTowers]);
  const requiredElementAllocation = useMemo(
    () => deriveMinimumElementAllocation(selectedTowers),
    [selectedTowers],
  );
  const effectiveElementAllocation = useMemo(
    () => deriveEffectiveElementAllocation(requiredElementAllocation, manualElementAllocation),
    [manualElementAllocation, requiredElementAllocation],
  );
  const requiredElements = useMemo(
    () => elements.filter((element) => requiredElementAllocation[element] > 0),
    [requiredElementAllocation],
  );
  const buildInputIssue = useMemo(() => (
    selectedTowers.length > maxTowerSlots
      ? "Maximum tower slots cannot be lower than the number of selected towers."
      : null
  ), [maxTowerSlots, selectedTowers.length]);
  const buildAtCapacity = selectedTowers.length >= maxTowerSlots;

  function updateCore(index: number, value: ElementName) {
    setCore((previous) => previous.map((element, itemIndex) => itemIndex === index ? value : element));
  }

  async function optimize() {
    setAllocationLoading(true);
    setAllocationError(null);
    try {
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ core }),
      });
      const payload = await response.json().catch(() => null) as {
        results?: Candidate[];
        legalCount?: number;
        error?: string;
      } | null;
      if (!response.ok || !payload?.results || typeof payload.legalCount !== "number") {
        throw new Error(payload?.error ?? "Allocation evaluation failed.");
      }
      setResults(payload.results);
      setLegalCount(payload.legalCount);
    } catch (error) {
      setAllocationError(error instanceof Error ? error.message : "Allocation evaluation failed.");
    } finally {
      setAllocationLoading(false);
    }
  }

  function markBuildChanged() {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setRecommendationLoading(false);
    setRecommendationResult(null);
    setRecommendationError(null);
  }

  function addTower(towerName: string) {
    if (buildAtCapacity) return;
    const selected = availableTowers.find((tower) => tower.name === towerName);
    if (!selected) return;
    setSelectedTowers((previous) => [...previous, { towerName: selected.name, level: 1 }]);
    setBuildNotice(`${selected.name} added to your lineup.`);
    markBuildChanged();
  }

  function removeTower(towerName: string) {
    setBuildNotice(`${towerName} removed from your lineup.`);
    setSelectedTowers((previous) => previous.filter((tower) => tower.towerName !== towerName));
    markBuildChanged();
  }

  function updateTowerLevel(towerName: string, level: number) {
    setBuildNotice(`${towerName} changed to level ${level}.`);
    setSelectedTowers((previous) => previous.map((tower) => (
      tower.towerName === towerName ? { ...tower, level } : tower
    )));
    markBuildChanged();
  }

  function updateElement(element: ElementName, value: string) {
    const numericValue = Number(value);
    if (!Number.isInteger(numericValue) || numericValue < 0) return;
    setManualElementAllocation((previous) => ({
      ...previous,
      [element]: Math.max(requiredElementAllocation[element], numericValue),
    }));
    markBuildChanged();
  }

  function updateSlotLimit(value: string) {
    const numericValue = Number(value);
    if (!Number.isInteger(numericValue) || numericValue < 0) return;
    setMaxTowerSlots(numericValue);
    markBuildChanged();
  }

  async function recommendNextTower() {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setRecommendationLoading(true);
    setRecommendationError(null);
    try {
      const intent = createBuildLabIntent({
        direction: buildDirection,
        focalTower,
        priority: intentPriority,
        preferredProfile,
        mode: intentMode,
      });
      const response = await fetch("/api/optimize/next", {
        signal: controller.signal,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state: { selectedTowers, elementAllocation: effectiveElementAllocation, maxTowerSlots },
          ...(intent ? { intent } : {}),
          lookahead: { enabled: twoStepPlanning },
          limit: 10,
        }),
      });
      const payload = await response.json().catch(() => null) as (
        SequentialRecommendationResponse & { error?: string; details?: string[] }
      ) | null;
      if (!response.ok || !payload || !("candidates" in payload)) {
        const details = payload?.details?.join(" ");
        throw new Error(details || payload?.error || "Recommendation evaluation failed.");
      }
      if (controller.signal.aborted) return;
      setRecommendationResult(payload);
    } catch (error) {
      if (controller.signal.aborted) return;
      setRecommendationError(error instanceof Error ? error.message : "Recommendation evaluation failed.");
      setRecommendationResult(null);
    } finally {
      if (activeRequest.current === controller) {
        setRecommendationLoading(false);
        activeRequest.current = null;
      }
    }
  }

  const allocationExplorer = <section className="workspace">
    <aside className="panel"><h2>Build focus</h2><p className="muted">Core = identity. Allocation = the actual strategy. This original allocation evaluator remains separate from sequential tower recommendations.</p>
      {core.map((value, index) => <div className="field" key={index}><label>Core element {index + 1}</label><select className="select" value={value} onChange={(event) => updateCore(index, event.target.value as ElementName)}>{elements.map((element) => <option key={element}>{element}</option>)}</select></div>)}
      <button className="primary" onClick={optimize} disabled={allocationLoading}>{allocationLoading ? "Evaluating…" : "Optimize build"}</button>
      {allocationError && <p className="error-message" role="alert">{allocationError}</p>}
      <div style={{ height: 10 }}/><div className="notice">Current evaluator is intentionally a foundation heuristic. UNKNOWN mechanics are not converted into invented facts.</div>
    </aside>
    <section className="panel"><div className="section-heading"><div><div className="eyebrow">SERVER EVALUATION</div><h2>Candidate allocations</h2><p className="muted small">{legalCount || "—"} legal core allocations</p></div>{summary && <div className="recommendation-value"><span>TOP FOUNDATION SCORE</span><b>{summary.score.toFixed(1)}</b></div>}</div>
      {!results.length ? <div className="notice">Choose your core and run the evaluator to populate candidates.</div> : <div className="grid">{results.slice(0, 12).map((result, index) => <article className="tower" key={result.allocation.join("-")}><div className="rank">#{index + 1} · {result.activeElements} active elements</div><h3 className="mono">{result.allocation.join(" · ")}</h3><div className="score">{result.score.toFixed(1)}</div><div className="bar"><i style={{ width: `${Math.min(100, result.score)}%` }}/></div><div className="chips">{result.selected.map((tower) => <span className="chip" key={tower.name}>{tower.name}</span>)}</div></article>)}</div>}
    </section>
  </section>;

  const buildLab = <section className="workspace sequential-workspace">
    <aside className="panel build-inputs">
      <CurrentBuild selected={selectedTowers} towers={towerOptions} maxSlots={maxTowerSlots} onLevel={updateTowerLevel} onRemove={removeTower}/>
      <TowerSelector towers={availableTowers} onAdd={addTower} disabled={buildAtCapacity}/>
      <p className="build-notice" role="status" aria-live="polite">{buildNotice || "Your lineup, your direction."}</p>
      <div className="direction-section">
        <label className="eyebrow" htmlFor="build-direction">02 / BUILD DIRECTION</label>
        <select id="build-direction" className="select" value={buildDirection} onChange={(event) => { setBuildDirection(event.target.value as BuildDirection); markBuildChanged(); }}>
          <option value="engine">Let engine decide</option><option value="tower">Build around a tower</option><option value="wave-clear">Improve wave clear</option><option value="boss-damage">Improve boss damage</option><option value="control">Improve control</option><option value="explore">Explore alternatives</option>
        </select>
        {buildDirection === "tower" && <div className="field focal-field"><label htmlFor="focal-tower">Build around which tower?</label><select id="focal-tower" className="select" value={focalTower} onChange={(event) => { setFocalTower(event.target.value); markBuildChanged(); }}><option value="">Choose a tower</option>{towerOptions.map((tower) => <option key={tower.name} value={tower.name}>{tower.name}</option>)}</select></div>}
      </div>
      <section className="derived-elements" aria-label="Derived elements">
        <div className="eyebrow">03 / DERIVED ELEMENTS</div>
        <div className="derived-element-list">{requiredElements.length ? requiredElements.map((element) => <ElementBadge key={element} element={element} depth={requiredElementAllocation[element]}/>) : <span className="muted small">Your tower recipes will appear here.</span>}</div>
        <p className="muted small">Automatically required by your selected towers.</p>
      </section>
      <details className="advanced-controls"><summary>Advanced build controls</summary><div className="advanced-content">
        <div className="field"><label>Manual element allocation <span>cannot reduce derived levels</span></label><p className="muted small">Optional investment can unlock more catalog towers. The effective allocation stays at or above your selected towers’ requirements.</p><div className="element-grid">{elements.map((element) => <label className="element-input" key={element}><span>{element}</span><input className="input" type="number" min={requiredElementAllocation[element]} step={1} value={effectiveElementAllocation[element]} onChange={(event) => updateElement(element, event.target.value)}/></label>)}</div></div>
        <div className="field"><label htmlFor="maximum-slots">Maximum tower slots</label><input id="maximum-slots" className="input" type="number" min={0} step={1} value={maxTowerSlots} onChange={(event) => updateSlotLimit(event.target.value)}/></div>
        <div className="field"><label htmlFor="intent-priority">Exact intent priority</label><select id="intent-priority" className="select" value={intentPriority} onChange={(event) => { setIntentPriority(event.target.value as typeof intentPriority); markBuildChanged(); }}><option value="explore">Explore · weak preference</option><option value="balanced">Balanced · shared influence</option><option value="maximum-depth">Maximum depth · strong preference</option></select></div>
        <div className="field"><label htmlFor="desired-profile">Exact desired profile</label><select id="desired-profile" className="select" value={preferredProfile} onChange={(event) => { setPreferredProfile(event.target.value as StrategicProfileKey | ""); markBuildChanged(); }}><option value="">Use build direction default</option>{strategicProfileOptions.map((profile) => <option key={profile.key} value={profile.key}>{profile.label}</option>)}</select></div>
        <div className="field"><label htmlFor="intent-mode">Intent mode</label><select id="intent-mode" className="select" value={intentMode} onChange={(event) => { setIntentMode(event.target.value as typeof intentMode); markBuildChanged(); }}><option value="normal">Normal · preserve coherence</option><option value="explore">Explore · modest breadth</option></select></div>
        <div className="field"><label>Planning horizon</label><label className="planning-toggle"><input type="checkbox" checked={twoStepPlanning} onChange={(event) => { setTwoStepPlanning(event.target.checked); markBuildChanged(); }}/> Compare the best legal two-step path</label><p className="muted small">Enabled by default. Turn this off to focus only on the next tower.</p></div>
      </div></details>
      {buildInputIssue && <p className="error-message" role="alert">{buildInputIssue}</p>}
      <button className="primary" onClick={recommendNextTower} disabled={recommendationLoading || Boolean(buildInputIssue)}>{recommendationLoading ? "Analyzing your build…" : "Recommend next tower"}<span aria-hidden="true"> →</span></button>
    </aside>
    <section className="recommendation-results" aria-label="Build recommendations">
      <RecommendationResults result={recommendationResult} loading={recommendationLoading} error={recommendationError} twoStep={twoStepPlanning}/>
    </section>
  </section>;

  const debugPanel = !recommendationResult ? <section className="panel"><div className="eyebrow">DEVELOPMENT DIAGNOSTICS</div><h2>Run a recommendation first</h2><p className="muted">The debug view is intentionally separate from the player-facing result. It shows the engine evidence used by the most recent Build Lab recommendation.</p></section> : <section className="recommendation-results">
    <section className="panel interpretation-summary"><div className="section-heading"><div><div className="eyebrow">BASE BUILD INTERPRETATION</div><h2>Current evidence</h2></div><span className="engine-version">{recommendationResult.engineVersion}</span></div><div className="summary-grid"><div><h3>Strategic profiles</h3><div className="chips">{recommendationResult.interpretation.strategicProfiles.map((profile) => <span className="chip" key={profile.key}>{labelStrategicProfile(profile.key)} · {profile.confidence}</span>)}</div></div><div><h3>Vulnerabilities</h3>{recommendationResult.interpretation.vulnerabilities.length ? <ul className="compact-list">{recommendationResult.interpretation.vulnerabilities.map((vulnerability) => <li key={vulnerability.capability}>{labelCapability(vulnerability.capability)} · {vulnerability.confidence}</li>)}</ul> : <p className="muted small">None identified.</p>}</div><div><h3>Requirements / gaps</h3>{recommendationResult.interpretation.relevantGaps.length ? <ul className="compact-list">{recommendationResult.interpretation.relevantGaps.map((gap) => <li key={gap.capability}>{labelCapability(gap.capability)} · {gap.status}</li>)}</ul> : <p className="muted small">None relevant.</p>}</div><div><h3>Compensations</h3>{recommendationResult.interpretation.compensations.length ? <ul className="compact-list">{recommendationResult.interpretation.compensations.map((compensation) => <li key={compensation.gapCapability}>{labelCapability(compensation.gapCapability)} via {compensation.compensatingCapabilities.map(labelCapability).join(", ")}</li>)}</ul> : <p className="muted small">None validated.</p>}</div></div>{recommendationResult.intent && <div className="notice"><b>Resolved intent · {recommendationResult.intent.alignment.replace("-", " ")}</b><p className="muted small">Mode: {recommendationResult.intent.mode}. Focus: {recommendationResult.intent.focusedTowers.map((focus) => `${focus.towerName} (${focus.priority}, ${focus.selected ? "selected" : "not selected"})`).join(", ") || "none"}. Profiles: {recommendationResult.intent.preferredProfiles.map(labelStrategicProfile).join(", ") || "none"}.</p>{recommendationResult.intent.conflicts.map((conflict) => <p className="muted small" key={conflict.key}>{humanizeEngineText(conflict.detail)}</p>)}{recommendationResult.intent.notes.map((note) => <p className="muted small" key={note}>{humanizeEngineText(note)}</p>)}</div>}</section>
    <section className="panel"><div className="eyebrow">CANDIDATE WHY</div><h2>Contextual component audit</h2><p className="muted small">Every contribution shown here is already present in the ranking response. This view adds no scoring logic.</p><div className="recommendation-list">{recommendationResult.candidates.map((candidate) => <CandidateDiagnostic recommendation={candidate} key={candidate.candidate.towerName}/>)}</div></section>
    {recommendationResult.lookahead && <section className="panel"><div className="eyebrow">FUTURE-PATH AUDIT</div><h2>Bounded policy and continuation</h2><p className="muted small">First-step limit: {recommendationResult.lookahead.firstStepLimit}. Immediate weight: {recommendationResult.lookahead.immediateWeight}. Continuation discount: {recommendationResult.lookahead.futureDiscount}.</p>{recommendationResult.lookahead.bestPath ? <div className="notice"><b>{recommendationResult.lookahead.bestPath.first.candidate.towerName} → {recommendationResult.lookahead.bestPath.second?.candidate.towerName ?? "No legal continuation"}</b><p className="muted small">Immediate value {recommendationResult.lookahead.bestPath.immediateValue}; continuation value {recommendationResult.lookahead.bestPath.continuationValue ?? "unavailable"}; path value {recommendationResult.lookahead.bestPath.pathValue}; {recommendationResult.lookahead.bestPath.confidence} confidence; continuation {recommendationResult.lookahead.bestPath.continuationStatus}.</p><p className="muted small">{recommendationResult.lookahead.comparison.detail}</p></div> : <p className="muted">No legal first-step path is available.</p>}</section>}
  </section>;

  return <main className="shell">
    <header className="top">
      <div className="brand"><div className="logo" aria-hidden="true">✦</div><div><b>ELEMENT TD 2</b><span>BUILD LAB / STRATEGY COMPANION</span></div></div>
      <div className="header-status"><span/> YOUR NEXT ADVANTAGE</div>
    </header>
    <section className="hero">
      <div><span className="eyebrow">SIX ELEMENTS. ENDLESS POSSIBILITIES.</span><h1>Make your next move count.</h1><p className="muted">Shape your lineup. Find the tower that brings it together.</p></div>
      <div className="hero-index"><b>50</b><span>TOWERS<br/>ONE STRATEGY: YOURS</span></div>
    </section>

    <nav className="nav" aria-label="Build Lab sections">{["Build Lab", "Allocation Explorer", "What If", "Core Explorer", "Tower Codex", "Research", "Debug"].map((item) => <button key={item} aria-current={tab === item ? "page" : undefined} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</nav>

    {tab === "Build Lab" ? buildLab : tab === "Allocation Explorer" ? allocationExplorer : tab === "Debug" ? debugPanel : <section className="panel"><div className="eyebrow">NEXT MODULE</div><h2 style={{ margin: "8px 0" }}>{tab}</h2><p className="muted">The route is reserved in the application shell. It will use the shared domain model rather than duplicate engine logic.</p></section>}

    <footer className="muted footer"><span>ELEMENT TD 2 / BUILD LAB</span><span>Independent strategy companion · Recommendations are specific to your build.</span></footer>
  </main>;
}
