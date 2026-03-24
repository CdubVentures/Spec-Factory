# Spec Factory — Runtime Knobs Reference

> **Source of truth:** `src/shared/settingsRegistry.js`
> **Excel companion:** `SPEC_FACTORY_KNOBS.xlsx` (14 tabs + Overview)
> **Last updated:** 2026-03-23

---

## Summary

| GUI Panel | Knob Count | Description |
|---|---|---|
| Run Setup | 19 | Search engines, query caps, resume, schema enforcement |
| Browser Rendering | 12 | Crawlee, auto-scroll, robots.txt, page screenshots |
| Fetch & Network | 17 | Timeouts, frontier cooldowns, per-host delay |
| Parsing & Storage | 1 | Spec DB directory |
| Run Output | 14 | Output mode, paths, S3 mirroring, markdown summary |
| Automation | 16 | Drift detection, self-improve, category authority, daemon, imports |
| Observability | 10 | Tracing, event logging, screencast streaming |
| LLM Global | 19 | Models, costs, budgets, call limits, API keys, timeout |
| LLM Phase Overrides | 8 | Per-phase model, token cap, and reasoning overrides |
| LLM Provider Registry | 5 | Provider configs (URLs, models, costs) |
| Storage Settings | 10 | Persistent storage destination (local / S3), credentials |
| UI Settings | 5 | Auto-save toggles for Studio, Runtime, Storage panels |
| Convergence | 0 | Empty |
| Not in GUI | 9 | Backend-only or internally-managed knobs |
| **TOTAL** | **145** | |

---

## Registries

All knobs live in one of four registries in `settingsRegistry.js`:

| Registry | Count | Scope |
|---|---|---|
| `RUNTIME_SETTINGS_REGISTRY` | 130 | Pipeline runtime config (env vars, route API, GUI) |
| `CONVERGENCE_SETTINGS_REGISTRY` | 0 | Empty — reserved for future knobs |
| `UI_SETTINGS_REGISTRY` | 5 | Auto-save UI toggles |
| `STORAGE_SETTINGS_REGISTRY` | 10 | Persistent artifact storage |

---

## Run Setup (19 knobs)

Settings for search configuration, pipeline limits, and resume behavior.

| Key | Type | Default | Range | Env Var |
|---|---|---|---|---|
| `maxRunSeconds` | int | 480 | 30–86,400 | `MAX_RUN_SECONDS` |
| `serperEnabled` | bool | true | — | `SERPER_ENABLED` |
| `serperApiKey` | string | "" | — | `SERPER_API_KEY` |
| `searchEngines` | csv_enum | google | google,bing,google-proxy,duckduckgo,brave | `SEARCH_ENGINES` |
| `searchEnginesFallback` | csv_enum | bing | (same) | `SEARCH_ENGINES_FALLBACK` |
| `searxngBaseUrl` | string | http://127.0.0.1:8080 | — | `SEARXNG_BASE_URL` |
| `searchMaxRetries` | int | 3 | 0–5 | `SEARCH_MAX_RETRIES` |
| `googleSearchProxyUrlsJson` | string | (proxy array) | — | — |
| `googleSearchScreenshotsEnabled` | bool | true | — | `GOOGLE_SEARCH_SCREENSHOTS_ENABLED` |
| `googleSearchTimeoutMs` | int | 30,000 | 30,000–120,000 | `GOOGLE_SEARCH_TIMEOUT_MS` |
| `googleSearchMinQueryIntervalMs` | int | 1,000 | 0–60,000 | `GOOGLE_SEARCH_MIN_QUERY_INTERVAL_MS` |
| `maxPagesPerDomain` | int | 5 | 1–100 | `MAX_PAGES_PER_DOMAIN` |
| `searchProfileQueryCap` | int | 10 | 1–100 | `SEARCH_PROFILE_QUERY_CAP` |
| `serpSelectorUrlCap` | int | 50 | 1–500 | `SERP_SELECTOR_URL_CAP` |
| `domainClassifierUrlCap` | int | 50 | 1–500 | `DOMAIN_CLASSIFIER_URL_CAP` |
| `llmEnhancerMaxRetries` | int | 2 | 1–5 | `LLM_ENHANCER_MAX_RETRIES` |
| `pipelineSchemaEnforcementMode` | enum | warn | off, warn, enforce | `PIPELINE_SCHEMA_ENFORCEMENT_MODE` |
| `resumeMode` | enum | auto | auto, force_resume, start_over | `INDEXING_RESUME_MODE` |
| `resumeWindowHours` | int | 48 | 1–8,760 | `INDEXING_RESUME_MAX_AGE_HOURS` |

---

## Browser Rendering (12 knobs)

Controls for Crawlee browser automation, scrolling, and screenshots.

| Key | Type | Default | Range | Env Var |
|---|---|---|---|---|
| `crawleeHeadless` | bool | true | — | `CRAWLEE_HEADLESS` |
| `crawleeRequestHandlerTimeoutSecs` | int | 75 | 0–300 | `CRAWLEE_REQUEST_HANDLER_TIMEOUT_SECS` |
| `autoScrollEnabled` | bool | true | — | `AUTO_SCROLL_ENABLED` |
| `autoScrollPasses` | int | 2 | 0–20 | `AUTO_SCROLL_PASSES` |
| `autoScrollDelayMs` | int | 1,200 | 0–10,000 | `AUTO_SCROLL_DELAY_MS` |
| `robotsTxtCompliant` | bool | true | — | `ROBOTS_TXT_COMPLIANT` |
| `robotsTxtTimeoutMs` | int | 6,000 | 100–120,000 | `ROBOTS_TXT_TIMEOUT_MS` |
| `capturePageScreenshotEnabled` | bool | true | — | `CAPTURE_PAGE_SCREENSHOT_ENABLED` |
| `capturePageScreenshotFormat` | string | jpeg | — | `CAPTURE_PAGE_SCREENSHOT_FORMAT` |
| `capturePageScreenshotQuality` | int | 50 | 1–100 | `CAPTURE_PAGE_SCREENSHOT_QUALITY` |
| `capturePageScreenshotMaxBytes` | int | 5,000,000 | 1,024–100,000,000 | `CAPTURE_PAGE_SCREENSHOT_MAX_BYTES` |
| `capturePageScreenshotSelectors` | string | table,... | — | `CAPTURE_PAGE_SCREENSHOT_SELECTORS` |

---

## Fetch & Network (17 knobs)

Timeouts, frontier cooldowns, and per-host delay policies.

| Key | Type | Default | Range | Env Var |
|---|---|---|---|---|
| `perHostMinDelayMs` | int | 1,500 | 0–120,000 | `PER_HOST_MIN_DELAY_MS` |
| `pageGotoTimeoutMs` | int | 12,000 | 0–120,000 | `PAGE_GOTO_TIMEOUT_MS` |
| `pageNetworkIdleTimeoutMs` | int | 2,000 | 0–60,000 | `PAGE_NETWORK_IDLE_TIMEOUT_MS` |
| `postLoadWaitMs` | int | 200 | 0–60,000 | `POST_LOAD_WAIT_MS` |
| `frontierDbPath` | string | _intel/frontier/frontier.json | — | `FRONTIER_DB_PATH` |
| `frontierQueryCooldownSeconds` | int | 21,600 | 0–31,536,000 | `FRONTIER_QUERY_COOLDOWN_SECONDS` |
| `repairDedupeRule` | enum | domain_once | domain_once, domain_and_status, none | `REPAIR_DEDUPE_RULE` |
| `frontierStripTrackingParams` | bool | true | — | `FRONTIER_STRIP_TRACKING_PARAMS` |
| `frontierCooldown404Seconds` | int | 259,200 | 0–31,536,000 | `FRONTIER_COOLDOWN_404` |
| `frontierCooldown404RepeatSeconds` | int | 1,209,600 | 0–31,536,000 | `FRONTIER_COOLDOWN_404_REPEAT` |
| `frontierCooldown410Seconds` | int | 7,776,000 | 0–31,536,000 | `FRONTIER_COOLDOWN_410` |
| `frontierCooldownTimeoutSeconds` | int | 21,600 | 0–31,536,000 | `FRONTIER_COOLDOWN_TIMEOUT` |
| `frontierCooldown403BaseSeconds` | int | 1,800 | 0–86,400 | `FRONTIER_COOLDOWN_403_BASE` |
| `frontierCooldown429BaseSeconds` | int | 600 | 0–86,400 | `FRONTIER_COOLDOWN_429_BASE` |
| `frontierBackoffMaxExponent` | int | 4 | 1–12 | `FRONTIER_BACKOFF_MAX_EXPONENT` |
| `frontierPathPenaltyNotfoundThreshold` | int | 3 | 1–50 | `FRONTIER_PATH_PENALTY_NOTFOUND_THRESHOLD` |
| `frontierBlockedDomainThreshold` | int | 1 | 1–50 | `FRONTIER_BLOCKED_DOMAIN_THRESHOLD` |

---

## Parsing & Storage (1 knob)

| Key | Type | Default | Env Var |
|---|---|---|---|
| `specDbDir` | string | .specfactory_tmp | `SPEC_DB_DIR` |

---

## Run Output (14 knobs)

Output destinations, paths, and S3 mirroring.

| Key | Type | Default | Env Var | Notes |
|---|---|---|---|---|
| `outputMode` | enum | local | `OUTPUT_MODE` | local, dual, s3 |
| `localMode` | bool | true | `LOCAL_MODE` | |
| `dryRun` | bool | false | `DRY_RUN` | |
| `localInputRoot` | string | fixtures/s3 | `LOCAL_INPUT_ROOT` | |
| `localOutputRoot` | string | (dynamic) | — | |
| `runtimeEventsKey` | string | _runtime/events.jsonl | `RUNTIME_EVENTS_KEY` | |
| `writeMarkdownSummary` | bool | true | `WRITE_MARKDOWN_SUMMARY` | |
| `runtimeControlFile` | string | _runtime/control/runtime_overrides.json | `RUNTIME_CONTROL_FILE` | |
| `mirrorToS3` | bool | false | `MIRROR_TO_S3` | |
| `mirrorToS3Input` | bool | false | `MIRROR_TO_S3_INPUT` | |
| `s3InputPrefix` | string | specs/inputs | `S3_INPUT_PREFIX` | |
| `s3OutputPrefix` | string | specs/outputs | `S3_OUTPUT_PREFIX` | |
| `awsRegion` | string | us-east-2 | `AWS_REGION` | readOnly |
| `s3Bucket` | string | my-spec-harvester-data | `S3_BUCKET` | readOnly |

---

## Automation (16 knobs)

Drift detection, self-improvement, category authority, daemon, and imports.

| Key | Type | Default | Range | Env Var |
|---|---|---|---|---|
| `driftDetectionEnabled` | bool | true | — | `DRIFT_DETECTION_ENABLED` |
| `driftPollSeconds` | int | 86,400 | 60–604,800 | `DRIFT_POLL_SECONDS` |
| `driftScanMaxProducts` | int | 250 | 1–10,000 | `DRIFT_SCAN_MAX_PRODUCTS` |
| `driftAutoRepublish` | bool | true | — | `DRIFT_AUTO_REPUBLISH` |
| `reCrawlStaleAfterDays` | int | 30 | 1–3,650 | `RECRAWL_STALE_AFTER_DAYS` |
| `selfImproveEnabled` | bool | true | — | `SELF_IMPROVE_ENABLED` |
| `batchStrategy` | string | bandit | — | `BATCH_STRATEGY` |
| `fieldRewardHalfLifeDays` | int | 45 | 1–365 | `FIELD_REWARD_HALF_LIFE_DAYS` |
| `categoryAuthorityEnabled` | bool | true | — | `HELPER_FILES_ENABLED` |
| `categoryAuthorityRoot` | string | category_authority | — | `CATEGORY_AUTHORITY_ROOT` |
| `helperSupportiveFillMissing` | bool | true | — | `HELPER_SUPPORTIVE_FILL_MISSING` |
| `daemonConcurrency` | int | 1 | 1–128 | `DAEMON_CONCURRENCY` |
| `indexingResumeSeedLimit` | int | 24 | 1–10,000 | `INDEXING_RESUME_SEED_LIMIT` |
| `indexingResumePersistLimit` | int | 160 | 1–100,000 | `INDEXING_RESUME_PERSIST_LIMIT` |
| `importsRoot` | string | imports | — | `IMPORTS_ROOT` |
| `importsPollSeconds` | int | 10 | 1–3,600 | `IMPORTS_POLL_SECONDS` |

---

## Observability (10 knobs)

Runtime tracing, event logging, and live screencast.

| Key | Type | Default | Range | Env Var |
|---|---|---|---|---|
| `runtimeTraceEnabled` | bool | true | — | `RUNTIME_TRACE_ENABLED` |
| `runtimeTraceFetchRing` | int | 30 | 10–2,000 | `RUNTIME_TRACE_FETCH_RING` |
| `runtimeTraceLlmRing` | int | 50 | 10–2,000 | `RUNTIME_TRACE_LLM_RING` |
| `runtimeTraceLlmPayloads` | bool | true | — | `RUNTIME_TRACE_LLM_PAYLOADS` |
| `eventsJsonWrite` | bool | true | — | `EVENTS_JSON_WRITE` |
| `runtimeScreencastEnabled` | bool | true | — | `RUNTIME_SCREENCAST_ENABLED` |
| `runtimeScreencastFps` | int | 10 | 1–60 | `RUNTIME_SCREENCAST_FPS` |
| `runtimeScreencastQuality` | int | 50 | 10–100 | `RUNTIME_SCREENCAST_QUALITY` |
| `runtimeScreencastMaxWidth` | int | 1,280 | 320–3,840 | `RUNTIME_SCREENCAST_MAX_WIDTH` |
| `runtimeScreencastMaxHeight` | int | 720 | 240–2,160 | `RUNTIME_SCREENCAST_MAX_HEIGHT` |

---

## LLM Global (19 knobs)

Model selection, cost tracking, budgets, call limits, and API keys.

| Key | Type | Default | Range | Env Var |
|---|---|---|---|---|
| `llmModelPlan` | string | gemini-2.5-flash | — | `LLM_MODEL_PLAN` |
| `llmModelReasoning` | string | deepseek-reasoner | — | `LLM_MODEL_REASONING` |
| `llmPlanFallbackModel` | string | deepseek-chat | — | `LLM_PLAN_FALLBACK_MODEL` |
| `llmReasoningFallbackModel` | string | gemini-2.5-pro | — | `LLM_REASONING_FALLBACK_MODEL` |
| `llmMaxOutputTokens` | int | 1,400 | 128–262,144 | `LLM_MAX_OUTPUT_TOKENS` |
| `llmCostInputPer1M` | float | 1.25 | 0–1,000 | `LLM_COST_INPUT_PER_1M` |
| `llmCostOutputPer1M` | float | 10 | 0–1,000 | `LLM_COST_OUTPUT_PER_1M` |
| `llmCostCachedInputPer1M` | float | 0.125 | 0–1,000 | `LLM_COST_CACHED_INPUT_PER_1M` |
| `llmMonthlyBudgetUsd` | float | 300 | 0–100,000 | `LLM_MONTHLY_BUDGET_USD` |
| `llmPerProductBudgetUsd` | float | 0.35 | 0–1,000 | `LLM_PER_PRODUCT_BUDGET_USD` |
| `llmMaxCallsPerProductTotal` | int | 14 | 1–100 | `LLM_MAX_CALLS_PER_PRODUCT_TOTAL` |
| `llmMaxCallsPerRound` | int | 5 | 1–200 | `LLM_MAX_CALLS_PER_ROUND` |
| `llmReasoningBudget` | int | 32,768 | 128–262,144 | `LLM_REASONING_BUDGET` |
| `llmTimeoutMs` | int | 30,000 | 1,000–600,000 | `LLM_TIMEOUT_MS` |
| `anthropicApiKey` | string | "" | — | `ANTHROPIC_API_KEY` |
| `openaiApiKey` | string | "" | — | `OPENAI_API_KEY` |
| `geminiApiKey` | string | "" | — | `GEMINI_API_KEY` |
| `deepseekApiKey` | string | "" | — | `DEEPSEEK_API_KEY` |
| `llmPlanApiKey` | string | "" | — | `LLM_PLAN_API_KEY` |

---

## LLM Phase Overrides (8 knobs)

Managed via `LlmPhaseSection` — per-phase model, token, and reasoning overrides.

| Key | Type | Default | Range | Env Var |
|---|---|---|---|---|
| `llmMaxOutputTokensPlan` | int | 4,096 | 128–262,144 | `LLM_MAX_OUTPUT_TOKENS_PLAN` |
| `llmMaxOutputTokensPlanFallback` | int | 2,048 | 128–262,144 | `LLM_MAX_OUTPUT_TOKENS_PLAN_FALLBACK` |
| `llmMaxOutputTokensTriage` | int | 20,000 | 20,000–262,144 | `LLM_MAX_OUTPUT_TOKENS_TRIAGE` |
| `llmMaxOutputTokensReasoning` | int | 4,096 | 128–262,144 | `LLM_MAX_OUTPUT_TOKENS_REASONING` |
| `llmMaxOutputTokensReasoningFallback` | int | 2,048 | 128–262,144 | `LLM_MAX_OUTPUT_TOKENS_REASONING_FALLBACK` |
| `llmPlanUseReasoning` | bool | false | — | `LLM_PLAN_USE_REASONING` |
| `llmPhaseOverridesJson` | string | {} | — | — |
| `llmReasoningMode` | bool | true | — | `LLM_REASONING_MODE` |

---

## LLM Provider Registry (5 knobs)

Managed via `LlmProviderRegistrySection` — provider URLs, models, and costs.

| Key | Type | Default | Env Var |
|---|---|---|---|
| `llmProviderRegistryJson` | string | (large JSON) | — |
| `llmProvider` | string | gemini | `LLM_PROVIDER` |
| `llmBaseUrl` | string | (Gemini URL) | `LLM_BASE_URL` |
| `llmPlanBaseUrl` | string | (Gemini URL) | `LLM_PLAN_BASE_URL` |
| `llmPlanProvider` | string | gemini | `LLM_PLAN_PROVIDER` |

---

## Storage Settings (10 knobs)

`STORAGE_SETTINGS_REGISTRY` — persistent artifact storage.

| Key | Type | Default | Notes |
|---|---|---|---|
| `enabled` | bool | false | Master switch |
| `destinationType` | enum | local | local, s3 |
| `localDirectory` | string | "" | |
| `awsRegion` | string | us-east-2 | |
| `s3Bucket` | string | "" | |
| `s3Prefix` | string | spec-factory-runs | |
| `s3AccessKeyId` | string | "" | |
| `s3SecretAccessKey` | string | "" | Secret, clearFlag |
| `s3SessionToken` | string | "" | Secret, clearFlag |
| `updatedAt` | string_or_null | null | Computed |

---

## UI Settings (5 knobs)

`UI_SETTINGS_REGISTRY` — auto-save toggles.

| Key | Type | Default |
|---|---|---|
| `studioAutoSaveAllEnabled` | bool | false |
| `studioAutoSaveEnabled` | bool | true |
| `studioAutoSaveMapEnabled` | bool | true |
| `runtimeAutoSaveEnabled` | bool | true |
| `storageAutoSaveEnabled` | bool | false |

---

## Convergence (0 knobs)

`CONVERGENCE_SETTINGS_REGISTRY` is empty.

---

## Not in GUI (9 knobs)

Backend-only or defaultsOnly knobs not exposed in any GUI panel.

| Key | Type | Default | Env Var | Notes |
|---|---|---|---|---|
| `crawlSessionCount` | int | 4 | `CRAWL_SESSION_COUNT` | Parallel browser sessions |
| `googleSearchMaxRetries` | int | 1 | `GOOGLE_SEARCH_MAX_RETRIES` | Google-specific retry cap |
| `llmMaxTokens` | int | 16,384 | `LLM_MAX_TOKENS` | Global context window |
| `llmExtractionCacheDir` | string | .specfactory_tmp/llm_cache | `LLM_EXTRACTION_CACHE_DIR` | LLM response cache dir |
| `maxCandidateUrls` | int | 80 | `MAX_CANDIDATE_URLS` | Discovery URL cap |
| `maxUrlsPerProduct` | int | 50 | `MAX_URLS_PER_PRODUCT` | Fetch URL cap per product |
| `searxngMinQueryIntervalMs` | int | 3,000 | `SEARXNG_MIN_QUERY_INTERVAL_MS` | SearXNG throttle |
| `discoveryEnabled` | bool | true | `DISCOVERY_ENABLED` | defaultsOnly master switch |
| `daemonGracefulShutdownTimeoutMs` | int | 30,000 | — | defaultsOnly |

---

## Knobs by Discovery Pipeline Phase

Which knobs control each stage, where they live, and where to tune them.

### Stage 01 — NeedSet

| Key | Default | Range | Surface | Notes |
|---|---|---|---|---|
| — | — | — | — | No dedicated knobs. NeedSet reads `fieldRules` from category config (not a runtime setting). |

### Stage 02 — Brand Resolver

| Key | Default | Range | Surface | Notes |
|---|---|---|---|---|
| `llmTimeoutMs` | 30,000 | 1,000–600,000 | GUI: LLM Config | Shared LLM timeout for brand resolution call |

### Stage 03 — Search Profile

| Key | Default | Range | Surface | Notes |
|---|---|---|---|---|
| `searchProfileQueryCap` | 10 | 1–100 | GUI: Run Setup | Hard cap on total query rows in the profile |
| `searchProfileCapMapJson` | (JSON) | — | Env only (not in registry) | Per-tier caps parsed by configBuilder from `SEARCH_PROFILE_CAP_MAP_JSON` |

### Stage 04 — Search Planner

| Key | Default | Range | Surface | Notes |
|---|---|---|---|---|
| `llmEnhancerMaxRetries` | 2 | 1–5 | GUI: Run Setup | LLM enhancement retries before deterministic fallback |
| `llmTimeoutMs` | 30,000 | 1,000–600,000 | GUI: LLM Config | Shared LLM timeout for planner call |

### Stage 05 — Query Journey

| Key | Default | Range | Surface | Notes |
|---|---|---|---|---|
| `searchProfileQueryCap` | 10 | 1–100 | GUI: Run Setup | Reused — caps the merged query list for execution |

### Stage 06 — Search Results

| Key | Default | Range | Surface | Notes |
|---|---|---|---|---|
| `searchEngines` | google | csv_enum | GUI: Run Setup | Primary search providers |
| `searchEnginesFallback` | bing | csv_enum | GUI: Run Setup | Fallback provider when primary fails |
| `searchMaxRetries` | 3 | 0–5 | GUI: Run Setup | Per-query retry count on provider error |
| `searxngBaseUrl` | http://127.0.0.1:8080 | — | GUI: Run Setup | SearXNG instance URL |
| `searxngMinQueryIntervalMs` | 3,000 | 0–30,000 | Backend: registry | Min delay between SearXNG queries |
| `serperEnabled` | true | — | GUI: Run Setup | Enable Serper API provider |
| `serperApiKey` | "" | — | GUI: Run Setup | Serper API key |

### Stage 07 — SERP Selector

| Key | Default | Range | Surface | Notes |
|---|---|---|---|---|
| `serpSelectorUrlCap` | 50 | 1–500 | GUI: Run Setup | Max URLs the LLM selector keeps |
| `llmMaxOutputTokensTriage` | 20,000 | 20,000–262,144 | GUI: LLM Phase Overrides | Output token budget for SERP selector LLM call |
| `SERP_SELECTOR_MAX_CANDIDATES` | 80 | — | **Hardcoded** | Normal lane capacity (serpSelector.js) |
| `SERP_SELECTOR_ABSOLUTE_MAX_CANDIDATES` | 120 | — | **Hardcoded** | Hard cap including priority overflow (serpSelector.js) |
| `SERP_SELECTOR_TITLE_MAX_CHARS` | 200 | — | **Hardcoded** | Title truncation for LLM input (serpSelector.js) |
| `SERP_SELECTOR_SNIPPET_MAX_CHARS` | 260 | — | **Hardcoded** | Snippet truncation for LLM input (serpSelector.js) |

### Stage 08 — Domain Classifier

| Key | Default | Range | Surface | Notes |
|---|---|---|---|---|
| `domainClassifierUrlCap` | 50 | 1–500 | GUI: Run Setup | Max URLs enqueued into the planner |

### Orchestrator (runDiscoverySeedPlan)

| Key | Default | Range | Surface | Notes |
|---|---|---|---|---|
| `pipelineSchemaEnforcementMode` | warn | off/warn/enforce | GUI: Run Setup | Zod checkpoint validation mode across all stages |
| `maxRunSeconds` | 480 | 30–86,400 | GUI: Run Setup | Total run time budget |

### Phase Knob Count Summary

| Phase | Registry Knobs | Hardcoded Constants | Total |
|---|---|---|---|
| 01 NeedSet | 0 | 0 | 0 |
| 02 Brand Resolver | 1 | 0 | 1 |
| 03 Search Profile | 1 | 0 | 1 |
| 04 Search Planner | 2 | 0 | 2 |
| 05 Query Journey | 1 | 0 | 1 |
| 06 Search Results | 7 | 0 | 7 |
| 07 SERP Selector | 2 | 4 | 6 |
| 08 Domain Classifier | 1 | 0 | 1 |
| Orchestrator | 2 | 0 | 2 |
