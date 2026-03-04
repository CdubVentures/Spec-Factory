# Pipeline Knob Hierarchy And Rollout Plan - 2026-02-26

## Short answer first
No, these are **not only pipeline knobs**.

Current classified scope from the 409-row planning matrix:
- Pipeline knobs: **319**
- Non-pipeline/platform knobs: **90**

Scope class split:
- `pipeline_core`: 310
- `advanced_pipeline_mode`: 43
- `platform_output_ops`: 18
- `platform_observability`: 17
- `platform_runtime_ops`: 10
- `integration_endpoint`: 9
- `integration_secret`: 2

## Source of truth artifacts
- Full 409-row plan matrix with target hierarchy and GUI control type:
  - `implementation/ai-indexing-plans/pipeline-knob-hierarchy-plan-2026-02-26.csv`
- Full knob audit:
  - `implementation/ai-indexing-plans/PIPELINE-SETTINGS-FULL-KNOB-AUDIT-2026-02-26.md`
- Code-level sweep addendum:
  - `implementation/ai-indexing-plans/PIPELINE-SETTINGS-CODELEVEL-SWEEP-ADDENDUM-2026-02-26.md`
- AST CI inventory gate snapshot:
  - `implementation/ai-indexing-plans/ast-knob-inventory.snapshot.json`

## Target hierarchy (main sidebar -> nested sidebar)

### 1) Pipeline Core (primary user surface)
1. NeedSet Engine
- NeedSet and Identity Caps
- Identity Weighting and Deficits

2. Discovery Planner
- Alias Generation
- Planner LLM
- Query Budget and Dedupe

3. Search Providers and SERP
- Provider Selection
- Provider Endpoints and Rescue
- SERP Scoring and Thresholds

4. Fetch and URL Health
- Fetch Concurrency and Delay
- Frontier Cooldowns and Blocking
- Dynamic Fetch Policy

5. Parsing and OCR
- Static DOM and Article Extraction
- OCR Settings
- Structured Metadata and PDF Routing

6. Retrieval and Evidence Index
- Retrieval Pool and Prime Sources
- Rediscovery and TTL

7. Identity Gate
- Thresholds and Ambiguity
- Numeric and Variant Guards

8. Consensus and Scoring
- Tier and Method Weights
- Policy Bonus and Acceptance Rules

9. LLM Routing and Budgets
- Role Routing
- Token Caps
- Fallback Routes
- Cost and Budget Guards

10. Run Control
- Resume and Re-extract
- Schema Packet Validation

11. Source Strategy
- Source Strategy Table (full CRUD)

### 2) Platform and Operations (separate from core tuning)
12. Observability and Tracing
- Runtime Trace
- Event Dual-Write
- Daemon and Runtime telemetry

13. Workers and Resilience
- Lane workers
- Health/restart/backoff thresholds

14. Output and Drift
- Drift scan and republish
- Output mode controls

15. Advanced Modes (Aggressive and Cortex)
- Aggressive extraction envelope
- Cortex routing and escalation

## Where knobs fit now vs where they go

### Current wave distribution (from 409-row matrix)
- `W0_existing_surface_alignment`: 74
- `W1_core_gap_closure`: 1
- `W2_backend_knob_surface`: 224
- `W2b_secret_profile_surface`: 2
- `W3_extract_hardcoded_constants`: 96
- `W4_new_feature_implementation`: 12

### Immediate structural gaps to close first
1. Convergence lane concurrency keys missing from Pipeline UI.
- `laneConcurrencySearch`
- `laneConcurrencyFetch`
- `laneConcurrencyParse`
- `laneConcurrencyLlm`

2. Source Strategy is not full CRUD in UI.
- Add create and edit flows for all source strategy fields.

3. Legacy location drift.
- Rows labeled "Indexing Runtime" should be normalized under Pipeline Runtime Flow ownership.

## GUI control standards (by knob type)
- `toggle`: booleans (`*_ENABLED`, `*_WRITE`, policy on/off).
- `number slider`: bounded weights/thresholds/caps where range matters and relative tuning is common.
- `number input`: exact values for timeouts, counts, hours/days, concurrency, limits.
- `enum select`: providers, modes, profiles, backends, formats, strategies.
- `json editor`: `*_JSON`, `*_MAP`, selector maps and domain policy maps.
- `text input`: free-form non-secret strings and identifiers.
- `secret reference picker`: API keys/secrets (do not expose plaintext values in normal views).
- `table CRUD`: row-oriented registries like Source Strategy.
- `formula editor` (optional advanced): only if intentionally exposing currently hardcoded formulas.

## Implementation plan (organized)

### Wave 0 - Surface alignment and authority cleanup
1. Normalize all existing GUI-labeled knobs to Pipeline Settings paths and docs.
2. Keep current behavior; no model changes.
3. Add hierarchy metadata object for current controls.

### Wave 1 - Core gap closure
1. Add Convergence "Lane Concurrency" nested group and wire 4 keys.
2. Add full Source Strategy CRUD in Pipeline Settings.
3. Tests:
- authority ownership
- route wiring
- persistence/propagation
- GUI contract

### Wave 2 - Backend-only knobs to UI surfaces
1. Move backend-only knobs into their target sections above.
2. Add integration endpoint controls in a dedicated integration subsection.
3. Keep secrets in secret-reference controls only.

### Wave 2b - Secret management surface
1. Add credential profiles (name, provider, key reference).
2. Runtime/settings store references only, never raw secret snapshots.
3. Add validation and redaction tests.

### Wave 3 - Hardcoded extraction program
1. Convert hardcoded constants into contract-backed settings gradually.
2. Prioritize by runtime impact:
- Identity Gate
- Consensus
- Retrieval
- NeedSet
3. For each extraction:
- failing test first
- minimal implementation
- parity verification

### Wave 4 - Not implemented knobs
1. Worker knobs (`WORKERS_*`, health and restart controls).
2. Batch safety (`MAX_BATCH_SIZE_CONFIRMATION`, parallel product worker cap).
3. Parsing vision fallback (`CHART_VISION_FALLBACK_ENABLED`).
4. Retrieval rediscovery caps/TTL behavior.

### Wave 5 - lock-in and governance
1. Keep AST knob inventory gate in CI.
2. Add registry gate: every key must have
- owner
- sidebar path
- control type
- test coverage tag
- exemption reason if not tunable.
3. Generate `tuning.csv` and knob docs from registry.

## Implementation status (current)
- Wave 1 is implemented:
  - Convergence `Lane Concurrency` group added and wired (`laneConcurrencySearch|Fetch|Parse|Llm`).
  - Source Strategy CRUD added in Pipeline Settings (create/edit/toggle/delete).
- Wave 2A observability slice is implemented:
  - `runtimeTraceEnabled`
  - `runtimeTraceFetchRing`
  - `runtimeTraceLlmRing`
  - `runtimeTraceLlmPayloads`
  - `eventsJsonWrite`
  - `authoritySnapshotEnabled`
  - Wired through defaults, runtime settings contract routes, runtime serializer/hydration, pipeline runtime-flow UI, and `/process/start` env override bridge.
- Detailed implementation record:
  - `implementation/ai-indexing-plans/PIPELINE-SETTINGS-WAVE-2A-OBSERVABILITY-IMPLEMENTATION-2026-02-26.md`

## Test gates per wave
- Contract coverage (`settingsContract`, route maps, value type maps).
- UI wiring coverage (sidebar section + nested group ownership).
- Authority propagation and persistence parity.
- Snapshot checks for hierarchy metadata.
- AST inventory drift check (`npm run audit:knobs`).

## Concrete next build order
1. W1: Convergence lane concurrency group + Source Strategy CRUD.
2. W2: Search/Fetch/Parsing backend-only controls.
3. W3: Identity/Consensus/Retrieval hardcoded extraction.
4. W4: Worker and batch safety not-implemented controls.

## Definition of done
- Every non-secret operational knob is tunable in GUI.
- Every secret knob is manageable via secret references/profile surfaces.
- Every knob has a deterministic sidebar/nested location.
- `tuning.csv` and hierarchy docs are generated from canonical registry.
- CI fails on unmapped or undocumented knob drift.
