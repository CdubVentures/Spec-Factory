# Data Flow Lineage Audit - Stages 01-13

Scope: runtime start -> NeedSet -> planning -> search execution -> triage -> fetch -> parsing -> identity gating -> consensus -> validation -> export.
Audit date: 2026-03-17.
Authority split:

- `planning/` remains the contract source for stages 01-05.
- `parsing/` is the consolidated contract source for stages 09-13.
- This audit ties the full pipeline together without modifying `planning/`.

## Transformation Tags

| Tag | Meaning |
|-----|---------|
| **passthrough** | Field or payload block survives unchanged across the boundary |
| **normalized** | Formatting or canonicalization changes only |
| **recomputed** | Derived again from upstream data or runtime config |
| **enriched** | New information added by scoring, LLMs, adapters, or aggregation |
| **persisted** | Serialized to durable storage with no semantic change |
| **dropped** | Consumed at the boundary and not emitted downstream |

---

## Boundary 1 - Runtime -> NeedSetOutput

Producer: `needsetEngine.computeNeedSet()`
Contracts: `planning/01-needset-input.json`, `planning/01-needset-output.json`

| Field Group | Tag | Source | Notes |
|-------------|-----|--------|-------|
| `run.*` | **passthrough** | runtime job context | product, category, round, and round mode |
| `identity.*` | **recomputed** | identity lock + identity context | lock state, label state, confidence, domains |
| `fields[].idx.*` | **normalized** | field rules | required level, query hints, domain hints, aliases |
| `fields[].current.*` | **recomputed** | current provenance | value state, confidence, refs found, reasons |
| `fields[].history.*` | **enriched** | `buildFieldHistories()` | queries tried, domains tried, evidence classes, attempts |
| `summary.*` | **recomputed** | fields aggregation | totals, unresolved counts, conflicts |
| `blockers.*` | **recomputed** | fields aggregation | missing, weak, conflict, exact-match, exhausted |
| `planner_seed.*` | **recomputed** | unresolved fields | planner seed for downstream planning |

---

## Boundary 2 - NeedSetOutput -> SearchPlanningContext

Producer: `searchPlanningContext.buildSearchPlanningContext()`
Contracts: `planning/01-needset-planner-context.json`, `planning/02-brand-resolver-*.json`

| Field Group | Tag | Source | Notes |
|-------------|-----|--------|-------|
| `run.*` | **passthrough** | NeedSet output | core run context survives |
| `identity.*` | **passthrough** | NeedSet output | no semantic change |
| `needset.summary` / `needset.blockers` | **passthrough** | NeedSet output | projected into planner context |
| `planner_limits.*` | **recomputed** | runtime config | LLM gate, provider, query caps |
| `group_catalog.*` | **enriched** | static group metadata | category-aware group defaults |
| `focus_groups[]` | **recomputed** | NeedSet fields | grouped unresolved fields, unions, counters, phase |
| `learning.*` | **passthrough** | learning stores | dead queries and dead domains |
| `previous_round_fields` | **passthrough** | prior round state | used later for delta computation |

### Boundary 2b - Brand Resolution Sidecar

Producer: `brandResolver.resolveBrandDomain()`

| Field | Tag | Source | Notes |
|-------|-----|--------|-------|
| `officialDomain` | **enriched** | cache or triage LLM | normalized domain |
| `supportDomain` | **enriched** | cache or triage LLM | normalized domain |
| `aliases` | **enriched** | cache or triage LLM | normalized alias list |
| `confidence` | **enriched** | cache or default LLM hit | planning hint only |
| `reasoning` | **enriched** | LLM response | optional trace payload |

---

## Boundary 3 - SearchPlanningContext -> NeedSetPlannerOutput

Producer: `buildSearchPlan()`
Contracts: `planning/03-search-planner-*.json`

| Field Group | Tag | Source | Notes |
|-------------|-----|--------|-------|
| `planner.*` | **recomputed** / **enriched** | planner LLM + post-processing | mode, confidence, dedupe, error |
| `search_plan_handoff.queries[]` | **enriched** / **recomputed** | planner response + group context | query text, hash, family, fields, domain hints |
| `panel.identity` | **passthrough** | planning context | GUI continuity |
| `panel.summary` / `panel.blockers` | **passthrough** | NeedSet projection | GUI continuity |
| `panel.bundles[]` | **recomputed** / **enriched** | focus groups + planner output | labels, strategy, queries, field states |
| `learning_writeback.*` | **recomputed** | generated queries | distinct hashes, families, domains, groups |

---

## Boundary 4 - NeedSetPlannerOutput -> Query Journey

Producer: `convertHandoffToExecutionPlan()` and related query journey helpers
Contracts: `planning/04-query-journey-*.json`

| Field Group | Tag | Source | Notes |
|-------------|-----|--------|-------|
| `queryRows[]` | **recomputed** | handoff queries | flat execution rows with metadata |
| `selectedQueryRowMap` | **recomputed** | handoff queries | lowercase query lookup |
| `guardContext` | **recomputed** | product identity | brand/model tokens and digit groups |
| `rejectLog` | **recomputed** | identity guard | rejected query reasons |
| `execution plan` | **recomputed** | guarded query rows | provider-ready plan for stage 05 |

---

## Boundary 5 - Query Journey -> Search Execution

Producer: `executeSearchQueries()`
Contracts: `planning/05-searxng-execution-input.json`

| Field Group | Tag | Source | Notes |
|-------------|-----|--------|-------|
| `rawResults[]` | **enriched** | search providers | url, title, snippet, provider, rank |
| `searchAttempts[]` | **recomputed** | execution loop | provider/result-count records |
| `searchJournal[]` | **recomputed** | execution loop | timeline log |
| `internalSatisfied` | **recomputed** | internal corpus result | whether internal search was enough |
| `externalSearchReason` | **recomputed** | execution policy | why web search still ran |

---

## Boundary 6 - Search Execution -> SERP Triage

Producer: `processDiscoveryResults()`

| Field Group | Tag | Source | Notes |
|-------------|-----|--------|-------|
| `candidates[]` | **enriched** | classified search results | tier, role, domain safety, identity signals |
| `approvedUrls[]` | **recomputed** | triage gate | ready for main queue |
| `candidateUrls[]` | **recomputed** | triage gate | ready for candidate queue |
| `serp_explorer` | **recomputed** | query and candidate traces | query-level and candidate-level audit artifact |
| `searchProfileFinal` | **recomputed** | triage summary | executed status, stats, counts |

---

## Boundary 7 - SERP Triage -> Planner Queues

Producer: `runDiscoverySeedPlan()`

| Field Group | Tag | Source | Notes |
|-------------|-----|--------|-------|
| `planner.enqueue(...)` | **recomputed** | approved URLs | queue routing by authority/host |
| `planner.seedCandidates(...)` | **recomputed** | candidate URLs | candidate queue seeding |
| `manufacturerQueue / queue / candidateQueue` | **recomputed** | planner routing rules | queue partitioning |
| `queue_snapshot` | **persisted** | queue snapshot phase | trace artifact |

---

## Boundary 8 - Planner Queues -> Fetch Payloads

Producer: fetch scheduler + fetch artifact phases

| Field Group | Tag | Source | Notes |
|-------------|-----|--------|-------|
| `source` | **passthrough** | planner dequeue | next URL and source metadata |
| `pageData.*` | **enriched** | fetcher output | HTML, final URL, status, title, screenshots, payloads |
| `artifact refs` | **persisted** | source artifacts phase | raw page, DOM snippet, screenshot, network payloads |
| `hostBudgetRow` | **recomputed** | host budget tracker | backoff and retry state |

---

## Boundary 9 - Fetch Payloads -> Extraction

Producer: `runSourceExtractionPhase()`
Contracts: `parsing/09-fetch-to-extraction-*.json`

| Field Group | Tag | Source | Notes |
|-------------|-----|--------|-------|
| flattened structured buckets | **recomputed** | JSON-LD, embedded state, network JSON | field path/value pairs for deterministic parse |
| DOM/article/manual surfaces | **enriched** | HTML, PDF, screenshot | tables, regex fallback, article extraction, PDF pairs |
| `llmEvidencePack` | **enriched** | evidence pack V2 | hashed snippets, field hints, source metadata |
| field candidates | **enriched** | deterministic parser, component resolver, optional LLM | method-scored candidate rows |
| identity candidates | **enriched** | extraction + adapters + optional LLM | brand/model/variant/hard-id rows |
| `phase08FieldContexts` / `phase08PrimeRows` | **recomputed** | source ingestion seam | late-stage extraction summaries |
| `llmSourcesUsed` / `llmCandidatesAccepted` | **recomputed** | stage 09 LLM gate | summary counters |

---

## Boundary 10 - Extraction -> Identity Gating

Producer: `runSourceIdentityEvaluationPhase()`
Contracts: `parsing/10-extraction-to-identity-gating-*.json`

| Field Group | Tag | Source | Notes |
|-------------|-----|--------|-------|
| `anchorCheck` | **recomputed** | extracted anchor fields | major/minor conflicts |
| `identity` | **recomputed** | source candidate map + identity lock | per-source score, confidence, reason codes |
| `identityGatedCandidates` | **enriched** | field candidates + identity result | adds `identity_label` and `identity_confidence` |
| `anchorStatus` | **recomputed** | anchor conflict summary | `pass`, `minor_conflicts`, or `failed_major_conflict` |
| `manufacturerBrandMismatch` | **recomputed** | identity result + source role | escalation sentinel |
| `parserHealth` | **recomputed** | candidates + anchors + endpoint signals | late-stage quality metric |

---

## Boundary 11 - Identity Gating -> Consensus

Producer: `runConsensusEngine()` via `executeConsensusPhase()`
Contracts: `parsing/11-identity-gating-to-consensus-*.json`

| Field Group | Tag | Source | Notes |
|-------------|-----|--------|-------|
| usable sources | **dropped** / **recomputed** | stage 10 output | only matched/possible + no major anchors survive |
| `fields` | **recomputed** | clustered candidates + identity lock seeds | canonical scalar output |
| `provenance` | **enriched** | winning cluster evidence | confirmations, approved domains, citations |
| `candidates` | **persisted** | clustered rows | kept for reducers/review |
| `fieldsBelowPassTarget` | **recomputed** | pass-target gate | unresolved or weak confirmation |
| `criticalFieldsBelowPassTarget` | **recomputed** | pass-target gate | critical subset |
| `newValuesProposed` | **recomputed** | list-value scan | values missing from known sets |
| `agreementScore` | **recomputed** | best vs second cluster dominance | cross-field agreement metric |

---

## Boundary 12 - Consensus -> Validation

Producer: `runProductFinalizationDerivation()`
Contracts: `parsing/12-consensus-to-validation-*.json`

| Field Group | Tag | Source | Notes |
|-------------|-----|--------|-------|
| component prior fills | **enriched** | component matches | fills known component-backed fields |
| `criticDecisions` | **recomputed** | deterministic critic | normalize/reject/unknown outcomes |
| `llmValidatorDecisions` | **enriched** | optional validator LLM | only when expensive finalization is allowed |
| `normalized` | **normalized** / **recomputed** | consensus + critic + runtime gate | final field values before export |
| `provenance` | **enriched** | consensus provenance + later passes | full field evidence chain |
| `completenessStats` / `coverageStats` / `confidence` | **recomputed** | final metrics | validation inputs |
| `gate` | **recomputed** | `evaluateValidationGate()` | validated flag, reasons, checks |
| `publishable` / `publishBlockers` | **recomputed** | gate + identity publish threshold | final publish decision |
| `fieldReasoning` | **recomputed** | provenance + constraints + availability | per-field reasons and unknown reasons |
| `trafficLight` | **recomputed** | provenance tiers and critic output | green/yellow/red counts |
| `needSet` | **enriched** | finalization reasoning + enriched histories | repair and GUI continuity payload |
| `phase07PrimeSources` | **recomputed** | final provenance | prime source summary |
| `phase08Extraction` | **recomputed** | legacy extraction contexts + validator decisions | batch/schema/ref summary |
| `parserHealthRows` / `parserHealthAverage` | **recomputed** | per-source parser health | late-stage parsing metric |

---

## Boundary 13 - Validation -> Output

Producer: `runProductCompletionLifecycle()`
Contracts: `parsing/13-*.json`

| Field Group | Tag | Source | Notes |
|-------------|-----|--------|-------|
| `run_completed` payload | **recomputed** | summary + extraction + resume stats | compact completion telemetry |
| summary artifacts | **persisted** | final summary + markdown + TSV | run summary materialization |
| `learningGateResult` | **recomputed** | final fields + provenance | accepted updates and gate results |
| learning stores | **persisted** | accepted updates | url memory, domain yield, anchors, component lexicon |
| `exportInfo` | **persisted** | exporter | `runBase` and `latestBase` |
| `finalExport` | **persisted** / **recomputed** | final exporter | promotion result, history keys, runtime gate counts |
| SpecDb dual-write | **persisted** | exporter | product run, field state, candidates, queue product |
| `run result` payload | **passthrough** / **enriched** | completion lifecycle | returned to caller with exports and learning |
| data-change events | **persisted** / **enriched** | finalization telemetry | broadcast payloads with entities and versions |

---

## End-To-End Lifecycle Summary

### Primary Payload Families

| Payload Family | Created | Aggregated | Final Consumer | End State |
|----------------|---------|------------|----------------|-----------|
| Need-driven field state | Stage 01 | Stage 12 enriches histories | stage 12 reasoning + GUI | survives as `needSet` |
| Query planning context | Stages 02-04 | stage 04 adapter + stage 06 triage | search execution + GUI | consumed before fetch |
| Search results and triage candidates | Stages 05-06 | stage 07 queue seeding | planner/fetch loop | consumed before fetch |
| Per-source fetch artifacts | Stage 08 | stage 09 extraction | per-source result append | stored in `runs/` raw artifact tree |
| Per-source field and identity candidates | Stage 09 | stage 10 gating | stage 11 consensus | survives as review/debug context in `sourceResults` |
| Consensus field output | Stage 11 | stage 12 refinement | finalization + export | survives as `normalized` + `provenance` |
| Validation and publishability signals | Stage 12 | stage 13 completion | exporters, learning, UI | survives in `summary`, `run_completed`, `finalExport` |
| Durable exports and events | Stage 13 | final exporter + telemetry | filesystem, SpecDb, websocket consumers | terminal state |

### Legacy Runtime Naming Map

| Runtime Name | Documentation Home | Meaning |
|--------------|--------------------|---------|
| `phase08FieldContexts` | `parsing/09-*` and `parsing/12-*` | stage 09 extraction field context aggregate |
| `phase08PrimeRows` | `parsing/09-*` and `parsing/12-*` | stage 09 prime-source aggregate |
| `phase08Extraction` | `parsing/12-*` and `parsing/13-*` | late-stage summary derived from stage 09 context |
| `phase07PrimeSources` | `parsing/12-*` and `parsing/13-*` | prime-source summary derived after validation |

### Mermaid And Contract Sources

- Planning stage overview: `planning/PREFETCH-PIPELINE-OVERVIEW.md`
- Parsing stage overview: `parsing/PARSING-PIPELINE-OVERVIEW.md`
- Full pipeline diagram: `FULL-PIPELINE-START-TO-FINISH.mmd`
- Planning contracts: `planning/00-super-schema-process.json`
- Parsing contracts: `parsing/00-super-schema-process.json`
