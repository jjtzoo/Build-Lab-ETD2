"use client";

import { useEffect, useRef, useState } from "react";
import type { ElementName, SelectedTowerInput } from "@/lib/types";
import { TowerVisual } from "./TowerVisual";
import { RecipeBadges } from "./ElementBadge";

export type TowerOption = Readonly<{ name: string; type: string; recipe: ElementName[]; maxLevel: number }>;

function LineupTowerCard({ tower, level, onLevel, onRemove }: {
  tower: TowerOption; level: number;
  onLevel: (name: string, level: number) => void; onRemove: (name: string) => void;
}) {
  const [removing, setRemoving] = useState(false);
  const removalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (removalTimer.current) clearTimeout(removalTimer.current); }, []);

  function remove() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onRemove(tower.name); return; }
    setRemoving(true);
    removalTimer.current = setTimeout(() => onRemove(tower.name), 150);
  }

  return <article className={`selected-tower ${removing ? "tower-removing" : ""}`}>
    <TowerVisual towerName={tower.name}/>
    <div className="selected-tower-info"><div className="selected-title"><b>{tower.name}</b><span>{tower.type}</span></div><RecipeBadges recipe={tower.recipe}/>
      <div className="tower-controls"><label><span key={level} className="level-label">Level {level}</span><select aria-label={`${tower.name} level`} className="small-select" value={level} disabled={removing} onChange={(event) => onLevel(tower.name, Number(event.target.value))}>{Array.from({ length: tower.maxLevel }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label><button type="button" className="remove" aria-label={`Remove ${tower.name}`} disabled={removing} onClick={remove}>Remove</button></div>
    </div>
  </article>;
}

export function TowerSelector({ towers, onAdd, disabled }: {
  towers: readonly TowerOption[]; onAdd: (name: string) => void; disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const details = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const choices = towers.filter((tower) => `${tower.name} ${tower.type} ${tower.recipe.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  return <details className="tower-selector" ref={details} onKeyDown={(event) => {
    if (event.key === "Escape") { details.current?.removeAttribute("open"); trigger.current?.focus(); }
  }}>
    <summary ref={trigger}><span aria-hidden="true">＋</span> Add a tower <span className="selector-count">{towers.length} available</span></summary>
    <div className="tower-picker">
      <label className="sr-only" htmlFor="tower-search">Find a tower by name or element</label>
      <input id="tower-search" className="input" type="search" placeholder="Search towers or elements…" value={query} onChange={(event) => setQuery(event.target.value)}/>
      <div className="tower-options">
        {choices.map((tower) => <button type="button" className="tower-option" key={tower.name} disabled={disabled} aria-label={`Add ${tower.name}`} onClick={() => {
          onAdd(tower.name); setQuery(""); details.current?.removeAttribute("open"); trigger.current?.focus();
        }}><TowerVisual towerName={tower.name}/><span><b>{tower.name}</b><span className="option-type">{tower.type}</span><RecipeBadges recipe={tower.recipe}/></span><span className="option-add" aria-hidden="true">＋</span></button>)}
        {!choices.length && <p className="muted">No towers match this search.</p>}
      </div>
      {disabled && <p className="muted small">All tower slots are in use.</p>}
    </div>
  </details>;
}

export function CurrentBuild({ selected, towers, maxSlots, onLevel, onRemove }: {
  selected: readonly SelectedTowerInput[]; towers: readonly TowerOption[]; maxSlots: number;
  onLevel: (name: string, level: number) => void; onRemove: (name: string) => void;
}) {
  return <div className="current-lineup">
    <div className="lineup-heading"><span className="eyebrow">01 / CURRENT BUILD</span><span className="slot-summary"><b>{selected.length}</b> / {maxSlots} slots</span></div>
    <h2>Your tower lineup</h2>
    <p className="muted small">Choose your towers. Find your next advantage.</p>
    {!selected.length ? <div className="lineup-empty"><span className="empty-slot" aria-hidden="true">＋</span><b>Your strategy starts here</b><p>Add the towers you already have.<br/>Their elements are calculated automatically.</p></div> : <div className="selected-towers">
      {selected.map((selection) => {
        const tower = towers.find((entry) => entry.name === selection.towerName)!;
        return <LineupTowerCard key={selection.towerName} tower={tower} level={selection.level} onLevel={onLevel} onRemove={onRemove}/>;
      })}
    </div>}
  </div>;
}
