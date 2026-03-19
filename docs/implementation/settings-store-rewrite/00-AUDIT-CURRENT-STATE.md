# Settings Store Current State Audit

Generated: 2026-03-18
Source of truth: `src/shared/settingsRegistry.js` (212 entries: 209 standard + 3 defaultsOnly)

---

## Section 1: Complete Field Propagation Matrix

Legend for `classification`:
- **direct-launch** -- in GUI start payload AND in launch plan env vars
- **payload-only** -- in GUI start payload but NOT converted to env var in launch plan (relies on stale user-settings.json in child)
- **save-only** -- NOT in GUI start payload at all (only reaches child via autosaved user-settings.json file)
- **dead** -- registry entry exists but no runtime consumer
- **readOnly** -- awsRegion, s3Bucket (cannot be set via PUT route)
- **defaultsOnly** -- config-only keys, not exposed via the settings API routes

### Key
- **LP** = processStartLaunchPlan.js
- **CB** = configBuilder.js
- **GUI** = appears in buildIndexingRunStartPayload output
- Sub-payload abbreviations: **rt** = RuntimePayload, **llm** = LlmSettingsPayload, **learn** = LearningPayload, **ocr** = OcrPolicyPayload, **disc** = DiscoveryPayload, **model** = ModelPayload, **top** = top-level in StartPayload

| # | key | type | default | flags | envVar (CB) | CB line | GUI? | sub-payload | LP env? | LP envVar | LP line | round override? | classification |
|---|-----|------|---------|-------|-------------|---------|------|-------------|---------|-----------|---------|-----------------|----------------|
| 1 | anthropicApiKey | string | "" | secret,allowEmpty | ANTHROPIC_API_KEY | 259 | Y | learn | Y | ANTHROPIC_API_KEY | 302 | N | direct-launch |
| 2 | articleExtractorDomainPolicyMapJson | string | "" | allowEmpty | ARTICLE_EXTRACTOR_DOMAIN_POLICY_MAP_JSON | 157 | Y | top | N | -- | -- | N | payload-only |
| 3 | articleExtractorMaxChars | int | 24000 | -- | ARTICLE_EXTRACTOR_MAX_CHARS | 443 | Y | top | N | -- | -- | N | payload-only |
| 4 | articleExtractorMinChars | int | 700 | -- | ARTICLE_EXTRACTOR_MIN_CHARS | 441 | Y | top | N | -- | -- | N | payload-only |
| 5 | articleExtractorMinScore | int | 45 | -- | ARTICLE_EXTRACTOR_MIN_SCORE | 442 | Y | top | N | -- | -- | N | payload-only |
| 6 | autoScrollDelayMs | int | 1200 | -- | AUTO_SCROLL_DELAY_MS | 484 | Y | top | N | -- | -- | Y (R0=0,R2+=1200) | payload-only |
| 7 | autoScrollEnabled | bool | true | -- | AUTO_SCROLL_ENABLED | 482 | Y | top | N | -- | -- | Y (R0=false,R2+=true) | payload-only |
| 8 | autoScrollPasses | int | 2 | -- | AUTO_SCROLL_PASSES | 483 | Y | top | N | -- | -- | Y (R0=0,R2+=3) | payload-only |
| 9 | awsRegion | string | "us-east-2" | readOnly | AWS_REGION | 176 | Y | top | Y | AWS_REGION | 293 | N | readOnly |
| 10 | batchStrategy | string | "bandit" | -- | BATCH_STRATEGY | 496 | Y | top | N | -- | -- | N | payload-only |
| 11 | capturePageScreenshotEnabled | bool | true | -- | CAPTURE_PAGE_SCREENSHOT_ENABLED | 470 | Y | top | Y | CAPTURE_PAGE_SCREENSHOT_ENABLED | 311 | N | direct-launch |
| 12 | capturePageScreenshotFormat | string | "jpeg" | -- | CAPTURE_PAGE_SCREENSHOT_FORMAT | 471 | Y | top | Y | CAPTURE_PAGE_SCREENSHOT_FORMAT | 312 | N | direct-launch |
| 13 | capturePageScreenshotMaxBytes | int | 5000000 | -- | CAPTURE_PAGE_SCREENSHOT_MAX_BYTES | 475 | Y | top | N | -- | -- | N | payload-only |
| 14 | capturePageScreenshotQuality | int | 50 | -- | CAPTURE_PAGE_SCREENSHOT_QUALITY | 474 | Y | top | N | -- | -- | N | payload-only |
| 15 | capturePageScreenshotSelectors | string | "table,..." | -- | CAPTURE_PAGE_SCREENSHOT_SELECTORS | 476 | Y | top | Y | CAPTURE_PAGE_SCREENSHOT_SELECTORS | 313 | N | direct-launch |
| 16 | categoryAuthorityEnabled | bool | true | -- | HELPER_FILES_ENABLED | 426 | Y | top | Y | HELPER_FILES_ENABLED | 265 | N | direct-launch |
| 17 | categoryAuthorityRoot | string | "category_authority" | allowEmpty | CATEGORY_AUTHORITY_ROOT | 168-173 | Y | top | Y | CATEGORY_AUTHORITY_ROOT + HELPER_FILES_ROOT | 267-268 | N | direct-launch |
| 18 | crawleeHeadless | bool | true | -- | CRAWLEE_HEADLESS | 450 | Y | top | N | -- | -- | N | payload-only |
| 19 | crawleeRequestHandlerTimeoutSecs | int | 75 | -- | CRAWLEE_REQUEST_HANDLER_TIMEOUT_SECS | 451 | Y | top | N | -- | -- | N | payload-only |
| 20 | daemonConcurrency | int | 1 | -- | DAEMON_CONCURRENCY | 419 | Y | rt | Y | DAEMON_CONCURRENCY | 320 | N | direct-launch |
| 21 | deepseekApiKey | string | "" | secret,allowEmpty | DEEPSEEK_API_KEY | 261 | N | -- | N | -- | -- | N | save-only |
| 22 | discoveryMaxDiscovered | int | 60 | -- | DISCOVERY_MAX_DISCOVERED | 236 | Y | disc | N | -- | -- | Y (R0=60,R2+=300) | payload-only |
| 23 | discoveryMaxQueries | int | 10 | -- | DISCOVERY_MAX_QUERIES | 234 | Y | disc | N | -- | -- | Y (R0=4,R2+=24) | payload-only |
| 24 | domSnippetMaxChars | int | 3600 | -- | DOM_SNIPPET_MAX_CHARS | 481 | Y | top | N | -- | -- | N | payload-only |
| 25 | domainRequestBurst | int | 0 | -- | DOMAIN_REQUEST_BURST | 208 | Y | top | N | -- | -- | N | payload-only |
| 26 | domainRequestRps | int | 0 | -- | DOMAIN_REQUEST_RPS | 205 | Y | top | N | -- | -- | N | payload-only |
| 27 | driftAutoRepublish | bool | true | -- | DRIFT_AUTO_REPUBLISH | 425 | Y | top | N | -- | -- | N | payload-only |
| 28 | driftDetectionEnabled | bool | true | -- | DRIFT_DETECTION_ENABLED | 422 | Y | top | N | -- | -- | N | payload-only |
| 29 | driftPollSeconds | int | 86400 | -- | DRIFT_POLL_SECONDS | 423 | Y | top | N | -- | -- | N | payload-only |
| 30 | driftScanMaxProducts | int | 250 | -- | DRIFT_SCAN_MAX_PRODUCTS | 424 | Y | top | N | -- | -- | N | payload-only |
| 31 | dryRun | bool | false | -- | DRY_RUN | 223 | Y | top | Y | DRY_RUN | 285 | N | direct-launch |
| 32 | dynamicCrawleeEnabled | bool | true | -- | DYNAMIC_CRAWLEE_ENABLED | 449 | Y | top | N (hardcoded false) | -- | 258 | N | payload-only |
| 33 | dynamicFetchPolicyMapJson | string | "" | allowEmpty | DYNAMIC_FETCH_POLICY_MAP_JSON | 163 | Y | ocr | Y | DYNAMIC_FETCH_POLICY_MAP_JSON | 271-278 | N | direct-launch |
| 34 | dynamicFetchRetryBackoffMs | int | 2500 | -- | DYNAMIC_FETCH_RETRY_BACKOFF_MS | 453 | Y | top | N | -- | -- | N | payload-only |
| 35 | dynamicFetchRetryBudget | int | 1 | -- | DYNAMIC_FETCH_RETRY_BUDGET | 452 | Y | top | N | -- | -- | N | payload-only |
| 36 | eloSupabaseAnonKey | string | "" | allowEmpty | ELO_SUPABASE_ANON_KEY | 252 | Y | top | Y | ELO_SUPABASE_ANON_KEY | 297 | N | direct-launch |
| 37 | eloSupabaseEndpoint | string | "" | allowEmpty | ELO_SUPABASE_ENDPOINT | 253 | Y | top | Y | ELO_SUPABASE_ENDPOINT | 298 | N | direct-launch |
| 38 | endpointNetworkScanLimit | int | 1800 | -- | ENDPOINT_NETWORK_SCAN_LIMIT | 489 | Y | llm | N | -- | -- | Y (R0=400,R2+=1800) | payload-only |
| 39 | endpointSignalLimit | int | 120 | -- | ENDPOINT_SIGNAL_LIMIT | 487 | Y | llm | N | -- | -- | Y (R0=24,R2+=120) | payload-only |
| 40 | endpointSuggestionLimit | int | 36 | -- | ENDPOINT_SUGGESTION_LIMIT | 488 | Y | llm | N | -- | -- | Y (R0=8,R2+=36) | payload-only |
| 41 | eventsJsonWrite | bool | true | -- | EVENTS_JSON_WRITE | 499 | Y | rt | Y | EVENTS_JSON_WRITE | 319 | N | direct-launch |
| 42 | fetchBudgetMs | int | 45000 | -- | FETCH_BUDGET_MS | 468 | N | -- | N | -- | -- | N | save-only |
| 43 | fetchCandidateSources | bool | true | -- | FETCH_CANDIDATE_SOURCES | 233 | Y | disc | Y | FETCH_CANDIDATE_SOURCES | 261 | Y (R0=false,R1+=true) | direct-launch |
| 44 | fetchConcurrency | int | 4 | cfgKey:concurrency | CONCURRENCY | 199 | Y | top | N | -- | -- | N | payload-only |
| 45 | fetchPerHostConcurrencyCap | int | 1 | -- | FETCH_PER_HOST_CONCURRENCY_CAP | 209 | Y | top | Y | FETCH_PER_HOST_CONCURRENCY_CAP | 307 | N | direct-launch |
| 46 | fetchSchedulerFallbackWaitMs | int | 60000 | -- | FETCH_SCHEDULER_FALLBACK_WAIT_MS | 211 | Y | top | N | -- | -- | N | dead |
| 47 | fetchSchedulerInternalsMapJson | string | (JSON) | allowEmpty | FETCH_SCHEDULER_INTERNALS_MAP_JSON | 151 | Y | ocr | N | -- | -- | N | payload-only |
| 48 | fetchSchedulerMaxRetries | int | 1 | -- | FETCH_SCHEDULER_MAX_RETRIES | 210 | Y | top | N | -- | -- | N | payload-only |
| 49 | fieldRewardHalfLifeDays | int | 45 | -- | FIELD_REWARD_HALF_LIFE_DAYS | 495 | Y | top | N | -- | -- | N | payload-only |
| 50 | frontierBackoffMaxExponent | int | 4 | -- | FRONTIER_BACKOFF_MAX_EXPONENT | 327 | Y | top | N | -- | -- | N | payload-only |
| 51 | frontierBlockedDomainThreshold | int | 1 | -- | FRONTIER_BLOCKED_DOMAIN_THRESHOLD | 329 | Y | top | Y | FRONTIER_BLOCKED_DOMAIN_THRESHOLD | 306 | N | direct-launch |
| 52 | frontierCooldown403BaseSeconds | int | 1800 | -- | FRONTIER_COOLDOWN_403_BASE | 325 | Y | top | N | -- | -- | N | payload-only |
| 53 | frontierCooldown404RepeatSeconds | int | 1209600 | -- | FRONTIER_COOLDOWN_404_REPEAT | 322 | Y | top | N | -- | -- | N | payload-only |
| 54 | frontierCooldown404Seconds | int | 259200 | -- | FRONTIER_COOLDOWN_404 | 321 | Y | top | N | -- | -- | N | payload-only |
| 55 | frontierCooldown410Seconds | int | 7776000 | -- | FRONTIER_COOLDOWN_410 | 323 | Y | top | N | -- | -- | N | payload-only |
| 56 | frontierCooldown429BaseSeconds | int | 600 | -- | FRONTIER_COOLDOWN_429_BASE | 326 | Y | top | N | -- | -- | N | payload-only |
| 57 | frontierCooldownTimeoutSeconds | int | 21600 | -- | FRONTIER_COOLDOWN_TIMEOUT | 324 | Y | top | N | -- | -- | N | payload-only |
| 58 | frontierDbPath | string | "_intel/frontier/frontier.json" | allowEmpty | FRONTIER_DB_PATH | 318 | Y | top | Y | FRONTIER_DB_PATH | 305 | N | direct-launch |
| 59 | frontierPathPenaltyNotfoundThreshold | int | 3 | -- | FRONTIER_PATH_PENALTY_NOTFOUND_THRESHOLD | 328 | Y | top | N | -- | -- | N | payload-only |
| 60 | frontierQueryCooldownSeconds | int | 21600 | -- | FRONTIER_QUERY_COOLDOWN_SECONDS | 320 | Y | top | N | -- | -- | N | payload-only |
| 61 | frontierStripTrackingParams | bool | true | -- | FRONTIER_STRIP_TRACKING_PARAMS | 319 | Y | top | N | -- | -- | N | payload-only |
| 62 | geminiApiKey | string | "" | secret,allowEmpty | GEMINI_API_KEY | 260 | N | -- | N | -- | -- | N | save-only |
| 63 | globalRequestBurst | int | 0 | -- | GLOBAL_REQUEST_BURST | 208 | Y | top | N | -- | -- | N | payload-only |
| 64 | globalRequestRps | int | 0 | -- | GLOBAL_REQUEST_RPS | 207 | Y | top | N | -- | -- | N | payload-only |
| 65 | googleSearchBlockMedia | bool | true | -- | GOOGLE_SEARCH_BLOCK_MEDIA | 248 | N | -- | N | -- | -- | N | save-only |
| 66 | googleSearchHeadless | bool | true | -- | GOOGLE_SEARCH_HEADLESS | 249 | N | -- | N | -- | -- | N | save-only |
| 67 | googleSearchMaxRetries | int | 1 | -- | GOOGLE_SEARCH_MAX_RETRIES | 247 | N | -- | N | -- | -- | N | save-only |
| 68 | googleSearchMinQueryIntervalMs | int | 1000 | -- | GOOGLE_SEARCH_MIN_QUERY_INTERVAL_MS | 246 | N | -- | N | -- | -- | N | save-only |
| 69 | googleSearchProxyUrlsJson | string | (JSON) | allowEmpty | (runtimeSettingDefault only) | 244 | N | -- | N | -- | -- | N | save-only |
| 70 | googleSearchScreenshotQuality | int | 60 | -- | GOOGLE_SEARCH_SCREENSHOT_QUALITY | 251 | N | -- | N | -- | -- | N | save-only |
| 71 | googleSearchScreenshotsEnabled | bool | true | -- | GOOGLE_SEARCH_SCREENSHOTS_ENABLED | 250 | N | -- | N | -- | -- | N | save-only |
| 72 | googleSearchTimeoutMs | int | 30000 | -- | GOOGLE_SEARCH_TIMEOUT_MS | 245 | N | -- | N | -- | -- | N | save-only |
| 73 | graphqlReplayEnabled | bool | true | -- | GRAPHQL_REPLAY_ENABLED | 435 | Y | top | N | -- | -- | N | payload-only |
| 74 | helperFilesRoot | string | "category_authority" | allowEmpty | HELPER_FILES_ROOT | 429 | N | -- | N | -- | -- | N | dead |
| 75 | helperSupportiveFillMissing | bool | true | -- | HELPER_SUPPORTIVE_FILL_MISSING | 431 | Y | top | N | -- | -- | N | payload-only |
| 76 | hypothesisAutoFollowupRounds | int | 2 | -- | HYPOTHESIS_AUTO_FOLLOWUP_ROUNDS | 493 | Y | learn | N | -- | -- | Y (R0=0,R2+=2) | payload-only |
| 77 | hypothesisFollowupUrlsPerRound | int | 24 | -- | HYPOTHESIS_FOLLOWUP_URLS_PER_ROUND | 494 | Y | learn | N | -- | -- | Y (R0=8,R2+=24) | payload-only |
| 78 | importsPollSeconds | int | 10 | -- | IMPORTS_POLL_SECONDS | 418 | Y | rt | Y | IMPORTS_POLL_SECONDS | 323 | N | direct-launch |
| 79 | importsRoot | string | "imports" | allowEmpty | IMPORTS_ROOT | 417 | Y | rt | Y | IMPORTS_ROOT | 322 | N | direct-launch |
| 80 | indexingCategoryAuthorityEnabled | bool | false | -- | INDEXING_HELPER_FILES_ENABLED | 348 | Y | learn | N | -- | -- | N | payload-only |
| 81 | indexingResumePersistLimit | int | 160 | -- | INDEXING_RESUME_PERSIST_LIMIT | 339 | Y | rt | N | -- | -- | N | payload-only |
| 82 | indexingResumeSeedLimit | int | 24 | -- | INDEXING_RESUME_SEED_LIMIT | 338 | Y | rt | N | -- | -- | N | payload-only |
| 83 | indexingSchemaPacketsValidationEnabled | bool | true | -- | INDEXING_SCHEMA_PACKETS_VALIDATION_ENABLED | 342 | Y | rt | N | -- | -- | N | payload-only |
| 84 | indexingSchemaPacketsValidationStrict | bool | true | -- | INDEXING_SCHEMA_PACKETS_VALIDATION_STRICT | 343 | Y | rt | N | -- | -- | N | payload-only |
| 85 | llmBaseUrl | string | "(gemini url)" | allowEmpty | LLM_BASE_URL | 127 | Y | learn | Y | LLM_BASE_URL | 300 | N | direct-launch |
| 86 | llmCostCachedInputPer1M | float | 0.125 | -- | LLM_COST_CACHED_INPUT_PER_1M | 392 | Y | llm | N | -- | -- | N | payload-only |
| 87 | llmCostInputPer1M | float | 1.25 | -- | LLM_COST_INPUT_PER_1M | 390 | Y | llm | N | -- | -- | N | payload-only |
| 88 | llmCostOutputPer1M | float | 10 | -- | LLM_COST_OUTPUT_PER_1M | 391 | Y | llm | N | -- | -- | N | payload-only |
| 89 | llmExtractMaxSnippetChars | int | 700 | -- | LLM_EXTRACT_MAX_SNIPPET_CHARS | 376 | Y | learn | N | -- | -- | N | payload-only |
| 90 | llmExtractMaxSnippetsPerBatch | int | 4 | -- | LLM_EXTRACT_MAX_SNIPPETS_PER_BATCH | 375 | Y | learn | N | -- | -- | N | payload-only |
| 91 | llmExtractSkipLowSignal | bool | true | -- | LLM_EXTRACT_SKIP_LOW_SIGNAL | 377 | Y | learn | N | -- | -- | N | payload-only |
| 92 | llmExtractionCacheDir | string | ".specfactory_tmp/llm_cache" | allowEmpty | LLM_EXTRACTION_CACHE_DIR | 402 | Y | learn | Y | LLM_EXTRACTION_CACHE_DIR | 264 | N | direct-launch |
| 93 | llmExtractionCacheTtlMs | int | 604800000 | -- | LLM_EXTRACTION_CACHE_TTL_MS | 403 | Y | learn | N | -- | -- | N | payload-only |
| 94 | llmMaxBatchesPerProduct | int | 4 | -- | LLM_MAX_BATCHES_PER_PRODUCT | 401 | Y | llm | N | -- | -- | N | payload-only |
| 95 | llmMaxCallsPerProductTotal | int | 14 | -- | LLM_MAX_CALLS_PER_PRODUCT_TOTAL | 404 | Y | learn | N | -- | -- | Y (floor=48) | payload-only |
| 96 | llmMaxCallsPerRound | int | 5 | -- | LLM_MAX_CALLS_PER_ROUND | 406 | Y | llm | N | -- | -- | Y (R0=max(1,4),R1+=floor 16) | payload-only |
| 97 | llmMaxEvidenceChars | int | 60000 | -- | LLM_MAX_EVIDENCE_CHARS | 407 | Y | llm | N | -- | -- | N | payload-only |
| 98 | llmMaxOutputTokens | int | 1400 | -- | LLM_MAX_OUTPUT_TOKENS | 382 | Y | llm | N | -- | -- | N | payload-only |
| 99 | llmMaxOutputTokensPlan | int | 4096 | tokenClamped | LLM_MAX_OUTPUT_TOKENS_PLAN | 383 | Y | model | Y | LLM_MAX_OUTPUT_TOKENS_PLAN | 350 | N | direct-launch |
| 100 | llmMaxOutputTokensPlanFallback | int | 2048 | tokenClamped | LLM_MAX_OUTPUT_TOKENS_PLAN_FALLBACK | 385 | Y | model | Y | LLM_MAX_OUTPUT_TOKENS_PLAN_FALLBACK | 358 | N | direct-launch |
| 101 | llmMaxOutputTokensReasoning | int | 4096 | tokenClamped | LLM_MAX_OUTPUT_TOKENS_REASONING | 384 | Y | model | Y | LLM_MAX_OUTPUT_TOKENS_REASONING | 351 | N | direct-launch |
| 102 | llmMaxOutputTokensReasoningFallback | int | 2048 | tokenClamped | LLM_MAX_OUTPUT_TOKENS_REASONING_FALLBACK | 271 | Y | model | N | -- | -- | N | payload-only |
| 103 | llmMaxTokens | int | 16384 | -- | LLM_MAX_TOKENS | 374 | Y | llm | N | -- | -- | N | payload-only |
| 104 | llmModelPlan | string | "gemini-2.5-flash" | -- | LLM_MODEL_PLAN | 131 | Y | model | Y | LLM_MODEL_PLAN | 346 | N | direct-launch |
| 105 | llmModelReasoning | string | "deepseek-reasoner" | -- | LLM_MODEL_REASONING | 133 | Y | model | Y | LLM_MODEL_REASONING | 347 | N | direct-launch |
| 106 | llmMonthlyBudgetUsd | float | 300 | -- | LLM_MONTHLY_BUDGET_USD | 399 | Y | learn | N | -- | -- | N | payload-only |
| 107 | llmPerProductBudgetUsd | float | 0.35 | -- | LLM_PER_PRODUCT_BUDGET_USD | 400 | Y | learn | N | -- | -- | N | payload-only |
| 108 | llmPhaseOverridesJson | string | "{}" | allowEmpty | (runtimeSettingDefault only) | 272 | N | -- | N | -- | -- | N | save-only |
| 109 | llmPlanApiKey | string | "" | secret,allowEmpty | LLM_PLAN_API_KEY | 275 | Y | learn | N | -- | -- | N | payload-only |
| 110 | llmPlanBaseUrl | string | "(gemini url)" | allowEmpty | LLM_PLAN_BASE_URL | 135 | Y | learn | N | -- | -- | N | payload-only |
| 111 | llmPlanFallbackModel | string | "deepseek-chat" | -- | LLM_PLAN_FALLBACK_MODEL | 276 | Y | model | Y | LLM_PLAN_FALLBACK_MODEL | 357 | N | direct-launch |
| 112 | llmPlanProvider | string | "gemini" | -- | LLM_PLAN_PROVIDER | 134 | Y | learn | N | -- | -- | N | payload-only |
| 113 | llmPlanUseReasoning | bool | false | -- | LLM_PLAN_USE_REASONING | 269 | N | -- | N | -- | -- | N | save-only |
| 114 | llmProvider | string | "gemini" | -- | LLM_PROVIDER | 126 | Y | learn | Y | LLM_PROVIDER | 299 | N | direct-launch |
| 115 | llmProviderRegistryJson | string | (large JSON) | allowEmpty | (resolveRegistryDefaults) | 52-72 | N | -- | N | -- | -- | N | save-only |
| 116 | llmReasoningBudget | int | 32768 | -- | LLM_REASONING_BUDGET | 373 | Y | learn | N | -- | -- | N | payload-only |
| 117 | llmReasoningFallbackModel | string | "gemini-2.5-pro" | -- | LLM_REASONING_FALLBACK_MODEL | 270 | Y | model | N | -- | -- | N | payload-only |
| 118 | llmReasoningMode | bool | true | -- | LLM_REASONING_MODE | 372 | Y | learn | N | -- | -- | N | payload-only |
| 119 | llmTimeoutMs | int | 30000 | -- | LLM_TIMEOUT_MS | 146 | Y | llm | N | -- | -- | N | payload-only |
| 120 | llmVerifyMode | bool | true | -- | LLM_VERIFY_MODE | 378 | Y | llm | N | -- | -- | N | payload-only |
| 121 | llmVerifySampleRate | int | 25 | -- | LLM_VERIFY_SAMPLE_RATE | 379 | Y | llm | N | -- | -- | N | payload-only |
| 122 | llmWriteSummary | bool | false | -- | LLM_WRITE_SUMMARY | 254 | Y | learn | Y | LLM_WRITE_SUMMARY | 292 | N | direct-launch |
| 123 | localInputRoot | string | "fixtures/s3" | allowEmpty | LOCAL_INPUT_ROOT | 227 | Y | top | Y | LOCAL_INPUT_ROOT | 288 | N | direct-launch |
| 124 | localMode | bool | true | -- | LOCAL_MODE | 222 | Y | top | Y | LOCAL_MODE | 284 | N | direct-launch |
| 125 | localOutputRoot | string | "(temp path)" | allowEmpty | LOCAL_OUTPUT_ROOT | 228 | Y | top | Y | LOCAL_OUTPUT_ROOT | 289 | N | direct-launch |
| 126 | manufacturerAutoPromote | bool | true | -- | MANUFACTURER_AUTO_PROMOTE | 490 | N | -- | N | -- | -- | N | save-only |
| 127 | maxCandidateUrls | int | 80 | -- | MAX_CANDIDATE_URLS | 137-141 | Y | disc | N | -- | -- | Y (R0=20,R1=120,R2+=300) | payload-only |
| 128 | maxGraphqlReplays | int | 20 | -- | MAX_GRAPHQL_REPLAYS | 436 | Y | top | N | -- | -- | Y (R2+=20) | payload-only |
| 129 | maxHypothesisItems | int | 120 | -- | MAX_HYPOTHESIS_ITEMS | 492 | Y | learn | N | -- | -- | Y (R2+=120) | payload-only |
| 130 | maxJsonBytes | int | 6000000 | -- | MAX_JSON_BYTES | 184 | Y | disc | N | -- | -- | Y (R2+=6000000) | payload-only |
| 131 | maxNetworkResponsesPerPage | int | 2500 | -- | MAX_NETWORK_RESPONSES_PER_PAGE | 437 | Y | top | N | -- | -- | Y (R2+=2500) | payload-only |
| 132 | maxPagesPerDomain | int | 5 | -- | MAX_PAGES_PER_DOMAIN | 182 | Y | disc | N | -- | -- | Y (R0=2,R1+=6,R2+=8) | payload-only |
| 133 | maxPdfBytes | int | 30000000 | -- | MAX_PDF_BYTES | 185 | Y | disc | Y | MAX_PDF_BYTES | 262 | N | direct-launch |
| 134 | maxRunSeconds | int | 480 | -- | MAX_RUN_SECONDS | 183 | Y | disc | N | -- | -- | Y (R0=180,R2+=3600) | payload-only |
| 135 | maxUrlsPerProduct | int | 50 | -- | MAX_URLS_PER_PRODUCT | 180 | Y | disc | N | -- | -- | Y (R0=12,R1=90,R2+=220) | payload-only |
| 136 | mirrorToS3 | bool | false | -- | MIRROR_TO_S3 | 225 | Y | top | Y | MIRROR_TO_S3 | 286 | N | direct-launch |
| 137 | mirrorToS3Input | bool | false | -- | MIRROR_TO_S3_INPUT | 226 | Y | top | Y | MIRROR_TO_S3_INPUT | 287 | N | direct-launch |
| 138 | openaiApiKey | string | "" | secret,allowEmpty | OPENAI_API_KEY | 75 | Y | learn | Y | OPENAI_API_KEY | 301 | N | direct-launch |
| 139 | outputMode | enum | "local" | -- | OUTPUT_MODE | 147 | Y | top | Y | OUTPUT_MODE | 280-283 | N | direct-launch |
| 140 | pageGotoTimeoutMs | int | 12000 | -- | PAGE_GOTO_TIMEOUT_MS | 438 | Y | top | Y | PAGE_GOTO_TIMEOUT_MS | 308 | Y (R0=12000,R2+=45000) | direct-launch |
| 141 | pageNetworkIdleTimeoutMs | int | 2000 | -- | PAGE_NETWORK_IDLE_TIMEOUT_MS | 439 | Y | top | N | -- | -- | Y (R0=1500,R2+=15000) | payload-only |
| 142 | parsingConfidenceBaseMapJson | string | "" | allowEmpty,routeOnly | (normalizeParsingConfidenceBaseMap) | 155 | Y | ocr | N | -- | -- | N | payload-only |
| 143 | pdfBackendRouterEnabled | bool | true | -- | PDF_BACKEND_ROUTER_ENABLED | 186 | Y | top | N | -- | -- | N | payload-only |
| 144 | pdfBackendRouterMaxPages | int | 60 | -- | PDF_BACKEND_ROUTER_MAX_PAGES | 189 | Y | top | N | -- | -- | N | payload-only |
| 145 | pdfBackendRouterMaxPairs | int | 5000 | -- | PDF_BACKEND_ROUTER_MAX_PAIRS | 190 | Y | top | N | -- | -- | N | payload-only |
| 146 | pdfBackendRouterMaxTextPreviewChars | int | 20000 | -- | PDF_BACKEND_ROUTER_MAX_TEXT_PREVIEW_CHARS | 191 | Y | top | N | -- | -- | N | payload-only |
| 147 | pdfBackendRouterTimeoutMs | int | 120000 | -- | PDF_BACKEND_ROUTER_TIMEOUT_MS | 188 | Y | top | N | -- | -- | N | payload-only |
| 148 | pdfPreferredBackend | string | "auto" | -- | PDF_PREFERRED_BACKEND | 187 | Y | top | Y | PDF_PREFERRED_BACKEND | 310 | N | direct-launch |
| 149 | perHostMinDelayMs | int | 1500 | -- | PER_HOST_MIN_DELAY_MS | 200 | Y | top | N | -- | -- | Y (R0=150) | payload-only |
| 150 | postLoadWaitMs | int | 200 | -- | POST_LOAD_WAIT_MS | 440 | Y | top | N | -- | -- | Y (R0=0,R2+=10000) | payload-only |
| 151 | preferHttpFetcher | bool | true | -- | PREFER_HTTP_FETCHER | 469 | Y | top | Y | PREFER_HTTP_FETCHER | 257+304 | Y (R0=true,R2+=false) | direct-launch |
| 152 | reCrawlStaleAfterDays | int | 30 | -- | RECRAWL_STALE_AFTER_DAYS | 420 | Y | top | N | -- | -- | N | payload-only |
| 153 | reextractAfterHours | int | 24 | cfgKey:indexingReextractAfterHours | INDEXING_REEXTRACT_AFTER_HOURS | 346 | N | -- | N | -- | -- | N | save-only |
| 154 | reextractIndexed | bool | true | cfgKey:indexingReextractEnabled | INDEXING_REEXTRACT_ENABLED | 345 | N | -- | N | -- | -- | N | save-only |
| 155 | repairDedupeRule | enum | "domain_once" | -- | REPAIR_DEDUPE_RULE | 330 | Y | ocr | N | -- | -- | N | payload-only |
| 156 | resumeMode | enum | "auto" | cfgKey:indexingResumeMode | INDEXING_RESUME_MODE | 336 | N | -- | N | -- | -- | N | save-only |
| 157 | resumeWindowHours | int | 48 | cfgKey:indexingResumeMaxAgeHours | INDEXING_RESUME_MAX_AGE_HOURS | 337 | N | -- | N | -- | -- | N | save-only |
| 158 | robotsTxtCompliant | bool | true | -- | ROBOTS_TXT_COMPLIANT | 485 | Y | top | N | -- | -- | N | payload-only |
| 159 | robotsTxtTimeoutMs | int | 6000 | -- | ROBOTS_TXT_TIMEOUT_MS | 486 | Y | top | N | -- | -- | N | payload-only |
| 160 | runtimeControlFile | string | "_runtime/control/..." | -- | RUNTIME_CONTROL_FILE | 350 | Y | top | N | -- | -- | N | payload-only |
| 161 | runtimeEventsKey | string | "_runtime/events.jsonl" | -- | RUNTIME_EVENTS_KEY | 229 | Y | top | Y | RUNTIME_EVENTS_KEY | 290 | N | direct-launch |
| 162 | runtimeScreencastEnabled | bool | true | -- | RUNTIME_SCREENCAST_ENABLED | 501 | Y | rt | Y | RUNTIME_SCREENCAST_ENABLED | 324 | N | direct-launch |
| 163 | runtimeScreencastFps | int | 10 | -- | RUNTIME_SCREENCAST_FPS | 502 | Y | rt | Y | RUNTIME_SCREENCAST_FPS | 325 | N | direct-launch |
| 164 | runtimeScreencastMaxHeight | int | 720 | -- | RUNTIME_SCREENCAST_MAX_HEIGHT | 505 | Y | rt | Y | RUNTIME_SCREENCAST_MAX_HEIGHT | 328 | N | direct-launch |
| 165 | runtimeScreencastMaxWidth | int | 1280 | -- | RUNTIME_SCREENCAST_MAX_WIDTH | 504 | Y | rt | Y | RUNTIME_SCREENCAST_MAX_WIDTH | 327 | N | direct-launch |
| 166 | runtimeScreencastQuality | int | 50 | -- | RUNTIME_SCREENCAST_QUALITY | 503 | Y | rt | Y | RUNTIME_SCREENCAST_QUALITY | 326 | N | direct-launch |
| 167 | runtimeTraceEnabled | bool | true | -- | RUNTIME_TRACE_ENABLED | 332 | Y | rt | N | -- | -- | N | payload-only |
| 168 | runtimeTraceFetchRing | int | 30 | -- | RUNTIME_TRACE_FETCH_RING | 333 | Y | rt | Y | RUNTIME_TRACE_FETCH_RING | 316 | N | direct-launch |
| 169 | runtimeTraceLlmPayloads | bool | true | -- | RUNTIME_TRACE_LLM_PAYLOADS | 335 | Y | rt | Y | RUNTIME_TRACE_LLM_PAYLOADS | 318 | N | direct-launch |
| 170 | runtimeTraceLlmRing | int | 50 | -- | RUNTIME_TRACE_LLM_RING | 334 | Y | rt | Y | RUNTIME_TRACE_LLM_RING | 317 | N | direct-launch |
| 171 | s3Bucket | string | "my-spec-harvester-data" | readOnly | S3_BUCKET | 177 | Y | top | Y | S3_BUCKET | 294 | N | readOnly |
| 172 | s3InputPrefix | string | "specs/inputs" | allowEmpty | S3_INPUT_PREFIX | 178 | Y | top | Y | S3_INPUT_PREFIX | 295 | N | direct-launch |
| 173 | s3OutputPrefix | string | "specs/outputs" | allowEmpty | S3_OUTPUT_PREFIX | 179 | Y | top | Y | S3_OUTPUT_PREFIX | 296 | N | direct-launch |
| 174 | scannedPdfOcrBackend | enum | "auto" | -- | SCANNED_PDF_OCR_BACKEND | 193 | Y | ocr | N | -- | -- | N | payload-only |
| 175 | scannedPdfOcrEnabled | bool | true | -- | SCANNED_PDF_OCR_ENABLED | 192 | Y | ocr | N | -- | -- | N | payload-only |
| 176 | scannedPdfOcrMaxPages | int | 4 | -- | SCANNED_PDF_OCR_MAX_PAGES | 194 | Y | ocr | N | -- | -- | N | payload-only |
| 177 | scannedPdfOcrMaxPairs | int | 800 | -- | SCANNED_PDF_OCR_MAX_PAIRS | 195 | Y | ocr | N | -- | -- | N | payload-only |
| 178 | scannedPdfOcrMinCharsPerPage | int | 30 | -- | SCANNED_PDF_OCR_MIN_CHARS_PER_PAGE | 196 | Y | ocr | N | -- | -- | N | payload-only |
| 179 | scannedPdfOcrMinConfidence | float | 0.5 | -- | SCANNED_PDF_OCR_MIN_CONFIDENCE | 198 | Y | ocr | N | -- | -- | N | payload-only |
| 180 | scannedPdfOcrMinLinesPerPage | int | 2 | -- | SCANNED_PDF_OCR_MIN_LINES_PER_PAGE | 197 | Y | ocr | N | -- | -- | N | payload-only |
| 181 | searchEngines | csv_enum | "google" | -- | SEARCH_ENGINES | 238 | Y | model | N | -- | -- | Y (R0="",R1+=configured) | payload-only |
| 182 | searchEnginesFallback | csv_enum | "bing" | -- | SEARCH_ENGINES_FALLBACK | 239 | Y | model | N | -- | -- | N | payload-only |
| 183 | searchProfileCapMapJson | string | (JSON) | allowEmpty | SEARCH_PROFILE_CAP_MAP_JSON | 457 | Y | ocr | N | -- | -- | N | payload-only |
| 184 | searxngBaseUrl | string | "http://127.0.0.1:8080" | allowEmpty | SEARXNG_BASE_URL | 240 | Y | learn | N | -- | -- | N | payload-only |
| 185 | searxngMinQueryIntervalMs | int | 3000 | -- | SEARXNG_MIN_QUERY_INTERVAL_MS | 242 | N | -- | N | -- | -- | N | save-only |
| 186 | selfImproveEnabled | bool | true | -- | SELF_IMPROVE_ENABLED | 491 | Y | learn | N | -- | -- | N | payload-only |
| 187 | serpRerankerWeightMapJson | string | (JSON) | allowEmpty | SERP_RERANKER_WEIGHT_MAP_JSON | 463 | Y | ocr | N | -- | -- | N | payload-only |
| 188 | specDbDir | string | ".specfactory_tmp" | allowEmpty | SPEC_DB_DIR | 317 | Y | top | Y | SPEC_DB_DIR | 263 | N | direct-launch |
| 189 | staticDomMaxEvidenceSnippets | int | 120 | -- | STATIC_DOM_MAX_EVIDENCE_SNIPPETS | 448 | Y | top | N | -- | -- | N | payload-only |
| 190 | staticDomMode | string | "cheerio" | -- | STATIC_DOM_MODE | 446 | Y | top | Y | STATIC_DOM_MODE | 314 | N | direct-launch |
| 191 | staticDomTargetMatchThreshold | float | 0.55 | -- | STATIC_DOM_TARGET_MATCH_THRESHOLD | 447 | Y | top | N | -- | -- | N | payload-only |
| 192 | userAgent | string | "(Chrome UA)" | -- | USER_AGENT | 218 | Y | learn | N | -- | -- | N | payload-only |
| 193 | writeMarkdownSummary | bool | true | -- | WRITE_MARKDOWN_SUMMARY | 230 | Y | top | Y | WRITE_MARKDOWN_SUMMARY | 291 | N | direct-launch |
| 194 | llmPlanUseReasoning | bool | false | -- | LLM_PLAN_USE_REASONING | 269 | N | -- | N | -- | -- | N | save-only |
| 195 | discoveryEnabled (defaultsOnly) | bool | true | defaultsOnly | DISCOVERY_ENABLED | 232 | Y | disc | N | -- | -- | Y (R0=false,R1+=true) | defaultsOnly |
| 196 | daemonGracefulShutdownTimeoutMs (defaultsOnly) | int | 30000 | defaultsOnly | (hardcoded 60000) | 421 | Y | rt | Y | DAEMON_GRACEFUL_SHUTDOWN_TIMEOUT_MS | 321 | N | defaultsOnly |
| 197 | runtimeAutoSaveEnabled (defaultsOnly) | bool | true | defaultsOnly | RUNTIME_AUTOSAVE_ENABLED | 506 | N | -- | N | -- | -- | N | defaultsOnly |

**Note on rows 194-197:** These are special cases. `discoveryEnabled` is sent in the GUI discovery payload as hardcoded `true`, but roundConfigBuilder overrides it per round. `daemonGracefulShutdownTimeoutMs` is destructured from the POST body and forwarded to an env var. `runtimeAutoSaveEnabled` is purely internal.

---

## Section 2: Round Override Inventory

Source: `src/runner/roundConfigBuilder.js`, function `buildRoundConfig` (lines 259-466).

Round 0 = "fast" profile (local seed data only, no discovery).
Round 1 = standard with discovery.
Round 2+ = "thorough" profile (aggressive crawling).

Effort-boost columns are additive adjustments applied when `contractEffort.total_effort > 0` (lines 393-401) or when `expectedCount > 0` (lines 378-387).

| key | round 0 (fast) | round 1 | round 2+ (thorough) | effort boost | CB line |
|-----|---------------|---------|---------------------|-------------|---------|
| runProfile | "standard" | "standard" | "standard" | -- | 288 |
| discoveryEnabled | false | true | true | conditional disable if missing=0 | 289, 363, 404-429 |
| fetchCandidateSources | false | true | true | conditional disable if missing=0 | 290, 364, 404-429 |
| searchEngines | "" | baseConfig.searchEngines | baseConfig.searchEngines | -- | 291, 436-445 |
| llmMaxCallsPerRound | max(1, base or 4) | max(1, base or 4) | max(1, base or 4) | floor 16 for round>0 | 293-295, 457-460 |
| maxUrlsPerProduct | min(base, 24) then min(12) | min(max(base,60), 90) | max(base, 220) | +effortTier*20 +hard*14 +crit*10 | 297-305, 332, 355, 373, 381, 399, 452-453 |
| maxCandidateUrls | min(base, 40) then min(20) | min(max(base,90), 120) | max(base, 300) | +effortTier*30 +hard*18 +crit*12 | 307-315, 333, 356, 374, 382, 400, 453 |
| preferHttpFetcher | true | (base) | false | -- | 320, 349 |
| autoScrollEnabled | false | (base) | true | -- | 321, 341 |
| autoScrollPasses | 0 | (base) | max(base, 3) | -- | 322, 342 |
| autoScrollDelayMs | (n/a, base overridden to 0ms via postLoadWaitMs) | (base) | max(base, 1200) | -- | 343 |
| postLoadWaitMs | min(base, 0) | (base) | max(base, 10000) | -- | 323, 346 |
| pageGotoTimeoutMs | min(base, 12000) | (base) | max(base, 45000) | -- | 324, 344 |
| pageNetworkIdleTimeoutMs | min(base, 1500) | (base) | max(base, 15000) | -- | 325, 345 |
| endpointSignalLimit | min(base, 24) | (base) | max(base, 120) | -- | 326, 361 |
| endpointSuggestionLimit | min(base, 8) | (base) | max(base, 36) | -- | 327, 362 |
| endpointNetworkScanLimit | min(base, 400) | (base) | max(base, 1800) | -- | 328, 360 |
| hypothesisAutoFollowupRounds | 0 | (base) | max(base, 2) | -- | 329, 353 |
| hypothesisFollowupUrlsPerRound | min(base, 8) | (base) | max(base, 24) | -- | 330, 354 |
| maxRunSeconds | min(base, 180) | (base) | max(base, 3600) | -- | 331, 348 |
| maxPagesPerDomain | min(base, 2) | max(base, 6) | max(base, 8) | -- | 334, 357, 375 |
| discoveryMaxQueries | min(base, 4) | max(base+4, 12) | max(base, 24) | +effortTier +min(6,expectedRequiredCount) | 335, 365, 372, 379, 398 |
| discoveryResultsPerQuery | min(base, 6) | (base) | max(base, 20) | -- | 336, 366, 380 |
| discoveryMaxDiscovered | min(base, 60) | (base) | max(base, 300) | -- | 337, 367 |
| discoveryQueryConcurrency | max(base, 4) | (base) | max(base, 8) | -- | 338, 368 |
| perHostMinDelayMs | min(base, 150) | (base) | (base) | -- | 339 |
| maxJsonBytes | (base) | (base) | max(base, 6000000) | -- | 347 |
| maxNetworkResponsesPerPage | (base) | (base) | max(base, 2500) | -- | 350 |
| maxGraphqlReplays | (base) | (base) | max(base, 20) | -- | 351, 358 |
| maxHypothesisItems | (base) | (base) | max(base, 120) | -- | 352, 359 |
| llmMaxCallsPerProductTotal | (base) | (base) | (base) | floor 48 always | 458-462 |

---

## Section 3: Dead Knob Evidence

### 3.1 `fetchSchedulerFallbackWaitMs`

- **Defined in:** `settingsRegistry.js` line 61 (key: "fetchSchedulerFallbackWaitMs", type: int, default: 60000)
- **Parsed in:** `configBuilder.js` line 211 as `cfg.fetchSchedulerFallbackWaitMs`
- **In GUI payload:** Yes (top-level in startPayload, line 69)
- **NOT consumed by:** The fetch scheduler (`src/features/indexing/search/` and related modules) uses `fetchSchedulerInternalsMap` and `fetchSchedulerMaxRetries`, but `fetchSchedulerFallbackWaitMs` is set on `cfg` and never read by any runtime code path. The configBuilder assigns it, and roundConfigBuilder does not override it. No module destructures or reads `config.fetchSchedulerFallbackWaitMs`.
- **Evidence:** The field exists on the config object but has no consumer. It was likely superseded by `fetchSchedulerInternalsMap.retryWaitMs`.

### 3.2 `helperFilesRoot`

- **Defined in:** `settingsRegistry.js` line 89 (key: "helperFilesRoot", type: string, default: "category_authority")
- **Parsed in:** `configBuilder.js` line 429 via dynamic key construction `helper${'FilesRoot'}` (legacy alias)
- **In GUI payload:** No (not included in any sub-payload builder)
- **NOT consumed by:** Any runtime code that matters. The system uses `categoryAuthorityRoot` exclusively. `helperFilesRoot` is a legacy alias that configBuilder sets but is fully eclipsed by `categoryAuthorityRoot`. The launch plan writes both `HELPER_FILES_ROOT` and `CATEGORY_AUTHORITY_ROOT` when `categoryAuthorityRoot` is provided (lines 267-268), but `helperFilesRoot` itself in the registry is dead weight.
- **Evidence:** `categoryAuthorityRoot` is the canonical key. `helperFilesRoot` is a backward-compat alias that no code prefers.

### 3.3 `runtimeTraceLlmRing`

- **Correction:** This knob was previously flagged as dead but it IS consumed. `configBuilder.js` line 334 reads `RUNTIME_TRACE_LLM_RING` and the launch plan forwards it (line 317). The trace ring buffer uses `cfg.runtimeTraceLlmRing` in `src/core/llm/client/`. This is NOT dead -- it is a **direct-launch** key.

**Revised dead knob count: 2** (`fetchSchedulerFallbackWaitMs`, `helperFilesRoot`)

---

## Section 4: Stale-Start Race Condition

### Step-by-step reproduction

1. User opens the GUI Pipeline Settings page and edits settings (e.g., changes `llmTimeoutMs` from 30000 to 60000).
2. The GUI autosave mechanism debounces changes and writes to `user-settings.json` via `PUT /api/runtime-settings` after a ~1500ms debounce window.
3. User clicks "Start Run" immediately after editing (within the 1500ms debounce window).
4. The GUI calls `POST /api/process/start` with `buildIndexingRunStartPayload()` output.
5. `processStartLaunchPlan.js` receives the POST body.
6. For **direct-launch** keys (42 settings), the value from the POST body is converted to an env var and passed to the child process. These are safe -- the child gets the user's latest intent.
7. For **payload-only** keys (~93 settings), the value IS in the POST body but `processStartLaunchPlan.js` does NOT convert it to an env var. The child process spawns, calls `loadConfigWithUserSettings()`, which reads `user-settings.json` from disk.
8. **Race:** If the autosave has not yet flushed (step 2 hasn't completed), the child reads STALE values from `user-settings.json`. The user's latest edits are lost.
9. The POST body carried the correct values but they were discarded by the launch plan.

### Affected settings

All **payload-only** classified settings (~93 keys) are vulnerable. This includes critical runtime tuning like:
- `llmTimeoutMs`, `llmMaxTokens`, `llmMaxOutputTokens`
- `llmReasoningMode`, `llmReasoningBudget`
- `fetchConcurrency`, `perHostMinDelayMs`
- `maxRunSeconds`, `maxUrlsPerProduct`, `maxCandidateUrls`
- `discoveryMaxQueries`, `discoveryMaxDiscovered`
- All frontier cooldown settings
- All PDF/OCR settings
- All endpoint limits
- All LLM cost settings

### Timing analysis

- Autosave debounce: ~1500ms
- `POST /api/process/start` can fire instantly on click
- Child process spawn: ~200-500ms
- Child config load: ~50ms
- **Window of vulnerability:** 0-1500ms after last edit

### Why it matters

The user sees their edited values in the GUI, clicks Start, and assumes those values are active. But the child may run with completely different values if the autosave hasn't flushed. There is no feedback to the user that settings were stale.

---

## Section 5: Classification Summary

| Classification | Count | Description |
|---------------|-------|-------------|
| **direct-launch** | 51 | GUI sends in POST body, launch plan converts to env var, child reads env |
| **payload-only** | 93 | GUI sends in POST body, launch plan DROPS it, child reads stale user-settings.json |
| **save-only** | 18 | Not in GUI start payload, only reaches child via autosaved user-settings.json |
| **dead** | 2 | Registry entry exists but no effective runtime consumer |
| **readOnly** | 2 | awsRegion, s3Bucket -- cannot be set via PUT route |
| **defaultsOnly** | 3 | discoveryEnabled, daemonGracefulShutdownTimeoutMs, runtimeAutoSaveEnabled |
| **TOTAL** | 169 | (excludes API keys that appear in multiple classifications) |

**Notes:**
- Some keys appear in both the GUI payload and the launch plan but with name transformations (e.g., `categoryAuthorityEnabled` -> `HELPER_FILES_ENABLED`).
- The `discoveryEnabled` defaultsOnly key IS sent by the GUI discovery payload as hardcoded `true`, and IS overridden per round by `roundConfigBuilder`. It is classified as defaultsOnly because it is not exposed in the settings PUT route.
- `daemonGracefulShutdownTimeoutMs` is defaultsOnly in the registry but IS destructured from the POST body and forwarded to an env var, making it functionally direct-launch for GUI-started runs.

### Risk assessment

- **93 payload-only keys** represent a systemic propagation gap. The GUI sends these values but the launch plan discards them.
- **18 save-only keys** have no GUI start payload path at all and rely entirely on the autosave race.
- **2 dead knobs** should be retired.
- The stale-start race condition affects all 111 non-direct-launch settings (payload-only + save-only).

### Direct-launch keys (51 total, with launch plan env var)

1. anthropicApiKey -> ANTHROPIC_API_KEY
2. capturePageScreenshotEnabled -> CAPTURE_PAGE_SCREENSHOT_ENABLED
3. capturePageScreenshotFormat -> CAPTURE_PAGE_SCREENSHOT_FORMAT
4. capturePageScreenshotSelectors -> CAPTURE_PAGE_SCREENSHOT_SELECTORS
5. categoryAuthorityEnabled -> HELPER_FILES_ENABLED
6. categoryAuthorityRoot -> CATEGORY_AUTHORITY_ROOT + HELPER_FILES_ROOT
7. daemonConcurrency -> DAEMON_CONCURRENCY
8. daemonGracefulShutdownTimeoutMs -> DAEMON_GRACEFUL_SHUTDOWN_TIMEOUT_MS
9. dryRun -> DRY_RUN
10. dynamicFetchPolicyMapJson -> DYNAMIC_FETCH_POLICY_MAP_JSON
11. eloSupabaseAnonKey -> ELO_SUPABASE_ANON_KEY
12. eloSupabaseEndpoint -> ELO_SUPABASE_ENDPOINT
13. eventsJsonWrite -> EVENTS_JSON_WRITE
14. fetchCandidateSources -> FETCH_CANDIDATE_SOURCES
15. fetchPerHostConcurrencyCap -> FETCH_PER_HOST_CONCURRENCY_CAP
16. frontierBlockedDomainThreshold -> FRONTIER_BLOCKED_DOMAIN_THRESHOLD
17. frontierDbPath -> FRONTIER_DB_PATH
18. importsPollSeconds -> IMPORTS_POLL_SECONDS
19. importsRoot -> IMPORTS_ROOT
20. llmBaseUrl -> LLM_BASE_URL
21. llmExtractionCacheDir -> LLM_EXTRACTION_CACHE_DIR
22. llmMaxOutputTokensPlan -> LLM_MAX_OUTPUT_TOKENS_PLAN
23. llmMaxOutputTokensPlanFallback -> LLM_MAX_OUTPUT_TOKENS_PLAN_FALLBACK
24. llmMaxOutputTokensReasoning -> LLM_MAX_OUTPUT_TOKENS_REASONING
25. llmModelPlan -> LLM_MODEL_PLAN
26. llmModelReasoning -> LLM_MODEL_REASONING
27. llmPlanFallbackModel -> LLM_PLAN_FALLBACK_MODEL
28. llmProvider -> LLM_PROVIDER
29. llmWriteSummary -> LLM_WRITE_SUMMARY
30. localInputRoot -> LOCAL_INPUT_ROOT
31. localMode -> LOCAL_MODE
32. localOutputRoot -> LOCAL_OUTPUT_ROOT
33. maxPdfBytes -> MAX_PDF_BYTES
34. mirrorToS3 -> MIRROR_TO_S3
35. mirrorToS3Input -> MIRROR_TO_S3_INPUT
36. openaiApiKey -> OPENAI_API_KEY
37. outputMode -> OUTPUT_MODE
38. pageGotoTimeoutMs -> PAGE_GOTO_TIMEOUT_MS
39. pdfPreferredBackend -> PDF_PREFERRED_BACKEND
40. preferHttpFetcher -> PREFER_HTTP_FETCHER
41. runtimeEventsKey -> RUNTIME_EVENTS_KEY
42. runtimeScreencastEnabled -> RUNTIME_SCREENCAST_ENABLED
43. runtimeScreencastFps -> RUNTIME_SCREENCAST_FPS
44. runtimeScreencastMaxHeight -> RUNTIME_SCREENCAST_MAX_HEIGHT
45. runtimeScreencastMaxWidth -> RUNTIME_SCREENCAST_MAX_WIDTH
46. runtimeScreencastQuality -> RUNTIME_SCREENCAST_QUALITY
47. runtimeTraceFetchRing -> RUNTIME_TRACE_FETCH_RING
48. runtimeTraceLlmPayloads -> RUNTIME_TRACE_LLM_PAYLOADS
49. runtimeTraceLlmRing -> RUNTIME_TRACE_LLM_RING
50. s3InputPrefix -> S3_INPUT_PREFIX
51. s3OutputPrefix -> S3_OUTPUT_PREFIX
52. specDbDir -> SPEC_DB_DIR
53. staticDomMode -> STATIC_DOM_MODE
54. writeMarkdownSummary -> WRITE_MARKDOWN_SUMMARY
55. awsRegion -> AWS_REGION (readOnly)
56. s3Bucket -> S3_BUCKET (readOnly)

### Save-only keys (18 total, not in GUI start payload)

1. deepseekApiKey
2. geminiApiKey
3. googleSearchBlockMedia
4. googleSearchHeadless
5. googleSearchMaxRetries
6. googleSearchMinQueryIntervalMs
7. googleSearchProxyUrlsJson
8. googleSearchScreenshotQuality
9. googleSearchScreenshotsEnabled
10. googleSearchTimeoutMs
11. llmPhaseOverridesJson
12. llmPlanUseReasoning
13. llmProviderRegistryJson
14. manufacturerAutoPromote
15. reextractAfterHours
16. reextractIndexed
17. resumeMode
18. resumeWindowHours
19. searxngMinQueryIntervalMs
20. fetchBudgetMs

---

## Appendix: Body Fields Destructured by processStartLaunchPlan but NOT Converted to Env Vars

These fields are destructured from the POST `body` (lines 105-178) but are used for CLI args or internal logic only, not forwarded as env vars:

| Body field | Used for | Line |
|-----------|----------|------|
| category | CLI arg `--category` | 223 |
| productId | CLI arg `--product-id` | 224-225 |
| brand | CLI arg `--brand` | 229 |
| model | CLI arg `--model` | 230 |
| variant | CLI arg `--variant` | 231 |
| sku | CLI arg `--sku` | 232 |
| seedUrls | CLI arg `--seed-urls` | 234-235 |
| seed | CLI arg `--seed` | 226-227 |
| fields | CLI arg `--fields` | 236-237 |
| providers | CLI arg `--providers` | 238-239 |
| searchEngines | CLI arg `--search-engines` | 241-244 |
| profile | CLI arg `--profile` | 249-251 |
| mode | Validation only (must be "indexlab") | 192-197 |
| indexlabOut | CLI arg `--out` | 246-248 |
| replaceRunning | Returned in result, not env | 367 |
| llmFallbackEnabled | Controls whether fallback model env vars are set or cleared | 353-359 |
| discoveryEnabled | NOT destructured from body (hardcoded logic in launch plan) | -- |

### Fields in POST body that processStartLaunchPlan IGNORES entirely

These fields are sent by the GUI `buildIndexingRunStartPayload` but are not destructured from `body` in `processStartLaunchPlan.js`:

- fetchConcurrency, perHostMinDelayMs, domainRequestRps, domainRequestBurst, globalRequestRps, globalRequestBurst
- dynamicCrawleeEnabled, crawleeHeadless, crawleeRequestHandlerTimeoutSecs
- dynamicFetchRetryBudget, dynamicFetchRetryBackoffMs
- fetchSchedulerMaxRetries, fetchSchedulerFallbackWaitMs
- pageNetworkIdleTimeoutMs, postLoadWaitMs
- frontierStripTrackingParams, frontierQueryCooldownSeconds, all frontier cooldown settings (except frontierBlockedDomainThreshold and frontierDbPath)
- autoScrollEnabled, autoScrollPasses, autoScrollDelayMs
- graphqlReplayEnabled, maxGraphqlReplays, maxNetworkResponsesPerPage
- robotsTxtCompliant, robotsTxtTimeoutMs
- runtimeTraceEnabled
- indexingResumeSeedLimit, indexingResumePersistLimit
- indexingSchemaPacketsValidationEnabled, indexingSchemaPacketsValidationStrict
- All scannedPdfOcr* settings
- searchProfileCapMapJson, serpRerankerWeightMapJson, fetchSchedulerInternalsMapJson, parsingConfidenceBaseMapJson
- repairDedupeRule
- All discovery/maxUrls/maxCandidate/maxPages/maxRun/maxJson settings
- pdfBackendRouterEnabled, pdfBackendRouterTimeoutMs, pdfBackendRouterMaxPages, pdfBackendRouterMaxPairs, pdfBackendRouterMaxTextPreviewChars
- capturePageScreenshotQuality, capturePageScreenshotMaxBytes
- articleExtractorMinChars, articleExtractorMinScore, articleExtractorMaxChars
- articleExtractorDomainPolicyMapJson
- staticDomTargetMatchThreshold, staticDomMaxEvidenceSnippets
- domSnippetMaxChars
- runtimeControlFile
- categoryAuthorityRoot (handled specially via body.categoryAuthorityRoot, not from destructuring)
- helperSupportiveFillMissing
- fieldRewardHalfLifeDays, batchStrategy
- driftDetectionEnabled, driftPollSeconds, driftScanMaxProducts, driftAutoRepublish
- reCrawlStaleAfterDays
- All LLM cost settings (llmCostInputPer1M, llmCostOutputPer1M, llmCostCachedInputPer1M)
- llmMaxCallsPerRound, llmMaxOutputTokens, llmVerifyMode, llmVerifySampleRate
- llmMaxBatchesPerProduct, llmMaxEvidenceChars, llmMaxTokens, llmTimeoutMs
- llmExtractionCacheTtlMs, llmMaxCallsPerProductTotal
- llmExtractMaxSnippetsPerBatch, llmExtractMaxSnippetChars, llmExtractSkipLowSignal
- llmReasoningMode, llmReasoningBudget, llmMonthlyBudgetUsd, llmPerProductBudgetUsd
- llmPlanProvider, llmPlanBaseUrl, llmPlanApiKey
- indexingCategoryAuthorityEnabled, userAgent, selfImproveEnabled
- maxHypothesisItems, hypothesisAutoFollowupRounds, hypothesisFollowupUrlsPerRound
- searxngBaseUrl
- searchEnginesFallback
- llmReasoningFallbackModel, llmMaxOutputTokensReasoningFallback
- endpointSignalLimit, endpointSuggestionLimit, endpointNetworkScanLimit
- manufacturerAutoPromote
