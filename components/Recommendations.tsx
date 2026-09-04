import { TowerVisual } from "./TowerVisual";
import { RecipeBadges } from "./ElementBadge";
import { AnalysisLoader } from "./AnalysisLoader";
import { humanizeEngineText, labelCapability, labelStrategicProfile, labelRankingComponent } from "@/lib/presentation-labels";
import type { RecommendationReason, SequentialRecommendationResponse, SerializedFuturePath, SerializedRankedCandidate } from "@/lib/types";

function Reasons({ title, reasons }: { title: string; reasons: readonly RecommendationReason[] }) {
  return reasons.length ? <div className="reason-group"><h4>{title}</h4><ul className="reason-list">{reasons.map((reason, index) => <li key={`${reason.key}-${index}`}>{humanizeEngineText(reason.detail)}</li>)}</ul></div> : null;
}

export function RecommendationCard({ recommendation, prominent = false }: { recommendation: SerializedRankedCandidate; prominent?: boolean }) {
  const warning = recommendation.warnings[0] ?? recommendation.tradeoffs[0];
  return <article className={`recommendation ${prominent ? "recommendation-hero" : "alternative-card"}`}>
    <div className="recommendation-main">
      <TowerVisual towerName={recommendation.candidate.towerName} size={prominent ? "hero" : "medium"}/>
      <div className="recommendation-copy">
        <div className="recommendation-kicker"><span className="eyebrow">{prominent ? "BEST NEXT MOVE" : `ALTERNATIVE / ${String(recommendation.rank).padStart(2, "0")}`}</span><span className={`category category-${recommendation.category}`}>{recommendation.category.replaceAll("-", " ")}</span></div>
        <h2>{recommendation.candidate.towerName}</h2>
        <div className="recommendation-meta">{recommendation.candidate.type} tower <span>·</span> Level {recommendation.candidate.initialLevel} <span>·</span> {recommendation.confidence} confidence</div>
        <RecipeBadges recipe={recommendation.candidate.recipe}/>
        <div className="pick-reason"><span className="eyebrow">WHY THIS PICK</span>{recommendation.strengths.length ? recommendation.strengths.slice(0, prominent ? 2 : 1).map((reason, index) => <p key={index}>{humanizeEngineText(reason.detail)}</p>) : <p>A legal addition for your current build. Evidence for a distinct advantage is limited.</p>}</div>
        {warning && <div className="pick-warning"><span aria-hidden="true">△</span><p>{humanizeEngineText(warning.detail)}</p></div>}
      </div>
    </div>
    <details className="component-details"><summary>Evidence & ranking details <span aria-hidden="true">＋</span></summary>
      <p className="muted small">Contextual value: {recommendation.contextualValue} · Maximum level: {recommendation.candidate.maxLevel}</p>
      {recommendation.intentAlignment && <p className="muted small">Intent: {recommendation.intentAlignment.status.replaceAll("-", " ")}. {recommendation.intentAlignment.matchedProfiles.map(labelStrategicProfile).join(", ")}{recommendation.intentAlignment.supportedFocalTowers.length ? ` · supports ${recommendation.intentAlignment.supportedFocalTowers.join(", ")}` : ""}</p>}
      <Reasons title="Strengths" reasons={recommendation.strengths}/><Reasons title="Tradeoffs" reasons={recommendation.tradeoffs}/><Reasons title="Warnings" reasons={recommendation.warnings}/>
      <ul className="component-list">{recommendation.components.map((component, index) => <li key={index}><span className={component.contribution < 0 ? "negative" : "positive"}>{component.contribution > 0 ? "+" : ""}{component.contribution}</span><span><b>{labelRankingComponent(component.component)}</b> · {humanizeEngineText(component.reason.detail)}</span></li>)}</ul>
    </details>
  </article>;
}

export function FuturePathCard({ path }: { path: SerializedFuturePath }) {
  return <div className="future-path">
    <div className="path-steps">
      <div className="path-step"><span className="eyebrow">01 / OPEN WITH</span><div><TowerVisual towerName={path.first.candidate.towerName} size="medium"/><span><h3>{path.first.candidate.towerName}</h3><p className="muted small">{path.first.candidate.type} · Level 1</p></span></div></div>
      <span className="path-connector" aria-hidden="true">→</span>
      <div className={`path-step ${path.second ? "" : "path-unavailable"}`}><span className="eyebrow">02 / CONTINUE WITH</span><div>{path.second ? <><TowerVisual towerName={path.second.candidate.towerName} size="medium"/><span><h3>{path.second.candidate.towerName}</h3><p className="muted small">{path.second.candidate.type} · Level 1</p></span></> : <><span className="path-stop" aria-hidden="true">—</span><span><h3>No legal continuation</h3><p className="muted small">This path ends after the first tower.</p></span></>}</div></div>
    </div>
    <p className="path-explanation">{humanizeEngineText(path.explanation.continuation)}</p>
    <details className="component-details"><summary>Path evidence & values <span aria-hidden="true">＋</span></summary><p className="muted small">Immediate {path.immediateValue} · Continuation {path.continuationValue ?? "unavailable"} · Path {path.pathValue} · {path.confidence} confidence</p><p className="muted small">{path.explanation.policy}</p>{(["strengths", "tradeoffs", "warnings"] as const).map((kind) => <Reasons key={kind} title={kind} reasons={path[kind].map((item) => ({ ...item.reason, detail: `${item.step === "first" ? "First" : "Second"}: ${item.reason.detail}` }))}/>)}</details>
  </div>;
}

function InterpretationDetails({ result }: { result: SequentialRecommendationResponse }) {
  const interpretation = result.interpretation;
  return <details className="panel engine-diagnostics"><summary>Why the engine thinks this <span className="engine-version">{result.engineVersion}</span></summary>
    <div className="summary-grid">
      <div><h3>Strategic profiles</h3>{interpretation.strategicProfiles.length ? interpretation.strategicProfiles.map((profile) => <p key={profile.key}><b>{labelStrategicProfile(profile.key)}</b><span className="muted small"> · {profile.confidence}</span><br/><span className="small muted">{humanizeEngineText(profile.rationale)}</span></p>) : <p className="muted">No active profiles yet.</p>}</div>
      <div><h3>Vulnerabilities</h3>{interpretation.vulnerabilities.length ? interpretation.vulnerabilities.map((item) => <p key={item.capability}><b>{labelCapability(item.capability)}</b><br/><span className="muted small">{humanizeEngineText(item.rationale)}</span></p>) : <p className="muted">No meaningful vulnerabilities identified.</p>}</div>
      <div><h3>Relevant gaps</h3>{interpretation.relevantGaps.length ? interpretation.relevantGaps.map((item) => <p key={item.capability}><b>{labelCapability(item.capability)}</b> · {item.status}<br/><span className="muted small">{humanizeEngineText(item.rationale)}</span></p>) : <p className="muted">No relevant gaps.</p>}</div>
      <div><h3>Compensations</h3>{interpretation.compensations.length ? interpretation.compensations.map((item) => <p key={item.gapCapability}><b>{labelCapability(item.gapCapability)}</b> via {item.compensatingCapabilities.map(labelCapability).join(", ")}<br/><span className="muted small">{humanizeEngineText(item.rationale)}</span></p>) : <p className="muted">No validated compensations active.</p>}</div>
    </div>
    {result.intent && <div className="intent-summary"><h3>Player intent · {result.intent.alignment.replaceAll("-", " ")}</h3><p>{result.intent.focusedTowers.map((focus) => `${focus.towerName} (${focus.priority})`).join(", ")}{result.intent.preferredProfiles.map(labelStrategicProfile).join(", ")}</p>{result.intent.conflicts.map((conflict) => <p key={conflict.key}>{humanizeEngineText(conflict.detail)}</p>)}{result.intent.notes.map((note) => <p key={note}>{humanizeEngineText(note)}</p>)}</div>}
  </details>;
}

export function RecommendationResults({ result, loading, error, twoStep }: {
  result: SequentialRecommendationResponse | null; loading: boolean; error: string | null; twoStep: boolean;
}) {
  if (loading) return <AnalysisLoader loading={loading} twoStep={twoStep}/>;
  if (error) return <section className="panel result-error" role="alert"><span className="eyebrow">ANALYSIS INTERRUPTED</span><h2>We couldn’t evaluate this build.</h2><p>{error}</p><p className="muted">Your lineup is still here. Check the build controls or try recommending again.</p></section>;
  if (!result) return <section className="panel result-empty"><div className="eyebrow">THE NEXT MOVE MATTERS</div><div className="empty-emblem" aria-hidden="true">◇<span>✦</span></div><h2>Build with purpose.</h2><p className="muted">Your towers tell a story.<br/>Find the next one that makes it stronger.</p><div className="empty-process"><span><b>01</b> Assemble</span><i>→</i><span><b>02</b> Analyze</span><i>→</i><span><b>03</b> Advance</span></div><p className="small muted">Add your lineup and select “Recommend next tower”.</p></section>;
  const concern = result.interpretation.vulnerabilities[0] ?? result.interpretation.relevantGaps.find((gap) => gap.status === "deficient");
  return <div className="result-stack result-reveal">
    <div className="results-status" role="status"><span>✓ Analysis ready</span><span>{result.candidates.length} ranked options</span></div>
    {result.topRecommendation ? <RecommendationCard recommendation={result.topRecommendation} prominent/> : <section className="panel result-empty no-candidates"><span className="eyebrow">CURRENT BUILD / NO AVAILABLE ADDITION</span><h2>No legal next tower.</h2><p className="muted">{result.noLegalCandidateReason?.message ?? result.warnings.join(" ")}</p></section>}
    {result.topRecommendation && result.lookahead?.bestPath && <section className="panel continuation-panel"><div className="section-heading"><div><span className="eyebrow">PLAN THE FOLLOW-THROUGH</span><h2>Best two-step path</h2></div><span className="subtle-tag">{result.lookahead.bestPath.confidence} confidence</span></div>
      {result.lookahead.comparison.differs && <div className="path-comparison"><span>Best immediate <b>{result.lookahead.comparison.immediateTopCandidate}</b></span><span>Best two-step opening <b>{result.lookahead.comparison.bestPathFirstCandidate}</b></span><p>{humanizeEngineText(result.lookahead.comparison.detail)}</p></div>}
      <FuturePathCard path={result.lookahead.bestPath}/>
    </section>}
    {result.candidates.length > 1 && <section className="alternatives"><div className="section-heading"><div><span className="eyebrow">OTHER WAYS FORWARD</span><h2>Worth considering</h2></div><span className="muted small">Ranked for this build</span></div><div className="recommendation-list">{result.candidates.slice(1).map((item) => <RecommendationCard recommendation={item} key={item.candidate.towerName}/>)}</div></section>}
    {concern && <section className="panel current-concern"><span className="eyebrow">KEEP AN EYE ON</span><h3>{labelCapability(concern.capability)}</h3><p className="muted small">{humanizeEngineText(concern.rationale)}</p></section>}
    <InterpretationDetails result={result}/>
  </div>;
}
