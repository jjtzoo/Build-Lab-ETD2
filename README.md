# Element TD 2 Build Lab — Full-Stack Foundation

This repository is the first migration step from the supplied `BUILD LAB V8` monolithic HTML/JS prototype into a maintainable full-stack application.

## Current vertical slice

- Next.js App Router + TypeScript
- Server-side `/api/optimize` endpoint
- V8 catalog extracted into `data/towers.json`
- Mechanics database extracted into `data/mechanics.json`
- Shared domain types in `lib/types.ts`
- Allocation generation and evaluation isolated in `lib/engine/allocation.ts`
- UI shell with future modules for What If, Allocation Explorer, Core Explorer, Tower Codex, Research, and Debug

## Important boundary

The current evaluator is a **foundation heuristic**, not a claim that the complete V8 decision engine has been ported. The original supplied engine should be migrated in discrete, testable evaluator modules rather than copied wholesale into React components.

## Target architecture

```text
Next.js UI
  ├─ Build Lab
  ├─ What If
  ├─ Allocation Explorer
  ├─ Core Explorer
  ├─ Tower Codex
  ├─ Research / Evidence
  └─ Debug / Evaluation Audit
        │
        ▼
Application API
  ├─ Build service
  ├─ Scenario service
  ├─ Research service
  └─ Evaluation service
        │
        ▼
Domain Engine
  ├─ legality
  ├─ tower states
  ├─ independent evaluators
  ├─ synergy graph
  ├─ opportunity cost
  ├─ redundancy / anti-synergy
  ├─ endgame / essence
  └─ hierarchical decision engine
        │
        ▼
PostgreSQL
  ├─ towers / mechanics
  ├─ evidence / sources
  ├─ rules / versions
  ├─ evaluator outputs
  ├─ saved builds
  └─ scenario experiments
```

## Next implementation order

1. Normalize the 50 tower records + mechanics records into versioned database entities.
2. Port the V8 evaluator functions one evaluator at a time with unit tests.
3. Add immutable engine runs so every recommendation is reproducible.
4. Add What If as scenario diffs against a saved baseline.
5. Add Research/Evidence so UNKNOWN remains first-class and every mechanic can have provenance.
6. Add the Decision Engine audit UI.
7. Add authentication and saved projects only after the domain engine is stable.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Database direction

The project is prepared for PostgreSQL. Do not introduce persistence into the evaluator yet; first make the domain model and evaluator outputs deterministic and testable.
