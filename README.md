Element TD 2 Build Lab

Three companion tools for planning an Element TD 2 game:

Build Lab — pick a main-DPS anchor tower and the engine returns a complete, defensible plan built around it: mandatory core (Anchor / Slow / Damage Amp / Buff), justified supporting towers, the element-keystone route, armour coverage, mechanic synergy, tensions, and the two End Game Essence picks — plus up to two materially distinct alternative routes.
Theory Craft — hand-build a package yourself, slot by slot, against the 11-keystone budget, and grade it with the same engine evidence Build Lab uses.
Match Plan — turn a finished build into a full pre-game strategy: phase-by-phase snapshots, camp assignments, a coverage-repair pass, and a safe purchase sequence, computed against map-specific placement data. (/live is kept as a back-compat alias so older saved links still open here.)

Every recommendation is derived from verified game facts. The engine never invents a mechanic; where a fact is unknown it stays qualitative and is shown as unresolved.

Stack
Next.js 15 (App Router, typed routes) · React 19 · TypeScript
Zustand for UI state, Motion for animation
React Hook Form + Zod for the feedback form
Hand-written CSS design system in app/globals.css (no runtime CSS framework)
Vitest — 58 test files across the engine, domain, live, match-plan and feedback layers
Postgres (via pg) + Resend for feedback storage and email notification; Prisma is present for a broader persistence layer that isn't wired into the app yet (see below)
Getting started
bash
npm install
npm run dev        # http://localhost:3000

No environment variables are needed to browse or use Build Lab, Theory Craft, or Match Plan. Submitting the in-app feedback form does need DATABASE_URL (Postgres) to save the submission, and RESEND_API_KEY / FEEDBACK_FROM_EMAIL / FEEDBACK_TO_EMAIL to email it — see .env.example. The rest of db/schema.sql (tower, mechanic_record, engine_run, scenario) describes a planned persistence layer for engine runs and saved scenarios that is not yet wired in.

Scripts
Command	Purpose
npm run dev	Dev server
npm run build / npm start	Production build and serve
npm test / npm run test:watch	Vitest suite
npm run test:e2e:build-lab	Puppeteer smoke test of the Build Lab page
npm run test:e2e:match-plan	Puppeteer smoke test of the Match Plan page
npm run typecheck	tsc --noEmit
npm run lint	ESLint
npm run format / npm run format:check	Prettier
npm run validate:data	Runs every validate:* data check below
npm run validate:towers	Validate the tower catalog (recipes, element order, bijection)
npm run validate:mechanic-facts	Validate data/towerMechanicFacts.v1.json
npm run validate:tower-economics	Validate data/towerEconomics.v1.json
npm run validate:calibration	Validate data/waveObservations.v1.json calibration data
npm run verify	lint + typecheck + test + build + validate:data, in sequence
npm run db:generate / db:migrate / db:studio	Prisma commands for the not-yet-wired persistence layer
Layout
app/
  page.tsx                 landing page: carousel linking the three tools
  build-lab/page.tsx        Build Lab UI
  theorycraft/page.tsx      Theory Craft UI
  match-plan/page.tsx       Match Plan UI
  live/page.tsx              legacy alias -> Match Plan (back-compat for old links)
  api/optimize/route.ts     POST { anchorTowerId } -> BuildRecommendationSet
  api/feedback/route.ts     POST feedback -> Postgres + Resend email
  globals.css               the hand-written design system
components/
  build-lab/                 Build Lab components + Zustand store
  theorycraft/                Theory Craft components + Zustand store
  match-plan/MatchPlan.tsx     Match Plan view (phases, camps, economy, coverage, action stream)
  live/                        legacy Live Tracker components
  landing/                     landing page carousel + per-tool previews
lib/
  domain/                   canonical game facts (towers, elements, mechanics, economics, maps, evolution)
  engine/                   the planners
    normalPackageSearch / buildPlanner / endGamePackageEvaluation /
    buildProgression / rankedBuildRecommendations      Build Lab recommendation engine
    matchPlan / matchPlanSurvival / mapPlacement / waveBenchmarks   Match Plan simulation + placement engine
    liveGame / liveEconomy / liveQueue / livePlacement / liveCoaching   legacy live-tracking engine
  feedback/                 feedback validation, rate limiting, Postgres store, Resend email
data/                       the verified fact catalogs, plus per-map placement data in `data/maps/`
tests/                      58 test files mirroring the structure above
Engine, briefly

For each anchor the planner enumerates every legal full element allocation, its mandatory core package, and — through a need-directed justification search — the strategically justified supporting towers. Towers enter a package only through a current justification atom or a verified mechanic edge; candidate dominance and a lexicographic branch-and-bound keep the search bounded. Complete plans are ranked by an ordered decision vector (core development first, then anchor synergy, coverage, realised buff magnitude, …); minimum capital is only a late tiebreaker.

Match Plan takes a finished build (from Build Lab, Theory Craft, or a saved link) and turns it into a full pre-game plan: phase-by-phase snapshots, camp assignments, a coverage-repair pass, and a purchase sequence — using the same verified fact catalogs plus per-map placement data and wave benchmarks.

Deploy (Render)

Web Service from this repo, branch main:

Build: npm install && npm run build
Start: npm start
Node: 20 or 22 (Next 15 requires ≥ 18.18)

next start binds to Render's PORT automatically. For the feedback form to save and email submissions in production, set DATABASE_URL, RESEND_API_KEY, FEEDBACK_FROM_EMAIL, and FEEDBACK_TO_EMAIL in the Render service's environment.
