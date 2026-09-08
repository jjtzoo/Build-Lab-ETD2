# Phase 9 — Top-3 recommendations and 22-anchor validation

Branch tip `9a0b4e0`. `buildRecommendationSet(anchor)` returns the engine
recommendation (`rank-1`) plus up to two materially distinct,
non-manufactured alternatives from the same planner run, each with a
comparison to the recommendation (capital / allocation / package-size
deltas, tower substitutions, human-readable improves / worsens, derived
labels) and a full EARLY/MID/LATE/END GAME progression.

Alternatives are lower-ranked combined plans that differ from the
recommendation by allocation, ≥2 tower substitutions, a different
Essence package, or a ≥3000-gold capital gap. No diversity is forced; if
fewer than three distinct plans exist, fewer are returned.

## All 22 curated anchors — engine recommendation (rank 1)

Allocation fingerprint is `L-D-W-F-N-E`.

| Anchor | Alloc | Pkg | Complete gold | Underdev | Quads | Endgame | Alternatives | ms |
|---|---|---:|---:|---:|---:|---|---|---:|
| atom | 3-0-2-2-1-3 | 6 | 47850 | 1 | 1 | earth + light | #2 route, #3 Wider Utility | 114 |
| poison | 0-3-3-2-1-2 | 9 | 56850 | 2 | 3 | darkness + water | #2/#3 Lower Capital + Smaller | 110 |
| vapor | 2-2-3-3-1-0 | 8 | 56100 | 1 | 2 | fire + water | #2/#3 route | 44 |
| infernal | 0-3-1-3-2-2 | 9 | 57600 | 2 | 2 | darkness x2 | #2/#3 Smaller Package | 64 |
| bloom | 3-0-1-2-3-2 | 7 | 54850 | 0 | 3 | light + nature | #3 More Developed | 68 |
| howitzer | 0-3-1-2-2-3 | 9 | 54850 | 3 | 1 | darkness x2 | #3 Smaller Package | 88 |
| lightning | 3-2-1-3-2-0 | 9 | 57600 | 2 | 2 | fire + light | #2/#3 route | 71 |
| disease | 2-3-1-0-3-2 | 8 | 53600 | 2 | 2 | nature x2 | #2 More Developed + Wider, #3 Stronger Synergy | 50 |
| ice | 3-2-3-2-0-1 | 8 | 56100 | 1 | 2 | light x2 | #3 Lower Capital + Smaller + More Developed | 44 |
| solar | 0-2-1-3-3-2 | 9 | 54100 | 3 | 2 | nature x2 | #2/#3 More Developed + Wider | 50 |
| mushroom | 2-0-1-2-3-3 | 8 | 56350 | 1 | 3 | earth + nature | #2 Stronger Synergy, #3 Lower Capital + Smaller | 34 |
| geyser | 2-0-3-2-1-3 | 7 | 54850 | 0 | 3 | water x2 | #2 More Developed, #3 Stronger Synergy | 41 |
| astral | 2-3-2-0-1-3 | 8 | 60600 | 0 | 2 | darkness x2 | #2/#3 Stronger Synergy | 346 |
| runic | 2-2-1-2-2-2 | 10 | 67300 | 1 | 4 | periodic x2 | #2/#3 route | 1822 |
| flooding | 1-2-2-2-2-2 | 10 | 70800 | 0 | 4 | periodic x2 | #3 Lower Capital + Smaller | 860 |
| flamethrower | 1-2-2-2-2-2 | 10 | 67300 | 1 | 4 | periodic x2 | #3 Lower Capital | 3044 |
| impulse | 1-2-2-2-2-2 | 9 | 66550 | 0 | 3 | periodic x2 | #2/#3 route | 493 |
| laser | 2-2-2-1-2-2 | 10 | 67300 | 1 | 4 | periodic x2 | #2 Stronger Synergy + Smaller | 1773 |
| ethereal | 2-3-1-0-2-3 | 7 | 55600 | 0 | 2 | darkness + earth | #2 Stronger Synergy, #3 More Developed | 1974 |
| wisp | 2-1-2-2-2-2 | 9 | 65800 | 0 | 4 | periodic x2 | #2/#3 route | 1580 |
| haste | 1-2-2-2-2-2 | 10 | 67850 | 1 | 3 | periodic x2 | #2/#3 route | 1601 |
| quake | 1-2-2-2-2-2 | 9 | 62300 | 1 | 4 | periodic x2 | #3 Smaller Package | 1328 |

## Distribution audit

| Metric | Result |
|---|---|
| Package size | min 6, median 9, max 10 |
| Complete-plan capital | min 47,850, median 57,600, max 70,800 |
| Underdeveloped post-core towers (rank-1, summed over 22) | 23 (~1 per plan) |
| Quad selections (rank-1, summed) | 60 (~2.7 per plan) |
| Life Altar in the rank-1 package | 14 / 22 |
| Periodic Essence uses (rank-1) | 16 (8 anchors run Periodic x2) |
| **Pure Fire x2 packages** | **0** |
| Pure copy counts (rank-1 endgame) | Darkness 8, Nature 6, Light 5, Water 4, Earth 3, Fire 2 |
| Breadth-only winners | 0 |
| Truncation | none on any anchor |
| Full 22-anchor recommendation run | 15.6 s total, max 3.0 s (flamethrower) |

## Findings

- **The Fire hypothesis is not supported.** On the reconciled post-1.9.4
  numbers Pure Fire's sustained output is the lowest of the Pure roster
  (51,840 base DPS vs Nature 143,640). Fire never appears as a doubled
  Essence pick and only twice as a single copy. No model term
  suppresses it — its base damage is simply low and Blaze's ramp does
  not close the gap over a 20-second engagement.

- **Trio anchors converge on 2-2-2-2-2-1 → Periodic x2.** Reaching every
  element at L1 unlocks Periodic and a wide Quad pool; the planner then
  fills the 3 post-core keystones with developed Quads. Every tower is
  individually justified (0-1 underdeveloped, breadth-winners = 0), but
  9-10 distinct tower types is a heavy field requirement — this is the
  single biggest open question about the current Step 8 evidence
  weights, carried over from the Phase 5C audit. No Step 8 strength was
  altered.

- **Life Altar appears in 64% of rank-1 packages.** It is a Nature Quad
  ({Light, Water, Nature, Earth}) that both buffs neighbours and pairs
  with Shredder for kill generation, so it satisfies several
  justification atoms at once. Worth a dedicated look at whether its
  mechanic facts over-credit it.

- **Alternatives are honest, not padded.** Many #2/#3 entries are
  "route" variants (identical package, different keystone order) because
  within a given anchor's top combined plans the genuinely distinct
  options are keystone-path choices. Where real substitutions exist the
  labels reflect them (Smaller Package, Lower Capital, Stronger Synergy,
  More Developed Package, Wider Utility).

## Performance note

The Phase 5B Laser stress case now completes in ~1.7 s isolated (was
6.3 s in the Phase 5B report) after the dominance-loop memoizations. The
densest Trio anchors (flamethrower, ethereal) top out around 2-3 s. The
need-directed architecture, frontier caps, and dominance rules are
unchanged; only redundant recomputation was removed.
