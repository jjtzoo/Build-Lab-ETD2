# Element TD 2 Build Lab

A strategy planner for [Element TD 2](https://store.steampowered.com/app/1156590/Element_TD_2/).
Pick a main-DPS **anchor** tower and the engine returns a complete, defensible
plan built around it: mandatory core (Anchor / Slow / Damage Amp / Buff),
justified supporting towers, the element-keystone route, armour coverage,
mechanic synergy, tensions, and the two End Game Essence picks — plus up to two
materially distinct alternative routes.

Every recommendation is derived from verified game facts. The engine never
invents a mechanic; where a fact is unknown it stays qualitative and is shown as
unresolved.

## Stack

- **Next.js 15** (App Router) · **React 19** · **TypeScript**
- **Zustand** for UI state, **Motion** for animation
- Hand-written CSS design system in `app/globals.css` (no runtime CSS framework)
- **Vitest** — 461 engine + DTO tests

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

No environment variables are needed to run. `DATABASE_URL` in `.env.example` and
`db/schema.sql` describe a planned persistence layer that is not yet wired in.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Full test suite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run validate:towers` | Validate the tower catalog (recipes, element order, bijection) |
| `npm run validate:mechanic-facts` | Validate `data/towerMechanicFacts.v1.json` |
| `npm run validate:tower-economics` | Validate `data/towerEconomics.v1.json` |

## Layout

```
app/
  api/optimize/route.ts   POST { anchorTowerId } -> BuildRecommendationSet
  page.tsx, globals.css   the Build Lab UI
components/build-lab/      React components + the Zustand store
lib/
  domain/                 canonical game facts (towers, elements, mechanics, economics)
  engine/                 the planner
    normalPackageSearch   need-directed variable-size package search
    buildPlanner          allocation search + lexicographic decision vector
    endGamePackageEvaluation  sustained-engagement End Game DPS model
    combinedBuildPlan / buildProgression / rankedBuildRecommendations
data/                     the verified fact catalogs
tests/engine/             the test suite
```

## Engine, briefly

For each anchor the planner enumerates every legal full element allocation, its
mandatory core package, and — through a need-directed justification search — the
strategically justified supporting towers. Towers enter a package only through a
current justification atom or a verified mechanic edge; candidate dominance and a
lexicographic branch-and-bound keep the search bounded. Complete plans are ranked
by an ordered decision vector (core development first, then anchor synergy,
coverage, realised buff magnitude, …); minimum capital is only a late tiebreaker.

## Deploy (Render)

Web Service from this repo, branch `main`:

- Build: `npm install && npm run build`
- Start: `npm start`
- Node: 20 or 22 (Next 15 requires ≥ 18.18)

`next start` binds to Render's `PORT` automatically.
