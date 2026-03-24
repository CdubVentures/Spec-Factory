// WHY: Single source of truth for all runtime settings. Every other layer
// (defaults, clamping ranges, route contracts, TS types, hydration, payload)
// derives from this registry. Adding a new setting = add one entry here.

// WHY: Inlined here to break circular dependency with settingsDefaults.js
// which imports from this registry. This is the canonical list.
export const SEARXNG_AVAILABLE_ENGINES = Object.freeze(['google', 'bing', 'google-proxy', 'duckduckgo', 'brave']);

const DEFAULT_LLM_PROVIDER_REGISTRY_JSON = "[{\"id\":\"default-gemini\",\"name\":\"Gemini\",\"type\":\"openai-compatible\",\"baseUrl\":\"https://generativelanguage.googleapis.com/v1beta/openai\",\"apiKey\":\"\",\"enabled\":true,\"models\":[{\"id\":\"default-gemini-flash\",\"modelId\":\"gemini-2.5-flash\",\"role\":\"primary\",\"costInputPer1M\":0.3,\"costOutputPer1M\":2.5,\"costCachedPer1M\":0.03,\"maxContextTokens\":1048576,\"maxOutputTokens\":65536},{\"id\":\"default-gemini-flash-lite\",\"modelId\":\"gemini-2.5-flash-lite\",\"role\":\"primary\",\"costInputPer1M\":0.1,\"costOutputPer1M\":0.4,\"costCachedPer1M\":0.01,\"maxContextTokens\":1048576,\"maxOutputTokens\":65536},{\"id\":\"default-gemini-pro\",\"modelId\":\"gemini-2.5-pro\",\"role\":\"reasoning\",\"costInputPer1M\":1.25,\"costOutputPer1M\":10,\"costCachedPer1M\":0.125,\"maxContextTokens\":1048576,\"maxOutputTokens\":65536}]},{\"id\":\"default-deepseek\",\"name\":\"DeepSeek\",\"type\":\"openai-compatible\",\"baseUrl\":\"https://api.deepseek.com\",\"apiKey\":\"\",\"enabled\":true,\"models\":[{\"id\":\"default-deepseek-chat\",\"modelId\":\"deepseek-chat\",\"role\":\"primary\",\"costInputPer1M\":0.28,\"costOutputPer1M\":0.42,\"costCachedPer1M\":0.028,\"maxContextTokens\":128000,\"maxOutputTokens\":8192},{\"id\":\"default-deepseek-reasoner\",\"modelId\":\"deepseek-reasoner\",\"role\":\"reasoning\",\"costInputPer1M\":0.28,\"costOutputPer1M\":0.42,\"costCachedPer1M\":0.028,\"maxContextTokens\":128000,\"maxOutputTokens\":64000}]},{\"id\":\"default-anthropic\",\"name\":\"Anthropic\",\"type\":\"anthropic\",\"baseUrl\":\"https://api.anthropic.com\",\"apiKey\":\"\",\"enabled\":false,\"models\":[{\"id\":\"default-anthropic-sonnet\",\"modelId\":\"claude-sonnet-4-20250514\",\"role\":\"reasoning\",\"costInputPer1M\":3,\"costOutputPer1M\":15,\"costCachedPer1M\":0.3,\"maxContextTokens\":200000,\"maxOutputTokens\":64000}]},{\"id\":\"default-openai\",\"name\":\"OpenAI\",\"type\":\"openai-compatible\",\"baseUrl\":\"https://api.openai.com/v1\",\"apiKey\":\"\",\"enabled\":false,\"models\":[{\"id\":\"default-openai-gpt-4-1\",\"modelId\":\"gpt-4.1\",\"role\":\"primary\",\"costInputPer1M\":2,\"costOutputPer1M\":8,\"costCachedPer1M\":0.5,\"maxContextTokens\":1047576,\"maxOutputTokens\":32768},{\"id\":\"default-openai-gpt-4-1-mini\",\"modelId\":\"gpt-4.1-mini\",\"role\":\"primary\",\"costInputPer1M\":0.4,\"costOutputPer1M\":1.6,\"costCachedPer1M\":0.1,\"maxContextTokens\":1047576,\"maxOutputTokens\":32768},{\"id\":\"default-openai-gpt-4-1-nano\",\"modelId\":\"gpt-4.1-nano\",\"role\":\"primary\",\"costInputPer1M\":0.1,\"costOutputPer1M\":0.4,\"costCachedPer1M\":0.025,\"maxContextTokens\":1047576,\"maxOutputTokens\":32768},{\"id\":\"default-openai-gpt-4o\",\"modelId\":\"gpt-4o\",\"role\":\"primary\",\"costInputPer1M\":2.5,\"costOutputPer1M\":10,\"costCachedPer1M\":1.25,\"maxContextTokens\":128000,\"maxOutputTokens\":16384},{\"id\":\"default-openai-gpt-4o-mini\",\"modelId\":\"gpt-4o-mini\",\"role\":\"primary\",\"costInputPer1M\":0.15,\"costOutputPer1M\":0.6,\"costCachedPer1M\":0.075,\"maxContextTokens\":128000,\"maxOutputTokens\":16384},{\"id\":\"default-openai-gpt-5\",\"modelId\":\"gpt-5\",\"role\":\"primary\",\"costInputPer1M\":1.25,\"costOutputPer1M\":10,\"costCachedPer1M\":0.125,\"maxContextTokens\":400000,\"maxOutputTokens\":128000},{\"id\":\"default-openai-gpt-5-mini\",\"modelId\":\"gpt-5-mini\",\"role\":\"primary\",\"costInputPer1M\":0.25,\"costOutputPer1M\":2,\"costCachedPer1M\":0.025,\"maxContextTokens\":400000,\"maxOutputTokens\":128000},{\"id\":\"default-openai-gpt-5-1\",\"modelId\":\"gpt-5.1\",\"role\":\"primary\",\"costInputPer1M\":1.25,\"costOutputPer1M\":10,\"costCachedPer1M\":0.125,\"maxContextTokens\":400000,\"maxOutputTokens\":128000},{\"id\":\"default-openai-gpt-5-2\",\"modelId\":\"gpt-5.2\",\"role\":\"primary\",\"costInputPer1M\":1.75,\"costOutputPer1M\":14,\"costCachedPer1M\":0.175,\"maxContextTokens\":400000,\"maxOutputTokens\":128000},{\"id\":\"default-openai-gpt-5-2-pro\",\"modelId\":\"gpt-5.2-pro\",\"role\":\"reasoning\",\"costInputPer1M\":21,\"costOutputPer1M\":168,\"costCachedPer1M\":2.1,\"maxContextTokens\":400000,\"maxOutputTokens\":128000}]}]";
export const RUNTIME_SETTINGS_REGISTRY = Object.freeze([
  { key: "anthropicApiKey", type: "string", default: "", secret: true, allowEmpty: true, policyGroup: "apiKeys", policyField: "anthropic", configKey: "anthropicApiKey", envKey: "ANTHROPIC_API_KEY", group: "llm", uiCategory: "extraction", uiSection: "provider" },
  { key: "autoScrollDelayMs", type: "int", default: 1200, min: 0, max: 10000, configKey: "autoScrollDelayMs", envKey: "AUTO_SCROLL_DELAY_MS", group: "misc", uiCategory: "fetcher", uiSection: "browser", disabledBy: "autoScrollEnabled" },
  { key: "autoScrollEnabled", type: "bool", default: true, configKey: "autoScrollEnabled", envKey: "AUTO_SCROLL_ENABLED", group: "misc", uiCategory: "fetcher", uiSection: "browser", uiHero: true },
  { key: "autoScrollPasses", type: "int", default: 2, min: 0, max: 20, configKey: "autoScrollPasses", envKey: "AUTO_SCROLL_PASSES", group: "misc", uiCategory: "fetcher", uiSection: "browser", disabledBy: "autoScrollEnabled" },
  { key: "awsRegion", type: "string", default: "us-east-2", readOnly: true, configKey: "awsRegion", envKey: "AWS_REGION", group: "storage", uiCategory: "flow", uiSection: "storage-cloud" },
  { key: "capturePageScreenshotEnabled", type: "bool", default: true, configKey: "capturePageScreenshotEnabled", envKey: "CAPTURE_PAGE_SCREENSHOT_ENABLED", group: "runtime", uiCategory: "fetcher", uiSection: "screenshots", uiHero: true },
  { key: "capturePageScreenshotFormat", type: "string", default: "jpeg", configKey: "capturePageScreenshotFormat", envKey: "CAPTURE_PAGE_SCREENSHOT_FORMAT", group: "runtime", uiCategory: "fetcher", uiSection: "screenshots", disabledBy: "capturePageScreenshotEnabled" },
  { key: "capturePageScreenshotMaxBytes", type: "int", default: 5000000, min: 1024, max: 100000000, configKey: "capturePageScreenshotMaxBytes", envKey: "CAPTURE_PAGE_SCREENSHOT_MAX_BYTES", group: "runtime", uiCategory: "fetcher", uiSection: "screenshots", disabledBy: "capturePageScreenshotEnabled" },
  { key: "capturePageScreenshotQuality", type: "int", default: 50, min: 1, max: 100, configKey: "capturePageScreenshotQuality", envKey: "CAPTURE_PAGE_SCREENSHOT_QUALITY", group: "runtime", uiCategory: "fetcher", uiSection: "screenshots", disabledBy: "capturePageScreenshotEnabled" },
  { key: "capturePageScreenshotSelectors", type: "string", default: "table,[data-spec-table],.specs-table,.spec-table,.specifications", configKey: "capturePageScreenshotSelectors", envKey: "CAPTURE_PAGE_SCREENSHOT_SELECTORS", group: "runtime", uiCategory: "fetcher", uiSection: "screenshots", disabledBy: "capturePageScreenshotEnabled" },
  { key: "categoryAuthorityEnabled", type: "bool", default: true, aliases: ["helperFilesEnabled"], configKey: "categoryAuthorityEnabled", envKey: "HELPER_FILES_ENABLED", group: "misc", uiCategory: "flow", uiSection: "output" },
  { key: "categoryAuthorityRoot", type: "string", default: "category_authority", allowEmpty: true, aliases: ["helperFilesRoot"], configKey: "categoryAuthorityRoot", envKey: "CATEGORY_AUTHORITY_ROOT", group: "paths", uiCategory: "flow", uiSection: "output" },
  { key: "crawleeHeadless", type: "bool", default: true, configKey: "crawleeHeadless", envKey: "CRAWLEE_HEADLESS", group: "runtime", uiCategory: "fetcher", uiSection: "browser" },
  { key: "crawleeRequestHandlerTimeoutSecs", type: "int", default: 75, min: 0, max: 300, configKey: "crawleeRequestHandlerTimeoutSecs", envKey: "CRAWLEE_REQUEST_HANDLER_TIMEOUT_SECS", group: "runtime", uiCategory: "fetcher", uiSection: "browser" },
  { key: "deepseekApiKey", type: "string", default: "", secret: true, allowEmpty: true, policyGroup: "apiKeys", policyField: "deepseek", configKey: "deepseekApiKey", envKey: "DEEPSEEK_API_KEY", group: "llm", uiCategory: "extraction", uiSection: "provider" },
  { key: "searchProfileQueryCap", type: "int", default: 10, min: 1, max: 100, configKey: "searchProfileQueryCap", envKey: "SEARCH_PROFILE_QUERY_CAP", group: "misc", uiCategory: "planner", uiSection: "budgets" },
  { key: "domainClassifierUrlCap", type: "int", default: 50, min: 1, max: 500, configKey: "domainClassifierUrlCap", envKey: "DOMAIN_CLASSIFIER_URL_CAP", group: "misc", uiCategory: "planner", uiSection: "budgets" },
  { key: "dryRun", type: "bool", default: false, configKey: "dryRun", envKey: "DRY_RUN", group: "misc", uiCategory: "flow", uiSection: "output" },
  { key: "eventsJsonWrite", type: "bool", default: true, configKey: "eventsJsonWrite", envKey: "EVENTS_JSON_WRITE", group: "observability", uiCategory: "flow", uiSection: "observability" },
  { key: "geminiApiKey", type: "string", default: "", secret: true, allowEmpty: true, policyGroup: "apiKeys", policyField: "gemini", configKey: "geminiApiKey", envKey: "GEMINI_API_KEY", group: "misc", uiCategory: "extraction", uiSection: "provider" },
  { key: "googleSearchMaxRetries", type: "int", default: 1, min: 0, max: 3, configKey: "googleSearchMaxRetries", envKey: "GOOGLE_SEARCH_MAX_RETRIES", group: "misc", uiCategory: "planner", uiSection: "discovery" },
  { key: "googleSearchMinQueryIntervalMs", type: "int", default: 1000, min: 0, max: 60000, configKey: "googleSearchMinQueryIntervalMs", envKey: "GOOGLE_SEARCH_MIN_QUERY_INTERVAL_MS", group: "misc", uiCategory: "planner", uiSection: "discovery" },
  { key: "googleSearchProxyUrlsJson", type: "string", default: "[\"http://zruyrjpq-rotate:dfm4udpzx5p0@p.webshare.io:80\"]", allowEmpty: true, configKey: "googleSearchProxyUrlsJson", envKey: "", uiCategory: "planner", uiSection: "discovery" },
  { key: "googleSearchScreenshotsEnabled", type: "bool", default: true, configKey: "googleSearchScreenshotsEnabled", envKey: "GOOGLE_SEARCH_SCREENSHOTS_ENABLED", group: "misc", uiCategory: "planner", uiSection: "discovery" },
  { key: "googleSearchTimeoutMs", type: "int", default: 30000, min: 30000, max: 120000, configKey: "googleSearchTimeoutMs", envKey: "GOOGLE_SEARCH_TIMEOUT_MS", group: "misc", uiCategory: "planner", uiSection: "discovery" },
  { key: "serperApiKey", type: "string", default: "", allowEmpty: true, configKey: "serperApiKey", envKey: "SERPER_API_KEY", group: "misc", uiCategory: "planner", uiSection: "discovery", disabledBy: "serperEnabled" },
  { key: "serperEnabled", type: "bool", default: true, configKey: "serperEnabled", envKey: "SERPER_ENABLED", group: "misc", uiCategory: "planner", uiSection: "discovery", uiHero: true },
  // WHY: helperFilesRoot removed — canonical key is categoryAuthorityRoot (line 31). HELPER_FILES_ROOT env var still read by configBuilder.
  { key: "indexingResumePersistLimit", type: "int", default: 160, min: 1, max: 100000, configKey: "indexingResumePersistLimit", envKey: "INDEXING_RESUME_PERSIST_LIMIT", group: "runtime", uiCategory: "flow", uiSection: "run-setup" },
  { key: "indexingResumeSeedLimit", type: "int", default: 24, min: 1, max: 10000, configKey: "indexingResumeSeedLimit", envKey: "INDEXING_RESUME_SEED_LIMIT", group: "runtime", uiCategory: "flow", uiSection: "run-setup" },
  { key: "llmEnhancerMaxRetries", type: "int", default: 2, min: 1, max: 5, configKey: "llmEnhancerMaxRetries", envKey: "LLM_ENHANCER_MAX_RETRIES", group: "misc", uiCategory: "planner", uiSection: "discovery" },
  { key: "llmBaseUrl", type: "string", default: "https://generativelanguage.googleapis.com/v1beta/openai", allowEmpty: true, policyGroup: "provider", policyField: "baseUrl", configKey: "llmBaseUrl", envKey: "LLM_BASE_URL", group: "llm", uiCategory: "extraction", uiSection: "provider" },
  { key: "llmCostCachedInputPer1M", type: "float", default: 0.125, min: 0, max: 1000, policyGroup: "budget", policyField: "costCachedInputPer1M", configKey: "llmCostCachedInputPer1M", envKey: "LLM_COST_CACHED_INPUT_PER_1M", group: "llm", uiCategory: "extraction", uiSection: "limits" },
  { key: "llmCostInputPer1M", type: "float", default: 1.25, min: 0, max: 1000, policyGroup: "budget", policyField: "costInputPer1M", configKey: "llmCostInputPer1M", envKey: "LLM_COST_INPUT_PER_1M", group: "llm", uiCategory: "extraction", uiSection: "limits" },
  { key: "llmCostOutputPer1M", type: "float", default: 10, min: 0, max: 1000, policyGroup: "budget", policyField: "costOutputPer1M", configKey: "llmCostOutputPer1M", envKey: "LLM_COST_OUTPUT_PER_1M", group: "llm", uiCategory: "extraction", uiSection: "limits" },
  { key: "llmMaxCallsPerProductTotal", type: "int", default: 14, min: 1, max: 100, configKey: "llmMaxCallsPerProductTotal", envKey: "LLM_MAX_CALLS_PER_PRODUCT_TOTAL", group: "llm", uiCategory: "extraction", uiSection: "limits" },
  { key: "llmMaxCallsPerRound", type: "int", default: 5, min: 1, max: 200, configKey: "llmMaxCallsPerRound", envKey: "LLM_MAX_CALLS_PER_ROUND", group: "llm", uiCategory: "extraction", uiSection: "limits" },
  { key: "llmMaxOutputTokens", type: "int", default: 1400, min: 128, max: 262144, policyGroup: "tokens", policyField: "maxOutput", configKey: "llmMaxOutputTokens", envKey: "LLM_MAX_OUTPUT_TOKENS", group: "llm", uiCategory: "extraction", uiSection: "models" },
  { key: "llmMaxOutputTokensPlan", type: "int", default: 4096, min: 128, max: 262144, tokenClamped: true, clampModelKey: "llmModelPlan", aliases: ["llmTokensPlan"], policyGroup: "tokens", policyField: "plan", configKey: "llmMaxOutputTokensPlan", envKey: "LLM_MAX_OUTPUT_TOKENS_PLAN", group: "llm", uiCategory: "extraction", uiSection: "models" },
  { key: "llmMaxOutputTokensPlanFallback", type: "int", default: 2048, min: 128, max: 262144, tokenClamped: true, clampModelKey: "llmPlanFallbackModel", clampModelFallbackKey: "llmModelPlan", aliases: ["llmTokensPlanFallback"], policyGroup: "tokens", policyField: "planFallback", configKey: "llmMaxOutputTokensPlanFallback", envKey: "LLM_MAX_OUTPUT_TOKENS_PLAN_FALLBACK", group: "llm", uiCategory: "extraction", uiSection: "models" },
  { key: "llmMaxOutputTokensTriage", type: "int", default: 20000, min: 20000, max: 262144, tokenClamped: true, clampModelKey: "llmModelPlan", aliases: ["llmTokensTriage"], configKey: "llmMaxOutputTokensTriage", envKey: "LLM_MAX_OUTPUT_TOKENS_TRIAGE", group: "llm", uiCategory: "extraction", uiSection: "models" },
  { key: "llmMaxOutputTokensReasoning", type: "int", default: 4096, min: 128, max: 262144, tokenClamped: true, clampModelKey: "llmModelReasoning", aliases: ["llmTokensReasoning"], policyGroup: "tokens", policyField: "reasoning", configKey: "llmMaxOutputTokensReasoning", envKey: "LLM_MAX_OUTPUT_TOKENS_REASONING", group: "llm", uiCategory: "extraction", uiSection: "models" },
  { key: "llmMaxOutputTokensReasoningFallback", type: "int", default: 2048, min: 128, max: 262144, tokenClamped: true, clampModelKey: "llmReasoningFallbackModel", clampModelFallbackKey: "llmModelReasoning", aliases: ["llmTokensReasoningFallback"], policyGroup: "tokens", policyField: "reasoningFallback", configKey: "llmMaxOutputTokensReasoningFallback", envKey: "LLM_MAX_OUTPUT_TOKENS_REASONING_FALLBACK", group: "misc", uiCategory: "extraction", uiSection: "models" },
  { key: "llmMaxTokens", type: "int", default: 16384, min: 128, max: 262144, policyGroup: "tokens", policyField: "maxTokens", configKey: "llmMaxTokens", envKey: "LLM_MAX_TOKENS", group: "llm", uiCategory: "extraction", uiSection: "models" },
  { key: "llmModelPlan", type: "string", default: "gemini-2.5-flash", aliases: ["phase2LlmModel"], policyGroup: "models", policyField: "plan", configKey: "llmModelPlan", envKey: "LLM_MODEL_PLAN", group: "llm", uiCategory: "extraction", uiSection: "models" },
  { key: "llmModelReasoning", type: "string", default: "deepseek-reasoner", policyGroup: "models", policyField: "reasoning", configKey: "llmModelReasoning", envKey: "LLM_MODEL_REASONING", group: "llm", uiCategory: "extraction", uiSection: "models" },
  { key: "llmMonthlyBudgetUsd", type: "float", default: 300, min: 0, max: 100000, policyGroup: "budget", policyField: "monthlyUsd", configKey: "llmMonthlyBudgetUsd", envKey: "LLM_MONTHLY_BUDGET_USD", group: "llm", uiCategory: "extraction", uiSection: "limits" },
  { key: "llmPerProductBudgetUsd", type: "float", default: 0.35, min: 0, max: 1000, policyGroup: "budget", policyField: "perProductUsd", configKey: "llmPerProductBudgetUsd", envKey: "LLM_PER_PRODUCT_BUDGET_USD", group: "llm", uiCategory: "extraction", uiSection: "limits" },
  { key: "llmPhaseOverridesJson", type: "string", default: "{}", allowEmpty: true, policyGroup: "_json", policyField: "phaseOverrides", configKey: "llmPhaseOverridesJson", envKey: "", uiCategory: "extraction", uiSection: "limits" },
  { key: "llmPlanApiKey", type: "string", default: "", secret: true, allowEmpty: true, policyGroup: "apiKeys", policyField: "plan", configKey: "llmPlanApiKey", envKey: "LLM_PLAN_API_KEY", group: "llm", uiCategory: "extraction", uiSection: "provider" },
  { key: "llmPlanBaseUrl", type: "string", default: "https://generativelanguage.googleapis.com/v1beta/openai", allowEmpty: true, policyGroup: "provider", policyField: "planBaseUrl", configKey: "llmPlanBaseUrl", envKey: "LLM_PLAN_BASE_URL", group: "llm", uiCategory: "extraction", uiSection: "provider" },
  { key: "llmPlanFallbackModel", type: "string", default: "deepseek-chat", policyGroup: "models", policyField: "planFallback", configKey: "llmPlanFallbackModel", envKey: "LLM_PLAN_FALLBACK_MODEL", group: "llm", uiCategory: "extraction", uiSection: "models" },
  { key: "llmPlanProvider", type: "string", default: "gemini", policyGroup: "provider", policyField: "planProvider", configKey: "llmPlanProvider", envKey: "LLM_PLAN_PROVIDER", group: "llm", uiCategory: "extraction", uiSection: "provider" },
  { key: "llmPlanUseReasoning", type: "bool", default: false, policyGroup: "reasoning", policyField: "enabled", configKey: "llmPlanUseReasoning", envKey: "LLM_PLAN_USE_REASONING", group: "llm", uiCategory: "extraction", uiSection: "models" },
  { key: "llmProvider", type: "string", default: "gemini", policyGroup: "provider", policyField: "id", configKey: "llmProvider", envKey: "LLM_PROVIDER", group: "llm", uiCategory: "extraction", uiSection: "provider", uiHero: true },
  { key: "llmProviderRegistryJson", type: "string", default: DEFAULT_LLM_PROVIDER_REGISTRY_JSON, allowEmpty: true, policyGroup: "_json", policyField: "providerRegistry", configKey: "llmProviderRegistryJson", envKey: "", uiCategory: "extraction", uiSection: "limits" },
  { key: "llmReasoningBudget", type: "int", default: 32768, min: 128, max: 262144, policyGroup: "reasoning", policyField: "budget", configKey: "llmReasoningBudget", envKey: "LLM_REASONING_BUDGET", group: "llm", uiCategory: "extraction", uiSection: "models" },
  { key: "llmReasoningFallbackModel", type: "string", default: "gemini-2.5-pro", policyGroup: "models", policyField: "reasoningFallback", configKey: "llmReasoningFallbackModel", envKey: "LLM_REASONING_FALLBACK_MODEL", group: "misc", uiCategory: "extraction", uiSection: "models" },
  { key: "llmReasoningMode", type: "bool", default: true, policyGroup: "reasoning", policyField: "mode", configKey: "llmReasoningMode", envKey: "LLM_REASONING_MODE", group: "llm", uiCategory: "extraction", uiSection: "models" },
  { key: "llmTimeoutMs", type: "int", default: 30000, min: 1000, max: 600000, policyGroup: "_topLevel", policyField: "timeoutMs", configKey: "llmTimeoutMs", envKey: "LLM_TIMEOUT_MS", group: "llm", uiCategory: "extraction", uiSection: "limits" },
  { key: "localInputRoot", type: "string", default: "fixtures/s3", allowEmpty: true, configKey: "localInputRoot", envKey: "LOCAL_INPUT_ROOT", group: "paths", uiCategory: "flow", uiSection: "output" },
  { key: "localMode", type: "bool", default: true, configKey: "localMode", envKey: "LOCAL_MODE", group: "misc", uiCategory: "flow", uiSection: "output" },
  // WHY: LOCAL_OUTPUT_ROOT is owned by pathsGroup.js (calls defaultLocalOutputRoot() dynamically).
  // No envKey here — prevents miscGroup from creating a duplicate manifest entry with a stale default.
  { key: "localOutputRoot", type: "string", default: "", allowEmpty: true, configKey: "localOutputRoot", envKey: "", uiCategory: "flow", uiSection: "output" },
  { key: "maxPagesPerDomain", type: "int", default: 5, min: 1, max: 100, configKey: "maxPagesPerDomain", envKey: "MAX_PAGES_PER_DOMAIN", group: "misc", uiCategory: "planner", uiSection: "budgets" },
  { key: "maxRunSeconds", type: "int", default: 480, min: 30, max: 86400, configKey: "maxRunSeconds", envKey: "MAX_RUN_SECONDS", group: "misc", uiCategory: "flow", uiSection: "run-setup", uiHero: true },
  { key: "mirrorToS3", type: "bool", default: false, configKey: "mirrorToS3", envKey: "MIRROR_TO_S3", group: "misc", uiCategory: "flow", uiSection: "storage-cloud" },
  { key: "mirrorToS3Input", type: "bool", default: false, configKey: "mirrorToS3Input", envKey: "MIRROR_TO_S3_INPUT", group: "misc", uiCategory: "flow", uiSection: "storage-cloud" },
  { key: "openaiApiKey", type: "string", default: "", secret: true, allowEmpty: true, policyGroup: "apiKeys", policyField: "openai", configKey: "openaiApiKey", envKey: "OPENAI_API_KEY", group: "llm", uiCategory: "extraction", uiSection: "provider" },
  { key: "outputMode", type: "enum", default: "local", allowed: ["local","dual","s3"], configKey: "outputMode", envKey: "OUTPUT_MODE", group: "misc", uiCategory: "flow", uiSection: "output" },
  { key: "pipelineSchemaEnforcementMode", type: "enum", default: "warn", allowed: ["off", "warn", "enforce"], configKey: "pipelineSchemaEnforcementMode", envKey: "PIPELINE_SCHEMA_ENFORCEMENT_MODE", group: "misc", uiCategory: "validation", uiSection: "schema", uiHero: true },
  { key: "repairDedupeRule", type: "enum", default: "domain_once", allowed: ["domain_once","domain_and_status","none"], configKey: "repairDedupeRule", envKey: "REPAIR_DEDUPE_RULE", group: "misc", uiCategory: "fetcher", uiSection: "network" },
  { key: "resumeMode", type: "enum", default: "auto", allowed: ["auto","force_resume","start_over"], configKey: "indexingResumeMode", envKey: "INDEXING_RESUME_MODE", group: "runtime", uiCategory: "flow", uiSection: "run-setup" },
  { key: "resumeWindowHours", type: "int", default: 48, min: 1, max: 8760, configKey: "indexingResumeMaxAgeHours", envKey: "INDEXING_RESUME_MAX_AGE_HOURS", group: "runtime", uiCategory: "flow", uiSection: "run-setup" },
  { key: "robotsTxtCompliant", type: "bool", default: true, configKey: "robotsTxtCompliant", envKey: "ROBOTS_TXT_COMPLIANT", group: "misc", uiCategory: "fetcher", uiSection: "browser" },
  { key: "robotsTxtTimeoutMs", type: "int", default: 6000, min: 100, max: 120000, configKey: "robotsTxtTimeoutMs", envKey: "ROBOTS_TXT_TIMEOUT_MS", group: "misc", uiCategory: "fetcher", uiSection: "browser", disabledBy: "robotsTxtCompliant" },
  { key: "runtimeControlFile", type: "string", default: "_runtime/control/runtime_overrides.json", configKey: "runtimeControlFile", envKey: "RUNTIME_CONTROL_FILE", group: "runtime", uiCategory: "flow", uiSection: "output" },
  { key: "runtimeEventsKey", type: "string", default: "_runtime/events.jsonl", configKey: "runtimeEventsKey", envKey: "RUNTIME_EVENTS_KEY", group: "runtime", uiCategory: "flow", uiSection: "output" },
  { key: "runtimeScreencastEnabled", type: "bool", default: true, configKey: "runtimeScreencastEnabled", envKey: "RUNTIME_SCREENCAST_ENABLED", group: "runtime", uiCategory: "flow", uiSection: "observability", uiHero: true },
  { key: "runtimeScreencastFps", type: "int", default: 10, min: 1, max: 60, configKey: "runtimeScreencastFps", envKey: "RUNTIME_SCREENCAST_FPS", group: "runtime", uiCategory: "flow", uiSection: "observability", disabledBy: "runtimeScreencastEnabled" },
  { key: "runtimeScreencastMaxHeight", type: "int", default: 720, min: 240, max: 2160, configKey: "runtimeScreencastMaxHeight", envKey: "RUNTIME_SCREENCAST_MAX_HEIGHT", group: "runtime", uiCategory: "flow", uiSection: "observability", disabledBy: "runtimeScreencastEnabled" },
  { key: "runtimeScreencastMaxWidth", type: "int", default: 1280, min: 320, max: 3840, configKey: "runtimeScreencastMaxWidth", envKey: "RUNTIME_SCREENCAST_MAX_WIDTH", group: "runtime", uiCategory: "flow", uiSection: "observability", disabledBy: "runtimeScreencastEnabled" },
  { key: "runtimeScreencastQuality", type: "int", default: 50, min: 10, max: 100, configKey: "runtimeScreencastQuality", envKey: "RUNTIME_SCREENCAST_QUALITY", group: "runtime", uiCategory: "flow", uiSection: "observability", disabledBy: "runtimeScreencastEnabled" },
  { key: "runtimeTraceEnabled", type: "bool", default: true, configKey: "runtimeTraceEnabled", envKey: "RUNTIME_TRACE_ENABLED", group: "runtime", uiCategory: "flow", uiSection: "observability", uiHero: true },
  { key: "runtimeTraceFetchRing", type: "int", default: 30, min: 10, max: 2000, configKey: "runtimeTraceFetchRing", envKey: "RUNTIME_TRACE_FETCH_RING", group: "runtime", uiCategory: "flow", uiSection: "observability", disabledBy: "runtimeTraceEnabled" },
  { key: "runtimeTraceLlmPayloads", type: "bool", default: true, configKey: "runtimeTraceLlmPayloads", envKey: "RUNTIME_TRACE_LLM_PAYLOADS", group: "runtime", uiCategory: "flow", uiSection: "observability", disabledBy: "runtimeTraceEnabled" },
  { key: "runtimeTraceLlmRing", type: "int", default: 50, min: 10, max: 2000, configKey: "runtimeTraceLlmRing", envKey: "RUNTIME_TRACE_LLM_RING", group: "runtime", uiCategory: "flow", uiSection: "observability", disabledBy: "runtimeTraceEnabled" },
  { key: "s3Bucket", type: "string", default: "my-spec-harvester-data", readOnly: true, configKey: "s3Bucket", envKey: "S3_BUCKET", group: "storage", uiCategory: "flow", uiSection: "storage-cloud" },
  { key: "s3InputPrefix", type: "string", default: "specs/inputs", allowEmpty: true, configKey: "s3InputPrefix", envKey: "S3_INPUT_PREFIX", group: "storage", uiCategory: "flow", uiSection: "storage-cloud" },
  { key: "s3OutputPrefix", type: "string", default: "specs/outputs", allowEmpty: true, configKey: "s3OutputPrefix", envKey: "S3_OUTPUT_PREFIX", group: "storage", uiCategory: "flow", uiSection: "storage-cloud" },
  { key: "searchEngines", type: "csv_enum", default: "google", allowed: SEARXNG_AVAILABLE_ENGINES, aliases: ["searchProvider"], configKey: "searchEngines", envKey: "SEARCH_ENGINES", group: "misc", uiCategory: "planner", uiSection: "discovery" },
  { key: "searchEnginesFallback", type: "csv_enum", default: "bing", allowed: SEARXNG_AVAILABLE_ENGINES, configKey: "searchEnginesFallback", envKey: "SEARCH_ENGINES_FALLBACK", group: "misc", uiCategory: "planner", uiSection: "discovery" },
  { key: "searchMaxRetries", type: "int", default: 3, min: 0, max: 5, configKey: "searchMaxRetries", envKey: "SEARCH_MAX_RETRIES", group: "misc", uiCategory: "planner", uiSection: "discovery" },
  { key: "serpSelectorUrlCap", type: "int", default: 50, min: 1, max: 500, configKey: "serpSelectorUrlCap", envKey: "SERP_SELECTOR_URL_CAP", group: "misc", uiCategory: "planner", uiSection: "budgets" },
  { key: "searxngBaseUrl", type: "string", default: "http://127.0.0.1:8080", allowEmpty: true, configKey: "searxngBaseUrl", envKey: "SEARXNG_BASE_URL", group: "discovery", uiCategory: "planner", uiSection: "discovery" },
  { key: "searxngMinQueryIntervalMs", type: "int", default: 3000, min: 0, max: 30000, configKey: "searxngMinQueryIntervalMs", envKey: "SEARXNG_MIN_QUERY_INTERVAL_MS", group: "misc", uiCategory: "planner", uiSection: "discovery" },
  { key: "specDbDir", type: "string", default: ".specfactory_tmp", allowEmpty: true, configKey: "specDbDir", envKey: "SPEC_DB_DIR", group: "paths", uiCategory: "flow", uiSection: "storage-cloud" },
  { key: "writeMarkdownSummary", type: "bool", default: true, configKey: "writeMarkdownSummary", envKey: "WRITE_MARKDOWN_SUMMARY", group: "misc", uiCategory: "flow", uiSection: "output" },

  // --- Non-route keys: exist in SETTINGS_DEFAULTS.runtime but not in route maps ---
  // WHY: These are config-only keys used internally, not exposed via the settings API.
  { key: "discoveryEnabled", type: "bool", default: true, defaultsOnly: true, configKey: "discoveryEnabled", envKey: "DISCOVERY_ENABLED", group: "misc", uiCategory: "planner", uiSection: "discovery", uiHero: true },
  // WHY: runtimeAutoSaveEnabled removed from RUNTIME — canonical home is UI_SETTINGS_REGISTRY.
]);

// WHY: Bootstrap env vars that exist in the config manifest but NOT in the
// runtime settings registry. These are read once at startup by configBuilder
// (from process.env / .env) and baked into the resolved config object.
// They have no settings-API route, no live-update path, and no UI knob.
// This registry lets downstream layers (audit, docs, GUI env editor) discover
// them without scraping manifest group files.
export const BOOTSTRAP_ENV_REGISTRY = Object.freeze([
  // --- core ---
  { key: "apiBaseUrl", envKey: "API_BASE_URL", type: "string", default: "http://localhost:8788", group: "core" },
  { key: "corsOrigin", envKey: "CORS_ORIGIN", type: "string", default: "http://localhost:8788", group: "core" },
  { key: "nodeEnv", envKey: "NODE_ENV", type: "string", default: "development", group: "core" },
  { key: "port", envKey: "PORT", type: "int", default: 8788, group: "core" },
  { key: "settingsCanonicalOnlyWrites", envKey: "SETTINGS_CANONICAL_ONLY_WRITES", type: "bool", default: true, group: "core" },

  // --- caching ---
  { key: "redisPassword", envKey: "REDIS_PASSWORD", type: "string", default: "", group: "caching", secret: true },
  { key: "redisTtl", envKey: "REDIS_TTL", type: "int", default: 0, group: "caching" },
  { key: "redisUrl", envKey: "REDIS_URL", type: "string", default: "", group: "caching" },

  // --- storage ---
  { key: "awsAccessKeyId", envKey: "AWS_ACCESS_KEY_ID", type: "string", default: "", group: "storage", secret: true },
  { key: "awsSecretAccessKey", envKey: "AWS_SECRET_ACCESS_KEY", type: "string", default: "", group: "storage", secret: true },
  { key: "awsSessionToken", envKey: "AWS_SESSION_TOKEN", type: "string", default: "", group: "storage", secret: true },
  { key: "runDataStorageDestinationType", envKey: "RUN_DATA_STORAGE_DESTINATION_TYPE", type: "string", default: "local", group: "storage" },
  { key: "runDataStorageEnabled", envKey: "RUN_DATA_STORAGE_ENABLED", type: "bool", default: false, group: "storage" },
  { key: "runDataStorageLocalDirectory", envKey: "RUN_DATA_STORAGE_LOCAL_DIRECTORY", type: "string", default: "", group: "storage" },
  { key: "runDataStorageS3AccessKeyId", envKey: "RUN_DATA_STORAGE_S3_ACCESS_KEY_ID", type: "string", default: "", group: "storage", secret: true },
  { key: "runDataStorageS3Bucket", envKey: "RUN_DATA_STORAGE_S3_BUCKET", type: "string", default: "", group: "storage" },
  { key: "runDataStorageS3Prefix", envKey: "RUN_DATA_STORAGE_S3_PREFIX", type: "string", default: "", group: "storage" },
  { key: "runDataStorageS3Region", envKey: "RUN_DATA_STORAGE_S3_REGION", type: "string", default: "", group: "storage" },
  { key: "runDataStorageS3SecretAccessKey", envKey: "RUN_DATA_STORAGE_S3_SECRET_ACCESS_KEY", type: "string", default: "", group: "storage", secret: true },
  { key: "runDataStorageS3SessionToken", envKey: "RUN_DATA_STORAGE_S3_SESSION_TOKEN", type: "string", default: "", group: "storage", secret: true },
  { key: "s3DataBucket", envKey: "S3_DATA_BUCKET", type: "string", default: "", group: "storage" },

  // --- security ---
  { key: "jwtExpiresIn", envKey: "JWT_EXPIRES_IN", type: "string", default: "24h", group: "security" },
  { key: "jwtSecret", envKey: "JWT_SECRET", type: "string", default: "", group: "security", secret: true },

  // --- llm ---
  { key: "chatmockComposeFile", envKey: "CHATMOCK_COMPOSE_FILE", type: "string", default: "", group: "llm" },
  { key: "chatmockDir", envKey: "CHATMOCK_DIR", type: "string", default: "", group: "llm" },
  { key: "deepseekChatMaxOutputDefault", envKey: "DEEPSEEK_CHAT_MAX_OUTPUT_DEFAULT", type: "int", default: 2048, group: "llm" },
  { key: "deepseekChatMaxOutputMaximum", envKey: "DEEPSEEK_CHAT_MAX_OUTPUT_MAXIMUM", type: "int", default: 4096, group: "llm" },
  { key: "deepseekContextLength", envKey: "DEEPSEEK_CONTEXT_LENGTH", type: "string", default: "", group: "llm" },
  { key: "deepseekFeatures", envKey: "DEEPSEEK_FEATURES", type: "string", default: "", group: "llm" },
  { key: "deepseekModelVersion", envKey: "DEEPSEEK_MODEL_VERSION", type: "string", default: "", group: "llm" },
  { key: "deepseekReasonerMaxOutputDefault", envKey: "DEEPSEEK_REASONER_MAX_OUTPUT_DEFAULT", type: "int", default: 4096, group: "llm" },
  { key: "deepseekReasonerMaxOutputMaximum", envKey: "DEEPSEEK_REASONER_MAX_OUTPUT_MAXIMUM", type: "int", default: 8192, group: "llm" },
  { key: "llmApiKey", envKey: "LLM_API_KEY", type: "string", default: "", group: "llm", secret: true },
  { key: "llmCostCachedInputPer1MDeepseekChat", envKey: "LLM_COST_CACHED_INPUT_PER_1M_DEEPSEEK_CHAT", type: "string", default: "", group: "llm" },
  { key: "llmCostCachedInputPer1MDeepseekReasoner", envKey: "LLM_COST_CACHED_INPUT_PER_1M_DEEPSEEK_REASONER", type: "string", default: "", group: "llm" },
  { key: "llmCostInputPer1MDeepseekChat", envKey: "LLM_COST_INPUT_PER_1M_DEEPSEEK_CHAT", type: "string", default: "", group: "llm" },
  { key: "llmCostInputPer1MDeepseekReasoner", envKey: "LLM_COST_INPUT_PER_1M_DEEPSEEK_REASONER", type: "string", default: "", group: "llm" },
  { key: "llmCostOutputPer1MDeepseekChat", envKey: "LLM_COST_OUTPUT_PER_1M_DEEPSEEK_CHAT", type: "string", default: "", group: "llm" },
  { key: "llmCostOutputPer1MDeepseekReasoner", envKey: "LLM_COST_OUTPUT_PER_1M_DEEPSEEK_REASONER", type: "string", default: "", group: "llm" },
  { key: "llmDisableBudgetGuards", envKey: "LLM_DISABLE_BUDGET_GUARDS", type: "bool", default: false, group: "llm" },
  { key: "llmExtractionCacheEnabled", envKey: "LLM_EXTRACTION_CACHE_ENABLED", type: "bool", default: true, group: "llm" },
  { key: "llmFallbackEnabled", envKey: "LLM_FALLBACK_ENABLED", type: "bool", default: false, group: "llm" },
  { key: "llmMaxOutputTokensExtract", envKey: "LLM_MAX_OUTPUT_TOKENS_EXTRACT", type: "int", default: 2048, group: "llm" },
  { key: "llmMaxOutputTokensExtractFallback", envKey: "LLM_MAX_OUTPUT_TOKENS_EXTRACT_FALLBACK", type: "int", default: 4096, group: "llm" },
  { key: "llmMaxOutputTokensValidate", envKey: "LLM_MAX_OUTPUT_TOKENS_VALIDATE", type: "int", default: 2048, group: "llm" },
  { key: "llmMaxOutputTokensValidateFallback", envKey: "LLM_MAX_OUTPUT_TOKENS_VALIDATE_FALLBACK", type: "int", default: 4096, group: "llm" },
  { key: "llmMaxOutputTokensWrite", envKey: "LLM_MAX_OUTPUT_TOKENS_WRITE", type: "int", default: 2048, group: "llm" },
  { key: "llmMaxOutputTokensWriteFallback", envKey: "LLM_MAX_OUTPUT_TOKENS_WRITE_FALLBACK", type: "int", default: 2048, group: "llm" },
  { key: "llmModelCatalog", envKey: "LLM_MODEL_CATALOG", type: "string", default: "", group: "llm" },
  { key: "llmModelOutputTokenMapJson", envKey: "LLM_MODEL_OUTPUT_TOKEN_MAP_JSON", type: "string", default: "", group: "llm" },
  { key: "llmModelPricingJson", envKey: "LLM_MODEL_PRICING_JSON", type: "string", default: "", group: "llm" },
  { key: "llmOutputTokenPresets", envKey: "LLM_OUTPUT_TOKEN_PRESETS", type: "string", default: "", group: "llm" },
  { key: "llmPhaseOverridesJson", envKey: "LLM_PHASE_OVERRIDES_JSON", type: "string", default: "{}", group: "llm" },
  { key: "llmPlanFallbackBaseUrl", envKey: "LLM_PLAN_FALLBACK_BASE_URL", type: "string", default: "", group: "llm" },
  { key: "llmPlanFallbackProvider", envKey: "LLM_PLAN_FALLBACK_PROVIDER", type: "string", default: "", group: "llm" },
  { key: "llmPricingAsOf", envKey: "LLM_PRICING_AS_OF", type: "string", default: "", group: "llm" },
  { key: "llmPricingSourcesJson", envKey: "LLM_PRICING_SOURCES_JSON", type: "string", default: "", group: "llm" },
  { key: "llmProviderRegistryJson", envKey: "LLM_PROVIDER_REGISTRY_JSON", type: "string", default: "", group: "llm" },
  { key: "llmTriageUseReasoning", envKey: "LLM_TRIAGE_USE_REASONING", type: "bool", default: false, group: "llm" },
  { key: "openaiBaseUrl", envKey: "OPENAI_BASE_URL", type: "string", default: "", group: "llm" },
  { key: "openaiModelExtract", envKey: "OPENAI_MODEL_EXTRACT", type: "string", default: "", group: "llm" },
  { key: "openaiModelPlan", envKey: "OPENAI_MODEL_PLAN", type: "string", default: "", group: "llm" },
  { key: "openaiModelWrite", envKey: "OPENAI_MODEL_WRITE", type: "string", default: "", group: "llm" },
  { key: "openaiTimeoutMs", envKey: "OPENAI_TIMEOUT_MS", type: "int", default: 40000, group: "llm" },

  // --- discovery ---
  { key: "searchProvider", envKey: "SEARCH_PROVIDER", type: "string", default: "", group: "discovery" },
  { key: "searxngDefaultBaseUrl", envKey: "SEARXNG_DEFAULT_BASE_URL", type: "string", default: "", group: "discovery" },
  { key: "searxngUrl", envKey: "SEARXNG_URL", type: "string", default: "", group: "discovery" },

  // --- runtime ---
  { key: "indexingReextractAfterHours", envKey: "INDEXING_REEXTRACT_AFTER_HOURS", type: "int", default: 24, group: "runtime" },
  { key: "indexingReextractEnabled", envKey: "INDEXING_REEXTRACT_ENABLED", type: "bool", default: true, group: "runtime" },
  { key: "indexingReextractSeedLimit", envKey: "INDEXING_REEXTRACT_SEED_LIMIT", type: "int", default: 8, group: "runtime" },
  { key: "indexingResumeRetryPersistLimit", envKey: "INDEXING_RESUME_RETRY_PERSIST_LIMIT", type: "int", default: 80, group: "runtime" },
  { key: "indexingResumeSuccessPersistLimit", envKey: "INDEXING_RESUME_SUCCESS_PERSIST_LIMIT", type: "int", default: 240, group: "runtime" },
  { key: "indexingSchemaPacketsSchemaRoot", envKey: "INDEXING_SCHEMA_PACKETS_SCHEMA_ROOT", type: "string", default: "", group: "runtime" },
  { key: "runtimeAutosaveEnabled", envKey: "RUNTIME_AUTOSAVE_ENABLED", type: "bool", default: true, group: "runtime" },
  { key: "runtimeOpsWorkbenchEnabled", envKey: "RUNTIME_OPS_WORKBENCH_ENABLED", type: "bool", default: true, group: "runtime" },
  { key: "visualAssetCaptureEnabled", envKey: "VISUAL_ASSET_CAPTURE_ENABLED", type: "bool", default: true, group: "runtime" },
  { key: "visualAssetCaptureMaxPerSource", envKey: "VISUAL_ASSET_CAPTURE_MAX_PER_SOURCE", type: "int", default: 5, group: "runtime" },
  { key: "visualAssetHeroSelectorMapJson", envKey: "VISUAL_ASSET_HERO_SELECTOR_MAP_JSON", type: "string", default: "", group: "runtime" },
  { key: "visualAssetLlmMaxBytes", envKey: "VISUAL_ASSET_LLM_MAX_BYTES", type: "int", default: 512000, group: "runtime" },
  { key: "visualAssetMaxPhashDistance", envKey: "VISUAL_ASSET_MAX_PHASH_DISTANCE", type: "int", default: 10, group: "runtime" },
  { key: "visualAssetMinEntropy", envKey: "VISUAL_ASSET_MIN_ENTROPY", type: "float", default: 2.5, group: "runtime" },
  { key: "visualAssetMinHeight", envKey: "VISUAL_ASSET_MIN_HEIGHT", type: "int", default: 320, group: "runtime" },
  { key: "visualAssetMinSharpness", envKey: "VISUAL_ASSET_MIN_SHARPNESS", type: "int", default: 80, group: "runtime" },
  { key: "visualAssetMinWidth", envKey: "VISUAL_ASSET_MIN_WIDTH", type: "int", default: 320, group: "runtime" },
  { key: "visualAssetPhashEnabled", envKey: "VISUAL_ASSET_PHASH_ENABLED", type: "bool", default: true, group: "runtime" },
  { key: "visualAssetRegionCropMaxSide", envKey: "VISUAL_ASSET_REGION_CROP_MAX_SIDE", type: "int", default: 1024, group: "runtime" },
  { key: "visualAssetRegionCropQuality", envKey: "VISUAL_ASSET_REGION_CROP_QUALITY", type: "int", default: 70, group: "runtime" },
  { key: "visualAssetRetentionDays", envKey: "VISUAL_ASSET_RETENTION_DAYS", type: "int", default: 30, group: "runtime" },
  { key: "visualAssetReviewFormat", envKey: "VISUAL_ASSET_REVIEW_FORMAT", type: "string", default: "webp", group: "runtime" },
  { key: "visualAssetReviewLgMaxSide", envKey: "VISUAL_ASSET_REVIEW_LG_MAX_SIDE", type: "int", default: 1600, group: "runtime" },
  { key: "visualAssetReviewLgQuality", envKey: "VISUAL_ASSET_REVIEW_LG_QUALITY", type: "int", default: 75, group: "runtime" },
  { key: "visualAssetReviewSmMaxSide", envKey: "VISUAL_ASSET_REVIEW_SM_MAX_SIDE", type: "int", default: 768, group: "runtime" },
  { key: "visualAssetReviewSmQuality", envKey: "VISUAL_ASSET_REVIEW_SM_QUALITY", type: "int", default: 65, group: "runtime" },
  { key: "visualAssetStoreOriginal", envKey: "VISUAL_ASSET_STORE_ORIGINAL", type: "bool", default: true, group: "runtime" },

  // --- paths ---
  { key: "frontierEnableSqlite", envKey: "FRONTIER_ENABLE_SQLITE", type: "bool", default: true, group: "paths" },
  { key: "frontierRepairSearchEnabled", envKey: "FRONTIER_REPAIR_SEARCH_ENABLED", type: "bool", default: true, group: "paths" },
  { key: "helperFilesRoot", envKey: "HELPER_FILES_ROOT", type: "string", default: "category_authority", group: "paths" },
  { key: "localOutputRoot", envKey: "LOCAL_OUTPUT_ROOT", type: "string", default: "", group: "paths" },
  { key: "localS3Root", envKey: "LOCAL_S3_ROOT", type: "string", default: "", group: "paths" },
]);

// WHY: Single source of truth for convergence settings. Same derivation pattern
// as RUNTIME_SETTINGS_REGISTRY — add one entry, all downstream layers derive.
export const CONVERGENCE_SETTINGS_REGISTRY = Object.freeze([]);

// WHY: Single source of truth for UI settings. All are simple booleans
// controlling auto-save behavior. Derivation functions produce the defaults,
// value-type map, and mutable key allowlist the handler needs.
export const UI_SETTINGS_REGISTRY = Object.freeze([
  { key: "studioAutoSaveAllEnabled", type: "bool", default: false, mutable: true },
  { key: "studioAutoSaveEnabled", type: "bool", default: true, mutable: true },
  { key: "studioAutoSaveMapEnabled", type: "bool", default: true, mutable: true },
  { key: "runtimeAutoSaveEnabled", type: "bool", default: true, mutable: true },
  { key: "storageAutoSaveEnabled", type: "bool", default: false, mutable: true },
]);

// WHY: Single source of truth for storage settings. Secret fields use
// `secret: true` and `clearFlag` metadata so derivation functions can
// exclude secrets from defaults and include clear flags in the mutable key allowlist.
export const STORAGE_SETTINGS_REGISTRY = Object.freeze([
  { key: "enabled", type: "bool", default: false, mutable: true },
  { key: "destinationType", type: "enum", default: "local", allowed: ["local", "s3"], mutable: true },
  { key: "localDirectory", type: "string", default: "", mutable: true },
  { key: "awsRegion", type: "string", default: "us-east-2", mutable: true },
  { key: "s3Bucket", type: "string", default: "", mutable: true },
  { key: "s3Prefix", type: "string", default: "spec-factory-runs", mutable: true },
  { key: "s3AccessKeyId", type: "string", default: "", mutable: true },
  { key: "s3SecretAccessKey", type: "string", default: "", secret: true, mutable: true, clearFlag: "clearS3SecretAccessKey" },
  { key: "s3SessionToken", type: "string", default: "", secret: true, mutable: true, clearFlag: "clearS3SessionToken" },
  { key: "updatedAt", type: "string_or_null", default: null, computed: true },
]);
