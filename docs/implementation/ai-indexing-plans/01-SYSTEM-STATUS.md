# 01-SYSTEM-STATUS.md - Current State of IndexLab

Last updated: 2026-03-11

Audit basis:
- Full suite: `5517/5517` passing on 2026-03-10
- Focused 01-06 proof stack: `434/434` passing targeted tests across doc parity, source authority, planner, fetch/parse, CP-0, CP-1, source registry, query compiler, deep gates, domain hints, runtime bridge, and GUI settings
- LLM dashboard proof: `28/28` passing (`15` dashboard builder + `13` model helpers)
- Latest fully enabled live run: `20260311003757-2b727e` for `mouse-razer-viper-v3-pro` with `searchProvider=google`, `llmEnabled=true`, and `discoveryEnabled=true`

## Implementation Scope

The current implementation focus is the **Collection Pipeline** — the 13-stage system that searches, fetches, parses, extracts, and stores per-source evidence. The pipeline's only job is high-value data collection and storage. It does NOT compare sources, resolve conflicts, or decide which field value is "correct."

The **Review Phase** (comparison, consensus, validation, publishing) is a separate process that will execute independently after collection completes. It will be implemented after the collection pipeline is complete and proven.

References to "publish gate," "consensus," and "identity gate" in the current system status describe legacy behavior that is being refactored as part of the pipeline overhaul, not final review phase architecture.

## Executive Status

- CP-0 is green. The deterministic GUI lane contract proof is passing.
- CP-1 is green. The Phase 04 to Phase 06B repair handoff proof is passing.
- Phases 01-06 are implemented and the automated proof stack is green.
- **Stage 1 identity gate refactor is COMPLETE.** Identity is now advisory (labels + consensus weighting) and only blocks publishing, not extraction. 12 dynamic threshold knobs retired, 4 cap knobs neutered, both NeedSet panels updated.
- **Feature-first vertical slice reorganization is COMPLETE.** All backend modules reorganized from flat `src/` layout to 9 feature-scoped domains under `src/features/`. Routes are now co-located with features. All tests preserved (0 test files deleted).
- **LLM dashboard simplification is COMPLETE.** Dead `input_summary`/`output_summary` fields removed from call row contract. Frontend uses `prompt_preview`/`response_preview` directly. Shared model helpers support Claude, Gemini, DeepSeek, GPT. `escalation_planner` call type added.
- **Stage 2A search/triage simplification and knob retirement is DONE.** Domain safety LLM call eliminated (deterministic-only). LLM SERP triage made conditional (fires only when deterministic quality < 60% threshold). Tier coverage override removed. 5 knobs retired (`serpTriageEnabled`, `llmSerpRerankEnabled`, `discoveryResultsPerQuery`, `discoveryQueryConcurrency`, `runProfile`). Locked knob UI pattern introduced. Frontier cache results filtered from prefetch panel.
- **Convergence loop elimination is COMPLETE (2026-03-15).** `runConvergenceLoop()` and its CLI path deleted. 7 convergence-specific knobs removed (`convergenceMaxRounds`, `convergenceNoProgressLimit`, `convergenceMaxLowQualityRounds`, `convergenceLowQualityConfidence`, `convergenceMaxDispatchQueries`, `convergenceMaxTargetFields`, `convergenceIdentityFailFastRounds`). `runProduct()` is now the only pipeline execution path. ~2,800 LOC removed across 10 deleted files and ~36 modified files. 21 non-convergence knobs in the convergence settings section (consensus, SERP triage, retrieval, lane concurrency) remain functional. All tests pass.
- Phases 05-06 are only partially proven live. The latest fully enabled live run completed with exit code `0` and emitted full output artifacts, but final publication stayed blocked by identity (unlocked status, insufficient sources).
- The v2 host-plan seam is still not the primary live control plane. `search_profile.effective_host_plan` was `null` in the latest fully enabled run.

## Architecture — Feature-First Reorganization (2026-03-10)

The codebase has been restructured from flat technical-layer directories (`src/catalog/`, `src/llm/`, `src/search/`, etc.) to 9 feature-scoped domains:

| Feature | Path | What it owns |
|---|---|---|
| `catalog` | `src/features/catalog/` | Product identity, brand registry, dedup, migrations. Routes: brand, catalog |
| `category-authority` | `src/features/category-authority/` | Data authority routes |
| `expansion-hardening` | `src/features/expansion-hardening/` | Phase 10 expansion logic |
| `indexing` | `src/features/indexing/` | Discovery, extraction, learning, orchestration, validation, search, analytics, telemetry, runtime. Routes: indexlab, runtime-ops, queue/billing/learning, source-strategy |
| `review` | `src/features/review/` | Review routes |
| `review-curation` | `src/features/review-curation/` | Curation logic |
| `settings` | `src/features/settings/` | Config routes |
| `settings-authority` | `src/features/settings-authority/` | Settings contract, user settings service |
| `studio` | `src/features/studio/` | Studio routes |

**Deleted modules** (moved into features): `src/catalog/`, `src/llm/`, `src/search/`, `src/learning/`, `src/extract/`, `src/extractors/`, `src/validator/`, `src/discovery/`, `src/helperFiles/`, `src/phase10/`, `src/api/routes/` (14 files), `src/pipeline/helpers/` (12 files), `src/features/catalog-identity/`.

**Route registration** is now feature-scoped: `src/api/guiServer.js` imports from `src/features/*/api/` instead of `src/api/routes/`.

**Orchestration hierarchy** (`src/features/indexing/orchestration/`): `bootstrap/` -> `discovery/` -> `execution/` -> `finalize/` with `quality/` and `shared/` helpers.

## Identity Gate — Current Architecture

Post-Stage 1, identity is a **three-module advisory + publish gate system**:

1. **Catalog identity** (`src/features/catalog/identity/identityGate.js`) — brand/model/variant dedup
2. **Source identity scoring** (`src/features/indexing/validation/identityGate.js`) — per-source 0–1 scoring (brand 0.35 + model 0.35 + variant 0.15 + hard-ID 0.15), aggregate validation across all sources
3. **Pipeline label wrapper** (`src/pipeline/identityGateExtraction.js`) — tags candidates for consensus weighting

**Two active knobs:** `identityGateBaseMatchThreshold=0.80`, `identityGatePublishThreshold=0.75`

**Key behavior:** Identity confidence is advisory — it does NOT block extraction. It only blocks publishing for fields at identity/critical/required level (15 of 80 mouse fields) when `publishable=false`. This appears in needset as `publish_gate_block` reason with 1.2x need score multiplier.

**GUI display:** Both NeedSet panels show identity as advisory with "does not block extraction" tips. No quarantine display. Publish state shows as "allowed" or "blocked."

## Phase 01-06 Status

| Phase | Status | What is proven | Latest live truth |
|---|---|---|---|
| 01 - NeedSet Engine | Implemented | NeedSet, identity gates, and GUI/runtime contract proofs are green. Stage 1 identity refactor complete. | Latest run ended with `identity_lock_state.status=unlocked`, NeedSet correctly applied `publish_gate_block` to 15 identity/critical/required fields |
| 02 - Source Registry / Authority | Implemented | Registry, authority loading, and production category tests are green | Category authority is active and explicit approved/support seeds survive planner filtering |
| 03 - Query Compiler / Discovery Planning | Implemented | Query compiler, domain hint resolver, and discovery integration proofs are green | Latest run executed real Google queries, but `effective_host_plan` remained `null` |
| 04 - URL Health / Runtime Bridge / Repair Handoff | Implemented | CP-1 end-to-end repair handoff is green; runtime bridge and GUI settings tests are green | Repair path is proven; community consensus dual-write remains documented and inactive |
| 05 - Fetch / Parse Scheduler | Implemented | Phase 05 fetch/parse proofs are green | Latest run fetched 3 pages successfully |
| 06 - IDX / Source Pipeline | Implemented, partially live-proven | IDX projection, source pipeline, runtime metadata, and doc parity are green | Latest run emitted `spec.json`, `summary.json`, `traffic_light.json`, `provenance.json`, and evidence |

## Current Live Evidence

Latest fully enabled live run summary:

| Field | Value |
|---|---|
| Run ID | `20260311003757-2b727e` |
| Product | `mouse-razer-viper-v3-pro` (Razer Viper V3 Pro) |
| Duration | `2026-03-11T00:37:57Z` -> `2026-03-11T00:42:xxZ` (~5 min) |
| Exit code | `0` |
| Notes | Frontier cache filtering confirmed working. Prefetch panel correctly shows only real search queries (10 shown, 18 frontier cache filtered). |

Previous live run:

| Field | Value |
|---|---|
| Run ID | `20260310215243-723af6` |
| Product | `mouse-razer-viper-v3-pro` (Razer Viper V3 Pro) |
| Duration | `2026-03-10T21:52:43Z` -> `2026-03-10T21:58:07Z` (~5 min) |
| Exit code | `0` |
| Pages fetched | `3` |
| Identity gate | `unlocked` (confidence 0.6, max match 0.75) |
| Final spec fill | `0/81` (identity unlocked, publish blocked) |
| NeedSet size | `80` fields in deficit |
| Publish gate blocks | `15` fields at identity/critical/required level |
| Publishable | `false` |
| Publish blockers | `model_ambiguity_alert`, `below_required_completeness`, `below_confidence_threshold`, `missing_manufacturer_confirmation`, `missing_additional_credible_sources`, `certainty_below_publish_threshold` |

## Open Gaps

1. The latest fully enabled live run is not publishable because identity resolution ended as `unlocked` with only 3 pages at WARNING confidence.
2. `search_profile.effective_host_plan` is still `null` in live output, so the v2 host-plan seam is not yet the main live steering artifact.
3. The pipeline completes and emits artifacts, but field fill requires more sources passing identity validation. The gap is source volume and diversity, not gate logic.
4. Community consensus dual-write remains a documented inactive design path, not an active 01-06 runtime behavior.
5. Stage 2 exit gate is not fully proven. Requires 2+ successful live runs with distinct products, full suite regression, and Runtime Ops manual inspection (all still pending).

## Upgrade-Plan Features Still Partial Or Future-Only

- `public-suffix-aware` parsing, `connector_only`, `blocked_in_search`, and the `HostHealth` ladder are covered by targeted proof, but the latest live run still wrote `search_profile.effective_host_plan = null`, so that steering contract is not yet fully live-proven.
- `QueryIndex`, `URLIndex`, and `PromptIndex` remain part of the documented instrumentation contract, but this status pass did not prove them as the compounding live control loop for the latest real run.
- `community ingestion` remains future connector-first work; the `Reddit connector` is not part of the current 01-06 live default path.
- `local helper AI` remains future-only and disabled by default in the current rollout docs.
- Full `evidence quote anchoring` with content hash plus span/context-window remains planned parsing hardening rather than a proven cross-path artifact invariant in this status pass.

## Bottom Line

IndexLab's identity gate refactor (Stage 1) is complete. Identity no longer blocks extraction — it only blocks publishing. The pipeline completes end-to-end and emits artifacts. The convergence loop has been fully eliminated — `runProduct()` is the only pipeline path, with no convergence round logic remaining in the codebase. The remaining gap is not gate logic; it is source volume and diversity to clear identity validation and fill fields. Stage 2A (search/triage simplification, knob retirement) is complete. Stage 2B (search pipeline rewrite candidates) and Stage 2 exit gate validation are next.
