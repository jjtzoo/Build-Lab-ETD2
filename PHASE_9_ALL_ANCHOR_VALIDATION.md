# Phase 9 — Top-3 recommendations and 22-anchor validation

Branch tip `1e40f8e` (Trio-L1 ban + realized-buff-magnitude ranking).
`buildRecommendationSet(anchor)` returns the engine recommendation
(`rank-1`) plus up to two materially distinct, non-manufactured
alternatives from the same planner run, each with a comparison to the
recommendation (capital / allocation / package-size deltas, tower
substitutions, human-readable improves / worsens, derived labels) and a
full EARLY/MID/LATE/END GAME progression.

Alternatives are lower-ranked combined plans that differ from the
recommendation by allocation, ≥2 tower substitutions, a different
Essence package, or a ≥3000-gold capital gap. No diversity is forced; if
fewer than three distinct plans exist, fewer are returned.

## Doctrine changes since the previous run (`9a0b4e0`)

1. **No Trio tower at L1 as a discretionary addition.** A Trio (canonical
   maxLevel 2) may only enter the package developed, at L2. Mandatory-core
   Trios are unaffected. This removes the "underdeveloped Trio with a
   unique pair-only justification" additions (Polar/Disease-style) that
   the previous run produced.
2. **Realized scaling-buff magnitude is a ranking dimension.** Blacksmith
   and Well scale their team buff 10 → 30 → 90 across L1–L3.
   `PlannerDecision.realizedBuffMagnitude` sums the verified percent
   magnitude the package actually realises (flat Quad buffs excluded). It
   sits below core development, anchor synergy and coverage, and above
   persistent/full synergy potency and breadth — so buff L3 can outrank
   one more discretionary tower.

## All 22 curated anchors — engine recommendation (rank 1)

Allocation fingerprint is `L-D-W-F-N-E`.

| Anchor | Alloc | Pkg | Complete gold | Underdev | Quads | Endgame | Alternatives | ms |
|---|---|--:|--:|--:|--:|---|---|--:|
| atom | 3-0-2-2-1-3 | 6 | 50600 | 1 | 2 | pure-earth + pure-light | #2 Wider Utility, #3 More Developed Package | 90 |
| poison | 0-3-3-2-1-2 | 8 | 52400 | 3 | 2 | pure-darkness + pure-water | #2 route, #3 Smaller Package/Wider Utility | 50 |
| vapor | 2-1-3-3-0-2 | 6 | 51350 | 1 | 1 | pure-fire + pure-water | #2 Stronger Synergy, #3 Stronger Synergy | 38 |
| infernal | 0-3-2-3-1-2 | 8 | 56100 | 2 | 2 | pure-darkness x2 | #2 route, #3 route | 56 |
| bloom | 3-0-1-2-3-2 | 7 | 54850 | 1 | 3 | pure-light + pure-nature | #2 More Developed Package, #3 Lower Capital/Smaller Package/More Developed Package | 37 |
| howitzer | 0-3-2-2-1-3 | 8 | 56100 | 2 | 2 | pure-darkness x2 | #2 Stronger Synergy/More Developed Package, #3 route | 35 |
| lightning | 3-2-1-3-2-0 | 8 | 56100 | 2 | 2 | pure-fire + pure-light | #2 route, #3 route | 28 |
| disease | 0-3-1-2-3-2 | 8 | 56100 | 2 | 2 | pure-nature x2 | #2 route, #3 Smaller Package/Wider Utility | 31 |
| ice | 3-1-3-2-0-2 | 7 | 56350 | 1 | 1 | pure-light x2 | #2 Stronger Synergy/Lower Capital/Smaller Package/More Developed Package, #3 Stronger Synergy | 35 |
| solar | 0-2-1-3-3-2 | 8 | 55350 | 2 | 3 | pure-nature x2 | #2 More Developed Package/Wider Utility, #3 More Developed Package/Wider Utility | 30 |
| mushroom | 0-2-1-2-3-3 | 7 | 51100 | 2 | 2 | pure-earth + pure-nature | #2 Stronger Synergy/Wider Utility, #3 More Developed Package/Wider Utility | 26 |
| geyser | 2-0-3-2-1-3 | 7 | 54850 | 1 | 3 | pure-water x2 | #2 More Developed Package, #3 Stronger Synergy | 25 |
| astral | 2-3-2-0-1-3 | 8 | 60600 | 1 | 2 | pure-darkness x2 | #2 Stronger Synergy, #3 Stronger Synergy | 238 |
| runic | 2-2-1-2-2-2 | 10 | 70800 | 1 | 4 | periodic x2 | #2 route, #3 Lower Capital/Smaller Package | 818 |
| flooding | 1-2-2-2-2-2 | 10 | 70800 | 1 | 4 | periodic x2 | #2 Lower Capital/Smaller Package, #3 Lower Capital/Smaller Package | 296 |
| flamethrower | 0-2-2-3-1-3 | 8 | 59050 | 1 | 3 | pure-earth + pure-fire | #2 route, #3 Stronger Synergy | 767 |
| impulse | 1-2-2-2-2-2 | 9 | 66550 | 1 | 3 | periodic x2 | #2 route, #3 route | 242 |
| laser | 2-2-1-2-2-2 | 10 | 70050 | 1 | 5 | periodic x2 | #2 More Developed Package, #3 route | 814 |
| ethereal | 2-3-1-0-2-3 | 8 | 60600 | 1 | 2 | pure-darkness + pure-earth | #2 Lower Capital/Smaller Package, #3 Lower Capital/Smaller Package | 830 |
| wisp | 2-1-2-2-2-2 | 9 | 65800 | 1 | 4 | periodic x2 | #2 route, #3 Lower Capital/Smaller Package | 629 |
| haste | 0-2-2-3-1-3 | 8 | 59050 | 1 | 3 | pure-earth + pure-fire | #2 Stronger Synergy, #3 Stronger Synergy | 741 |
| quake | 2-1-2-2-2-2 | 8 | 60800 | 1 | 4 | periodic x2 | #2 More Developed Package/Stronger Endgame, #3 Stronger Synergy | 393 |

## Distribution audit

| Metric | Result | vs `9a0b4e0` |
|---|---|---|
| Package size | min 6, median 8, max 10, mean 8.0 | median 9 → 8 |
| Complete-plan capital | min 50,600, median 56,350, max 70,800 | — |
| Underdeveloped post-core (rank-1, summed) | 30 | counts Duals below L3 |
| Quad selections (rank-1, summed) | 59 (~2.7 per plan) | 60 → 59 |
| Life Altar in the rank-1 package | 11 / 22 | 14 → 11 |
| Blacksmith or Well developed to L3 (rank-1) | 2 / 22 (flamethrower, haste) | new |
| Periodic Essence uses (rank-1) | 12 (6 anchors run Periodic x2) | 16 → 12 |
| **Pure Fire x2 packages** | **0** | unchanged |
| Pure copy counts (rank-1 endgame) | Darkness 8, Nature 6, Earth 5, Light 5, Fire 4, Water 4 | Fire 2 → 4 |
| Breadth-only winners | 0 | unchanged |
| Truncation | none on any anchor | unchanged |
| Full 22-anchor recommendation run | 6.2 s total, max 0.83 s (ethereal) | 15.6 s → 6.2 s |

## Findings

- **The Fire hypothesis is still not supported.** Pure Fire is never a
  doubled Essence pick. It now appears as a single copy four times (was
  twice) because the Trio-L1 ban reshaped several Trio-anchor allocations
  away from all-six-at-L1, which makes a Fire-heavy allocation (and a
  Pure Fire single) competitive where Periodic x2 previously won. No
  model term suppresses Fire; its base damage is simply low.

- **The Trio-L1 ban leaned Trio anchors off Periodic x2.** flamethrower
  (1-2-2-2-2-2 → 0-2-2-3-1-3), haste, vapor and lightning now field a
  Pure pair instead of Periodic x2. Reaching all six elements at L1 is no
  longer "free": the keystones that used to unlock a wide L1 Trio pool
  now have no legal L1 Trio to justify them, so concentrated allocations
  Pareto-dominate. runic / flooding / laser still converge on
  2-2-2-2-2-1 → Periodic x2 with 10-tower packages — their Quad pool is
  deep enough to justify the spread without any Trio-L1.

- **Buff development now competes with breadth.** flamethrower and haste
  take Blacksmith L3 (realized buff magnitude 90) with an 8-tower package
  instead of Blacksmith L2 + two more towers. For the other 20 anchors
  the allocation cannot reach a scaling buff at L3 while keeping the core
  developed, so the buff stays at L2 and the term is inert — it never
  overrides coverage or anchor synergy.

- **Life Altar down to 50%.** Excluding its flat Quad buff from
  `realizedBuffMagnitude` and removing Trio-L1 partners (Shredder pairs)
  cut its appearances from 14 to 11. Still worth a dedicated look at
  whether its mechanic facts over-credit it.

- **Alternatives remain honest.** "route" entries are identical packages
  with a different keystone order; substitution labels (Smaller Package,
  Lower Capital, Stronger Synergy, More Developed Package, Wider Utility)
  reflect real evidence deltas.

## Performance note

Removing Trio-L1 candidates before justification-graph construction cut
the full 22-anchor run from 15.6 s to 6.2 s, with the slowest anchor
(ethereal) down from ~2 s to ~0.83 s. The need-directed architecture,
frontier caps and dominance rules are unchanged — the candidate set is
simply smaller.
