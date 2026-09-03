"use client";

import { useMemo, useState } from "react";

import { TOWERS } from "@/lib/data";
import { getTowerLevelCeiling } from "@/lib/engine/build-state";
import type {
  Candidate,
  ElementAllocation,
  ElementName,
  RecommendationReason,
  SelectedTowerInput,
  SequentialRecommendationResponse,
  SerializedFuturePath,
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
  { key: "dot", label: "DoT" },
  { key: "burst", label: "Burst" },
  { key: "sustainedDps", label: "Sustained DPS" },
  { key: "aoeWaveClear", label: "AoE / Wave Clear" },
  { key: "bossSingleTarget", label: "Boss / Single Target" },
  { key: "control", label: "Control" },
  { key: "support", label: "Support" },
  { key: "scaling", label: "Scaling" },
  { key: "economy", label: "Economy" },
  { key: "replicationNetwork", label: "Replication / Network" },
  { key: "isolation", label: "Isolation" },
  { key: "executionFinisher", label: "Execution / Finisher" },
];

function emptyAllocation(): ElementAllocation {
  return { Light: 0, Darkness: 0, Water: 0, Fire: 0, Nature: 0, Earth: 0 };
}

function reasonList(title: string, reasons: readonly RecommendationReason[]) {
  if (reasons.length === 0) return null;
  return <div className="reason-group">
    <div className="reason-title">{title}</div>
    <ul className="reason-list">
      {reasons.map((reason, index) => <li key={`${reason.component}-${reason.key}-${index}`}>
        {reason.detail}
      </li>)}
    </ul>
  </div>;
}

function RecommendationCard({
  recommendation,
  prominent = false,
}: {
  recommendation: SerializedRankedCandidate;
  prominent?: boolean;
}) {
  return <article className={prominent ? "recommendation top-recommendation" : "recommendation"}>
    <div className="recommendation-head">
      <div>
        <div className="rank">#{recommendation.rank} · {recommendation.candidate.type}</div>
        <h3>{recommendation.candidate.towerName}</h3>
        <div className="muted small">{recommendation.candidate.recipe.join(" + ")} · Starts level {recommendation.candidate.initialLevel} · Max level {recommendation.candidate.maxLevel}</div>
      </div>
      <div className="recommendation-value">
        <span className={`category category-${recommendation.category}`}>{recommendation.category.replace("-", " ")}</span>
        <b>{recommendation.contextualValue}</b>
        <span>CONTEXTUAL VALUE</span>
        <em>{recommendation.confidence} confidence</em>
      </div>
    </div>
    {recommendation.intentAlignment && recommendation.intentAlignment.status !== "neutral" && <p className="muted small">Intent alignment: {recommendation.intentAlignment.status.replace("-", " ")}{recommendation.intentAlignment.matchedProfiles.length ? ` · ${recommendation.intentAlignment.matchedProfiles.join(", ")}` : ""}{recommendation.intentAlignment.supportedFocalTowers.length ? ` · supports ${recommendation.intentAlignment.supportedFocalTowers.join(", ")}` : ""}</p>}
    {reasonList("Strengths", recommendation.strengths)}
    {reasonList("Tradeoffs", recommendation.tradeoffs)}
    {reasonList("Warnings", recommendation.warnings)}
    <details className="component-details">
      <summary>Ranking component breakdown</summary>
      <ul className="component-list">
        {recommendation.components.map((component, index) => <li key={`${component.component}-${component.key}-${index}`}>
          <span className={component.contribution > 0 ? "positive" : component.contribution < 0 ? "negative" : "neutral"}>
            {component.contribution > 0 ? "+" : ""}{component.contribution}
          </span>
          <span>{component.reason.detail}</span>
        </li>)}
      </ul>
    </details>
  </article>;
}

function pathReasonList(
  title: string,
  path: SerializedFuturePath,
  kind: "strengths" | "tradeoffs" | "warnings",
) {
  const reasons = path[kind];
  if (reasons.length === 0) return null;
  return <div className="reason-group">
    <div className="reason-title">{title}</div>
    <ul className="reason-list">
      {reasons.map((item, index) => <li key={`${item.step}-${item.reason.component}-${item.reason.key}-${index}`}>
        <b>{item.step === "first" ? "First: " : "Second: "}</b>{item.reason.detail}
      </li>)}
    </ul>
  </div>;
}

function FuturePathCard({ path }: { path: SerializedFuturePath }) {
  return <article className="recommendation top-recommendation">
    <div className="recommendation-head">
      <div>
        <div className="rank">PATH #{path.rank} · {path.confidence} confidence</div>
        <h3>{path.first.candidate.towerName} <span className="muted">→</span> {path.second?.candidate.towerName ?? "No legal continuation"}</h3>
        <div className="muted small">{path.explanation.continuation}</div>
      </div>
      <div className="recommendation-value">
        <b>{path.pathValue}</b>
        <span>PATH VALUE</span>
        <em>Now {path.immediateValue} · Then {path.continuationValue ?? "—"}</em>
      </div>
    </div>
    <p className="muted small">{path.explanation.policy}</p>
    {pathReasonList("Path strengths", path, "strengths")}
    {pathReasonList("Path tradeoffs", path, "tradeoffs")}
    {pathReasonList("Path warnings", path, "warnings")}
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
  const [elementAllocation, setElementAllocation] = useState<ElementAllocation>(emptyAllocation);
  const [maxTowerSlots, setMaxTowerSlots] = useState(10);
  const [towerToAdd, setTowerToAdd] = useState("Poison");
  const [focalTower, setFocalTower] = useState("");
  const [intentPriority, setIntentPriority] = useState<"explore" | "balanced" | "maximum-depth">("balanced");
  const [preferredProfile, setPreferredProfile] = useState<StrategicProfileKey | "">("");
  const [intentMode, setIntentMode] = useState<"normal" | "explore">("normal");
  const [twoStepPlanning, setTwoStepPlanning] = useState(false);
  const [recommendationResult, setRecommendationResult] = useState<SequentialRecommendationResponse | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);

  const summary = useMemo(() => results[0], [results]);
  const availableTowers = useMemo(() => {
    const selectedNames = new Set(selectedTowers.map((tower) => tower.towerName));
    return towerOptions.filter((tower) => !selectedNames.has(tower.name));
  }, [selectedTowers]);
  const selectedTowerDetails = useMemo(() => selectedTowers.map((selected) => ({
    selected,
    tower: towerOptions.find((tower) => tower.name === selected.towerName),
  })), [selectedTowers]);

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
    setRecommendationResult(null);
    setRecommendationError(null);
  }

  function addTower() {
    const selected = availableTowers.find((tower) => tower.name === towerToAdd) ?? availableTowers[0];
    if (!selected) return;
    setSelectedTowers((previous) => [...previous, { towerName: selected.name, level: 1 }]);
    setTowerToAdd(availableTowers.find((tower) => tower.name !== selected.name)?.name ?? "");
    markBuildChanged();
  }

  function removeTower(towerName: string) {
    setSelectedTowers((previous) => previous.filter((tower) => tower.towerName !== towerName));
    markBuildChanged();
  }

  function updateTowerLevel(towerName: string, level: number) {
    setSelectedTowers((previous) => previous.map((tower) => (
      tower.towerName === towerName ? { ...tower, level } : tower
    )));
    markBuildChanged();
  }

  function updateElement(element: ElementName, value: string) {
    const numericValue = Number(value);
    if (!Number.isInteger(numericValue) || numericValue < 0) return;
    setElementAllocation((previous) => ({ ...previous, [element]: numericValue }));
    markBuildChanged();
  }

  function updateSlotLimit(value: string) {
    const numericValue = Number(value);
    if (!Number.isInteger(numericValue) || numericValue < 0) return;
    setMaxTowerSlots(numericValue);
    markBuildChanged();
  }

  async function recommendNextTower() {
    setRecommendationLoading(true);
    setRecommendationError(null);
    try {
      const response = await fetch("/api/optimize/next", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state: { selectedTowers, elementAllocation, maxTowerSlots },
          ...(focalTower || preferredProfile || intentMode === "explore" ? {
            intent: {
              focusedTowers: focalTower ? [{ tower: focalTower, priority: intentPriority }] : [],
              ...(preferredProfile ? { preferredProfiles: [preferredProfile] } : {}),
              mode: intentMode,
            },
          } : {}),
          ...(twoStepPlanning ? { lookahead: { enabled: true } } : {}),
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
      setRecommendationResult(payload);
    } catch (error) {
      setRecommendationError(error instanceof Error ? error.message : "Recommendation evaluation failed.");
      setRecommendationResult(null);
    } finally {
      setRecommendationLoading(false);
    }
  }

  const allocationExplorer = <section className="workspace">
    <aside className="panel"><h2>Build focus</h2><p className="muted">Core = identity. Allocation = the actual strategy. This original allocation evaluator remains separate from sequential tower recommendations.</p>
      {core.map((value, index) => <div className="field" key={index}><label>Core element {index + 1}</label><select className="select" value={value} onChange={(event) => updateCore(index, event.target.value as ElementName)}>{elements.map((element) => <option key={element}>{element}</option>)}</select></div>)}
      <button className="primary" onClick={optimize} disabled={allocationLoading}>{allocationLoading ? "Evaluating…" : "Optimize build"}</button>
      {allocationError && <p className="error-message" role="alert">{allocationError}</p>}
      <div style={{ height: 10 }}/><div className="notice">Current evaluator is intentionally a foundation heuristic. UNKNOWN mechanics are not converted into invented facts.</div>
    </aside>
    <section className="panel"><div className="section-heading"><div><div className="eyebrow">SERVER EVALUATION</div><h2>Candidate allocations</h2></div>{summary && <div className="recommendation-value"><span>TOP FOUNDATION SCORE</span><b>{summary.score.toFixed(1)}</b></div>}</div>
      {!results.length ? <div className="notice">Choose your core and run the evaluator to populate candidates.</div> : <div className="grid">{results.slice(0, 12).map((result, index) => <article className="tower" key={result.allocation.join("-")}><div className="rank">#{index + 1} · {result.activeElements} active elements</div><h3 className="mono">{result.allocation.join(" · ")}</h3><div className="score">{result.score.toFixed(1)}</div><div className="bar"><i style={{ width: `${Math.min(100, result.score)}%` }}/></div><div className="chips">{result.selected.map((tower) => <span className="chip" key={tower.name}>{tower.name}</span>)}</div></article>)}</div>}
    </section>
  </section>;

  const buildLab = <section className="workspace sequential-workspace">
    <aside className="panel build-inputs">
      <div className="eyebrow">CURRENT BUILD</div><h2>Sequential planner</h2><p className="muted">Represent the current build, then ask the server for the next contextual tower recommendation.</p>
      <div className="field"><label>Add tower</label><div className="inline-field"><select className="select" value={availableTowers.some((tower) => tower.name === towerToAdd) ? towerToAdd : availableTowers[0]?.name ?? ""} onChange={(event) => setTowerToAdd(event.target.value)} disabled={availableTowers.length === 0}>{availableTowers.map((tower) => <option key={tower.name} value={tower.name}>{tower.name} · {tower.type}</option>)}</select><button className="btn" onClick={addTower} disabled={availableTowers.length === 0}>Add</button></div></div>
      {selectedTowerDetails.length === 0 ? <div className="notice">No towers selected. You can still inspect opening options from the allocated elements.</div> : <div className="selected-towers">{selectedTowerDetails.map(({ selected, tower }) => <div className="selected-tower" key={selected.towerName}><div><b>{selected.towerName}</b><span>{tower?.type} · {tower?.recipe.join(" + ")}</span></div><div className="tower-controls"><label>Level<select className="small-select" value={selected.level} onChange={(event) => updateTowerLevel(selected.towerName, Number(event.target.value))}>{Array.from({ length: tower?.maxLevel ?? 1 }, (_, index) => index + 1).map((level) => <option key={level} value={level}>{level}</option>)}</select></label><button className="remove" onClick={() => removeTower(selected.towerName)}>Remove</button></div></div>)}</div>}
      <div className="field"><label>Maximum tower slots</label><input className="input" type="number" min={0} step={1} value={maxTowerSlots} onChange={(event) => updateSlotLimit(event.target.value)}/></div>
      <div className="field"><label>Element allocation <span>{Object.values(elementAllocation).reduce((total, value) => total + value, 0)} allocated</span></label><div className="element-grid">{elements.map((element) => <label className="element-input" key={element}><span>{element}</span><input className="input" type="number" min={0} step={1} value={elementAllocation[element]} onChange={(event) => updateElement(element, event.target.value)}/></label>)}</div></div>
      <div className="field"><label>Build intent <span>optional</span></label><p className="muted small">Intent adjusts decision priority; it does not change what the current build objectively contains.</p><label>Focal tower<select className="select" value={focalTower} onChange={(event) => { setFocalTower(event.target.value); markBuildChanged(); }}><option value="">No focal tower</option>{towerOptions.map((tower) => <option key={tower.name} value={tower.name}>{tower.name}</option>)}</select></label><label>Priority<select className="select" value={intentPriority} onChange={(event) => { setIntentPriority(event.target.value as typeof intentPriority); markBuildChanged(); }}><option value="explore">Explore · weak preference</option><option value="balanced">Balanced · shared influence</option><option value="maximum-depth">Maximum depth · strong preference</option></select></label><label>Desired profile<select className="select" value={preferredProfile} onChange={(event) => { setPreferredProfile(event.target.value as StrategicProfileKey | ""); markBuildChanged(); }}><option value="">No requested profile</option>{strategicProfileOptions.map((profile) => <option key={profile.key} value={profile.key}>{profile.label}</option>)}</select></label><label>Intent mode<select className="select" value={intentMode} onChange={(event) => { setIntentMode(event.target.value as typeof intentMode); markBuildChanged(); }}><option value="normal">Normal · preserve coherence</option><option value="explore">Explore · modest breadth</option></select></label></div>
      <div className="field"><label>Planning horizon <span>optional</span></label><label className="planning-toggle"><input type="checkbox" checked={twoStepPlanning} onChange={(event) => { setTwoStepPlanning(event.target.checked); markBuildChanged(); }}/> Evaluate the best legal next continuation</label><p className="muted small">Evaluates only the top current options, then one legal follow-up for each.</p></div>
      <button className="primary" onClick={recommendNextTower} disabled={recommendationLoading}>{recommendationLoading ? "Evaluating…" : "Recommend next tower"}</button>
      {recommendationError && <p className="error-message" role="alert">{recommendationError}</p>}
    </aside>
    <section className="recommendation-results">
      {!recommendationResult ? <section className="panel"><div className="eyebrow">SEQUENTIAL ENGINE</div><h2>Next-tower recommendations</h2><p className="muted">The engine evaluates the current build state on the server. Results include build-specific strengths, tradeoffs, and confidence—never a universal tower score.</p>{selectedTowers.length === 0 && <div className="notice">Empty build: add a tower or allocate elements to explore the first legal additions.</div>}</section> : <>
        <section className="panel interpretation-summary"><div className="section-heading"><div><div className="eyebrow">CURRENT BUILD INTERPRETATION</div><h2>Why the engine is looking for these things</h2></div><span className="engine-version">{recommendationResult.engineVersion}</span></div><div className="summary-grid"><div><h3>Strategic profiles</h3>{recommendationResult.interpretation.strategicProfiles.length ? <div className="chips">{recommendationResult.interpretation.strategicProfiles.map((profile) => <span className="chip" key={profile.key}>{profile.key}</span>)}</div> : <p className="muted small">No active strategic profiles yet.</p>}</div><div><h3>Vulnerabilities</h3>{recommendationResult.interpretation.vulnerabilities.length ? <ul className="compact-list">{recommendationResult.interpretation.vulnerabilities.map((vulnerability) => <li key={vulnerability.capability}>{vulnerability.capability}</li>)}</ul> : <p className="muted small">No meaningful vulnerabilities identified.</p>}</div><div><h3>Relevant gaps</h3>{recommendationResult.interpretation.relevantGaps.length ? <ul className="compact-list">{recommendationResult.interpretation.relevantGaps.map((gap) => <li key={gap.capability}>{gap.capability} · {gap.status}</li>)}</ul> : <p className="muted small">No relevant gaps identified.</p>}</div><div><h3>Compensations</h3>{recommendationResult.interpretation.compensations.length ? <ul className="compact-list">{recommendationResult.interpretation.compensations.map((compensation) => <li key={compensation.gapCapability}>{compensation.gapCapability} via {compensation.compensatingCapabilities.join(", ")}</li>)}</ul> : <p className="muted small">No validated compensations active.</p>}</div></div>{recommendationResult.intent && <div className="notice"><b>Player intent · {recommendationResult.intent.alignment.replace("-", " ")}</b><div className="chips">{recommendationResult.intent.focusedTowers.map((focus) => <span className="chip" key={focus.towerName}>{focus.towerName} · {focus.priority}</span>)}{recommendationResult.intent.preferredProfiles.map((profile) => <span className="chip" key={profile}>{profile}</span>)}</div>{recommendationResult.intent.conflicts.map((conflict) => <p className="muted small" key={conflict.key}>{conflict.detail}</p>)}{recommendationResult.intent.notes.map((note) => <p className="muted small" key={note}>{note}</p>)}</div>}</section>
        {recommendationResult.lookahead && <section className="panel"><div className="section-heading"><div><div className="eyebrow">BOUNDED TWO-STEP PLAN</div><h2>Best two-step path</h2></div><span className="engine-version">top {recommendationResult.lookahead.firstStepLimit} · {recommendationResult.lookahead.futureDiscount} future discount</span></div>{recommendationResult.lookahead.comparison.differs && <div className="notice"><b>Immediate top: {recommendationResult.lookahead.comparison.immediateTopCandidate}</b><br/><b>Best two-step first pick: {recommendationResult.lookahead.comparison.bestPathFirstCandidate}</b><p className="muted small">{recommendationResult.lookahead.comparison.detail}</p></div>}{recommendationResult.lookahead.bestPath ? <FuturePathCard path={recommendationResult.lookahead.bestPath}/> : <p className="muted">No legal first-step path is available for this build.</p>}</section>}
        {recommendationResult.warnings.map((warning) => <div className="notice" key={warning}>{warning}</div>)}
        {recommendationResult.topRecommendation ? <section className="panel"><div className="eyebrow">TOP RECOMMENDATION</div><RecommendationCard recommendation={recommendationResult.topRecommendation} prominent/></section> : <section className="panel"><h2>No legal next tower</h2><p className="muted">Adjust tower slots, selected towers, or element allocation, then try again.</p></section>}
        {recommendationResult.candidates.length > 1 && <section className="panel"><div className="eyebrow">RANKED ALTERNATIVES</div><h2>Other contextual fits</h2><div className="recommendation-list">{recommendationResult.candidates.slice(1).map((item) => <RecommendationCard recommendation={item} key={item.candidate.towerName}/>)}</div></section>}
      </>}
    </section>
  </section>;

  return <main className="shell">
    <header className="top">
      <div className="brand"><div className="logo"/><div><b>ELEMENT TD 2 · BUILD LAB</b><span>FULL-STACK RESEARCH & DECISION PLATFORM</span></div></div>
      <span className="eyebrow">SEQUENTIAL v1</span>
    </header>

    <section className="hero">
      <div className="panel"><div className="eyebrow">THE BUILD IS THE DATASET</div><h1>Ask what the build needs next.</h1><p className="muted">Build Lab turns the current tower state into contextual next-tower recommendations. The Allocation Explorer remains available for its original core-allocation workflow.</p></div>
      <div className="panel stats"><div className="stat"><b>50</b><span>CATALOG TOWERS</span></div><div className="stat"><b>6</b><span>ELEMENTS</span></div><div className="stat"><b>{legalCount || "—"}</b><span>LEGAL CORE ALLOCATIONS</span></div><div className="stat"><b>{recommendationResult?.candidates.length ?? "—"}</b><span>NEXT-TOWER RESULTS</span></div></div>
    </section>

    <nav className="nav">{["Build Lab", "Allocation Explorer", "What If", "Core Explorer", "Tower Codex", "Research", "Debug"].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</nav>

    {tab === "Build Lab" ? buildLab : tab === "Allocation Explorer" ? allocationExplorer : <section className="panel"><div className="eyebrow">NEXT MODULE</div><h2 style={{ margin: "8px 0" }}>{tab}</h2><p className="muted">The route is reserved in the application shell. It will use the shared domain model rather than duplicate engine logic.</p></section>}

    <footer className="muted footer">Sequential recommendations are build-specific contextual values, not universal tower strength ratings.</footer>
  </main>;
}
