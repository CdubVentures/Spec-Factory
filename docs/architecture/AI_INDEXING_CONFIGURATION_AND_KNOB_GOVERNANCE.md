# AI Indexing Configuration and Knob Governance

Date: 2026-03-04  
Owner: Full-Stack Architecture

## 1. Executive summary

This document consolidates the `implementation/ai-indexing-plans` program into a stable architecture reference for runtime configuration governance.

Primary outcomes:
- Global system defaults are centralized in config manifest (`src/core/config/manifest.js`).
- Runtime environment now uses a minimal `.env` policy (secrets + deploy overrides only).
- User-generated application settings remain in user settings storage and are intentionally excluded from env/manifest ownership.
- Knob surfacing program moved from ad-hoc plan files to governed, test-backed configuration contracts.

## 2. Canonical configuration ownership

### 2.1 Global/system configuration
- Source of truth: `src/core/config/manifest.js`
- Loader: `src/config.js`
- Rule: non-user, operational knobs must have manifest metadata and validated runtime mapping.

### 2.2 Environment-specific overrides
- Source: `.env`
- Rule: keep minimal; use for secrets and deployment-specific runtime values only.

### 2.3 User-specific mutable settings (excluded from env/manifest defaults)
These remain in user settings storage (database/app logic), start empty, and override defaults only after user change:
- categories, brands, models, variants
- created components
- enums and field rules
- key navigations
- mapping studio/user workflow settings
- other user-scoped UX/workbench preferences

## 3. Program status distilled from phase bundles

### 3.1 Foundation and discovery (Phases 00-03)
- Event bridge, NeedSet, SearchProfile planner, and deterministic SERP triage are in place.
- Remaining gap in this bundle: NeedSet snippet timestamp lineage + GUI sort.

### 3.2 Core ingestion and evidence (Phases 04-06)
- Fetch scheduler and evidence index are complete.
- Remaining critical integration: Phase 04 repair signal to Phase 06B durable queue end-to-end handoff.

### 3.3 Retrieval/extraction/convergence (Phases 07-09)
- Retrieval and convergence are implemented.
- Visual pipeline (08B) remains partial: capture manifest hardening, quality gates, eligibility gating, and extraction-context wiring.

### 3.4 Learning/ops/batch (Phases 10-13)
- Learning, batch orchestration, and runtime diagnostics are largely complete.
- Remaining governance item: per-run knob usage telemetry event.

### 3.5 Critical path alignment
Canonical remaining execution path is tracked in:
- `implementation/ai-indexing-plans/CRITICAL-PATH-REMAINING-IMPLEMENTATION.md`

## 4. Knob inventory and surfacing governance

## 4.1 Inventory model
The knob program evolved from a CSV/matrix audit into contract-backed implementation slices with test gates.

Key audit themes captured:
- contract/UI mismatches
- backend-only knobs requiring surfacing
- hardcoded constant extraction into contracted settings
- explicit `not_implemented` queue management

### 4.2 Validation guardrails
- AST inventory generator + snapshot gate
- runtime settings contract coverage tests
- UI contract/wiring tests
- full regression gate (`npm test`)

### 4.3 Current governance rule
A knob is considered production-governed only when all are true:
1. Has manifest/runtime default authority.
2. Has typed route/contract mapping.
3. Has serializer/hydration path.
4. Has UI ownership metadata where applicable.
5. Has focused wiring tests and passes full regression.

## 5. Runtime settings architecture (practical flow)

1. Manifest defaults are applied first.
2. `.env` overrides are applied for environment and secrets.
3. Runtime/user settings snapshots are merged from settings authority.
4. Derived artifacts are applied to active runtime config.
5. Process/start bridges pass effective values into runtime execution.

## 6. Documentation normalization

Legacy planning artifacts are archived for traceability under `docs/archive/ai-indexing-plans/2026-03-04/`.

Kept in active implementation folder by intent:
- `CRITICAL-PATH-REMAINING-IMPLEMENTATION.md`
- `PHASES-00-03-foundation-and-discovery.md`
- `PHASES-04-06-core-ingestion-and-evidence.md`
- `PHASES-07-09-retrieval-extraction-convergence.md`
- `PHASES-10-13-learning-ops-and-batch.md`
- `indexlab-full-pipeline.mmd`
- `indexlab-full-pipeline.png`
- `indexlab-full-pipeline.svg`

## 7. Operating policy going forward

1. Add new global knobs in manifest first.
2. Keep `.env` minimal; avoid re-expanding into full defaults inventory.
3. Do not move user-owned settings into env/manifest.
4. Require contract + wiring + tests for any new surfaced knob.
5. Update this docs set and archive index when plan artifacts are retired.