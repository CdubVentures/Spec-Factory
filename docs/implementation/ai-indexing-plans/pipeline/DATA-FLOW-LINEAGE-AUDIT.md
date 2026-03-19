# Data Flow Lineage Audit

Audit date: 2026-03-18.
Scope: full product indexing run from `runProduct()` bootstrap through discovery, source processing, finalization, schema packets, learning writeback, and next-run readback.

## Authority

- Planning/discovery contract source: `docs/implementation/ai-indexing-plans/pipeline/planning/*`
- Parsing/finalization contract source: `docs/implementation/ai-indexing-plans/pipeline/parsing/*`
- Live runtime source: `src/pipeline/runProduct.js` plus `src/features/indexing/orchestration/**`

## Current Runtime Shape

```text
runProduct()
  -> bootstrapRunProductExecutionState()
  -> runPlannerProcessingLifecycle()
  -> runIndexingResumePersistencePhase()
  -> runProductFinalizationPipeline()
  -> next run bootstrap readback
```

The older 01-13 stage labels still help with traceability, but the live code is now grouped into five runtime blocks:

1. Bootstrap and learning readback
2. Discovery seed orchestration
3. Planner processing and source execution
4. Finalization derivation
5. Completion lifecycle and cross-run learning writeback

## Boundary Map

| Stage | Producer | Main payloads | Notes |
|------|----------|---------------|-------|
| B0 Bootstrap | `bootstrapRunProductExecutionState()` | planner, frontier state, `learningProfile`, `learningStoreHints`, resume state, initial NeedSet event | If `selfImproveEnabled`, prior run profile seeds the planner and store hints are read before discovery starts. |
| 01 NeedSet | `computeNeedSet()` | `identity`, `fields[]`, `summary`, `blockers`, `planner_seed` | Search memory carries through `buildFieldHistories()` and late-stage enrichment. |
| 02 Brand Resolver | `resolveBrandDomain()` | `officialDomain`, `supportDomain`, `aliases`, `confidence`, `reasoning` | Cache-first sidecar used by discovery and host promotion. |
| 03 Search Planner | `buildSearchPlanningContext()`, `buildSearchPlan()` | Schema 3 context, Schema 4 handoff, planner panel, `learning_writeback` | Fires once at run start when Schema 4 planning is enabled. |
| 04 Query Journey | `resolveSchema4ExecutionPlan()`, fallback `planUberQueries()` branch | final query rows, guard context, reject log | Schema 4 is preferred; fallback planner runs when Schema 4 is absent or underfilled. |
| 05 Search Results | `executeSearchQueries()` | `rawResults`, `searchAttempts`, `searchJournal`, `providerState`, `internalSatisfied`, `externalSearchReason` | Internal-first search, frontier cache reuse, mixed transport execution, plan-only fallback. |
| 05A Google Crawlee sidecar | `splitEnginesByTransport()` -> `attemptGoogleCrawlee()` -> `searchGoogle()` | Google result rows, optional screenshot metadata, transport-level warnings | Independent of SearXNG readiness; CAPTCHA/consent pages return empty rows instead of failing the run. |
| 06 SERP Triage | `processDiscoveryResults()` | `candidates`, `approvedUrls`, `candidateUrls`, `searchProfileFinal`, `serp_explorer` | Hard drops, classification, soft labels, lane quotas, optional LLM rerank. |
| 07 Queue Seeding | `runDiscoverySeedPlan()` + `SourcePlanner` | enqueue calls, triage meta map, enqueue counters | Discovery output is revalidated before it enters planner queues. |
| 08 Fetch Entry | planner/fetch phases under `orchestration/execution` | source descriptor, page fetch outcome, raw artifacts, host-budget state | Fetch scheduling and artifact persistence live in grouped execution phases. |
| 09 Extraction | `runSourceExtractionPhase()` | evidence pack, deterministic candidates, adapter outputs, optional LLM candidates, `phase08FieldContexts`, `phase08PrimeRows` | Also drives planner discovery callbacks and endpoint followup suggestions. |
| 10 Source Identity | `runSourceIdentityEvaluationPhase()` | `anchorCheck`, `identity`, `identityGatedCandidates`, `anchorStatus`, `parserHealth` | Source-level gate before consensus. |
| 11 Consensus | `executeConsensusPhase()` / `runConsensusEngine()` | `fields`, `provenance`, `candidates`, `fieldsBelowPassTarget`, `agreementScore` | Only usable sources without major anchor conflicts survive. |
| 12 Finalization Derivation | `runProductFinalizationDerivation()` | component prior, critic, validator, inference, runtime gate, validation gate, `needSet`, `phase07PrimeSources`, `phase08Extraction` | Starts with synthetic source ingestion, then derives publishability and reasoning. |
| 13 Completion Lifecycle | `runProductCompletionLifecycle()` | indexing schema packets, telemetry, `run_completed`, `learningGateResult`, `learning`, `exportInfo`, `finalExport` | Also writes accepted learning into stores and exports the `_learning` profile for the next run. |

## Payload Families

| Payload family | Created | Aggregated | Terminal use |
|----------------|---------|------------|--------------|
| Need-driven field state | Stages 01 and 12 | NeedSet histories are enriched again during finalization | GUI, repair reasoning, run summaries |
| Search profile and discovery state | Stages 03-06 | planned profile becomes executed profile with `serp_explorer` | planner seeding, GUI, audits |
| Search transport state | Stage 05 | provider availability + per-query attempts + Google/SearXNG merge | search diagnostics, runtime ops, fallback decisions |
| Per-source extraction state | Stages 08-10 | artifact refs, evidence packs, source-level identity, parser health | consensus, diagnostics, exports |
| Product-level normalized state | Stages 11-12 | consensus plus finalization overlays | exporter, learning gate, runtime summaries |
| Cross-run learning state | Bootstrap and 13 | `learningProfile`, `learningStoreHints`, `acceptedUpdates`, exported learning profile | next-run planner seeding, query/domain bias, anchor/value reuse |
| Completion telemetry | Stage 13 | run_completed, run_result, finalization events | UI, websocket consumers, durable history |
| Indexing schema packets | Stage 13 | `sourceCollection`, `itemPacket`, `runMetaPacket` plus AJV validation result | downstream audits and schema artifacts |

## Cross-Stage Lineage Notes

- `seed_search_plan_output` is attached to the discovery result and reused during finalization so the planner LLM is not called twice.
- `phase08FieldContexts`, `phase08PrimeRows`, and `phase08Extraction` are legacy names that still represent live late-stage extraction summaries.
- `searchEngineAvailability()` produces `providerState`, including `google_ready`, `google_search_ready`, `searxng_ready`, `active_providers`, `fallback_engines`, and `internet_ready`.
- `splitEnginesByTransport()` routes `google` through Crawlee and every other configured search engine through SearXNG.
- `searchGoogle()` applies request pacing, optional proxy config, stealth init, optional screenshot capture, and CAPTCHA/consent detection before returning parsed Google rows.
- `llmSourcesUsed` and `llmCandidatesAccepted` are accumulated during source processing and reported again in completion telemetry.
- `loadLearningStoreHintsForRun()` is bootstrap-owned and best effort. If store readback fails, discovery still runs with `learningStoreHints=null`.
- `mergeLearningStoreHintsIntoLexicon()` injects readback hints into the discovery/runtime lexicon; this is separate from Schema 4 planner `learning_writeback`.
- `runProductCompletionLifecycle()` executes learning in this order: `runLearningGate()` -> `persistSelfImproveLearningStores()` -> `persistLearningProfile()` inside terminal learning export.
- The next run consumes prior learning through two separate paths: `applyLearningSeeds()` for planner seeding and `readLearningHintsFromStores()` for field-level anchors/URLs/domain yield hints.

## Durable Outputs

| Output | Produced by | Location |
|--------|-------------|----------|
| run-scoped artifacts | `exportRunArtifacts()` | `runs/{runId}/...` and runtime artifact roots |
| latest snapshot | `exportRunArtifacts()` | `latest/...` |
| promoted final snapshot | `writeFinalOutputs()` | `final/{category}/{brand}/{model}[/{variant}]` |
| final history rows | `writeFinalOutputs()` | `history/runs.jsonl`, `evidence/sources.jsonl` |
| events and summaries | `exportRunArtifacts()` and completion telemetry | `logs/events.jsonl.gz`, `logs/summary.json`, websocket/data-change consumers |
| schema packets and validation | `runIndexingSchemaArtifactsPhase()` | analysis artifacts emitted during finalization |
| cross-run learning profile | `persistLearningProfile()` | `_learning/{category}/profiles/{profileId}.json` |
| run-scoped learning export log | `persistLearningProfile()` | `runs/{runId}/logs/learning.json` |

## Validation Result

The documentation set is now aligned with the current runtime on the following drift points introduced by the rework:

- bootstrap now owns learning profile seed application and learning-store readback
- stage 05 is a mixed transport layer, with Google routed through Crawlee and non-google engines routed through SearXNG
- `searchGoogle()` is a first-class execution sidecar with screenshot/captcha/consent behavior, not a generic provider alias
- finalization explicitly separates `learningGateResult` from `learning` profile export output
- stage 13 writes cross-run learning that is reloaded by the next run bootstrap rather than by discovery itself
