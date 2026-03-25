## Purpose
IndexLab runtime bridge and orchestration support. Translates pipeline events into structured observation packets for the GUI, manages search slot allocation, LLM call tracking, stage lifecycle, needset computation, and search plan generation.

## Public API (The Contract)
- `index.js`: Re-exports public surface from submodules.
- `runtimeBridge.js`: `IndexLabRuntimeBridge` class — main bridge connecting pipeline events to GUI runtime state.
- `runtimeBridgeEventHandlers.js`: `dispatchRuntimeEvent(state, deps, row)` — table-driven event dispatcher for all pipeline events.
- `runtimeBridgeLlmTracker.js`: `createLlmCallTracker()` — factory for LLM worker ID resolution and aggregate metrics.
- `runtimeBridgeSearchSlots.js`: `createSearchSlotScheduler()` — search worker slot allocation.
- `runtimeBridgeStageLifecycle.js`: `startStage()`, `finishStage()` — pipeline stage tracking.
- `runtimeBridgePayloads.js`: `extractRuntimeEventPayload()`, `toIdentityEvidenceRow()`, `toIdentityContradictionRows()`, `mergeSearchProfileRows()`.
- `runtimeBridgeCoercers.js`: Type coercion helpers for event normalization (`asInt`, `asFloat`, `toIso`, `normalizeRunId`).
- `runtimeBridgeArtifacts.js`: `ensureRun()`, `writeRunMeta()`, `writeNeedSet()`, `writeSearchProfile()` — run artifact persistence.
- `needsetEngine.js`: `computeNeedSet()` — determines which fields need data and their priority.
- `needsetRound0Seeder.js`: `seedRound0NeedSet()` — initial needset for round 0.
- `needsetStoryProjection.js`: `projectNeedSetStory()` — needset narrative for search planning.
- `searchPlanningContext.js`: `buildSearchPlanningContext()` — Schema 3 context from needset + field groups.
- `searchPlanBuilder.js`: `buildSearchPlan()` — Schema 4 query plan via LLM or deterministic fallback.
- `indexingSchemaPackets.js`: `buildIndexingSchemaPackets()` — constructs schema-validated packets.
- `indexingSchemaPacketsValidator.js`: `validateIndexingSchemaPackets()` — AJV-based packet validation.

## Dependencies
- Allowed: `src/core/config/`, `src/core/llm/`, `src/pipeline/` (dedupeOutcomeEvent), `src/shared/`.
- Forbidden: `src/features/` (indexlab is consumed BY features, not the reverse), `src/api/`, `src/db/`.

## Domain Invariants
- Every runtime event maps to exactly one handler (or is silently ignored). No event triggers multiple handlers.
- LLM worker IDs are reused on fallback (same GUI row for primary + fallback call).
- Search plan queries are capped per group (3) and globally (6).
- Stage lifecycle: `startStage` must precede `finishStage` for every stage.
- Needset computation is deterministic given the same field rules and prior round state.
- Schema packets must pass AJV validation before emission when validation is enabled.
