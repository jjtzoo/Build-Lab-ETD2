import { ELEMENTS, MECHANICS_BY_TOWER, TOWERS } from "@/lib/data";
import type { Allocation, Candidate, ElementName, Tower } from "@/lib/types";

export function legalAllocations(core: ElementName[]): Allocation[] {
  const out: Allocation[] = [];
  for (let a=0;a<=3;a++) for (let b=0;b<=3;b++) for (let c=0;c<=3;c++)
    for (let d=0;d<=3;d++) for (let e=0;e<=3;e++) for (let f=0;f<=3;f++) {
      const x: Allocation = [a,b,c,d,e,f];
      if (x.reduce((s,n)=>s+n,0)!==11) continue;
      if (core.some((name)=>x[ELEMENTS.indexOf(name)]<1)) continue;
      out.push(x);
    }
  return out;
}

export function unlockedTowers(a: Allocation): Tower[] {
  return TOWERS.filter((tower)=>tower.recipe.every((element)=>a[ELEMENTS.indexOf(element)]>=1));
}

function heuristicScore(tower: Tower, a: Allocation): number {
  const depth = Math.min(...tower.recipe.map((e)=>a[ELEMENTS.indexOf(e)]));
  const record = MECHANICS_BY_TOWER.get(tower.name);
  const tags = record?.strategic_roles ?? [];
  let score = depth * (tower.type === "Quad" ? 4 : tower.type === "Trio" ? 3 : 2);
  if (tags.includes("Main DPS")) score += 12;
  if (tags.includes("Control")) score += 7;
  if (tags.includes("Coverage")) score += 5;
  if (tags.includes("Support")) score += 3;
  if (tags.includes("Amplification")) score += 8;
  return score;
}

export function evaluateAllocation(a: Allocation): Candidate {
  const unlocked = unlockedTowers(a);
  const ranked = unlocked.slice().sort((x,y)=>heuristicScore(y,a)-heuristicScore(x,a));
  const selected = ranked.slice(0, Math.min(5, ranked.length));
  const score = selected.reduce((sum,t)=>sum+heuristicScore(t,a),0);
  return { allocation:a, score, activeElements:a.filter(Boolean).length, unlocked, selected };
}

export function optimize(core: ElementName[]): Candidate[] {
  return legalAllocations(core).map(evaluateAllocation).sort((a,b)=>b.score-a.score);
}
