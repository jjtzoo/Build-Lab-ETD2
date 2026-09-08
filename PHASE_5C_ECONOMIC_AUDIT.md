# Phase 5C — Economic + Development Coherence Audit

Branch `feat/data-foundation`. Reconciled to the audited Element TD 2
tower formula workbook (recipes) and the repo's latest-live balance
reconciliation (stats). Search behaviour matches Phase 5B after the
`perf: memoize search decision vectors and package capital` fix.

## Cost-field semantics

`data/towerEconomics.v1.json` — `costSemantics: "cumulative-minimum-field-cost"`.
Each catalog value is the **total** verified gold to field one tower
directly at that level, not a per-upgrade increment. The engine returns
the indexed value directly and never sums earlier levels.

| Class | L1 | L2 | L3 | Source |
|---|---:|---:|---:|---|
| Dual | 500 | 1300 | 3300 | Official 1.3 announcement + dev DPS/Gold sheet |
| Trio | 1500 | 5000 | — | Dev DPS/Gold sheet |
| Quad | 4250 | — | — | Official 1.6 announcement |

`minimumNormalPackageCapital` = Σ (verified cumulative field cost of each
selected normal tower at its recommended level). No copy counts, army
spend, interest, farm income, or wave budgets.

## How capital enters the engine

- **Search candidate dominance** — capital is the lowest-priority
  dominance term: two candidates identical on every strategic dimension
  are separated by cost (cheaper removes its twin), but a cheaper yet
  strategically weaker candidate is never pruned by a more expensive one.
- **Search state / context Pareto** — among strategically equal states a
  strictly more expensive state cannot dominate a cheaper one.
- **Final ranking** (`decisionVector`) — `-minimumNormalPackageCapital`
  sits after all substantive strategic evidence and reachable-level
  totals and before package size. It breaks ties only.

There is no hard cap, no score-per-gold, and no generic cheap-tower
bias (`tests/engine/phase5cEconomicCoherence.test.ts` asserts the Laser
recommendation is strictly more expensive than the cheapest plan in its
own ranked set).

## Development classification

`developed` (reachable level == class max) · `underdeveloped` (below
class max) · `core-target` (any mandatory Anchor/Slow/Amp/Buff tower,
whatever its level — so an intentional Buff L2 is never flagged).
**Quad L1 is always `developed`** because L1 is the Quad normal maximum.

An `underdeveloped` post-core tower survives only with an
`explicitDevelopmentReasons` entry that is a real evidence gain
(critical element coverage, a defining full-strength interaction,
meaningful factual offense at its current level, a meaningful range
extension). "Reduces minimum capital" is explicitly excluded from that
list.

> **Superseded for Trio towers (branch `1e40f8e`).** A Trio (class max
> L2) may no longer enter the package as a discretionary L1 addition at
> all, even with a defining justification — the freed allocation is
> always better spent elsewhere. The `windstorm Trio L1` row below is
> retained only as a record of the pre-ban Laser Rank #1; the current
> engine does not produce it. Dual towers below L3 and Quad L1 are
> unaffected.

## Laser economic / development audit (engine Rank #1)

Allocation `L2 D2 W2 F1 N2 E2` · 10 tower types · minimum capital 39,800.

| Tower | Class / level | Status | Field cost | Purpose | Leave-one-out |
|---|---|---|---:|---|---|
| laser | Trio L2 | core-target | 5000 | main DPS | invalidates main-dps role |
| muck | Trio L2 | core-target | 5000 | slow | invalidates slow role |
| incantation | Trio L2 | core-target | 5000 | damage amp | invalidates damage-amp role |
| well | Dual L2 | core-target | 1300 | buff (intentional L2) | invalidates buff role |
| life-altar | Quad L1 | developed | 4250 | critical Earth coverage; kill-generation pair with shredder; amp-buff hub for doom/ethereal/laser/shredder | loses Earth counter + 5 full-strength interactions |
| ethereal | Trio L2 | developed | 5000 | meaningful offense; +500 range extension; ASPD/AD buff consumer | loses range extension + 2 interactions |
| doom | Quad L1 | developed | 4250 | meaningful offense; AD/ASPD/slow full-strength interactions | loses 3 interactions |
| shredder | Quad L1 | developed | 4250 | meaningful offense; kill-generation pair with life-altar; ASPD buff | loses 3 interactions |
| rage | Quad L1 | developed | 4250 | target-isolation full-strength for laser (0→4) and incantation (0→3) | loses the isolation interactions |
| windstorm | Trio **L1** | **underdeveloped** | 1500 | only enabler of `muck enemy-grouping 0→3` at this allocation | loses that grouping interaction |

Every post-core tower carries unique strategic evidence and a
leave-one-out consequence beyond "reduces minimum capital". The single
underdeveloped tower (windstorm L1, 1,500 g) has an explicit defining
interaction as its reason.

## Open observation for Phase 9

Laser Ranks #1–#3 are all 9–10 tower packages (capital 38,300 / 39,800 /
42,550). Each tower is individually defensible under this audit, but the
distribution audit in Phase 9 should confirm this is the real strategic
optimum and not a residual breadth incentive — in particular whether
`doom + ethereal + life-altar + shredder` all clearing as mutually
buffed developed offense reflects genuine Step 8 evidence weight rather
than provider stacking. No Step 8 strengths were altered in Phase 5C.

## Performance

Laser reference search (`rankAnchorBuildPlansWithDiagnostics("laser", 10)`),
isolated:

| | Phase 5B report | Pre-5C (this machine) | 5C committed | 5C + memo fix |
|---|---:|---:|---:|---:|
| Wall time | 6.32 s | ~8.3 s | ~14 s | **~7.3 s** |
| Packages evaluated | 10,347 | 10,442 | 15,164 | 15,164 |
| Max frontier | 105 | 105 | 105 | 105 |
| Truncation | none | none | none | none |

The 5C economic Pareto terms legitimately widen the frontier (~45% more
complete packages), but the memoization of `searchDecisionVector` and
`minimumNormalPackageCapital` more than absorbs the cost. Output is
byte-identical before and after the memo fix.
