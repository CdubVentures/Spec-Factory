# Spec Factory Knobs Maintenance Control File

> **Last full audit:** 2026-03-15 — full code-level sweep against `src/shared/settingsDefaults.js`, `src/config.js` (`loadConfig()`), `src/features/settings-authority/settingsContract.js`, `tools/gui-react/src/stores/settingsManifest.ts`, all pipeline-settings section components (including `RuntimeFlowLlmCortexSection.tsx` which absorbed the former RoleRouting and FallbackRouting sections), `tools/gui-react/src/features/pipeline-settings/components/RuntimeFlowHeaderControls.tsx`, `src/features/indexing/sources/sourceFileService.js`, `src/features/indexing/api/sourceStrategyRoutes.js`, `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx`, `src/db/specDb.js`, `src/features/settings/api/configRoutes.js`, `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx`, `tools/gui-react/src/pages/storage/StoragePage.tsx`, and `tools/gui-react/src/features/studio/components/StudioPage.tsx`. All defaults verified against effective runtime values (settingsDefaults.js wins over config.js hardcoded fallbacks via `applyCanonicalSettingsDefaults`). Frontend labels below denote direct edit surfaces only; inherited or read-only displays do not count as knob ownership.

## How to maintain this file

1. This file has three primary authority families: `src/shared/settingsDefaults.js` for shared runtime/convergence-section/storage/ui/autosave knobs, `category_authority/<category>/sources.json` plus `sourceFileService.js` / `sourceStrategyRoutes.js` for category source strategy, and `src/db/specDb.js` plus `/llm-settings/:category/routes` for the per-category LLM route matrix. Note: the "convergence" settings section still exists for non-loop knobs (consensus, SERP triage, retrieval, lane concurrency) — only the 7 convergence loop knobs were removed (2026-03-15).
2. When tuning a shared runtime/convergence-section/storage/ui knob, update `src/shared/settingsDefaults.js`, then update this file. `src/shared/settingsDefaults.js` is the single canonical owner for shared defaults; `src/config.js` should only consume those defaults plus explicit env overrides and must not carry a competing literal default for the same knob family.
3. Sections are organized by **functional domain**, not pipeline phase numbers.
4. Each section notes the authoritative property path or storage shape (for example `settingsDefaults.js -> runtime.knobName`, `sources.json -> sources.*`, or `llm_route_matrix.*`).
5. Alias rows list both live names when the runtime still carries a legacy or mirrored key.
6. Derived mirrors such as `dynamicFetchPolicyMap`, source-strategy `host`/`sourceId` projections, and LLM route `route_key` / `effort_band` are noted inline, but are not counted as standalone writable knobs unless the app persists them as first-class writable values.
7. Composite JSON-map leaves and provider-specific role/fallback keys are listed again in the appendix when the app exposes them as real config leaves even if the primary sections summarize them through a parent map.
8. The legacy section status label `implemented_gui_env` is not proof that every row is GUI-editable; confirm writable keys through `settingsContract.js` / the GUI surfaces.
9. The Storage page also exposes two persisted credential inputs, `s3SecretAccessKey` and `s3SessionToken`, through the `/storage-settings` route. They are real Storage-tab fields, but they are not backed by `settingsDefaults.js` defaults, so they are called out inline in section 38 and excluded from the shared-default totals in this file.

## Audit Snapshot (2026-03-15)

- Operator-facing direct-edit controls on `Pipeline Settings`: `445`
- Operator-facing direct-edit controls on dedicated non-pipeline pages: `41` (`LlmSettings=30`, `Storage=8`, `Studio=3`)
- Intentionally unsurfaced backend/internal entries in this inventory: `8` (`debounceMs.*`, `statusMs.studioSavedIndicatorReset`, `consensusEligibleFields`)
- Extra persisted Storage-page credential fields outside the shared-default inventory: `2` (`s3SecretAccessKey`, `s3SessionToken`)

## Column legend

| Column | Meaning |
|--------|---------|
| **Knob** | Setting key name (aliases shown with `/`) |
| **Default** | Canonical default from `settingsDefaults.js` or `config.js` |
| **Type** | `bool`, `int`, `float`, `string`, `json`, `enum` |
| **Backend** | Where the knob is defined/validated. `SD` = `settingsDefaults.js`, `CFG` = `config.js`, `SC` = `settingsContract.js` (PUT/GET routes) |
| **Frontend** | Which GUI surface directly edits this knob. Section abbreviations defined below. `—` = not surfaced in GUI |
| **Summary** | Purpose and behavior |

### Frontend section abbreviations

| Abbrev | Full path | GUI tab |
|--------|-----------|---------|
| **RunSetup** | `RuntimeFlowRunSetupSection.tsx` | Pipeline Settings → Run Setup |
| **FetchNet** | `RuntimeFlowFetchNetworkSection.tsx` | Pipeline Settings → Fetch & Network |
| **Automation** | `RuntimeFlowAutomationSection.tsx` | Pipeline Settings → Automation |
| **Browser** | `RuntimeFlowBrowserRenderingSection.tsx` | Pipeline Settings → Browser & Rendering |
| **Parsing** | `RuntimeFlowParsingSection.tsx` | Pipeline Settings → Parsing |
| ~~**Scoring**~~ | ~~`RuntimeFlowScoringEvidenceSection.tsx`~~ | ~~Pipeline Settings → Scoring & Evidence~~ RETIRED 2026-03-16 |
| **LlmCortex** | `RuntimeFlowLlmCortexSection.tsx` | Pipeline Settings → LLM & CORTEX (role models, token budgets, fallback chain, cache) |
| **PlanTriage** | `RuntimeFlowPlannerTriageSection.tsx` | Pipeline Settings → Planner & Triage |
| **RunOutput** | `RuntimeFlowRunOutputSection.tsx` | Pipeline Settings → Run Output |
| **Observability** | `RuntimeFlowObservabilitySection.tsx` | Pipeline Settings → Observability |
| **Ocr** | `RuntimeFlowOcrSection.tsx` | Pipeline Settings → OCR |
| **RuntimeHdr** | `RuntimeFlowHeaderControls.tsx` | Pipeline Settings → Runtime header controls |
| **Convergence** | `PipelineSettingsPage.tsx` (Convergence tab) | Pipeline Settings → Convergence (convergence loop group removed 2026-03-15; tab still hosts consensus, SERP triage, retrieval, lane concurrency knobs) |
| **Storage** | `StoragePage.tsx` | Storage page |
| **Studio** | `StudioPage.tsx` | Studio page |
| **LlmSettings** | `LlmSettingsPage.tsx` | LLM Settings page |
| **SourceStrat** | `PipelineSettingsPage.tsx` (Source Strategy tab) | Pipeline Settings → Source Strategy |

---

## Section Index

| # | Section | Knobs |
|---|---------|-------|
| 1 | Runtime Trace & Event Stream | 6 |
| 2 | NeedSet Engine | 14 |
| 3 | ~~Convergence Loop~~ | ~~7~~ RETIRED 2026-03-15 |
| 4 | Search Profile & Query Planning | 11 |
| 5 | Search Providers | 2 |
| 6 | SERP Triage & Reranking | 21 |
| 7 | Frontier & URL Health | 15 |
| 8 | Fetch & Browser Configuration | 28 |
| 9 | Rate Limiting | 8 |
| 10 | Discovery & Manufacturer Research | 22 |
| 11 | Parsing: Static DOM | 5 |
| 12 | Parsing: Article Extraction | 5 |
| 13 | Parsing: HTML Tables | 1 |
| 14 | ~~Parsing: Structured Metadata~~ | ~~6~~ RETIRED 2026-03-16 (Wave 7; dead feature — client never instantiated) |
| 15 | Parsing: PDF Processing | 7 |
| 16 | Parsing: OCR | 8 |
| 17 | Parsing: Chart Extraction | 1 |
| 18 | ~~Parsing Confidence Calibration~~ | ~~1~~ RETIRED 2026-03-16 |
| 19 | ~~Evidence Pack~~ | ~~2~~ RETIRED 2026-03-16 |
| 20 | ~~Tier Retrieval & Evidence Scoring~~ | ~~3~~ RETIRED 2026-03-16 (Wave 6; core controls hardcoded) |
| 21 | ~~Consensus Engine~~ | ~~8~~ RETIRED 2026-03-16 (Wave 6; weights hardcoded, thresholds removed) |
| 22 | ~~Identity Gate~~ | ~~3~~ RETIRED 2026-03-16 |
| 23 | LLM Core Configuration | 11 |
| 24 | LLM Model Routing | 15 |
| 25 | LLM Token Budgets | 22 |
| 26 | LLM Extraction Settings | 6 |
| 27 | LLM Budget Guards | 8 |
| 28 | LLM Verification, Pricing & Cache | 8 |
| 29 | Visual Asset Capture | 19 |
| 30 | Screenshots & Screencast | 12 |
| 31 | Aggressive Mode | 18 |
| 32 | CORTEX Integration | 28 |
| 33 | Indexing Resume & Reextract | 8 |
| 34 | Learning & Category Authority | 19 |
| 35 | Hypothesis & Self-Improvement | 6 |
| 36 | Drift Detection & Maintenance | 5 |
| 37 | Daemon & Imports | 4 |
| 38 | Output & Artifact Storage | 25 |
| 39 | Dual-Write Flags | 8 |
| 40 | Worker Lane Concurrency | 4 |
| 41 | UI & Autosave | 13 |
| 42 | Source Strategy | 20 |
| 43 | LLM Route Matrix | 29 |
| 44 | Compound Learning Indexes | 2 |
| 45 | Community Consensus Dual-Write | 4 |
| | **Total** | **520** |

---

## 1. Runtime Trace & Event Stream

All knobs: `settingsDefaults.js → runtime.*` · Status: `implemented_gui_env`

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `runtimeTraceEnabled` | `true` | bool | SD, SC | Observability | Master switch for runtime tracing — feeds NDJSON log and WebSocket to GUI |
| `runtimeTraceFetchRing` | `30` | int | SD, SC | Observability | Circular buffer size for recent fetch events in memory |
| `runtimeTraceLlmRing` | `50` | int | SD, SC | Observability | Circular buffer size for recent LLM call events in memory |
| `runtimeTraceLlmPayloads` | `true` | bool | SD, SC | Observability | Capture full LLM request/response payloads in trace ring |
| `runtimeControlFile` | `_runtime/control/runtime_overrides.json` | string | SD, SC | RunOutput | Path to hot-reload runtime override JSON file |
| `runtimeEventsKey` | `_runtime/events.jsonl` | string | SD, SC | RunOutput | Path for NDJSON event log output |

---

## 2. NeedSet Engine

All knobs: `settingsDefaults.js → runtime.*` · Status: `implemented_gui_env`

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `needsetRequiredWeightIdentity` | `5` | int | SD, SC | Scoring | Weight multiplier for identity-level fields (brand/model/variant) |
| `needsetRequiredWeightCritical` | `4` | int | SD, SC | Scoring | Weight multiplier for critical-level fields |
| `needsetRequiredWeightRequired` | `2` | int | SD, SC | Scoring | Weight multiplier for required-level fields |
| `needsetRequiredWeightExpected` | `1` | int | SD, SC | Scoring | Weight multiplier for expected-level fields |
| `needsetRequiredWeightOptional` | `1` | int | SD, SC | Scoring | Weight multiplier for optional-level fields |
| `needsetMissingMultiplier` | `2` | float | SD, SC | Scoring | Doubles need score for empty/missing fields |
| `needsetTierDeficitMultiplier` | `2` | float | SD, SC | Scoring | Doubles need when field wants Tier 1 but only has Tier 2+ |
| `needsetMinRefsDeficitMultiplier` | `1.5` | float | SD, SC | Scoring | 50% boost when refs_found < min_refs |
| `needsetConflictMultiplier` | `1.5` | float | SD, SC | Scoring | 50% boost when sources disagree on field value |
| `needsetIdentityLockThreshold` | `0.95` | float | SD, SC | Scoring | Confidence >= this transitions identity to "locked" |
| `needsetIdentityProvisionalThreshold` | `0.7` | float | SD, SC | Scoring | Confidence >= this transitions identity to "provisional" |
| `needsetDefaultIdentityAuditLimit` | `24` | int | SD, SC | Scoring | Max rows in identity audit context |

Convergence-section knobs (still active — these are NeedSet scoring knobs, not convergence loop knobs):

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `needsetEvidenceDecayDays` | `14` | int | SD, SC | Scoring, Convergence | Half-life in days for evidence freshness decay |
| `needsetEvidenceDecayFloor` | `0.3` | float | SD, SC | Scoring, Convergence | Minimum decay multiplier floor (never below 30%) |

---

## 3. ~~Convergence Loop~~ — RETIRED 2026-03-15

**All 7 knobs removed from code, config, env parsing, settings defaults, GUI, and route contracts.** `runConvergenceLoop()` deleted. `runProduct()` is the only pipeline execution path. ~2,800 LOC removed across 10 deleted files and ~36 modified files.

Retired knobs (no longer in codebase):

| Knob | Was | Status |
|------|-----|--------|
| `convergenceMaxRounds` | `3` | **REMOVED** |
| `convergenceNoProgressLimit` | `3` | **REMOVED** |
| `convergenceMaxLowQualityRounds` | `2` | **REMOVED** |
| `convergenceLowQualityConfidence` | `0.5` | **REMOVED** |
| `convergenceMaxDispatchQueries` | `15` | **REMOVED** |
| `convergenceMaxTargetFields` | `45` | **REMOVED** |
| `convergenceIdentityFailFastRounds` | `1` | **REMOVED** |

Non-convergence knobs that remain in the convergence settings section (consensus, SERP triage, retrieval, lane concurrency — 21 keys) are documented in their respective sections below.

---

## 4. Search Profile & Query Planning

All knobs: `settingsDefaults.js → runtime.*` · Status: `implemented_gui_env`

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `phase2LlmEnabled` / `llmPlanDiscoveryQueries` | `true` | bool | SD, SC | PlanTriage | Master switch for LLM search planner |
| `llmModelPlan` / `phase2LlmModel` | `gemini-2.5-flash-lite` | string | SD, SC | LlmCortex | LLM model used for search query planning |
| `llmPlanProvider` | `gemini` | string | SD, SC | RunOutput | Provider for planning LLM calls |
| `llmPlanBaseUrl` | `https://generativelanguage.googleapis.com/v1beta/openai` | string | SD, SC | RunOutput | Base URL for planning LLM |
| `llmPlanApiKey` | `''` | string | SD, SC | LlmCortex | API key for planning LLM (inherits from main if empty) |
| `searchProfileCapMapJson` | `{"deterministicAliasCap":6,"llmAliasValidationCap":12,...}` | json | SD, SC | RunSetup | Caps for query generation components |

**Cap map breakdown:**

| Sub-knob | Default | Type | Summary |
|----------|---------|------|---------|
| `deterministicAliasCap` | `6` | int | Max model slug candidates from deterministic alias generation |
| `llmAliasValidationCap` | `12` | int | Max aliases the LLM planner can return |
| `llmDocHintQueriesCap` | `3` | int | Max queries per document hint category |
| `llmFieldTargetQueriesCap` | `3` | int | Max queries targeting a single missing field |
| `dedupeQueriesCap` | `24` | int | Max total unique queries after deduplication |

---

## 5. Search Providers

All knobs: `settingsDefaults.js → runtime.*` · Status: `implemented_gui_env`

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `searchProvider` | `dual` | enum | SD, SC | RunSetup | Active operator search provider (`google`, `bing`, `searxng`, `dual`). Internal off-state `none` is reserved for disabled discovery paths. |
| `searxngBaseUrl` | `http://127.0.0.1:8080` | string | SD, SC | RunSetup | SearXNG instance URL |

---

## 6. SERP Triage & Reranking

All knobs: `settingsDefaults.js → convergence.* / runtime.*` · Status: `implemented_gui_env`

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `serpTriageEnabled` | `hardcoded true` | bool | CFG | — | SERP triage master invariant. Not an operator-facing toggle. |
| `serpTriageMinScore` | `3` | int | SD, SC | Convergence | Minimum reranker score to keep a URL |
| `serpTriageMaxUrls` | `20` | int | SD, SC | Convergence | Max URLs passed through triage |
| `llmSerpRerankEnabled` | `hardcoded true` | bool | CFG | — | LLM-assisted SERP reranking invariant. Not an operator-facing toggle. |
| `phase3LlmModel` | `gemini-2.5-flash-lite` | string | SD, SC | LlmCortex | Model alias used for LLM reranking |
| `serpRerankerWeightMapJson` | `{"identityStrongBonus":1.4,...}` | json | SD, SC | PlanTriage | JSON weight map for deterministic SERP reranking |

**SERP reranker weight map** (`serpRerankerWeightMapJson`):

| Weight | Default | Type | Summary |
|--------|---------|------|---------|
| `identityStrongBonus` | `1.4` | float | Bonus for strong identity match |
| `identityPartialBonus` | `0.7` | float | Bonus for partial identity match |
| `identityWeakBonus` | `0` | float | Bonus for weak identity match |
| `identityNoneBonus` | `-1.4` | float | Penalty for no identity match |
| `brandPresenceBonus` | `1.6` | float | Bonus when brand name appears |
| `modelPresenceBonus` | `2.1` | float | Bonus when model name appears |
| `specManualKeywordBonus` | `0.7` | float | Bonus for spec/manual keywords |
| `reviewBenchmarkBonus` | `0.6` | float | Bonus for review/benchmark content |
| `forumRedditPenalty` | `-1.2` | float | Penalty for forum/Reddit URLs |
| `brandInHostnameBonus` | `0.8` | float | Bonus when brand is in hostname |
| `wikipediaPenalty` | `-1` | float | Penalty for Wikipedia URLs |
| `variantGuardPenalty` | `-4` | float | Penalty for variant mismatch |
| `multiModelHintPenalty` | `-1.6` | float | Penalty for multi-model pages |
| `tier1Bonus` | `1.1` | float | Bonus for Tier 1 sources |
| `tier2Bonus` | `0.1` | float | Bonus for Tier 2 sources |

---

## 7. Frontier & URL Health

All knobs: `settingsDefaults.js → runtime.*` · Status: `implemented_gui_env`

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `frontierDbPath` | `_intel/frontier/frontier.json` | string | SD, SC | FetchNet | Frontier database file path |
| `frontierEnableSqlite` | `true` | bool | SD, SC | FetchNet | Use SQLite for frontier persistence |
| `frontierStripTrackingParams` | `true` | bool | SD, SC | FetchNet | Strip UTM/tracking params from URLs |
| `frontierQueryCooldownSeconds` | `21600` | int | SD, SC | FetchNet | Query cooldown (6 hours) |
| `frontierCooldown404Seconds` | `259200` | int | SD, SC | FetchNet | 404 cooldown (72 hours) |
| `frontierCooldown404RepeatSeconds` | `1209600` | int | SD, SC | FetchNet | Repeated 404 cooldown (14 days) |
| `frontierCooldown410Seconds` | `7776000` | int | SD, SC | FetchNet | 410 Gone cooldown (90 days) |
| `frontierCooldownTimeoutSeconds` | `21600` | int | SD, SC | FetchNet | Timeout cooldown (6 hours) |
| `frontierCooldown403BaseSeconds` | `1800` | int | SD, SC | FetchNet | Base 403 cooldown (30 min) for faster recovery on temporary blocks |
| `frontierCooldown429BaseSeconds` | `600` | int | SD, SC | FetchNet | Base 429 cooldown (10 min) for faster rate-limit recovery |
| `frontierBackoffMaxExponent` | `4` | int | SD, SC | FetchNet | Max exponential backoff exponent |
| `frontierPathPenaltyNotfoundThreshold` | `3` | int | SD, SC | FetchNet | Path penalty after N not-founds |
| `frontierBlockedDomainThreshold` | `1` | int | SD, SC | FetchNet | Block domain after N failures |
| `frontierRepairSearchEnabled` | `true` | bool | SD, SC | FetchNet | Enable repair search for failed URLs |
| `repairDedupeRule` | `domain_once` | enum | SD, SC | FetchNet | Repair dedup rule (`domain_once`, `domain_and_status`, `none`) |

---

## 8. Fetch & Browser Configuration

All knobs: `settingsDefaults.js → runtime.*` · Status: `implemented_gui_env`

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `concurrency` | `4` | int | SD, SC | FetchNet | Global fetch concurrency (alias of `fetchConcurrency`) |
| `fetchConcurrency` | `4` | int | SD, SC | FetchNet | Fetch-specific concurrency |
| `perHostMinDelayMs` | `1500` | int | SD, SC | FetchNet | Minimum delay between requests to same host |
| `fetchPerHostConcurrencyCap` | `1` | int | SD, SC | FetchNet | Max concurrent requests per host |
| `preferHttpFetcher` | `true` | bool | SD, SC | FetchNet | Prefer the HTTP/static path first, with Playwright escalation for pages that require it |
| `dynamicCrawleeEnabled` | `true` | bool | SD, SC | Browser | Enable Crawlee dynamic fetcher |
| `crawleeHeadless` | `true` | bool | SD, SC | Browser | Run Playwright in headless mode |
| `crawleeRequestHandlerTimeoutSecs` | `75` | int | SD, SC | Browser | Crawlee request handler timeout |
| `dynamicFetchRetryBudget` | `1` | int | SD, SC | Browser | Retry budget for dynamic fetches |
| `dynamicFetchRetryBackoffMs` | `2500` | int | SD, SC | Browser | Backoff between retries |
| `dynamicFetchPolicyMapJson` | `''` | json | SD, SC | Browser | Per-domain fetch policy overrides (JSON) |
| `pageGotoTimeoutMs` | `12000` | int | SD, SC | FetchNet | Browser page-goto timeout |
| `pageNetworkIdleTimeoutMs` | `2000` | int | SD, SC | FetchNet | Network idle timeout |
| `postLoadWaitMs` | `200` | int | SD, SC | FetchNet | Post-load wait after navigation before extraction begins |
| `autoScrollEnabled` | `true` | bool | SD, SC | Browser | Enable auto-scroll to trigger lazy loading |
| `autoScrollPasses` | `2` | int | SD, SC | Browser | Number of scroll passes |
| `autoScrollDelayMs` | `1200` | int | SD, SC | Browser | Delay between scroll passes |
| `fetchSchedulerEnabled` | `true` | bool | SD, SC | FetchNet | Enable advanced fetch scheduler |
| `fetchSchedulerMaxRetries` | `1` | int | SD, SC | FetchNet | Scheduler max retries |
| `fetchSchedulerFallbackWaitMs` | `60000` | int | SD, SC | FetchNet | Scheduler fallback wait |
| `fetchSchedulerInternalsMapJson` | `{"defaultDelayMs":300,...}` | json | SD, SC | FetchNet | Scheduler internals |
| `graphqlReplayEnabled` | `true` | bool | SD, SC | Browser | Replay intercepted GraphQL responses |
| `maxGraphqlReplays` | `20` | int | SD, SC | Browser | Max GraphQL replays per page |
| `maxNetworkResponsesPerPage` | `2500` | int | SD, SC | Browser | Max network responses captured per page |
| `robotsTxtCompliant` | `true` | bool | SD, SC | Browser | Respect robots.txt |
| `robotsTxtTimeoutMs` | `6000` | int | SD, SC | Browser | Robots.txt fetch timeout |
| `userAgent` | `real Chrome UA` | string | SD, SC | RunSetup | Realistic browser user agent for fetch/browser traffic |
| `fetchBudgetMs` | `45000` | int | SD, SC | FetchNet | Per-page fetch budget timeout (ms). Playwright fetcher aborts if a single page fetch exceeds this budget. |

Note: runtime snapshots also carry a derived `dynamicFetchPolicyMap` object parsed from `dynamicFetchPolicyMapJson`; it is not a separately writable knob.

---

## 9. Rate Limiting

All knobs: `settingsDefaults.js → runtime.*` · Status: `implemented_gui_env`

All rate limiters default to `0` (disabled/unlimited):

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `searchGlobalRps` | `0` | int | SD, SC | FetchNet | Global search requests per second |
| `searchGlobalBurst` | `0` | int | SD, SC | FetchNet | Global search burst allowance |
| `searchPerHostRps` | `0` | int | SD, SC | FetchNet | Per-host search requests per second |
| `searchPerHostBurst` | `0` | int | SD, SC | FetchNet | Per-host search burst allowance |
| `domainRequestRps` | `0` | int | SD, SC | FetchNet | Per-domain request rate |
| `domainRequestBurst` | `0` | int | SD, SC | FetchNet | Per-domain burst allowance |
| `globalRequestRps` | `0` | int | SD, SC | FetchNet | Global request rate |
| `globalRequestBurst` | `0` | int | SD, SC | FetchNet | Global burst allowance |

---

## 10. Discovery & Manufacturer Research

All knobs: `settingsDefaults.js → runtime.*` · Status: `implemented_gui_env`

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `discoveryEnabled` | `true` | bool | SD, SC | RunSetup | Master switch for search discovery |
| `runProfile` / `profile` | `standard` | enum | SD, SC | — | Run profile (`fast`, `standard`, `thorough`) |
| `discoveryMaxQueries` | `10` | int | SD, SC | RunSetup | Max search queries per discovery round |
| `discoveryResultsPerQuery` | `10` | int | CFG | — | Results retained per discovery query. **Hardcoded in config.js — not tunable via env/settings/GUI.** |
| `discoveryMaxDiscovered` | `60` | int | SD, SC | RunSetup | Max discovered URLs per product |
| `discoveryQueryConcurrency` | `1` | int | CFG | — | Concurrent search queries. **Hardcoded in config.js — not tunable via env/settings/GUI.** |
| `maxUrlsPerProduct` | `50` | int | SD, SC | RunSetup | Max URLs processed per product |
| `maxCandidateUrls` | `80` | int | SD, SC | RunSetup | Max candidate URLs before filtering |
| `maxPagesPerDomain` | `5` | int | SD, SC | RunSetup | Max pages from a single domain |
| `maxRunSeconds` | `480` | int | SD, SC | RunSetup | Max run time per product (8 min) |
| `fetchCandidateSources` | `true` | bool | SD, SC | RunSetup | Fetch candidate source URLs |
| `manufacturerAutoPromote` | `true` | bool | SD, SC | RunSetup | Auto-promote brand-resolved official domains into manufacturer source entries |

---

## 11. Parsing: Static DOM

All knobs: `settingsDefaults.js → runtime.*` · Status: `implemented_gui_env`

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `staticDomExtractorEnabled` | `true` | bool | SD, SC | Parsing | Enable static DOM extractor |
| `staticDomMode` | `cheerio` | string | SD, SC | Parsing | DOM parsing mode |
| `staticDomTargetMatchThreshold` | `0.55` | float | SD, SC | Parsing | Minimum match threshold for target fields |
| `staticDomMaxEvidenceSnippets` | `120` | int | SD, SC | Parsing | Max evidence snippets from static DOM |
| `domSnippetMaxChars` | `3600` | int | SD, SC | Parsing | Max chars per DOM snippet |

---

## 12. Parsing: Article Extraction

All knobs: `settingsDefaults.js → runtime.*` · Status: `implemented_gui_env`

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `articleExtractorV2Enabled` | `true` | bool | SD, SC | Parsing | Enable V2 article extractor |
| `articleExtractorMinChars` | `700` | int | SD, SC | Parsing | Minimum chars for valid article |
| `articleExtractorMinScore` | `45` | int | SD, SC | Parsing | Minimum quality score for article |
| `articleExtractorMaxChars` | `24000` | int | SD, SC | Parsing | Maximum chars to extract from article |
| `articleExtractorDomainPolicyMapJson` | `''` | json | SD, SC | Parsing | Per-domain article extraction policies |

---

## 13. Parsing: HTML Tables

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `htmlTableExtractorV2` | `true` | bool | SD, SC | Parsing | Enable V2 HTML table extractor |

---

## ~~14. Parsing: Structured Metadata~~ — RETIRED 2026-03-16 (Wave 7)

**All 6 knobs removed.** `StructuredMetadataClient` was fully implemented but never instantiated in the pipeline — `pageData.structuredMetadata` was never populated. Values hardcoded in `configBuilder.js`; feature permanently off. `daemonGracefulShutdownTimeoutMs` (section 37 daemon group) also retired in Wave 7 — loaded but never read by any runtime code.

---

## 15. Parsing: PDF Processing

All knobs: `settingsDefaults.js → runtime.*` · Status: `implemented_gui_env`

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `pdfBackendRouterEnabled` | `true` | bool | SD, SC | Parsing | Enable PDF backend router |
| `pdfPreferredBackend` | `auto` | string | SD, SC | Parsing | Preferred PDF backend |
| `pdfBackendRouterTimeoutMs` | `120000` | int | SD, SC | Parsing | PDF processing timeout (2 min) |
| `pdfBackendRouterMaxPages` | `60` | int | SD, SC | Parsing | Max PDF pages to process |
| `pdfBackendRouterMaxPairs` | `5000` | int | SD, SC | Parsing | Max key-value pairs from PDF |
| `pdfBackendRouterMaxTextPreviewChars` | `20000` | int | SD, SC | Parsing | Max text preview chars from PDF |
| `maxPdfBytes` | `30000000` | int | SD, SC | Parsing | Max PDF file size (30 MB) |

---

## 16. Parsing: OCR

All knobs: `settingsDefaults.js → runtime.*` · Status: `implemented_gui_env`

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `scannedPdfOcrEnabled` | `true` | bool | SD, SC | Ocr | Enable OCR for scanned PDFs |
| `scannedPdfOcrPromoteCandidates` | `true` | bool | SD, SC | Ocr | Promote OCR candidates to evidence |
| `scannedPdfOcrBackend` | `auto` | enum | SD, SC | Ocr | OCR backend (`auto`, `tesseract`, `none`) |
| `scannedPdfOcrMaxPages` | `4` | int | SD, SC | Ocr | Max pages to OCR |
| `scannedPdfOcrMaxPairs` | `800` | int | SD, SC | Ocr | Max key-value pairs from OCR |
| `scannedPdfOcrMinCharsPerPage` | `30` | int | SD, SC | Ocr | Min chars/page to consider as scanned |
| `scannedPdfOcrMinLinesPerPage` | `2` | int | SD, SC | Ocr | Min lines/page to consider as scanned |
| `scannedPdfOcrMinConfidence` | `0.5` | float | SD, SC | Ocr | Min OCR confidence threshold |

---

## 17. Parsing: Chart Extraction

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `chartExtractionEnabled` | `true` | bool | SD, SC | Parsing | Enable chart/graph extraction from pages |

---

## ~~18. Parsing Confidence Calibration~~ RETIRED 2026-03-16 (Wave 5)

| Knob | Status |
|------|--------|
| ~~`parsingConfidenceBaseMapJson`~~ | RETIRED — unpacked individual keys remain in config |

---

## ~~19. Evidence Pack~~ RETIRED 2026-03-16 (Wave 5)

| Knob | Status |
|------|--------|
| ~~`evidenceTextMaxChars`~~ | RETIRED |
| ~~`evidencePackLimitsMapJson`~~ | RETIRED — unpacked individual keys remain in config |

---

## 20. ~~Tier Retrieval & Evidence Scoring~~ — Core controls RETIRED 2026-03-16 (Wave 6)

**~~Core retrieval controls~~** RETIRED 2026-03-16 (Wave 6) — `retrievalMaxHitsPerField`, `retrievalMaxPrimeSources`, `retrievalIdentityFilterEnabled` removed from convergence settings surface; values hardcoded in `configBuilder.js`. Zero behavior change.

**~~Tier weights~~** RETIRED 2026-03-16 (Wave 5) — `retrievalTierWeightTier1`–`Tier5` removed from settings surface.

**~~Doc kind weights~~** RETIRED 2026-03-16 (Wave 5) — `retrievalDocKindWeight*` removed from settings surface.

**~~Method weights~~** RETIRED 2026-03-16 (Wave 5) — `retrievalMethodWeight*` removed from settings surface.

**~~Score formula components~~** RETIRED 2026-03-16 (Wave 5) — `retrievalAnchorScorePerMatch`, `retrievalIdentityScorePerMatch`, `retrievalUnitMatchBonus`, `retrievalDirectFieldMatchBonus`, `retrievalInternalsMapJson` removed from settings surface.

**Retrieval internals** (hardcoded defaults, no longer env-configurable):

| Sub-knob | Default | Type | Summary |
|----------|---------|------|---------|
| `evidenceTierWeightMultiplier` | `2.6` | float | Tier weight multiplier in score formula |
| `evidenceDocWeightMultiplier` | `1.5` | float | Doc weight multiplier in score formula |
| `evidenceMethodWeightMultiplier` | `0.85` | float | Method weight multiplier in score formula |
| `evidencePoolMaxRows` | `4000` | int | Max rows in evidence pool |
| `snippetsPerSourceCap` | `120` | int | Max snippets per source |
| `maxHitsCap` | `80` | int | Global max hits cap |
| `evidenceRefsLimit` | `12` | int | Max evidence references per field |
| `reasonBadgesLimit` | `8` | int | Max reason badges per field |
| `retrievalAnchorsLimit` | `6` | int | Max retrieval anchors |
| `primeSourcesMaxCap` | `20` | int | Upper bound for prime sources |
| `fallbackEvidenceMaxRows` | `6000` | int | Fallback pool max rows |
| `provenanceOnlyMinRows` | `24` | int | Min rows for provenance-only mode |

---

## 21. ~~Consensus Engine~~ — Weights RETIRED 2026-03-16 (Wave 6)

**~~LLM confidence weights by tier~~** RETIRED 2026-03-16 (Wave 6) — `consensusLlmWeightTier1`–`Tier4` removed from convergence settings surface; values hardcoded in `configBuilder.js`. Zero behavior change.

**~~Source tier weights~~** RETIRED 2026-03-16 (Wave 6) — `consensusTier1Weight`–`Tier4Weight` removed from convergence settings surface; values hardcoded in `configBuilder.js`. Zero behavior change.

**~~Consensus thresholds~~** RETIRED 2026-03-16 (Wave 6) — `consensusTier4OverrideThreshold`, `consensusMinConfidence` removed from convergence settings surface. Never consumed by runtime code.

**~~Method weights~~** RETIRED 2026-03-16 (Wave 5) — `consensusMethodWeight*` removed from settings surface.

**~~Acceptance thresholds~~** RETIRED 2026-03-16 (Wave 5) — `consensusPolicyBonus`, `consensusWeightedMajorityThreshold`, `consensusStrictAcceptanceDomainCount`, `consensusRelaxedAcceptanceDomainCount`, `consensusInstrumentedFieldThreshold`, `consensusConfidenceScoringBase`, `consensusPassTargetIdentityStrong`, `consensusPassTargetNormal`, `allowBelowPassTargetFill` removed from settings surface. Bug fix: `allowBelowPassTargetFill` now defaults to `true` via `?? true` in `consensusEngine.js`.

---

## ~~22. Identity Gate~~ RETIRED 2026-03-16 (Wave 5)

| Knob | Status |
|------|--------|
| ~~`identityGatePublishThreshold`~~ | RETIRED |
| ~~`identityGateBaseMatchThreshold`~~ | RETIRED |
| ~~`qualityGateIdentityThreshold`~~ | RETIRED |

All three knobs removed from settings surface. Consumers use hardcoded `??` fallback defaults.

---

## 23. LLM Core Configuration

All knobs: settingsDefaults.js runtime section. Status: implemented_gui_env

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `llmEnabled` | `false` | bool | SD, SC | RunOutput | Master switch for all LLM calls |
| `llmProvider` | `gemini` | enum | SD, SC | RunOutput | Primary LLM provider |
| `llmBaseUrl` | `https://generativelanguage.googleapis.com/v1beta/openai` | string | SD, SC | RunOutput | Primary LLM API base URL |
| `openaiApiKey` | `''` | string | SD, SC | RunOutput | OpenAI API key |
| `anthropicApiKey` | `''` | string | SD, SC | RunOutput | Anthropic API key |
| `llmMaxTokens` | `16384` | int | SD, SC | Scoring | Max input tokens |
| `llmMaxOutputTokens` | `1400` | int | SD, SC | Scoring | Default max output tokens |
| `llmTimeoutMs` | `30000` | int | SD, SC | Scoring | LLM request timeout (30s) |
| `llmReasoningMode` | `true` | bool | SD, SC | Scoring | Enable reasoning/thinking mode |
| `llmReasoningBudget` | `32768` | int | SD, SC | Scoring | Token budget for reasoning |
| `llmFallbackEnabled` | `false` | bool | SD, SC | LlmCortex | Enable provider fallback chain |

---

## 24. LLM Model Routing

All knobs: settingsDefaults.js runtime section. Status: implemented_gui_env

**Primary models:**

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `llmModelPlan` | `gemini-2.5-flash-lite` | string | SD, SC | LlmCortex | Planning/alias generation model |
| `llmModelTriage` | `gemini-2.5-flash-lite` | string | SD, SC | LlmCortex | SERP triage model |
| `llmModelFast` | `gemini-2.5-flash-lite` | string | SD, SC | LlmCortex | Fast/cheap model for simple tasks |
| `llmModelReasoning` | `gemini-2.5-flash-lite` | string | SD, SC | LlmCortex | Reasoning model for complex tasks |
| `llmModelExtract` | `gemini-2.5-flash-lite` | string | SD, SC | LlmCortex | Field extraction model |
| `llmModelValidate` | `gemini-2.5-flash-lite` | string | SD, SC | LlmCortex | Value validation model |
| `llmModelWrite` | `gemini-2.5-flash-lite` | string | SD, SC | LlmCortex | Summary writing model |

**Fallback models:**

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `llmPlanFallbackModel` | `gemini-2.5-flash-lite` | string | SD, SC | LlmCortex | Plan fallback model |
| `llmExtractFallbackModel` | `gemini-2.5-flash-lite` | string | SD, SC | LlmCortex | Extract fallback model |
| `llmValidateFallbackModel` | `gemini-2.5-flash-lite` | string | SD, SC | LlmCortex | Validate fallback model |
| `llmWriteFallbackModel` | `gemini-2.5-flash-lite` | string | SD, SC | LlmCortex | Write fallback model |
| `llmFallbackPlanModel` | `gemini-2.5-flash-lite` | string | SD, SC | LlmCortex | (alias) Plan fallback model |
| `llmFallbackExtractModel` | `gemini-2.5-flash-lite` | string | SD, SC | LlmCortex | (alias) Extract fallback model |
| `llmFallbackValidateModel` | `gemini-2.5-flash-lite` | string | SD, SC | LlmCortex | (alias) Validate fallback model |
| `llmFallbackWriteModel` | `gemini-2.5-flash-lite` | string | SD, SC | LlmCortex | (alias) Write fallback model |

---

## 25. LLM Token Budgets

All knobs: settingsDefaults.js runtime section. Status: implemented_gui_env

**Primary role token limits:**

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `llmTokensPlan` | `2048` | int | SD, SC | LlmCortex | Plan role token cap |
| `llmMaxOutputTokensPlan` | `2048` | int | SD, SC | LlmCortex | Plan role max output tokens |
| `llmTokensTriage` | `2048` | int | SD, SC | LlmCortex | Triage role token cap |
| `llmMaxOutputTokensTriage` | `2048` | int | SD, SC | LlmCortex | Triage role max output tokens |
| `llmTokensFast` | `1536` | int | SD, SC | LlmCortex | Fast role token cap |
| `llmMaxOutputTokensFast` | `1536` | int | SD, SC | LlmCortex | Fast role max output tokens |
| `llmTokensReasoning` | `4096` | int | SD, SC | LlmCortex | Reasoning role token cap |
| `llmMaxOutputTokensReasoning` | `4096` | int | SD, SC | LlmCortex | Reasoning role max output tokens |
| `llmTokensExtract` | `900` | int | SD, SC | LlmCortex | Extract role token cap |
| `llmMaxOutputTokensExtract` | `900` | int | SD, SC | LlmCortex | Extract role max output tokens |
| `llmTokensValidate` | `900` | int | SD, SC | LlmCortex | Validate role token cap |
| `llmMaxOutputTokensValidate` | `900` | int | SD, SC | LlmCortex | Validate role max output tokens |
| `llmTokensWrite` | `800` | int | SD, SC | LlmCortex | Write role token cap |
| `llmMaxOutputTokensWrite` | `800` | int | SD, SC | LlmCortex | Write role max output tokens |

**Fallback role token limits:**

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `llmTokensPlanFallback` | `2048` | int | SD, SC | LlmCortex | Plan fallback token cap |
| `llmMaxOutputTokensPlanFallback` | `2048` | int | SD, SC | LlmCortex | Plan fallback max output tokens |
| `llmTokensExtractFallback` | `4096` | int | SD, SC | LlmCortex | Extract fallback token cap |
| `llmMaxOutputTokensExtractFallback` | `4096` | int | SD, SC | LlmCortex | Extract fallback max output tokens |
| `llmTokensValidateFallback` | `4096` | int | SD, SC | LlmCortex | Validate fallback token cap |
| `llmMaxOutputTokensValidateFallback` | `4096` | int | SD, SC | LlmCortex | Validate fallback max output tokens |
| `llmTokensWriteFallback` | `2048` | int | SD, SC | LlmCortex | Write fallback token cap |
| `llmMaxOutputTokensWriteFallback` | `2048` | int | SD, SC | LlmCortex | Write fallback max output tokens |

---

## 26. LLM Extraction Settings

All knobs: settingsDefaults.js runtime section. Status: implemented_gui_env

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `llmExtractMaxTokens` | `1200` | int | SD, SC | Scoring | Max tokens per extraction call |
| `llmExtractMaxSnippetsPerBatch` | `4` | int | SD, SC | Scoring | Max evidence snippets per LLM batch |
| `llmExtractMaxSnippetChars` | `700` | int | SD, SC | Scoring | Max chars per snippet sent to LLM |
| `llmExtractSkipLowSignal` | `true` | bool | SD, SC | Scoring | Skip low-signal snippets in extraction |
| `llmExtractReasoningBudget` | `2048` | int | SD, SC | Scoring | Reasoning token budget for extraction |
| `llmMaxEvidenceChars` | `60000` | int | SD, SC | Scoring | Max total evidence chars sent to LLM |

---

## 27. LLM Budget Guards

All knobs: settingsDefaults.js runtime section. Status: implemented_gui_env

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `llmMonthlyBudgetUsd` | `300` | int | SD, SC | Scoring | Monthly LLM spend budget (USD) |
| `llmPerProductBudgetUsd` | `0.35` | float | SD, SC | Scoring | Per-product LLM spend budget (USD) |
| `llmDisableBudgetGuards` | `false` | bool | SD, SC | Scoring | Disable all budget guards |
| `llmMaxBatchesPerProduct` | `4` | int | SD, SC | Scoring | Max LLM batches per product |
| `llmMaxCallsPerProductTotal` | `14` | int | SD, SC | LlmCortex | Max total LLM calls per product |
| `llmMaxCallsPerProductFast` | `6` | int | SD, SC | LlmCortex | Max fast-role LLM calls per product |
| `llmMaxCallsPerRound` | `5` | int | SD, SC | Scoring | Max LLM calls per round |
| `llmWriteSummary` | `false` | bool | SD, SC | RunOutput | Generate LLM-written product summary |

---

## 28. LLM Verification, Pricing & Cache

All knobs: settingsDefaults.js runtime section. Status: implemented_gui_env

**Verification:**

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `llmVerifyMode` | `true` | bool | SD, SC | Scoring | Enable LLM verification pass |
| `llmVerifySampleRate` | `25` | int | SD, SC | Scoring | Verify every Nth extraction |

**Pricing:**

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `llmCostInputPer1M` | `1.25` | float | SD, SC | Scoring | Cost per 1M input tokens (USD) |
| `llmCostOutputPer1M` | `10` | float | SD, SC | Scoring | Cost per 1M output tokens (USD) |
| `llmCostCachedInputPer1M` | `0.125` | float | SD, SC | Scoring | Cost per 1M cached input tokens (USD) |

**Cache:**

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `llmExtractionCacheEnabled` | `true` | bool | SD, SC | LlmCortex | Cache LLM extraction results |
| `llmExtractionCacheDir` | `.specfactory_tmp/llm_cache` | string | SD, SC | LlmCortex | Cache directory |
| `llmExtractionCacheTtlMs` | `604800000` | int | SD, SC | LlmCortex | Cache TTL (7 days) |

---

## 29. Visual Asset Capture

All knobs: settingsDefaults.js runtime section. Status: implemented_gui_env

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `visualAssetCaptureEnabled` | `true` | bool | SD, SC | Browser | Master switch for visual asset capture |
| `visualAssetCaptureMaxPerSource` | `5` | int | SD, SC | Browser | Max assets captured per source |
| `visualAssetStoreOriginal` | `true` | bool | SD, SC | Browser | Store original resolution assets |
| `visualAssetRetentionDays` | `30` | int | SD, SC | Browser | Asset retention period |
| `visualAssetPhashEnabled` | `true` | bool | SD, SC | Browser | Enable perceptual hash deduplication |
| `visualAssetReviewFormat` | `webp` | string | SD, SC | Browser | Output format for review assets |
| `visualAssetReviewLgMaxSide` | `1600` | int | SD, SC | Browser | Large review image max dimension |
| `visualAssetReviewSmMaxSide` | `768` | int | SD, SC | Browser | Small review image max dimension |
| `visualAssetReviewLgQuality` | `75` | int | SD, SC | Browser | Large review image quality |
| `visualAssetReviewSmQuality` | `65` | int | SD, SC | Browser | Small review image quality |
| `visualAssetRegionCropMaxSide` | `1024` | int | SD, SC | Browser | Region crop max dimension |
| `visualAssetRegionCropQuality` | `70` | int | SD, SC | Browser | Region crop quality |
| `visualAssetLlmMaxBytes` | `512000` | int | SD, SC | Browser | Max bytes for LLM vision input |
| `visualAssetMinWidth` | `320` | int | SD, SC | Browser | Min image width to capture |
| `visualAssetMinHeight` | `320` | int | SD, SC | Browser | Min image height to capture |
| `visualAssetMinSharpness` | `80` | int | SD, SC | Browser | Min sharpness score |
| `visualAssetMinEntropy` | `2.5` | float | SD, SC | Browser | Min entropy score |
| `visualAssetMaxPhashDistance` | `10` | int | SD, SC | Browser | Max perceptual hash distance for dedup |
| `visualAssetHeroSelectorMapJson` | `''` | json | SD, SC | Browser | Hero image CSS selector overrides |

---

## 30. Screenshots & Screencast

All knobs: settingsDefaults.js runtime section. Status: implemented_gui_env

**Page screenshots:**

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `capturePageScreenshotEnabled` | `true` | bool | SD, SC | Browser | Enable page screenshot capture |
| `capturePageScreenshotFormat` | `jpeg` | string | SD, SC | Browser | Screenshot format |
| `capturePageScreenshotQuality` | `50` | int | SD, SC | Browser | Screenshot quality (1-100) |
| `capturePageScreenshotMaxBytes` | `5000000` | int | SD, SC | Browser | Max screenshot file size (5 MB) |
| `capturePageScreenshotSelectors` | `table,[data-spec-table],...` | string | SD, SC | Browser | CSS selectors for spec table screenshots |
| `runtimeCaptureScreenshots` | `true` | bool | SD, SC | Browser | Enable runtime screenshot capture |
| `runtimeScreenshotMode` | `last_only` | string | SD, SC | Browser | Screenshot capture mode |

**Screencast:**

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `runtimeScreencastEnabled` | `true` | bool | SD, SC | Observability | Enable live screencast streaming |
| `runtimeScreencastFps` | `10` | int | SD, SC | Observability | Screencast frame rate |
| `runtimeScreencastQuality` | `50` | int | SD, SC | Observability | Screencast JPEG quality |
| `runtimeScreencastMaxWidth` | `1280` | int | SD, SC | Observability | Screencast max width |
| `runtimeScreencastMaxHeight` | `720` | int | SD, SC | Observability | Screencast max height |

---

## 31. Aggressive Mode

All knobs: settingsDefaults.js runtime section. Status: implemented_gui_env

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `aggressiveModeEnabled` | `true` | bool | SD, SC | Automation | Always-on production default (true). Three-mode preset system retired 2026-03-09 |
| `aggressiveConfidenceThreshold` | `0.85` | float | SD, SC | Automation | Confidence threshold for field acceptance |
| `aggressiveMaxSearchQueries` | `3` | int | SD, SC | Automation | Max search queries per pass |
| `aggressiveEvidenceAuditEnabled` | `true` | bool | SD, SC | Automation | Enable evidence audit cross-checking |
| `aggressiveEvidenceAuditBatchSize` | `60` | int | SD, SC | Automation | Evidence audit batch size |
| `aggressiveMaxTimePerProductMs` | `600000` | int | SD, SC | Automation | Max time per product (10 min) |
| `aggressiveThoroughFromRound` | `2` | int | SD, SC | Automation | Switch to thorough search from this round |
| `aggressiveRound1MaxUrls` | `45` | int | SD, SC | Automation | Max URLs in round 1 |
| `aggressiveRound1MaxCandidateUrls` | `120` | int | SD, SC | Automation | Max candidate URLs in round 1 |
| `aggressiveLlmMaxCallsPerRound` | `8` | int | SD, SC | Automation | Max LLM calls per round |
| `aggressiveLlmMaxCallsPerProductTotal` | `16` | int | SD, SC | Automation | Max total LLM calls per product |
| `aggressiveLlmTargetMaxFields` | `75` | int | SD, SC | Automation | Max fields targeted per product |
| `aggressiveLlmDiscoveryPasses` | `3` | int | SD, SC | Automation | LLM discovery passes |
| `aggressiveLlmDiscoveryQueryCap` | `12` | int | SD, SC | Automation | Max LLM discovery queries |
| `uberAggressiveEnabled` | `true` | bool | SD, SC | Automation | Always-on production default (true). Three-mode preset system retired 2026-03-09 |
| `uberMaxRounds` | `6` | int | SD, SC | Automation | Max uber-aggressive rounds |
| `uberMaxUrlsPerProduct` | `25` | int | SD, SC | RunSetup | Max URLs per product in uber path |
| `uberMaxUrlsPerDomain` | `6` | int | SD, SC | RunSetup | Max URLs per domain |

---

## 32. CORTEX Integration

All knobs: settingsDefaults.js runtime section. Status: implemented_gui_env

**Core:**

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `cortexEnabled` | `false` | bool | SD, SC | Automation | Enable CORTEX external LLM orchestrator |
| `cortexBaseUrl` | `http://localhost:5001/v1` | string | SD, SC | Automation | CORTEX sync API URL |
| `cortexApiKey` | `key` | string | SD, SC | Automation | CORTEX API key |
| `cortexAsyncEnabled` | `true` | bool | SD, SC | Automation | Enable async CORTEX operations |
| `cortexAsyncBaseUrl` | `http://localhost:5000/api` | string | SD, SC | Automation | CORTEX async API URL |
| `cortexAsyncSubmitPath` | `/async/submit` | string | SD, SC | Automation | Async submit endpoint |
| `cortexAsyncStatusPath` | `/async/status/{id}` | string | SD, SC | Automation | Async status endpoint |

**Timeouts and lifecycle:**

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `cortexSyncTimeoutMs` | `60000` | int | SD, SC | Automation | Sync request timeout (1 min) |
| `cortexAsyncPollIntervalMs` | `5000` | int | SD, SC | Automation | Async poll interval (5s) |
| `cortexAsyncMaxWaitMs` | `900000` | int | SD, SC | Automation | Max async wait (15 min) |
| `cortexAutoStart` | `true` | bool | SD, SC | Automation | Auto-start CORTEX container |
| `cortexAutoRestartOnAuth` | `true` | bool | SD, SC | Automation | Auto-restart on auth failure |
| `cortexEnsureReadyTimeoutMs` | `15000` | int | SD, SC | Automation | Ready check timeout |
| `cortexStartReadyTimeoutMs` | `60000` | int | SD, SC | Automation | Startup ready timeout |
| `cortexFailureThreshold` | `3` | int | SD, SC | Automation | Failures before circuit opens |
| `cortexCircuitOpenMs` | `30000` | int | SD, SC | Automation | Circuit breaker open duration |

**Escalation:**

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `cortexEscalateConfidenceLt` | `0.85` | float | SD, SC | Automation | Escalate when confidence below this |
| `cortexEscalateIfConflict` | `true` | bool | SD, SC | Automation | Escalate on field conflicts |
| `cortexEscalateCriticalOnly` | `true` | bool | SD, SC | Automation | Only escalate critical fields |
| `cortexMaxDeepFieldsPerProduct` | `12` | int | SD, SC | Automation | Max fields per deep analysis |

**Model routing:**

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `cortexModelFast` | `gpt-5-low` | string | SD, SC | Automation | Fast/cheap model |
| `cortexModelAudit` | `gpt-5.1-low` | string | SD, SC | Automation | Audit model |
| `cortexModelDom` | `gpt-5.1-low` | string | SD, SC | Automation | DOM analysis model |
| `cortexModelReasoningDeep` | `gpt-5.2-high` | string | SD, SC | Automation | Deep reasoning model |
| `cortexModelVision` | `gpt-5.2-xhigh` | string | SD, SC | Automation | Vision model |
| `cortexModelSearchFast` | `gpt-5.1-low` | string | SD, SC | Automation | Fast search model |
| `cortexModelRerankFast` | `gpt-5.1-low` | string | SD, SC | Automation | Fast reranking model |
| `cortexModelSearchDeep` | `gpt-5.2-xhigh` | string | SD, SC | Automation | Deep search model |

---

## 33. Indexing Resume & Reextract

All knobs: settingsDefaults.js runtime section. Status: implemented_gui_env

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `indexingResumeMode` / `resumeMode` | `auto` | enum | SD, SC | RunSetup | Resume mode (auto, force_resume, start_over) |
| `indexingResumeMaxAgeHours` / `resumeWindowHours` | `48` | int | SD, SC | RunSetup | Max age for resumable runs |
| `indexingResumeSeedLimit` | `24` | int | SD, SC | Observability | Max seed sources for resume |
| `indexingResumePersistLimit` | `160` | int | SD, SC | Observability | Max persisted sources for resume |
| `indexingReextractEnabled` / `reextractIndexed` | `true` | bool | SD, SC | RunSetup | Enable re-extraction of indexed data |
| `indexingReextractAfterHours` / `reextractAfterHours` | `24` | int | SD, SC | RunSetup | Re-extract after this many hours |
| `indexingSchemaPacketsValidationEnabled` | `true` | bool | SD, SC | Observability | Validate indexing schema packets |
| `indexingSchemaPacketsValidationStrict` | `true` | bool | SD, SC | Observability | Strict schema validation |

---

## 34. Learning & Category Authority

All knobs: settingsDefaults.js runtime section. Status: implemented_gui_env

**Learning and decay:**

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `selfImproveEnabled` | `true` | bool | SD, SC | Automation | Enable self-improvement learning loop |
| `learningConfidenceThreshold` | `0.85` | float | SD, SC | Automation | Min confidence for learning signals |
| `componentLexiconDecayDays` | `90` | int | SD, SC | Automation | Component lexicon half-life |
| `componentLexiconExpireDays` | `180` | int | SD, SC | Automation | Component lexicon expiry |
| `fieldAnchorsDecayDays` | `60` | int | SD, SC | Automation | Field anchors decay half-life |
| `urlMemoryDecayDays` | `120` | int | SD, SC | Automation | URL memory decay half-life |
| `fieldRewardHalfLifeDays` | `45` | int | SD, SC | Automation | Field reward signal half-life |
| `batchStrategy` | `bandit` | string | SD, SC | Automation | Batch scheduling strategy |

**Category Authority (formerly helper files):**

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `helperFilesEnabled` | `true` | bool | SD, SC | Automation | Master toggle for helper-files runtime substrate |
| `helperFilesRoot` | `category_authority` | string | SD, SC | Automation | Helper files root directory |
| `helperSupportiveEnabled` | `true` | bool | SD, SC | Automation | Enable supportive helper data |
| `helperSupportiveFillMissing` | `true` | bool | SD, SC | Automation | Fill missing fields from helpers |
| `helperSupportiveMaxSources` | `12` | int | SD, SC | Automation | Max helper sources per product |
| `helperAutoSeedTargets` | `true` | bool | SD, SC | Automation | Auto-seed target fields from helpers |
| `helperActiveSyncLimit` | `0` | int | SD, SC | Automation | Active sync limit (0 = unlimited) |
| `categoryAuthorityEnabled` | `true` | bool | SD, SC | Automation | Enable category authority system |
| `categoryAuthorityRoot` | `category_authority` | string | SD, SC | Automation | Category authority root directory |
| `indexingCategoryAuthorityEnabled` | `false` | bool | SD, SC | Automation | Enable category authority in indexing |
| `indexingHelperFilesEnabled` | `false` | bool | SD, SC | Automation | Enable helper files in indexing pipeline |

---

## 35. Hypothesis & Self-Improvement

All knobs: settingsDefaults.js runtime section. Status: implemented_gui_env

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `maxHypothesisItems` | `120` | int | SD, SC | Automation | Max hypothesis queue items |
| `hypothesisAutoFollowupRounds` | `2` | int | SD, SC | Automation | Auto follow-up rounds per hypothesis |
| `hypothesisFollowupUrlsPerRound` | `24` | int | SD, SC | Automation | URLs per follow-up round |
| `endpointSignalLimit` | `120` | int | SD, SC | Automation | Max endpoint signals tracked |
| `endpointSuggestionLimit` | `36` | int | SD, SC | Automation | Max endpoint suggestions |
| `endpointNetworkScanLimit` | `1800` | int | SD, SC | Automation | Max network scan entries |

---

## 36. Drift Detection & Maintenance

All knobs: settingsDefaults.js runtime section. Status: implemented_gui_env

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `driftDetectionEnabled` | `true` | bool | SD, SC | Automation | Enable drift detection |
| `driftPollSeconds` | `86400` | int | SD, SC | Automation | Drift poll interval (24 hours) |
| `driftScanMaxProducts` | `250` | int | SD, SC | Automation | Max products per drift scan |
| `driftAutoRepublish` | `true` | bool | SD, SC | Automation | Auto-republish on drift detection |
| `reCrawlStaleAfterDays` | `30` | int | SD, SC | Automation, Observability | Re-crawl sources older than this |

---

## 37. Daemon & Imports

All knobs: settingsDefaults.js runtime section. Status: implemented_gui_env

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `daemonConcurrency` | `1` | int | SD, SC | Observability | Daemon worker concurrency |
| ~~`daemonGracefulShutdownTimeoutMs`~~ | ~~`60000`~~ | ~~int~~ | — | — | RETIRED Wave 7 — never read by runtime |
| `importsRoot` | `imports` | string | SD, SC | Observability | Import watch directory |
| `importsPollSeconds` | `10` | int | SD, SC | Observability | Import poll interval |

---

## 38. Output & Artifact Storage

All knobs: settingsDefaults.js runtime section. Status: implemented_gui_env

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `outputMode` | `local` | enum | SD, SC | RunOutput | Output mode (local, dual, s3) |
| `localMode` | `true` | bool | SD, SC | RunOutput | Enable local filesystem mode |
| `dryRun` | `false` | bool | SD, SC | RunOutput | Dry run mode (no writes) |
| `mirrorToS3` | `false` | bool | SD, SC | RunOutput | Mirror output to S3 |
| `mirrorToS3Input` | `false` | bool | SD, SC | RunOutput | Mirror input to S3 |
| `localInputRoot` | `fixtures/s3` | string | SD, SC | RunOutput | Local input directory |
| `localOutputRoot` | `<system-temp>/spec-factory/output` | string | SD, SC | RunOutput | Local output directory |
| `writeMarkdownSummary` | `true` | bool | SD, SC | RunOutput | Write markdown summary file |
| `specDbDir` | `.specfactory_tmp` | string | SD, SC | Parsing | SQLite database directory |
| `maxJsonBytes` | `6000000` | int | SD, SC | RunSetup | Max JSON response size (6 MB) |
| `awsRegion` | `us-east-2` | string | SD, SC | RunOutput | AWS region (read-only — derived from Storage) |
| `s3Bucket` | `my-spec-harvester-data` | string | SD, SC | RunOutput | S3 bucket name (read-only — derived from Storage) |
| `s3InputPrefix` | `specs/inputs` | string | SD, SC | RunOutput | S3 input prefix |
| `s3OutputPrefix` | `specs/outputs` | string | SD, SC | RunOutput | S3 output prefix |
| `automationQueueStorageEngine` | `sqlite` | enum | SD, SC | FetchNet | Queue storage (sqlite, memory) |
| `authoritySnapshotEnabled` | `true` | bool | SD, SC | Observability | Enable authority snapshot capture |
| `eloSupabaseAnonKey` | `''` | string | SD, SC | RunOutput | Supabase anonymous key for Elo ranking integration |
| `eloSupabaseEndpoint` | `''` | string | SD, SC | RunOutput | Supabase endpoint URL for Elo ranking integration |

**Run data storage** (settingsDefaults.js storage section):

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `storage.enabled` | `false` | bool | SD | Storage | Enable run data storage |
| `storage.destinationType` | `local` | enum | SD | Storage | Destination (local, s3) |
| `storage.localDirectory` | `''` | string | SD | Storage | Local storage directory |
| `storage.awsRegion` | `us-east-2` | string | SD | Storage | AWS region (SSOT for config.awsRegion) |
| `storage.s3Bucket` | `''` | string | SD | Storage | S3 bucket (SSOT for config.s3Bucket) |
| `storage.s3Prefix` | `spec-factory-runs` | string | SD | Storage | S3 prefix |
| `storage.s3AccessKeyId` | `''` | string | SD | Storage | S3 access key |

Storage page operational fields exposed through `/storage-settings` but not backed by `settingsDefaults.js` defaults:

- Writable Storage-tab-only fields: `s3SecretAccessKey`, `s3SessionToken`
- Response/status-only storage fields: `hasS3SecretAccessKey`, `hasS3SessionToken`, `stagingTempDirectory`, `updatedAt`
- These are intentionally excluded from the shared-default knob totals and from the section index counts above.

---

## 39. Dual-Write Flags

All knobs: settingsDefaults.js runtime section. Status: implemented_gui_env

When true, data is written to both SQLite and NDJSON files:

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `eventsJsonWrite` | `true` | bool | SD, SC | Observability | Events dual-write (only one that defaults true) |
| `queueJsonWrite` | `false` | bool | SD, SC | Observability | Queue state dual-write |
| `billingJsonWrite` | `false` | bool | SD, SC | Observability | Billing data dual-write |
| `brainJsonWrite` | `false` | bool | SD, SC | Observability | Brain/learning dual-write |
| `intelJsonWrite` | `false` | bool | SD, SC | Observability | Intel data dual-write |
| `corpusJsonWrite` | `false` | bool | SD, SC | Observability | Corpus data dual-write |
| `learningJsonWrite` | `false` | bool | SD, SC | Observability | Learning signals dual-write |
| `cacheJsonWrite` | `false` | bool | SD, SC | Observability | Cache data dual-write |

---

## 40. Worker Lane Concurrency

All knobs: settingsDefaults.js convergence section. Status: implemented_gui_env

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `laneConcurrencySearch` | `2` | int | SD, SC | Convergence | Concurrent search workers |
| `laneConcurrencyFetch` | `4` | int | SD, SC | Convergence | Concurrent fetch workers |
| `laneConcurrencyParse` | `4` | int | SD, SC | Convergence | Concurrent parse workers |
| `laneConcurrencyLlm` | `2` | int | SD, SC | Convergence | Concurrent LLM workers |

---

## 41. UI & Autosave

**UI toggles** (settingsDefaults.js ui section):

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `studioAutoSaveAllEnabled` | `false` | bool | SD | Studio | Global studio auto-save toggle |
| `studioAutoSaveEnabled` | `true` | bool | SD | Studio | Studio docs auto-save |
| `studioAutoSaveMapEnabled` | `true` | bool | SD | Studio | Studio map auto-save |
| `runtimeAutoSaveEnabled` | `true` | bool | SD | RuntimeHdr | Runtime settings auto-save |
| `storageAutoSaveEnabled` | `false` | bool | SD | Storage | Storage settings auto-save |
| `llmSettingsAutoSaveEnabled` | `true` | bool | SD | LlmSettings | LLM settings auto-save |

**Autosave debounce** (settingsDefaults.js autosave.debounceMs section):

These are implementation-timing internals for the GUI autosave framework, not operator-facing tuning knobs. They are intentionally not surfaced in the frontend.

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `debounceMs.runtime` | `1500` | int | SD | — | Runtime settings save debounce |
| `debounceMs.storage` | `700` | int | SD | — | Storage settings save debounce |
| `debounceMs.llmRoutes` | `700` | int | SD | — | LLM route settings save debounce |
| `debounceMs.uiSettings` | `250` | int | SD | — | UI settings save debounce |
| `debounceMs.studioDocs` | `1500` | int | SD | — | Studio docs save debounce |
| `debounceMs.studioMap` | `1500` | int | SD | — | Studio map save debounce |

**Autosave status** (settingsDefaults.js autosave.statusMs section):

This status timer is also an implementation detail rather than an operator-facing settings surface.

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `statusMs.studioSavedIndicatorReset` | `2000` | int | SD | — | Saved indicator display duration (ms) |

---

## 42. Source Strategy

All knobs: `category_authority/<category>/sources.json -> sources.*` plus `src/features/indexing/api/sourceStrategyRoutes.js` / `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` · Status: `implemented_gui_json`

**Editable entry fields** (new-entry GUI defaults from `makeSourceStrategyDraft()` and create/save normalization from `sourceStrategyPayloadFromDraft()` / `sourceStrategyRoutes.js`):

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `host` | `''` | string | sourceStrategyRoutes | SourceStrat | Required create input; also used to derive `sourceId` when omitted |
| `display_name` | `'' -> host` | string | sourceStrategyRoutes | SourceStrat | Blank draft default; save/create falls back to the host string |
| `tier` | `tier2_lab` | enum | sourceStrategyRoutes | SourceStrat | Default tier for new source entries |
| `authority` | `unknown` | enum | sourceStrategyRoutes | SourceStrat | Default authority label |
| `base_url` | `'' -> https://<host>` | string | sourceStrategyRoutes | SourceStrat | Blank draft default; save/create falls back to the host URL |
| `content_types` | `'' -> []` | string | sourceStrategyRoutes | SourceStrat | CSV input for content-type hints |
| `doc_kinds` | `'' -> []` | string | sourceStrategyRoutes | SourceStrat | CSV input for document-kind hints |
| `crawl_config.method` | `http` | enum | sourceStrategyRoutes | SourceStrat | Default crawl method for new entries |
| `crawl_config.rate_limit_ms` | `2000` | int | sourceStrategyRoutes | SourceStrat | Per-host delay for this source entry |
| `crawl_config.timeout_ms` | `12000` | int | sourceStrategyRoutes | SourceStrat | Per-request timeout for this source entry |
| `crawl_config.robots_txt_compliant` | `true` | bool | sourceStrategyRoutes | SourceStrat | Respect `robots.txt` by default |
| `field_coverage.high` | `'' -> []` | string | sourceStrategyRoutes | SourceStrat | CSV input for high-confidence field hints |
| `field_coverage.medium` | `'' -> []` | string | sourceStrategyRoutes | SourceStrat | CSV input for medium-confidence field hints |
| `field_coverage.low` | `'' -> []` | string | sourceStrategyRoutes | SourceStrat | CSV input for low-confidence field hints |
| `discovery.method` | `search_first` | enum | sourceStrategyRoutes | SourceStrat | New-entry discovery mode. Valid: `search_first`, `manual` |
| `discovery.source_type` | `''` | string | sourceStrategyRoutes | SourceStrat | Discovery classifier token |
| `discovery.search_pattern` | `''` | string | sourceStrategyRoutes | SourceStrat | Optional explicit search-pattern template |
| `discovery.priority` | `50` | int | sourceStrategyRoutes | SourceStrat | Priority used for source ordering |
| `discovery.enabled` | `true` | bool | sourceStrategyRoutes | SourceStrat | Master enable switch for this source entry |
| `discovery.notes` | `''` | string | sourceStrategyRoutes | SourceStrat | Free-form operator notes |

**Read-time fallback for legacy rows with no `discovery` block** (`DISCOVERY_DEFAULTS` in `sourceFileService.js`):

`method=manual`, `source_type=''`, `search_pattern=''`, `priority=50`, `enabled=true`, `notes=''`

---

## 43. LLM Route Matrix

All knobs: `src/db/specDb.js -> llm_route_matrix.*` via `src/features/settings/api/configRoutes.js` and `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` · Status: `implemented_gui_db`

`scope`, `route_key`, and `effort_band` identify or derive rows, but they are not standalone writable knobs.

**Per-row editable fields** (base fallback defaults from `baseLlmRoute()`):

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `required_level` | `expected` | enum | specDb | LlmSettings | Route severity / publication importance |
| `difficulty` | `medium` | enum | specDb | LlmSettings | Extraction difficulty band |
| `availability` | `expected` | enum | specDb | LlmSettings | Expected availability of evidence |
| `effort` | `3` | int | specDb | LlmSettings | Core effort dial; drives derived `effort_band` |
| `single_source_data` | `true` | bool | specDb | LlmSettings | Send the primary source packet by default |
| `all_source_data` | `false` | bool | specDb | LlmSettings | Do not send all source packets unless escalated |
| `enable_websearch` | `true` | bool | specDb | LlmSettings | Allow route-level web search by default |
| `model_ladder_today` | `gpt-5-low -> gpt-5-medium` | string | specDb | LlmSettings | Default model escalation ladder |
| `all_sources_confidence_repatch` | `true` | bool | specDb | LlmSettings | Recompute confidence with all sources |
| `max_tokens` | `4096` | int | specDb | LlmSettings | Default token cap before row-specific overrides |
| `studio_key_navigation_sent_in_extract_review` | `true` | bool | specDb | LlmSettings | Include key navigation context |
| `studio_contract_rules_sent_in_extract_review` | `true` | bool | specDb | LlmSettings | Include contract rules in extraction review |
| `studio_extraction_guidance_sent_in_extract_review` | `true` | bool | specDb | LlmSettings | Include extraction guidance |
| `studio_tooltip_or_description_sent_when_present` | `true` | bool | specDb | LlmSettings | Include tooltip/description context |
| `studio_enum_options_sent_when_present` | `true` | bool | specDb | LlmSettings | Include enum options |
| `studio_component_variance_constraints_sent_in_component_review` | `true` (component) / `false` | bool | specDb | LlmSettings | Component-only variance constraints |
| `studio_parse_template_sent_direct_in_extract_review` | `true` | bool | specDb | LlmSettings | Include parse template in extract review |
| `studio_ai_mode_difficulty_effort_sent_direct_in_extract_review` | `true` | bool | specDb | LlmSettings | Include AI mode / difficulty / effort context |
| `studio_required_level_sent_in_extract_review` | `true` | bool | specDb | LlmSettings | Include required-level context |
| `studio_component_entity_set_sent_when_component_field` | `true` (component) / `false` | bool | specDb | LlmSettings | Component-only entity-set context |
| `studio_evidence_policy_sent_direct_in_extract_review` | `true` | bool | specDb | LlmSettings | Include evidence policy |
| `studio_variance_policy_sent_in_component_review` | `true` (component) / `false` | bool | specDb | LlmSettings | Component-only variance-policy |
| `studio_constraints_sent_in_component_review` | `true` (component) / `false` | bool | specDb | LlmSettings | Component-only constraints |
| `studio_send_booleans_prompted_to_model` | `false` | bool | specDb | LlmSettings | Do not send boolean prompting extras by default |
| `scalar_linked_send` | `scalar value + prime sources` | string | specDb | LlmSettings | Default scalar payload mode |
| `component_values_send` | `component values + prime sources` | string | specDb | LlmSettings | Default component payload mode |
| `list_values_send` | `list values prime sources` | string | specDb | LlmSettings | Default list payload mode |
| `llm_output_min_evidence_refs_required` | `1` | int | specDb | LlmSettings | Minimum evidence refs required |
| `insufficient_evidence_action` | `threshold_unmet` | enum | specDb | LlmSettings | Default action when evidence floor is missed |

Row save/reset normalization clamps `max_tokens` to `256..65536` and `llm_output_min_evidence_refs_required` to `1..5`.

**Reset seed matrix** (`buildDefaultLlmRoutes(category)`; 15 live rows = 9 `field`, 3 `component`, 3 `list`):

| Seed row | Key overrides |
|----------|---------------|
| `field / identity / hard / always` | `effort=10`, `model=gpt-5.2-xhigh -> gpt-5.2-high`, `all_source_data=true`, `max_tokens=24576`, `min_refs=2` |
| `field / critical / hard / rare` | `effort=9`, `model=gpt-5.2-high -> gpt-5.1-high`, `all_source_data=true`, `max_tokens=16384`, `min_refs=2` |
| `field / required / hard / expected` | `effort=8`, `model=gpt-5.2-high -> gpt-5.1-high`, `all_source_data=true`, `max_tokens=12288`, `min_refs=2` |
| `field / required / medium / expected` | `effort=6`, `model=gpt-5.1-medium -> gpt-5.2-medium`, `all_source_data=true`, `max_tokens=8192`, `min_refs=2` |
| `field / expected / hard / sometimes` | `effort=7`, `model=gpt-5.1-high -> gpt-5.2-medium`, `all_source_data=true`, `max_tokens=8192` |
| `field / expected / medium / expected` | `effort=5`, `model=gpt-5-medium -> gpt-5.1-medium`, `websearch=false`, `max_tokens=6144` |
| `field / expected / easy / rare` | `effort=3`, `all_source_data=true`, `max_tokens=4096` |
| `field / optional / easy / sometimes` | `effort=2`, `model=gpt-5-minimal -> gpt-5-low`, `websearch=false`, `max_tokens=3072` |
| `field / editorial / easy / editorial_only` | `effort=1`, `model=gpt-5-minimal -> gpt-5-low`, `websearch=false`, `max_tokens=2048` |
| `component / critical / hard / expected` | `effort=9`, `model=gpt-5.2-high -> gpt-5.2-medium`, `all_source_data=true`, `max_tokens=16384`, `min_refs=2` |
| `component / expected / medium / expected` | `effort=6`, `model=gpt-5.1-medium -> gpt-5.2-medium`, `websearch=false`, `max_tokens=8192` |
| `component / optional / easy / sometimes` | `effort=3`, `websearch=false`, `max_tokens=4096` |
| `list / required / hard / rare` | `effort=8`, `model=gpt-5.2-high -> gpt-5.1-high`, `all_source_data=true`, `max_tokens=12288`, `min_refs=2` |
| `list / expected / medium / expected` | `effort=5`, `model=gpt-5-medium -> gpt-5.1-medium`, `websearch=false`, `max_tokens=6144` |
| `list / optional / easy / sometimes` | `effort=2`, `model=gpt-5-minimal -> gpt-5-low`, `websearch=false`, `max_tokens=3072` |

---

## 44. Compound Learning Indexes

Origin: Phase 4A design. Status: `implemented_live` — wired in `settingsDefaults.js → runtime.*` and `config.js`

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `enableQueryIndex` | `true` | bool | SD, SC, CFG | RunSetup | Runtime flag for QueryIndex recording and summary routes |
| `enableUrlIndex` | `true` | bool | SD, SC, CFG | RunSetup | Runtime flag for URLIndex recording and summary routes |

PromptIndex is part of the same Phase 4A design, but no separate rollout-flag name is fixed in the current design docs.

---

## 45. Community Consensus Dual-Write

Origin: Phase 6 design. Status: `implemented_live` — wired in `settingsDefaults.js → convergence.*`

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `consensusTier4OverrideThreshold` | `0.9` | float | SD, SC | Convergence | Confidence threshold before community evidence can unlock dual display |
| `consensusDualWriteEnabled` | `false` | bool | SD, SC | Convergence | Master switch for official + community dual-display output |
| `consensusEligibleFields` | `''` | string | SD | — | Allowlist of numeric measurement fields eligible for dual display (empty = none). Not surfaced in GUI — string type not supported by convergence knob UI. |
| `consensusMinConfidence` | `0.7` | float | SD, SC | Convergence | Minimum consensus confidence before dual display is allowed |

---

## Appendix A. Composite And Provider-Specific Live Knob Addendum

These rows are live in `src/config.js` and downstream consumers even when the primary numbered sections summarize them through parent maps or shared model/provider groups.

### Search Provider And SERP Scoring Leaves

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `searxngDefaultBaseUrl` | `http://127.0.0.1:8080` | string | CFG | — | Default SearXNG base URL used by provider adapters |
| `hostHealthDownrankPenalty` | `-0.4` | float | CFG | — | SERP reranker penalty for downranked hosts |
| `hostHealthExcludePenalty` | `-2.0` | float | CFG | — | SERP reranker penalty for excluded hosts |
| `operatorRiskPenalty` | `-0.5` | float | CFG | — | SERP reranker penalty for risky query operators |
| `fieldAffinityBonus` | `0.5` | float | CFG | — | SERP reranker bonus when query intent aligns with missing fields |
| `diversityPenaltyPerDupe` | `-0.3` | float | CFG | — | SERP reranker penalty for duplicate host/path clusters |
| `needsetCoverageBonus` | `0.2` | float | CFG | — | SERP reranker bonus for unmet NeedSet gaps |

### Fetch Scheduler Composite Leaves

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `fetchSchedulerDefaultDelayMs` | `300` | int | CFG | — | Default per-host delay inside fetch scheduler internals |
| `fetchSchedulerDefaultConcurrency` | `3` | int | CFG | — | Default per-host concurrency inside fetch scheduler internals |
| `fetchSchedulerDefaultMaxRetries` | `1` | int | CFG | — | Default retry cap inside fetch scheduler internals |
| `fetchSchedulerRetryWaitMs` | `15000` | int | CFG | — | Retry wait window inside fetch scheduler internals |

### Evidence And Identity Composite Leaves

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `evidenceHeadingsLimit` | `120` | int | CFG | — | Evidence-pack heading cap |
| `evidenceChunkMaxLength` | `3000` | int | CFG | — | Max chars per evidence chunk |
| `evidenceSpecSectionsLimit` | `8` | int | CFG | — | Max spec sections emitted into evidence pack |

### LLM Core Provider And API Leaves

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `llmForceRoleModelProvider` | `false` | bool | CFG | — | Force role-specific provider routing |
| `llmApiKey` | `<secret env>` | string | CFG | — | Shared LLM API key |
| `openaiBaseUrl` | `<derived>` | string | CFG | — | OpenAI-compatible base URL |
| `openaiModelExtract` | `<derived>` | string | CFG | — | Primary extract model in OpenAI-compatible config |
| `openaiModelPlan` | `<derived>` | string | CFG | — | Primary plan model in OpenAI-compatible config |
| `openaiModelWrite` | `<derived>` | string | CFG | — | Primary write model in OpenAI-compatible config |
| `openaiTimeoutMs` | `30000` | int | CFG | — | Timeout for OpenAI-compatible client |
| `openaiMaxInputChars` | `50000` | int | CFG | — | Max prompt chars sent through OpenAI-compatible client |

### LLM Role Providers And Fallback Leaves

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `llmPlanFallbackProvider` | `''` | string | CFG | — | Plan fallback provider override |
| `llmPlanFallbackBaseUrl` | `''` | string | CFG | — | Plan fallback base URL override |
| `llmPlanFallbackApiKey` | `<secret env>` | string | CFG | — | Secret for plan fallback provider |
| `llmExtractProvider` | `''` | string | CFG | — | Provider for extract role calls |
| `llmExtractBaseUrl` | `''` | string | CFG | — | Base URL for extract role calls |
| `llmExtractApiKey` | `<secret env>` | string | CFG | — | Secret for extract role calls |
| `llmExtractFallbackProvider` | `''` | string | CFG | — | Extract fallback provider override |
| `llmExtractFallbackBaseUrl` | `''` | string | CFG | — | Extract fallback base URL override |
| `llmExtractFallbackApiKey` | `<secret env>` | string | CFG | — | Secret for extract fallback calls |
| `llmValidateProvider` | `''` | string | CFG | — | Provider for validate role calls |
| `llmValidateBaseUrl` | `''` | string | CFG | — | Base URL for validate role calls |
| `llmValidateApiKey` | `<secret env>` | string | CFG | — | Secret for validate role calls |
| `llmValidateFallbackProvider` | `''` | string | CFG | — | Validate fallback provider override |
| `llmValidateFallbackBaseUrl` | `''` | string | CFG | — | Validate fallback base URL override |
| `llmValidateFallbackApiKey` | `<secret env>` | string | CFG | — | Secret for validate fallback calls |
| `llmWriteProvider` | `''` | string | CFG | — | Provider for write role calls |
| `llmWriteBaseUrl` | `''` | string | CFG | — | Base URL for write role calls |
| `llmWriteApiKey` | `<secret env>` | string | CFG | — | Secret for write role calls |
| `llmWriteFallbackProvider` | `''` | string | CFG | — | Write fallback provider override |
| `llmWriteFallbackBaseUrl` | `''` | string | CFG | — | Write fallback base URL override |
| `llmWriteFallbackApiKey` | `<secret env>` | string | CFG | — | Secret for write fallback calls |

### LLM Catalog, Pricing, And Token Leaves

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `llmModelCatalog` | `''` | string | CFG | — | Optional CSV catalog of allowed models for UI/runtime model pickers |
| `llmModelPricingMap` | `built-in map` | json | CFG | — | Per-model cost map used by runtime cost accounting |
| `llmPricingAsOf` | `2026-02-19` | string | CFG | — | Pricing snapshot date |
| `llmPricingSources` | `provider docs map` | json | CFG | — | Provider pricing source URLs |
| `llmVerifyAggressiveAlways` | `false` | bool | CFG | — | Force verification on every aggressive batch |
| `llmVerifyAggressiveBatchCount` | `3` | int | CFG | — | Number of aggressive batches to verify |
| `llmOutputTokenPresets` | `[256,384,...,8192]` | json | CFG | — | UI/runtime token preset list |
| `llmCostInputPer1MDeepseekChat` | `-1` | float | CFG | — | Optional DeepSeek Chat input cost override |
| `llmCostOutputPer1MDeepseekChat` | `-1` | float | CFG | — | Optional DeepSeek Chat output cost override |
| `llmCostCachedInputPer1MDeepseekChat` | `-1` | float | CFG | — | Optional DeepSeek Chat cached-input cost override |
| `llmCostInputPer1MDeepseekReasoner` | `-1` | float | CFG | — | Optional DeepSeek Reasoner input cost override |
| `llmCostOutputPer1MDeepseekReasoner` | `-1` | float | CFG | — | Optional DeepSeek Reasoner output cost override |
| `llmCostCachedInputPer1MDeepseekReasoner` | `-1` | float | CFG | — | Optional DeepSeek Reasoner cached-input cost override |
| `deepseekModelVersion` | `''` | string | CFG | — | Optional DeepSeek model version suffix |
| `deepseekContextLength` | `''` | string | CFG | — | Optional DeepSeek context-length override |
| `deepseekChatMaxOutputDefault` | `2048` | int | CFG | — | Default DeepSeek Chat output cap |
| `deepseekChatMaxOutputMaximum` | `4096` | int | CFG | — | Hard maximum DeepSeek Chat output cap |
| `deepseekReasonerMaxOutputDefault` | `4096` | int | CFG | — | Default DeepSeek Reasoner output cap |
| `deepseekReasonerMaxOutputMaximum` | `8192` | int | CFG | — | Hard maximum DeepSeek Reasoner output cap |
| `llmModelOutputTokenMap` | `built-in map` | json | CFG | — | Per-model output token defaults and maxima |
| `deepseekFeatures` | `''` | string | CFG | — | Optional DeepSeek feature flags |
| `chatmockDir` | `C:\Users\Chris\Desktop\ChatMock` | string | CFG | — | ChatMock workspace root |
| `chatmockComposeFile` | `C:\Users\Chris\Desktop\ChatMock\docker-compose.yml` | string | CFG | — | ChatMock compose file path |

### Indexing Resume, Schema, And Runtime-Ops Leaves

| Knob | Default | Type | Backend | Frontend | Summary |
|------|---------|------|---------|----------|---------|
| `indexingResumeRetryPersistLimit` | `80` | int | CFG | — | Persisted retry packet cap for resumable runs |
| `indexingResumeSuccessPersistLimit` | `240` | int | CFG | — | Persisted successful packet cap for resumable runs |
| `indexingSchemaPacketsSchemaRoot` | `''` | string | CFG | — | Optional schema-root override for indexing packet validation |
| `indexingReextractSeedLimit` | `8` | int | CFG | — | Max persisted source seeds for re-extract passes |
| `fieldRulesEngineEnforceEvidence` | `<derived>` | bool | CFG | — | Require evidence-backed field rules. Defaults to `true` when aggressive/uber enabled. |
| `runtimeOpsWorkbenchEnabled` | `true` | bool | CFG | — | Gate for runtime-ops workbench routes and panels |
| `accuracyMode` | `production` | string | CFG | — | Accuracy/quality profile for extraction pipeline. Hardcoded in `config.js`. |
