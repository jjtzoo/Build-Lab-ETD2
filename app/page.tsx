"use client";

import { useMemo, useState } from "react";

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

function reasonList(title: string, reasons: readonly RecommendationReason[]) {
  if (reasons.length === 0) return null;
  return <div className="reason-group">
    <div className="reason-title">{title}</div>
    <ul className="reason-list">
      {reasons.map((reason, index) => <li key={`${reason.component}-${reason.key}-${index}`}>
        {humanizeEngineText(reason.detail)}
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
    {recommendation.intentAlignment && recommendation.intentAlignment.status !== "neutral" && <p className="muted small">Intent alignment: {recommendation.intentAlignment.status.replace("-", " ")}{recommendation.intentAlignment.matchedProfiles.length ? ` · ${recommendation.intentAlignment.matchedProfiles.map(labelStrategicProfile).join(", ")}` : ""}{recommendation.intentAlignment.supportedFocalTowers.length ? ` · supports ${recommendation.intentAlignment.supportedFocalTowers.join(", ")}` : ""}</p>}
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
          <span>{humanizeEngineText(component.reason.detail)}</span>
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
        <b>{item.step === "first" ? "First: " : "Second: "}</b>{humanizeEngineText(item.reason.detail)}
      </li>)}
    </ul>
  </div>;
}

function FuturePathCard({ path }: { path: SerializedFuturePath }) {
  return <article className="recommendation top-recommendation">
    <div className="recommendation-head">
      <div>
        <div className="rank">TWO-STEP PATH #{path.rank} · {path.confidence} confidence</div>
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
  const [towerToAdd, setTowerToAdd] = useState("Poison");
  const [buildDirection, setBuildDirection] = useState<BuildDirection>("engine");
  const [focalTower, setFocalTower] = useState("");
  const [intentPriority, setIntentPriority] = useState<"explore" | "balanced" | "maximum-depth">("balanced");
  const [preferredProfile, setPreferredProfile] = useState<StrategicProfileKey | "">("");
  const [intentMode, setIntentMode] = useState<"normal" | "explore">("normal");
  const [twoStepPlanning, setTwoStepPlanning] = useState(DEFAULT_TWO_STEP_PLANNING);
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
    setRecommendationResult(null);
    setRecommendationError(null);
  }

  function addTower() {
    if (buildAtCapacity) return;
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
      <div className="eyebrow">CURRENT BUILD</div><h2>What should your build do next?</h2><p className="muted">Add the towers you already have. Build Lab derives the minimum elements and evaluates the next decision for you.</p>
      <div className="slot-summary"><b>{selectedTowers.length} / {maxTowerSlots}</b><span>tower slots used</span></div>
      <div className="field"><label>Add tower</label><div className="inline-field"><select className="select" value={availableTowers.some((tower) => tower.name === towerToAdd) ? towerToAdd : availableTowers[0]?.name ?? ""} onChange={(event) => setTowerToAdd(event.target.value)} disabled={availableTowers.length === 0 || buildAtCapacity}>{availableTowers.map((tower) => <option key={tower.name} value={tower.name}>{tower.name} · {tower.type}</option>)}</select><button className="btn" onClick={addTower} disabled={availableTowers.length === 0 || buildAtCapacity}>Add</button></div>{buildAtCapacity && <p className="muted small">All tower slots are in use.</p>}</div>
      {selectedTowerDetails.length === 0 ? <div className="notice">Start with the towers already in your build. Their element requirements are filled in automatically.</div> : <div className="selected-towers">{selectedTowerDetails.map(({ selected, tower }) => <div className="selected-tower" key={selected.towerName}><div><b>{selected.towerName}</b><span>{tower?.type} · {tower?.recipe.join(" + ")}</span></div><div className="tower-controls"><label>Level<select className="small-select" value={selected.level} onChange={(event) => updateTowerLevel(selected.towerName, Number(event.target.value))}>{Array.from({ length: tower?.maxLevel ?? 1 }, (_, index) => index + 1).map((level) => <option key={level} value={level}>{level}</option>)}</select></label><button className="remove" onClick={() => removeTower(selected.towerName)}>Remove</button></div></div>)}</div>}
      <section className="derived-elements" aria-label="Derived elements"><div className="eyebrow">DERIVED ELEMENTS</div>{requiredElements.length ? <div className="derived-element-list">{requiredElements.map((element) => <div key={element}><span>{element}</span><b>{requiredElementAllocation[element]}</b></div>)}</div> : <p className="muted small">Add a tower to see its required elements.</p>}<p className="muted small">Automatically required by your selected towers.</p></section>
      <div className="field"><label>Build direction</label><select className="select" value={buildDirection} onChange={(event) => { setBuildDirection(event.target.value as BuildDirection); markBuildChanged(); }}><option value="engine">Let engine decide</option><option value="tower">Build around a tower</option><option value="wave-clear">Improve wave clear</option><option value="boss-damage">Improve boss damage</option><option value="control">Improve control</option><option value="explore">Explore alternatives</option></select></div>
      {buildDirection === "tower" && <div className="field"><label>Build around which tower?</label><select className="select" value={focalTower} onChange={(event) => { setFocalTower(event.target.value); markBuildChanged(); }}><option value="">Choose a tower</option>{towerOptions.map((tower) => <option key={tower.name} value={tower.name}>{tower.name}</option>)}</select></div>}
      <details className="advanced-controls"><summary>Advanced build controls</summary><div className="advanced-content">
        <div className="field"><label>Manual element allocation <span>cannot reduce derived levels</span></label><p className="muted small">Optional investment can unlock more catalog towers. The effective allocation stays at or above your selected towers’ requirements.</p><div className="element-grid">{elements.map((element) => <label className="element-input" key={element}><span>{element}</span><input className="input" type="number" min={requiredElementAllocation[element]} step={1} value={effectiveElementAllocation[element]} onChange={(event) => updateElement(element, event.target.value)}/></label>)}</div></div>
        <div className="field"><label>Maximum tower slots</label><input className="input" type="number" min={0} step={1} value={maxTowerSlots} onChange={(event) => updateSlotLimit(event.target.value)}/></div>
        <div className="field"><label>Exact intent priority</label><select className="select" value={intentPriority} onChange={(event) => { setIntentPriority(event.target.value as typeof intentPriority); markBuildChanged(); }}><option value="explore">Explore · weak preference</option><option value="balanced">Balanced · shared influence</option><option value="maximum-depth">Maximum depth · strong preference</option></select></div>
        <div className="field"><label>Exact desired profile</label><select className="select" value={preferredProfile} onChange={(event) => { setPreferredProfile(event.target.value as StrategicProfileKey | ""); markBuildChanged(); }}><option value="">Use build direction default</option>{strategicProfileOptions.map((profile) => <option key={profile.key} value={profile.key}>{profile.label}</option>)}</select></div>
        <div className="field"><label>Intent mode</label><select className="select" value={intentMode} onChange={(event) => { setIntentMode(event.target.value as typeof intentMode); markBuildChanged(); }}><option value="normal">Normal · preserve coherence</option><option value="explore">Explore · modest breadth</option></select></div>
        <div className="field"><label>Planning horizon</label><label className="planning-toggle"><input type="checkbox" checked={twoStepPlanning} onChange={(event) => { setTwoStepPlanning(event.target.checked); markBuildChanged(); }}/> Compare the best legal two-step path</label><p className="muted small">Enabled by default. Turn this off for the original one-step API behavior.</p></div>
      </div></details>
      {buildInputIssue && <p className="error-message" role="alert">{buildInputIssue}</p>}
      <button className="primary" onClick={recommendNextTower} disabled={recommendationLoading || Boolean(buildInputIssue)}>{recommendationLoading ? "Evaluating recommendations…" : "Recommend next tower"}</button>
      {recommendationError && <p className="error-message" role="alert">{recommendationError}</p>}
    </aside>
    <section className="recommendation-results">
      {!recommendationResult ? <section className="panel"><div className="eyebrow">SEQUENTIAL ENGINE</div><h2>Next-tower recommendations</h2><p className="muted">The engine evaluates your current build on the server and explains a useful next decision.</p>{selectedTowers.length === 0 && <div className="notice">Add the towers in your current build, then get a recommendation.</div>}</section> : <>
        {recommendationResult.topRecommendation ? <section className="panel"><div className="eyebrow">BEST NEXT TOWER</div><h2>Your best next tower</h2><RecommendationCard recommendation={recommendationResult.topRecommendation} prominent/></section> : <section className="panel"><div className="eyebrow">NEXT STEP UNAVAILABLE</div><h2>No legal next tower</h2><p className="muted">{recommendationResult.noLegalCandidateReason?.message ?? "No legal next tower is available for this build."}</p></section>}
        {recommendationResult.topRecommendation && recommendationResult.lookahead && <section className="panel"><div className="section-heading"><div><div className="eyebrow">BEST TWO-STEP PATH</div><h2>Best two-step continuation</h2></div><span className="engine-version">two-step planning</span></div>{recommendationResult.lookahead.comparison.differs && <div className="notice"><b>Best immediate pick: {recommendationResult.lookahead.comparison.immediateTopCandidate}</b><br/><b>Best planned first pick: {recommendationResult.lookahead.comparison.bestPathFirstCandidate}</b><p className="muted small">{humanizeEngineText(recommendationResult.lookahead.comparison.detail)}</p></div>}{recommendationResult.lookahead.bestPath ? <FuturePathCard path={recommendationResult.lookahead.bestPath}/> : <p className="muted">No legal first-step path is available for this build.</p>}</section>}
        {(recommendationResult.interpretation.vulnerabilities[0] || recommendationResult.interpretation.relevantGaps.find((gap) => gap.status === "deficient")) && <section className="panel current-concern"><div className="eyebrow">CURRENT BUILD WATCHOUT</div>{recommendationResult.interpretation.vulnerabilities[0] ? <><h2>{labelCapability(recommendationResult.interpretation.vulnerabilities[0].capability)} is the key vulnerability</h2><p className="muted">{humanizeEngineText(recommendationResult.interpretation.vulnerabilities[0].rationale)}</p></> : (() => { const gap = recommendationResult.interpretation.relevantGaps.find((item) => item.status === "deficient"); return gap ? <><h2>{labelCapability(gap.capability)} needs attention</h2><p className="muted">{humanizeEngineText(gap.rationale)}</p></> : null; })()}</section>}
        <details className="panel interpretation-summary engine-diagnostics"><summary><span><span className="eyebrow">ENGINE DIAGNOSTICS</span><b>Why the engine thinks this</b></span><span className="engine-version">{recommendationResult.engineVersion}</span></summary><div className="summary-grid"><div><h3>Strategic profiles</h3>{recommendationResult.interpretation.strategicProfiles.length ? <div className="chips">{recommendationResult.interpretation.strategicProfiles.map((profile) => <span className="chip" key={profile.key}>{labelStrategicProfile(profile.key)}</span>)}</div> : <p className="muted small">No active strategic profiles yet.</p>}</div><div><h3>Vulnerabilities</h3>{recommendationResult.interpretation.vulnerabilities.length ? <ul className="compact-list">{recommendationResult.interpretation.vulnerabilities.map((vulnerability) => <li key={vulnerability.capability}>{labelCapability(vulnerability.capability)}</li>)}</ul> : <p className="muted small">No meaningful vulnerabilities identified.</p>}</div><div><h3>Relevant gaps</h3>{recommendationResult.interpretation.relevantGaps.length ? <ul className="compact-list">{recommendationResult.interpretation.relevantGaps.map((gap) => <li key={gap.capability}>{labelCapability(gap.capability)} · {gap.status}</li>)}</ul> : <p className="muted small">No relevant gaps identified.</p>}</div><div><h3>Compensations</h3>{recommendationResult.interpretation.compensations.length ? <ul className="compact-list">{recommendationResult.interpretation.compensations.map((compensation) => <li key={compensation.gapCapability}>{labelCapability(compensation.gapCapability)} via {compensation.compensatingCapabilities.map(labelCapability).join(", ")}</li>)}</ul> : <p className="muted small">No validated compensations active.</p>}</div></div>{recommendationResult.intent && <div className="notice"><b>Player intent · {recommendationResult.intent.alignment.replace("-", " ")}</b><div className="chips">{recommendationResult.intent.focusedTowers.map((focus) => <span className="chip" key={focus.towerName}>{focus.towerName} · {focus.priority}</span>)}{recommendationResult.intent.preferredProfiles.map((profile) => <span className="chip" key={profile}>{labelStrategicProfile(profile)}</span>)}</div>{recommendationResult.intent.conflicts.map((conflict) => <p className="muted small" key={conflict.key}>{humanizeEngineText(conflict.detail)}</p>)}{recommendationResult.intent.notes.map((note) => <p className="muted small" key={note}>{humanizeEngineText(note)}</p>)}</div>}</details>
        {recommendationResult.candidates.length > 1 && <section className="panel"><div className="eyebrow">RANKED ALTERNATIVES</div><h2>Other contextual fits</h2><div className="recommendation-list">{recommendationResult.candidates.slice(1).map((item) => <RecommendationCard recommendation={item} key={item.candidate.towerName}/>)}</div></section>}
      </>}
    </section>
  </section>;

  const debugPanel = !recommendationResult ? <section className="panel"><div className="eyebrow">DEVELOPMENT DIAGNOSTICS</div><h2>Run a recommendation first</h2><p className="muted">The debug view is intentionally separate from the player-facing result. It shows the engine evidence used by the most recent Build Lab recommendation.</p></section> : <section className="recommendation-results">
    <section className="panel interpretation-summary"><div className="section-heading"><div><div className="eyebrow">BASE BUILD INTERPRETATION</div><h2>Current evidence</h2></div><span className="engine-version">{recommendationResult.engineVersion}</span></div><div className="summary-grid"><div><h3>Strategic profiles</h3><div className="chips">{recommendationResult.interpretation.strategicProfiles.map((profile) => <span className="chip" key={profile.key}>{labelStrategicProfile(profile.key)} · {profile.confidence}</span>)}</div></div><div><h3>Vulnerabilities</h3>{recommendationResult.interpretation.vulnerabilities.length ? <ul className="compact-list">{recommendationResult.interpretation.vulnerabilities.map((vulnerability) => <li key={vulnerability.capability}>{labelCapability(vulnerability.capability)} · {vulnerability.confidence}</li>)}</ul> : <p className="muted small">None identified.</p>}</div><div><h3>Requirements / gaps</h3>{recommendationResult.interpretation.relevantGaps.length ? <ul className="compact-list">{recommendationResult.interpretation.relevantGaps.map((gap) => <li key={gap.capability}>{labelCapability(gap.capability)} · {gap.status}</li>)}</ul> : <p className="muted small">None relevant.</p>}</div><div><h3>Compensations</h3>{recommendationResult.interpretation.compensations.length ? <ul className="compact-list">{recommendationResult.interpretation.compensations.map((compensation) => <li key={compensation.gapCapability}>{labelCapability(compensation.gapCapability)} via {compensation.compensatingCapabilities.map(labelCapability).join(", ")}</li>)}</ul> : <p className="muted small">None validated.</p>}</div></div>{recommendationResult.intent && <div className="notice"><b>Resolved intent · {recommendationResult.intent.alignment.replace("-", " ")}</b><p className="muted small">Mode: {recommendationResult.intent.mode}. Focus: {recommendationResult.intent.focusedTowers.map((focus) => `${focus.towerName} (${focus.priority}, ${focus.selected ? "selected" : "not selected"})`).join(", ") || "none"}. Profiles: {recommendationResult.intent.preferredProfiles.map(labelStrategicProfile).join(", ") || "none"}.</p>{recommendationResult.intent.conflicts.map((conflict) => <p className="muted small" key={conflict.key}>{humanizeEngineText(conflict.detail)}</p>)}{recommendationResult.intent.notes.map((note) => <p className="muted small" key={note}>{humanizeEngineText(note)}</p>)}</div>}</section>
    <section className="panel"><div className="eyebrow">CANDIDATE WHY</div><h2>Contextual component audit</h2><p className="muted small">Every contribution shown here is already present in the ranking response. This view adds no scoring logic.</p><div className="recommendation-list">{recommendationResult.candidates.map((candidate) => <CandidateDiagnostic recommendation={candidate} key={candidate.candidate.towerName}/>)}</div></section>
    {recommendationResult.lookahead && <section className="panel"><div className="eyebrow">FUTURE-PATH AUDIT</div><h2>Bounded policy and continuation</h2><p className="muted small">First-step limit: {recommendationResult.lookahead.firstStepLimit}. Immediate weight: {recommendationResult.lookahead.immediateWeight}. Continuation discount: {recommendationResult.lookahead.futureDiscount}.</p>{recommendationResult.lookahead.bestPath ? <div className="notice"><b>{recommendationResult.lookahead.bestPath.first.candidate.towerName} → {recommendationResult.lookahead.bestPath.second?.candidate.towerName ?? "No legal continuation"}</b><p className="muted small">Immediate value {recommendationResult.lookahead.bestPath.immediateValue}; continuation value {recommendationResult.lookahead.bestPath.continuationValue ?? "unavailable"}; path value {recommendationResult.lookahead.bestPath.pathValue}; {recommendationResult.lookahead.bestPath.confidence} confidence; continuation {recommendationResult.lookahead.bestPath.continuationStatus}.</p><p className="muted small">{recommendationResult.lookahead.comparison.detail}</p></div> : <p className="muted">No legal first-step path is available.</p>}</section>}
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

    {tab === "Build Lab" ? buildLab : tab === "Allocation Explorer" ? allocationExplorer : tab === "Debug" ? debugPanel : <section className="panel"><div className="eyebrow">NEXT MODULE</div><h2 style={{ margin: "8px 0" }}>{tab}</h2><p className="muted">The route is reserved in the application shell. It will use the shared domain model rather than duplicate engine logic.</p></section>}

    <footer className="muted footer">Sequential recommendations are build-specific contextual values, not universal tower strength ratings.</footer>
  </main>;
}
