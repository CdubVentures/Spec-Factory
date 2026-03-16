# 04-RUNTIME-AND-GUI.md — Worker Panels, Drawer, Prefetch, and Observability

**Scope:** These GUI surfaces observe the **Collection Pipeline** during live runs. The pipeline's job is high-value data extraction and storage. Any existing consensus/validation/publish surfaces reflect legacy behavior being refactored — the Review Phase (comparison, conflict resolution, publishing) will be a separate system implemented after the collection pipeline.

**Purpose:** Single source of truth for all runtime GUI surfaces. What exists, how it works, what data it shows, and what the user should see during live runs.

## Code Locations (Post Feature-Slice Reorg)

| Component area | Path |
|---|---|
| Runtime Ops frontend | `tools/gui-react/src/features/runtime-ops/` |
| Runtime Ops types | `tools/gui-react/src/features/runtime-ops/types.ts` |
| IndexLab frontend | `tools/gui-react/src/features/indexing/` |
| IndexLab types | `tools/gui-react/src/features/indexing/types.ts` |
| Runtime Ops data builders | `src/features/indexing/api/builders/runtimeOpsDataBuilders.js` |
| Runtime Ops routes | `src/features/indexing/api/runtimeOpsRoutes.js` |
| Runtime bridge | `src/indexlab/runtimeBridge.js` |
| Shared model helpers | `tools/gui-react/src/features/runtime-ops/selectors/llmModelHelpers.ts` |
| Phase lineage helpers | `tools/gui-react/src/features/runtime-ops/selectors/phaseLineageHelpers.ts` |

---

## Worker Panel Architecture

Three pool-specific experiences. No more generic panels.

| Pool | Component | Key Data |
|---|---|---|
| Fetch | `WorkerLivePanel` + `WorkerDataDrawer` | Browserstream, documents, extraction, screenshots, queue, metrics, pipeline |
| Search | `SearchWorkerPanel` | Slot identity, query attempts table, KPI row, provider/result tracking, per-result triage decisions (keep/maybe/drop) with scoring |
| LLM | `LlmWorkerPanel` | Call type, model, tokens, cost, prompt/response preview, round tracking |

### Search Worker Identity Model

Bounded slot pool: `search-a`, `search-b`, etc. Slot allocated on `discovery_query_started`, released on `discovery_query_completed`. Same `worker_id` on start and finish events. **No worker inflation** — 4 queries show as 4 attempts across bounded slots, not 8 workers.

### LLM Worker Telemetry

Sequential IDs: `llm-br-1`, `llm-sp-1`, etc. (not reusable). Each call enriched with: `call_type`, `round`, `model`, `prompt_tokens`, `completion_tokens`, `estimated_cost`, `prompt_preview`, `response_preview`, `prefetch_tab`. Aggregate state tracks totals and breakdowns by type/model.

`input_summary` and `output_summary` were removed from the dashboard call row contract (2026-03-10). These fields were never populated at the source (`openaiClient.js`); the pipeline carried null values through 5 layers. The frontend now uses `prompt_preview` (JSON, 8k max) and `response_preview` (plain text, 12k max) directly with smart formatting. The raw worker event schema (`RuntimeOpsWorkerRow`, `WorkerLlmDetail`) retains the summary fields for backward compatibility.

### LLM Call Types

| Call Type | Symbol | Label | Classifier Match |
|---|---|---|---|
| `brand_resolver` | `\u25C8` | Brand Resolver | `reason === 'brand_resolution'` |
| `search_planner` | `\u25CE` | Search Planner | `reason.startsWith('discovery_planner')` |
| `serp_triage` | `\u229E` | SERP Triage | `reason.includes('triage')` or `rerank` or `serp` |
| `domain_classifier` | `\u2B21` | Domain Classifier | `reason === 'domain_safety_classification'` |
| `extraction` | `\u25C9` | Extraction | `reason.startsWith('extract')` or `extract_batch` |
| `validation` | `\u2713` | Candidate Valid. | `reason === 'validate'` or `validate_*` |
| `verification` | `\u2713` | Candidate Valid. | `reason.startsWith('verify_extract')` |
| `field_judge` | `\u2696` | Field Judge | (direct match) |
| `summary_writer` | `\u270E` | Summary Writer | `reason === 'write'` or `summary` |
| `escalation_planner` | `\u21D1` | Escalation | `reason === 'escalation_planner'` or `escalation` |

### Shared Model Helpers

Model name formatting and chip classes are shared between the RuntimeOps LLM tab (`LlmCallsDashboard.tsx`) and the IndexLab LLM panel (`LlmCallsDashboardPanel.tsx`) via `tools/gui-react/src/features/runtime-ops/selectors/llmModelHelpers.ts`.

| Provider | Example Input | Short Name | Chip Class |
|---|---|---|---|
| Claude | `claude-sonnet-4-20250514` | `Sonnet 4.20250514` | `sf-chip-info` |
| Claude | `claude-haiku-3-20250301` | `Haiku 3.20250301` | `sf-chip-success` |
| Claude | `claude-opus-4-20250514` | `Opus 4.20250514` | `sf-chip-accent` |
| Gemini | `gemini-2.5-flash-lite` | `Flash-Lite 2.5` | `sf-chip-teal-strong` |
| Gemini | `gemini-2.5-flash` | `Flash 2.5` | `sf-chip-sky-strong` |
| DeepSeek | `deepseek-chat` | `DS Chat` | `sf-chip-purple` |
| GPT | `gpt-4o-mini` | `4o-mini` | `sf-chip-warning` |

### Cross-Surface Navigation

Worker action buttons (`Open Query Journey`, `Open Search Results`, etc.) switch to corresponding prefetch tab. Focus key stored in `sessionStorage` scoped to category; consumed by target panel on mount.

---

## Worker Data Drawer (576px, 6 Tabs)

### Identity Banner
Every drawer shows: worker_id, pool, state, current URL, elapsed time. No anonymous drawers.

### Docs Tab
- **Summary:** Doc count, total bytes, content type distribution bar, status chips
- **Filters:** URL search, type dropdown, status dropdown, count indicator
- **Table (6 col):** URL | Status | Code | Type | Size | Parse
- **Expansion:** Full URL, all badges, content hash, status flow dots, copy URL

### Extract Tab
- **Summary:** Avg confidence (ConfidenceBar), method distribution, confidence tiers (High ≥90%, Medium 70–89%, Low <70%)
- **Filter:** Clickable method chips
- **Table (5 col):** Field | Value | Confidence | Method | Source host
- **Default sort:** Confidence descending

### Queue Tab
- **Summary:** Lane counts as chips, status counts as colored chips
- **Table (6 col):** Status | Lane | URL | Reason | Targets | Cooldown
- **Pulse animation** on running jobs. Field targets as mini chips. Cooldown countdown.
- **Expansion:** Full URL, created_at, transitions timeline

### Shots Tab
- **Retained frame** with overlay badge (dimensions + timestamp)
- **2-column thumbnail grid** — always visible, no click-to-expand
- **Lightbox** — fixed overlay, keyboard nav (Escape/Left/Right)

### Metrics Tab
- **KPI grid (2×3):** Documents | Fields | Total Size | Avg Confidence | Queue Jobs | Screenshots
- **Content type distribution** bar
- **Method distribution** chip cloud
- **Status funnel** — proportional bars (discovered → fetched → parsed → indexed → error)
- **Confidence histogram** — 3-tier bars

### Pipeline Tab
- **Summary:** X/10 phases used, Y/35 methods observed, dominant phase badge
- **10 phase cards (P01–P10):** Phase badge, label, status (active/docs-only/inactive), doc count + field count (zeros shown explicitly), method chips (observed = full opacity, unobserved = `opacity-40`), ConfidenceBar if active
- **Cross-cutting section:** `llm_extract`, `llm_validate`, `deterministic_normalizer`, `consensus_policy_reducer`
- **Prefers backend `phase_lineage`**, falls back to client-side `computePhaseLineage()`

---

## Prefetch Tabs

| Tab | Panel | Data Source |
|---|---|---|
| NeedSet | `PrefetchNeedSetPanel` | `needset.json` artifact |
| Search Profile | `PrefetchSearchProfilePanel` | `search_profile.json` + gate badges |
| Brand Resolver | `PrefetchBrandResolverPanel` | LLM call group (disabled when `phase2LlmEnabled=false`) |
| Search Planner | `PrefetchSearchPlannerPanel` | LLM call group (disabled when `phase2LlmEnabled=false`) |
| Query Journey | `PrefetchQueryJourneyPanel` | Query rankings, score breakdowns |
| Search Results | `PrefetchSearchResultsPanel` | Result sets per query |
| URL Predictor | `PrefetchUrlPredictorPanel` | LLM call group (disabled when `phase2LlmEnabled=false`) |
| SERP Triage | `PrefetchSerpTriagePanel` | Triage artifact + LLM call group. Surface stays visible when `phase3LlmTriageEnabled=false` and reports runtime mode as deterministic instead of showing the surface as off. |
| Domain Classifier | `PrefetchDomainClassifierPanel` | Domain-health artifact + LLM call group. Surface stays visible when LLM assist is unavailable and reports deterministic mode instead of showing the surface as off. |

Runtime Ops must not hide `SERP Triage` or `Domain Classifier` behind the phase-3 LLM rerank toggle. Both surfaces have deterministic coverage in the live pipeline and should remain inspectable during every run.

## Discovery v2 Surfaces That Must Be Explicit

- `Unresolved Tokens`: show `effective_host_plan.unresolved_tokens` or an explicit missing-plan state; never collapse this to a silent `0/Y`.
- `Host Plan`: render host groups, explain rows, diversity budgets, and policy reasons including `connector_only` / `blocked_in_search` when the v2 plan is present.
- `Host Health`: render the `HostHealth` ladder state, cooldown, blocked reason, and any relax/override reason used by query planning.
- `PromptIndex`: when instrumentation is enabled, LLM worker views should expose prompt version, route, yield, error, and cost linkage instead of leaving prompt telemetry stranded in traces.

### Gate Badge Resolution

Search profile rows show gate badges resolved from `field_rule_hint_counts_by_field[targetField]`: `off` | `zero` | `active`. Gates: `search_hints.query_terms`, `search_hints.domain_hints`, `search_hints.preferred_content_types`. Disabled gates don't contribute to query construction.

### Prefetch API

`GET /api/v1/indexlab/run/:runId/runtime/prefetch` → reads run artifacts + event-derived data → returns `PreFetchPhasesResponse`. Fallback hydration from `category_authority/<category>/_generated/field_rules.json` when gate snapshots missing.

---

## Observability Counters

| Counter | Meaning | Action If High |
|---|---|---|
| `search_slot_reuse` | Slot recycled (idle → running) | Normal — shows bounded pool working |
| `search_finish_without_start` | Completion with no matching slot | Bug — event correlation broken |
| `search_unique_slots` | Distinct slot letters used | Should stay bounded (a–d typical) |
| `llm_missing_telemetry` | LLM call lacks model AND reason | Bug — enrichment missed |
| `llm_orphan_finish` | Completion/failure with no start | Bug — event pairing broken |

Accessed via `bridge.getObservability()`. Diagnostic only, not in API response.

---

## What To Watch During Live Runs

### Pass 1 — Early Yield (First 2 Minutes)
- Search workers dispatching queries to high-authority hosts (manufacturer, support)
- Fetch workers pulling manufacturer pages, spec PDFs, support docs
- Docs tab accumulating HTML + PDF documents
- Extract tab showing high-confidence fields from Tier1/Tier2 sources
- Pipeline tab lighting up P01 (Static HTML), P04 (HTML Tables), P05 (Structured Meta), P06 (Text PDF)

### Pass 2 — Gap-Driven (Minutes 2–5)
- New search queries targeting different host groups (retailer, lab)
- Fetch workers hitting URLs from tier expansion
- Docs tab growing with diverse content types
- Extract tab confidence tiers filling out (Medium tier growing)
- Queue tab showing retry/fallback activity
- Pipeline tab lighting up additional phases

### Pass 3 — Escalation (Minutes 5–8, if triggered)
- LLM workers activating for ambiguous fields
- Queue tab showing harder retries, fallback routes
- Shots tab accumulating screenshots (if visual pipeline active)
- Pipeline tab showing P07 (OCR), P08 (Image OCR) if relevant
- Metrics tab funnel showing documents progressing through all stages

### Red Flags (Stop and File Defect)
- Spinner that never stops → fetch hang or zombie worker
- Worker showing activity but URL frozen → fake-active
- Panel data unchanged after run completes → stale data
- Domain panel `0/Y` for populated category → resolver not using registry
- Core fact sourced from Tier4 → gate bypass
- Console full of unhandled errors → instability
- Feature flag toggled but behavior unchanged → flag not read

---

## Test Coverage

| Area | Tests | Files |
|---|---|---|
| Search slot pool | 9 | `runtimeBridgeSearchWorkerSlotReuse.test.js` |
| LLM call telemetry | 4 | `runtimeBridgeLlmCallTelemetry.test.js` |
| Search pool builders | 7 | `runtimeOpsDataBuildersSearchPool.test.js` |
| LLM pool builders | 6 | `runtimeOpsDataBuildersLlmPool.test.js` |
| Pre-existing builders | 25 | `runtimeOpsDataBuilders.test.js` |
| Pipeline integration | 12 | `runtimeOpsWorkerPipelineIntegration.test.js` |
| Response shape | 7 | `runtimeOpsRouteResponseShape.test.js` |
| Legacy tolerance | 8 | `runtimeOpsBridgeLegacyTolerance.test.js` |
| Observability counters | 6 | `runtimeOpsObservabilityCounters.test.js` |
| GUI contracts | 1 | `runtimeOpsWorkerContractsGui.test.js` |
| Phase lineage (backend) | 14 | `runtimeOpsWorkerDetailPhaseLineage.test.js` |
| Phase lineage (frontend) | 12 | `phaseLineageHelpers.test.js` |
| Drawer structure | 6 | `runtimeOpsWorkerDrawerStructure.test.js` |
| Drawer tabs (6 files) | 42 | `drawer*Tab*.test.js` |
| Worker detail | 8 | `runtimeOpsWorkerDetail.test.js` |
| Drawer wiring | 3 | `runtimeOpsWorkerDrawerWiring.test.js` |
| Bridge event audit | 19 | `runtimeBridgeEventAudit.test.js` |
| LLM dashboard builders | 15 | `llmCallsDashboard.test.js` |
| LLM model helpers | 13 | `llmModelHelpers.test.js` |
| **Total** | **220** | |
