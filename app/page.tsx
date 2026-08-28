"use client";

import { useMemo, useState } from "react";
import type { Candidate, ElementName } from "@/lib/types";

const elements: ElementName[] = ["Light","Darkness","Water","Fire","Nature","Earth"];

export default function Home() {
  const [core, setCore] = useState<ElementName[]>(["Light","Darkness","Fire"]);
  const [results, setResults] = useState<Candidate[]>([]);
  const [legalCount, setLegalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("Build Lab");

  const summary = useMemo(()=>results[0],[results]);

  function updateCore(index:number, value:ElementName){
    setCore((prev)=>prev.map((x,i)=>i===index?value:x));
  }

  async function optimize(){
    setLoading(true);
    const res = await fetch("/api/optimize", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({core}) });
    const data = await res.json();
    if(res.ok){ setResults(data.results); setLegalCount(data.legalCount); }
    setLoading(false);
  }

  return <main className="shell">
    <header className="top">
      <div className="brand"><div className="logo"/><div><b>ELEMENT TD 2 · BUILD LAB</b><span>FULL-STACK RESEARCH & DECISION PLATFORM</span></div></div>
      <span className="eyebrow">FOUNDATION v0.1</span>
    </header>

    <section className="hero">
      <div className="panel"><div className="eyebrow">THE BUILD IS THE DATASET</div><h1>Turn Build Lab into a real application.</h1><p className="muted">This is the first vertical slice: the V8 catalog and mechanics records are now separated from the UI, allocation evaluation is server-side, and the architecture is ready for persistent research data, scenario history, and a real decision engine.</p></div>
      <div className="panel stats"><div className="stat"><b>50</b><span>CATALOG TOWERS</span></div><div className="stat"><b>6</b><span>ELEMENTS</span></div><div className="stat"><b>{legalCount || "—"}</b><span>LEGAL CORE ALLOCATIONS</span></div><div className="stat"><b>{results.length || "—"}</b><span>RETURNED CANDIDATES</span></div></div>
    </section>

    <nav className="nav">{["Build Lab","What If","Allocation Explorer","Core Explorer","Tower Codex","Research","Debug"].map((x)=><button key={x} className={tab===x?"active":""} onClick={()=>setTab(x)}>{x}</button>)}</nav>

    {tab !== "Build Lab" ? <section className="panel"><div className="eyebrow">NEXT MODULE</div><h2 style={{margin:"8px 0"}}>{tab}</h2><p className="muted">The route is reserved in the application shell. We will migrate this module onto the shared domain model instead of duplicating the old HTML/JS logic.</p></section> : <section className="workspace">
      <aside className="panel"><h2>Build focus</h2><p className="muted">Core = identity. Allocation = the actual 11-point strategy. Anchor, scenarios, evidence and the hierarchical V8 decision engine are the next layers.</p>
        {core.map((value,i)=><div className="field" key={i}><label>Core element {i+1}</label><select className="select" value={value} onChange={e=>updateCore(i,e.target.value as ElementName)}>{elements.map(e=><option key={e}>{e}</option>)}</select></div>)}
        <button className="primary" onClick={optimize} disabled={loading}>{loading?"Evaluating…":"Optimize build"}</button>
        <div style={{height:10}}/><div className="notice">Current evaluator is intentionally a foundation heuristic. The supplied V8 engine remains the source for the next migration pass; UNKNOWN mechanics are not converted into invented facts.</div>
      </aside>
      <section className="panel"><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"start"}}><div><div className="eyebrow">SERVER EVALUATION</div><h2 style={{margin:"7px 0"}}>Candidate allocations</h2></div>{summary&&<div style={{textAlign:"right"}}><div className="rank">Top foundation score</div><div className="score">{summary.score.toFixed(1)}</div></div>}</div>
        {!results.length ? <div className="notice" style={{marginTop:14}}>Choose your core and run the evaluator to populate candidates.</div> : <div className="grid" style={{marginTop:14}}>{results.slice(0,12).map((r,i)=><article className="tower" key={r.allocation.join("-")}><div className="rank">#{i+1} · {r.activeElements} active elements</div><h3 className="mono">{r.allocation.join(" · ")}</h3><div className="score">{r.score.toFixed(1)}</div><div className="bar"><i style={{width:`${Math.min(100,r.score)}%`}}/></div><div className="chips">{r.selected.map(t=><span className="chip" key={t.name}>{t.name}</span>)}</div></article>)}</div>}
      </section>
    </section>}

    <footer className="muted" style={{fontSize:11,textAlign:"center",marginTop:18}}>Foundation derived from the supplied Element TD 2 Build Lab V8 independent-evaluation engine.</footer>
  </main>;
}
