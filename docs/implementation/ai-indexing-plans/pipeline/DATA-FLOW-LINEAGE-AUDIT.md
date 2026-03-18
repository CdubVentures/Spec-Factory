# Data Flow Lineage Audit

Audit date: 2026-03-18.
Scope: full product indexing run from `runProduct()` bootstrap through discovery, source processing, finalization, schema packets, learning, and durable outputs.

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
```

The older 01-13 stage labels are still useful, but the live code is now grouped into four orchestration blocks:

1. Bootstrap and discovery seed
2. Planner processing and source execution
3. Finalization derivation
4. Completion lifecycle

## Boundary Map

| Stage | Producer | Main payloads | Notes |
|------|----------|---------------|-------|
| 01 NeedSet | `computeNeedSet()` | `identity`, `fields[]`, `summary`, `blockers`, `planner_seed` | Search memory now carries through `buildFieldHistories()` and final enrichment. |
| 02 Brand Resolver | `resolveBrandDomain()` | `officialDomain`, `supportDomain`, `aliases`, `confidence`, `reasoning` | Cache-first sidecar used by discovery and host promotion. |
| 03 Search Planner | `buildSearchPlanningContext()`, `buildSearchPlan()` | Schema 3 context, Schema 4 handoff, planner panel, learning writeback | Fires once at run start when Schema 4 planning is enabled. |
| 04 Query Journey | `resolveSchema4ExecutionPlan()`, fallback `planUberQueries()` branch | final query rows, guard context, reject log | Schema 4 is preferred; fallback planner runs when Schema 4 is absent or underfilled. |
| 05 Search Results | `executeSearchQueries()` | `rawResults`, `searchAttempts`, `searchJournal`, `internalSatisfied`, `externalSearchReason` | Internal-first search, frontier cache reuse, provider execution, plan-only fallback. |
| 06 SERP Triage | `processDiscoveryResults()` | `candidates`, `approvedUrls`, `candidateUrls`, `searchProfileFinal`, `serp_explorer` | Hard drops, classification, soft labels, lane quotas, optional LLM rerank. |
| 07 Queue Seeding | `runDiscoverySeedPlan()` + `SourcePlanner` | enqueue calls, triage meta map, enqueue counters | Discovery output is revalidated before it enters planner queues. |
| 08 Fetch Entry | planner/fetch phases under `orchestration/execution` | source descriptor, page fetch outcome, raw artifacts, host-budget state | Fetch scheduling and artifact persistence now live in grouped execution phases. |
| 09 Extraction | `runSourceExtractionPhase()` | evidence pack, deterministic candidates, adapter outputs, optional LLM candidates, `phase08FieldContexts`, `phase08PrimeRows` | Also drives planner discovery callbacks and endpoint followup suggestions. |
| 10 Source Identity | `runSourceIdentityEvaluationPhase()` | `anchorCheck`, `identity`, `identityGatedCandidates`, `anchorStatus`, `parserHealth` | Source-level gate before consensus. |
| 11 Consensus | `executeConsensusPhase()` / `runConsensusEngine()` | `fields`, `provenance`, `candidates`, `fieldsBelowPassTarget`, `agreementScore` | Only usable sources without major anchor conflicts survive. |
| 12 Finalization Derivation | `runProductFinalizationDerivation()` | component prior, critic, validator, inference, aggressive extraction, runtime gate, validation gate, `needSet`, `phase07PrimeSources`, `phase08Extraction` | Starts with dedicated synthetic source ingestion, then derives publishability and reasoning. |
| 13 Completion Lifecycle | `runProductCompletionLifecycle()` | telemetry, run-completed payload, run-result payload, learning gate, exports, final promotion | Also builds and validates indexing schema packets before emitting final outputs. |

## Payload Families

| Payload family | Created | Aggregated | Terminal use |
|----------------|---------|------------|--------------|
| Need-driven field state | Stages 01 and 12 | NeedSet histories are enriched again during finalization | GUI, repair reasoning, run summaries |
| Search profile and discovery state | Stages 03-06 | planned profile becomes executed profile with `serp_explorer` | planner seeding, GUI, audits |
| Per-source extraction state | Stages 08-10 | artifact refs, evidence packs, source-level identity, parser health | consensus, diagnostics, exports |
| Product-level normalized state | Stages 11-12 | consensus plus finalization overlays | exporter, learning gate, runtime summaries |
| Completion telemetry | Stage 13 | run_completed, run_result, finalization events | UI, websocket consumers, durable history |
| Indexing schema packets | Stage 13 | `sourceCollection`, `itemPacket`, `runMetaPacket` plus AJV validation result | downstream audits and schema artifacts |

## Cross-Stage Lineage Notes

- `seed_search_plan_output` is attached to the discovery result and reused during finalization so the planner LLM is not called twice.
- `phase08FieldContexts`, `phase08PrimeRows`, and `phase08Extraction` are legacy names that still represent live late-stage extraction summaries.
- `llmSourcesUsed` and `llmCandidatesAccepted` are accumulated during source processing and reported again in completion telemetry.
- Resume persistence now happens between planner processing and finalization, not as an afterthought inside export code.
- Indexing schema packet generation and AJV validation are part of the completion lifecycle, not a separate offline audit step.

## Durable Outputs

| Output | Produced by | Location |
|--------|-------------|----------|
| run-scoped artifacts | `exportRunArtifacts()` | `runs/{runId}/...` and runtime artifact roots |
| latest snapshot | `exportRunArtifacts()` | `latest/...` |
| promoted final snapshot | `writeFinalOutputs()` | `final/{category}/{brand}/{model}[/{variant}]` |
| final history rows | `writeFinalOutputs()` | `history/runs.jsonl`, `evidence/sources.jsonl` |
| events and summaries | `exportRunArtifacts()` and completion telemetry | `logs/events.jsonl.gz`, `logs/summary.json`, websocket/data-change consumers |
| schema packets and validation | `runIndexingSchemaArtifactsPhase()` | analysis artifacts emitted during finalization |

## Validation Result

The documentation set is now aligned with the current runtime on the following drift points that changed during the rework:

- discovery is orchestrated through `runDiscoverySeedPlan()` and no longer described as a loose prefetch chain
- the live fallback query planner is `planUberQueries()`, not `discoveryPlanner.js`
- SERP processing is lane-based and no longer described as a simple admission-filter plus reranker flow
- finalization now explicitly includes dedicated synthetic source ingestion, resume persistence, and indexing schema packet generation/validation
