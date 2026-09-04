# Element TD 2 Build Lab

Element TD 2 Build Lab is a full-stack strategy-planning application for Element TD 2.

The project is being rebuilt from a clean foundation.

Previous prototypes and V8-era implementations are reference material only. The new application does not attempt to port the previous evaluator architecture wholesale.

## Product boundary

### Build Lab

Build Lab is an assisted strategy planner.

The user may provide:

- an optional Anchor Tower
- optional Preferred Elements

The engine owns the remaining strategic decisions.

Anchor selection is curated. A tower being capable of functioning as Main DPS does not automatically make it available as a Build Lab anchor.

### What If

What If is the manual theorycrafting environment.

Exact element allocations, forced tower combinations, scenario manipulation, and detailed user-controlled experiments belong here rather than in Build Lab.

## Engine philosophy

The planner follows the structure of actual Element TD 2 build construction.

```text
Anchor / Main DPS
        ↓
Slow
        ↓
Damage Amp
        ↓
Buff
        ↓
Coverage + Synergy
        ↓
Remaining Keystone Optimization