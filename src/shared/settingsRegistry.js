// WHY: Single source of truth for all runtime settings. Every other layer
// (defaults, clamping ranges, route contracts, TS types, hydration, payload)
// derives from this registry. Adding a new setting = add one entry here.

// WHY: Inlined here to break circular dependency with settingsDefaults.js
// which imports from this registry. This is the canonical list.
export const SEARXNG_AVAILABLE_ENGINES = Object.freeze(['google', 'bing', 'google-proxy', 'duckduckgo', 'brave']);

const DEFAULT_LLM_PROVIDER_REGISTRY_JSON = "[{\"id\":\"default-gemini\",\"name\":\"Gemini\",\"type\":\"openai-compatible\",\"baseUrl\":\"https://generativelanguage.googleapis.com/v1beta/openai\",\"apiKey\":\"\",\"enabled\":true,\"models\":[{\"id\":\"default-gemini-flash\",\"modelId\":\"gemini-2.5-flash\",\"role\":\"primary\",\"costInputPer1M\":0.3,\"costOutputPer1M\":2.5,\"costCachedPer1M\":0.03,\"maxContextTokens\":1048576,\"maxOutputTokens\":65536},{\"id\":\"default-gemini-flash-lite\",\"modelId\":\"gemini-2.5-flash-lite\",\"role\":\"primary\",\"costInputPer1M\":0.1,\"costOutputPer1M\":0.4,\"costCachedPer1M\":0.01,\"maxContextTokens\":1048576,\"maxOutputTokens\":65536},{\"id\":\"default-gemini-pro\",\"modelId\":\"gemini-2.5-pro\",\"role\":\"reasoning\",\"costInputPer1M\":1.25,\"costOutputPer1M\":10,\"costCachedPer1M\":0.125,\"maxContextTokens\":1048576,\"maxOutputTokens\":65536}]},{\"id\":\"default-deepseek\",\"name\":\"DeepSeek\",\"type\":\"openai-compatible\",\"baseUrl\":\"https://api.deepseek.com\",\"apiKey\":\"\",\"enabled\":true,\"models\":[{\"id\":\"default-deepseek-chat\",\"modelId\":\"deepseek-chat\",\"role\":\"primary\",\"costInputPer1M\":0.28,\"costOutputPer1M\":0.42,\"costCachedPer1M\":0.028,\"maxContextTokens\":128000,\"maxOutputTokens\":8192},{\"id\":\"default-deepseek-reasoner\",\"modelId\":\"deepseek-reasoner\",\"role\":\"reasoning\",\"costInputPer1M\":0.28,\"costOutputPer1M\":0.42,\"costCachedPer1M\":0.028,\"maxContextTokens\":128000,\"maxOutputTokens\":64000}]},{\"id\":\"default-anthropic\",\"name\":\"Anthropic\",\"type\":\"anthropic\",\"baseUrl\":\"https://api.anthropic.com\",\"apiKey\":\"\",\"enabled\":false,\"models\":[{\"id\":\"default-anthropic-sonnet\",\"modelId\":\"claude-sonnet-4-20250514\",\"role\":\"reasoning\",\"costInputPer1M\":3,\"costOutputPer1M\":15,\"costCachedPer1M\":0.3,\"maxContextTokens\":200000,\"maxOutputTokens\":64000}]},{\"id\":\"default-openai\",\"name\":\"OpenAI\",\"type\":\"openai-compatible\",\"baseUrl\":\"https://api.openai.com/v1\",\"apiKey\":\"\",\"enabled\":false,\"models\":[{\"id\":\"default-openai-gpt-4-1\",\"modelId\":\"gpt-4.1\",\"role\":\"primary\",\"costInputPer1M\":2,\"costOutputPer1M\":8,\"costCachedPer1M\":0.5,\"maxContextTokens\":1047576,\"maxOutputTokens\":32768},{\"id\":\"default-openai-gpt-4-1-mini\",\"modelId\":\"gpt-4.1-mini\",\"role\":\"primary\",\"costInputPer1M\":0.4,\"costOutputPer1M\":1.6,\"costCachedPer1M\":0.1,\"maxContextTokens\":1047576,\"maxOutputTokens\":32768},{\"id\":\"default-openai-gpt-4-1-nano\",\"modelId\":\"gpt-4.1-nano\",\"role\":\"primary\",\"costInputPer1M\":0.1,\"costOutputPer1M\":0.4,\"costCachedPer1M\":0.025,\"maxContextTokens\":1047576,\"maxOutputTokens\":32768},{\"id\":\"default-openai-gpt-4o\",\"modelId\":\"gpt-4o\",\"role\":\"primary\",\"costInputPer1M\":2.5,\"costOutputPer1M\":10,\"costCachedPer1M\":1.25,\"maxContextTokens\":128000,\"maxOutputTokens\":16384},{\"id\":\"default-openai-gpt-4o-mini\",\"modelId\":\"gpt-4o-mini\",\"role\":\"primary\",\"costInputPer1M\":0.15,\"costOutputPer1M\":0.6,\"costCachedPer1M\":0.075,\"maxContextTokens\":128000,\"maxOutputTokens\":16384},{\"id\":\"default-openai-gpt-5\",\"modelId\":\"gpt-5\",\"role\":\"primary\",\"costInputPer1M\":1.25,\"costOutputPer1M\":10,\"costCachedPer1M\":0.125,\"maxContextTokens\":400000,\"maxOutputTokens\":128000},{\"id\":\"default-openai-gpt-5-mini\",\"modelId\":\"gpt-5-mini\",\"role\":\"primary\",\"costInputPer1M\":0.25,\"costOutputPer1M\":2,\"costCachedPer1M\":0.025,\"maxContextTokens\":400000,\"maxOutputTokens\":128000},{\"id\":\"default-openai-gpt-5-1\",\"modelId\":\"gpt-5.1\",\"role\":\"primary\",\"costInputPer1M\":1.25,\"costOutputPer1M\":10,\"costCachedPer1M\":0.125,\"maxContextTokens\":400000,\"maxOutputTokens\":128000},{\"id\":\"default-openai-gpt-5-2\",\"modelId\":\"gpt-5.2\",\"role\":\"primary\",\"costInputPer1M\":1.75,\"costOutputPer1M\":14,\"costCachedPer1M\":0.175,\"maxContextTokens\":400000,\"maxOutputTokens\":128000},{\"id\":\"default-openai-gpt-5-2-pro\",\"modelId\":\"gpt-5.2-pro\",\"role\":\"reasoning\",\"costInputPer1M\":21,\"costOutputPer1M\":168,\"costCachedPer1M\":2.1,\"maxContextTokens\":400000,\"maxOutputTokens\":128000}]}]";
export const RUNTIME_SETTINGS_REGISTRY = Object.freeze([
  { key: "anthropicApiKey", type: "string", default: "", secret: true, allowEmpty: true, policyGroup: "apiKeys", policyField: "anthropic", configKey: "anthropicApiKey", envKey: "ANTHROPIC_API_KEY", group: "llm", uiCategory: "extraction", uiSection: "provider", uiGroup: "API Keys", uiTip: "API key for Anthropic (Claude) models" },
  { key: "autoScrollDelayMs", type: "int", default: 1200, min: 0, max: 10000, configKey: "autoScrollDelayMs", envKey: "AUTO_SCROLL_DELAY_MS", group: "misc", uiCategory: "fetcher", uiSection: "browser", uiGroup: "Auto Scroll", uiTip: "Delay between each auto-scroll pass", disabledBy: "autoScrollEnabled" },
  { key: "autoScrollEnabled", type: "bool", default: true, configKey: "autoScrollEnabled", envKey: "AUTO_SCROLL_ENABLED", group: "misc", uiCategory: "fetcher", uiSection: "browser", uiHero: true, uiTip: "Automatically scroll pages to trigger lazy-loaded content" },
  { key: "autoScrollPasses", type: "int", default: 2, min: 0, max: 20, configKey: "autoScrollPasses", envKey: "AUTO_SCROLL_PASSES", group: "misc", uiCategory: "fetcher", uiSection: "browser", uiGroup: "Auto Scroll", uiTip: "Number of scroll-to-bottom passes per page", disabledBy: "autoScrollEnabled" },
  { key: "capturePageScreenshotEnabled", type: "bool", default: true, configKey: "capturePageScreenshotEnabled", envKey: "CAPTURE_PAGE_SCREENSHOT_ENABLED", group: "runtime", uiCategory: "extraction", uiSection: "screenshots", uiHero: true, uiTip: "Capture targeted screenshots of spec tables on crawled pages" },
  { key: "capturePageScreenshotFormat", type: "string", default: "jpeg", configKey: "capturePageScreenshotFormat", envKey: "CAPTURE_PAGE_SCREENSHOT_FORMAT", group: "runtime", uiCategory: "extraction", uiSection: "screenshots", uiGroup: "Capture Settings", uiTip: "Image format for page screenshots (jpeg or png)", disabledBy: "capturePageScreenshotEnabled" },
  { key: "capturePageScreenshotMaxBytes", type: "int", default: 5000000, min: 1024, max: 100000000, configKey: "capturePageScreenshotMaxBytes", envKey: "CAPTURE_PAGE_SCREENSHOT_MAX_BYTES", group: "runtime", uiCategory: "extraction", uiSection: "screenshots", uiGroup: "Capture Settings", uiTip: "Maximum file size for a single page screenshot", disabledBy: "capturePageScreenshotEnabled" },
  { key: "capturePageScreenshotQuality", type: "int", default: 50, min: 1, max: 100, configKey: "capturePageScreenshotQuality", envKey: "CAPTURE_PAGE_SCREENSHOT_QUALITY", group: "runtime", uiCategory: "extraction", uiSection: "screenshots", uiGroup: "Capture Settings", uiTip: "JPEG quality for page screenshots (1-100)", disabledBy: "capturePageScreenshotEnabled" },
  { key: "capturePageScreenshotSelectors", type: "string", default: "table,[data-spec-table],.specs-table,.spec-table,.specifications", configKey: "capturePageScreenshotSelectors", envKey: "CAPTURE_PAGE_SCREENSHOT_SELECTORS", group: "runtime", uiCategory: "extraction", uiSection: "screenshots", uiGroup: "Capture Settings", uiTip: "CSS selectors used to find spec tables for screenshot capture", disabledBy: "capturePageScreenshotEnabled" },

  { key: "categoryAuthorityRoot", type: "string", default: "category_authority", allowEmpty: true, aliases: ["helperFilesRoot"], configKey: "categoryAuthorityRoot", envKey: "CATEGORY_AUTHORITY_ROOT", group: "paths", uiCategory: "global", uiSection: "output", uiGroup: "Paths", uiTip: "Root directory for category authority helper files" },
  { key: "crawleeHeadless", type: "bool", default: true, configKey: "crawleeHeadless", envKey: "CRAWLEE_HEADLESS", group: "runtime", uiCategory: "fetcher", uiSection: "browser", uiGroup: "Crawlee Internals", uiTip: "Run the browser in headless mode (no visible window)" },
  { key: "crawleeRequestHandlerTimeoutSecs", type: "int", default: 75, min: 0, max: 300, configKey: "crawleeRequestHandlerTimeoutSecs", envKey: "CRAWLEE_REQUEST_HANDLER_TIMEOUT_SECS", group: "runtime", uiCategory: "fetcher", uiSection: "browser", uiGroup: "Crawlee Internals", uiTip: "Timeout for the Crawlee request handler per page" },
  { key: "fetcherAdapter", type: "enum", default: "crawlee", allowed: ["crawlee"], configKey: "fetcherAdapter", envKey: "FETCHER_ADAPTER", group: "runtime", uiCategory: "fetcher", uiSection: "adapter", uiHero: true, uiTip: "Crawl tool used for page fetching" },
  { key: "fetcherPlugins", type: "string", default: "stealth,autoScroll,screenshot", configKey: "fetcherPlugins", envKey: "FETCHER_PLUGINS", group: "runtime", uiCategory: "fetcher", uiSection: "adapter", uiTip: "Comma-separated list of fetcher plugins to activate" },
  { key: "deepseekApiKey", type: "string", default: "", secret: true, allowEmpty: true, policyGroup: "apiKeys", policyField: "deepseek", configKey: "deepseekApiKey", envKey: "DEEPSEEK_API_KEY", group: "llm", uiCategory: "extraction", uiSection: "provider", uiGroup: "API Keys", uiTip: "API key for DeepSeek models" },
  { key: "searchProfileQueryCap", type: "int", default: 10, min: 1, max: 100, configKey: "searchProfileQueryCap", envKey: "SEARCH_PROFILE_QUERY_CAP", group: "misc", uiCategory: "planner", uiSection: "search-profile", uiGroup: "Query Caps", uiTip: "Maximum total queries the search profile can generate" },
  { key: "domainClassifierUrlCap", type: "int", default: 50, min: 1, max: 500, configKey: "domainClassifierUrlCap", envKey: "DOMAIN_CLASSIFIER_URL_CAP", group: "misc", uiCategory: "planner", uiSection: "domain-classifier", uiTip: "Maximum URLs sent to the domain classifier per round" },
  { key: "dryRun", type: "bool", default: false, configKey: "dryRun", envKey: "DRY_RUN", group: "misc", uiCategory: "global", uiSection: "output", uiGroup: "Runtime Output", uiTip: "Run the pipeline without writing output files. Useful for testing configuration" },
  { key: "eventsJsonWrite", type: "bool", default: true, configKey: "eventsJsonWrite", envKey: "EVENTS_JSON_WRITE", group: "observability", uiCategory: "fetcher", uiSection: "observability", uiGroup: "Events", uiTip: "Write runtime events to the JSONL event log" },
  { key: "geminiApiKey", type: "string", default: "", secret: true, allowEmpty: true, policyGroup: "apiKeys", policyField: "gemini", configKey: "geminiApiKey", envKey: "GEMINI_API_KEY", group: "misc", uiCategory: "extraction", uiSection: "provider", uiGroup: "API Keys", uiTip: "API key for Google Gemini models" },
  { key: "googleSearchMaxRetries", type: "int", default: 1, min: 0, max: 3, configKey: "googleSearchMaxRetries", envKey: "GOOGLE_SEARCH_MAX_RETRIES", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Google Search", uiTip: "Max retries for a single Google Search request" },
  { key: "googleSearchMinQueryIntervalMs", type: "int", default: 1000, min: 0, max: 60000, configKey: "googleSearchMinQueryIntervalMs", envKey: "GOOGLE_SEARCH_MIN_QUERY_INTERVAL_MS", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Google Search", uiTip: "Minimum delay between consecutive Google Search queries" },
  { key: "googleSearchProxyUrlsJson", type: "string", default: "[\"http://zruyrjpq-rotate:dfm4udpzx5p0@p.webshare.io:80\"]", allowEmpty: true, configKey: "googleSearchProxyUrlsJson", envKey: "", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Google Search", uiTip: "JSON array of proxy URLs for Google Search rotation" },
  { key: "googleSearchScreenshotsEnabled", type: "bool", default: true, configKey: "googleSearchScreenshotsEnabled", envKey: "GOOGLE_SEARCH_SCREENSHOTS_ENABLED", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Google Search", uiTip: "Capture screenshots of Google SERP pages for debugging" },
  { key: "googleSearchTimeoutMs", type: "int", default: 30000, min: 30000, max: 120000, configKey: "googleSearchTimeoutMs", envKey: "GOOGLE_SEARCH_TIMEOUT_MS", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Google Search", uiTip: "Timeout for a single Google Search request" },
  { key: "serperApiKey", type: "string", default: "", allowEmpty: true, configKey: "serperApiKey", envKey: "SERPER_API_KEY", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Serper", uiTip: "API key for the Serper search service", disabledBy: "serperEnabled" },
  { key: "serperEnabled", type: "bool", default: true, configKey: "serperEnabled", envKey: "SERPER_ENABLED", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiHero: true, uiTip: "Enable the Serper API as a search provider" },
  // WHY: helperFilesRoot removed — canonical key is categoryAuthorityRoot (line 31). HELPER_FILES_ROOT env var still read by configBuilder.
  { key: "llmEnhancerMaxRetries", type: "int", default: 2, min: 1, max: 5, configKey: "llmEnhancerMaxRetries", envKey: "LLM_ENHANCER_MAX_RETRIES", group: "misc", uiCategory: "planner", uiSection: "search-planner", uiTip: "Maximum retry attempts for the LLM query enhancer" },
  { key: "llmBaseUrl", type: "string", default: "https://generativelanguage.googleapis.com/v1beta/openai", allowEmpty: true, policyGroup: "provider", policyField: "baseUrl", configKey: "llmBaseUrl", envKey: "LLM_BASE_URL", group: "llm", uiCategory: "extraction", uiSection: "provider", uiGroup: "Plan Provider", uiTip: "Base URL for the default LLM provider API" },
  { key: "llmCostCachedInputPer1M", type: "float", default: 0.125, min: 0, max: 1000, policyGroup: "budget", policyField: "costCachedInputPer1M", configKey: "llmCostCachedInputPer1M", envKey: "LLM_COST_CACHED_INPUT_PER_1M", group: "llm", uiCategory: "extraction", uiSection: "limits", uiGroup: "Token Costs", uiTip: "Cost per 1M cached input tokens (USD)" },
  { key: "llmCostInputPer1M", type: "float", default: 1.25, min: 0, max: 1000, policyGroup: "budget", policyField: "costInputPer1M", configKey: "llmCostInputPer1M", envKey: "LLM_COST_INPUT_PER_1M", group: "llm", uiCategory: "extraction", uiSection: "limits", uiGroup: "Token Costs", uiTip: "Cost per 1M input tokens (USD)" },
  { key: "llmCostOutputPer1M", type: "float", default: 10, min: 0, max: 1000, policyGroup: "budget", policyField: "costOutputPer1M", configKey: "llmCostOutputPer1M", envKey: "LLM_COST_OUTPUT_PER_1M", group: "llm", uiCategory: "extraction", uiSection: "limits", uiGroup: "Token Costs", uiTip: "Cost per 1M output tokens (USD)" },
  { key: "llmMaxOutputTokens", type: "int", default: 1400, min: 128, max: 262144, policyGroup: "tokens", policyField: "maxOutput", configKey: "llmMaxOutputTokens", envKey: "LLM_MAX_OUTPUT_TOKENS", group: "llm", uiCategory: "extraction", uiSection: "models", uiGroup: "Global Tokens", uiTip: "Default max output tokens for LLM responses" },
  { key: "llmMaxOutputTokensPlan", type: "int", default: 4096, min: 128, max: 262144, tokenClamped: true, clampModelKey: "llmModelPlan", aliases: ["llmTokensPlan"], policyGroup: "tokens", policyField: "plan", configKey: "llmMaxOutputTokensPlan", envKey: "LLM_MAX_OUTPUT_TOKENS_PLAN", group: "llm", uiCategory: "extraction", uiSection: "models", uiGroup: "Plan Phase", uiTip: "Max output tokens for plan-phase LLM calls" },
  { key: "llmMaxOutputTokensPlanFallback", type: "int", default: 2048, min: 128, max: 262144, tokenClamped: true, clampModelKey: "llmPlanFallbackModel", clampModelFallbackKey: "llmModelPlan", aliases: ["llmTokensPlanFallback"], policyGroup: "tokens", policyField: "planFallback", configKey: "llmMaxOutputTokensPlanFallback", envKey: "LLM_MAX_OUTPUT_TOKENS_PLAN_FALLBACK", group: "llm", uiCategory: "extraction", uiSection: "models", uiGroup: "Plan Phase", uiTip: "Max output tokens for plan-phase fallback model" },
  { key: "llmMaxOutputTokensTriage", type: "int", default: 20000, min: 20000, max: 262144, tokenClamped: true, clampModelKey: "llmModelPlan", aliases: ["llmTokensTriage"], configKey: "llmMaxOutputTokensTriage", envKey: "LLM_MAX_OUTPUT_TOKENS_TRIAGE", group: "llm", uiCategory: "extraction", uiSection: "models", uiGroup: "Global Tokens", uiTip: "Max output tokens for triage-phase LLM calls" },
  { key: "llmMaxOutputTokensReasoning", type: "int", default: 4096, min: 128, max: 262144, tokenClamped: true, clampModelKey: "llmModelReasoning", aliases: ["llmTokensReasoning"], policyGroup: "tokens", policyField: "reasoning", configKey: "llmMaxOutputTokensReasoning", envKey: "LLM_MAX_OUTPUT_TOKENS_REASONING", group: "llm", uiCategory: "extraction", uiSection: "models", uiGroup: "Reasoning Phase", uiTip: "Max output tokens for reasoning-phase LLM calls" },
  { key: "llmMaxOutputTokensReasoningFallback", type: "int", default: 2048, min: 128, max: 262144, tokenClamped: true, clampModelKey: "llmReasoningFallbackModel", clampModelFallbackKey: "llmModelReasoning", aliases: ["llmTokensReasoningFallback"], policyGroup: "tokens", policyField: "reasoningFallback", configKey: "llmMaxOutputTokensReasoningFallback", envKey: "LLM_MAX_OUTPUT_TOKENS_REASONING_FALLBACK", group: "misc", uiCategory: "extraction", uiSection: "models", uiGroup: "Reasoning Phase", uiTip: "Max output tokens for reasoning-phase fallback model" },
  { key: "llmMaxTokens", type: "int", default: 16384, min: 128, max: 262144, policyGroup: "tokens", policyField: "maxTokens", configKey: "llmMaxTokens", envKey: "LLM_MAX_TOKENS", group: "llm", uiCategory: "extraction", uiSection: "models", uiGroup: "Global Tokens", uiTip: "Global max context tokens for LLM requests" },
  { key: "llmModelPlan", type: "string", default: "gemini-2.5-flash", aliases: ["phase2LlmModel"], policyGroup: "models", policyField: "plan", configKey: "llmModelPlan", envKey: "LLM_MODEL_PLAN", group: "llm", uiCategory: "extraction", uiSection: "models", uiGroup: "Plan Phase", uiTip: "Model ID used for the plan phase" },
  { key: "llmModelReasoning", type: "string", default: "deepseek-reasoner", policyGroup: "models", policyField: "reasoning", configKey: "llmModelReasoning", envKey: "LLM_MODEL_REASONING", group: "llm", uiCategory: "extraction", uiSection: "models", uiGroup: "Reasoning Phase", uiTip: "Model ID used for the reasoning phase" },
  { key: "llmMonthlyBudgetUsd", type: "float", default: 300, min: 0, max: 100000, policyGroup: "budget", policyField: "monthlyUsd", configKey: "llmMonthlyBudgetUsd", envKey: "LLM_MONTHLY_BUDGET_USD", group: "llm", uiCategory: "extraction", uiSection: "limits", uiGroup: "Budget", uiTip: "Monthly LLM spending limit in USD" },
  { key: "llmPerProductBudgetUsd", type: "float", default: 0.35, min: 0, max: 1000, policyGroup: "budget", policyField: "perProductUsd", configKey: "llmPerProductBudgetUsd", envKey: "LLM_PER_PRODUCT_BUDGET_USD", group: "llm", uiCategory: "extraction", uiSection: "limits", uiGroup: "Budget", uiTip: "Per-product LLM spending limit in USD" },
  { key: "llmPhaseOverridesJson", type: "string", default: "{}", allowEmpty: true, policyGroup: "_json", policyField: "phaseOverrides", configKey: "llmPhaseOverridesJson", envKey: "", uiCategory: "extraction", uiSection: "limits", uiGroup: "Advanced Config", uiTip: "JSON overrides for per-phase LLM configuration" },
  { key: "llmPlanApiKey", type: "string", default: "", secret: true, allowEmpty: true, policyGroup: "apiKeys", policyField: "plan", configKey: "llmPlanApiKey", envKey: "LLM_PLAN_API_KEY", group: "llm", uiCategory: "extraction", uiSection: "provider", uiGroup: "Plan Provider", uiTip: "API key override for the plan-phase LLM provider" },
  { key: "llmPlanBaseUrl", type: "string", default: "https://generativelanguage.googleapis.com/v1beta/openai", allowEmpty: true, policyGroup: "provider", policyField: "planBaseUrl", configKey: "llmPlanBaseUrl", envKey: "LLM_PLAN_BASE_URL", group: "llm", uiCategory: "extraction", uiSection: "provider", uiGroup: "Plan Provider", uiTip: "Base URL override for the plan-phase LLM provider" },
  { key: "llmPlanFallbackModel", type: "string", default: "deepseek-chat", policyGroup: "models", policyField: "planFallback", configKey: "llmPlanFallbackModel", envKey: "LLM_PLAN_FALLBACK_MODEL", group: "llm", uiCategory: "extraction", uiSection: "models", uiGroup: "Plan Phase", uiTip: "Fallback model ID for the plan phase" },
  { key: "llmPlanProvider", type: "string", default: "gemini", policyGroup: "provider", policyField: "planProvider", configKey: "llmPlanProvider", envKey: "LLM_PLAN_PROVIDER", group: "llm", uiCategory: "extraction", uiSection: "provider", uiGroup: "Plan Provider", uiTip: "LLM provider used specifically for the plan phase" },
  { key: "llmPlanUseReasoning", type: "bool", default: false, policyGroup: "reasoning", policyField: "enabled", configKey: "llmPlanUseReasoning", envKey: "LLM_PLAN_USE_REASONING", group: "llm", uiCategory: "extraction", uiSection: "models", uiGroup: "Plan Phase", uiTip: "Enable reasoning mode for plan-phase LLM calls" },
  { key: "llmProvider", type: "string", default: "gemini", policyGroup: "provider", policyField: "id", configKey: "llmProvider", envKey: "LLM_PROVIDER", group: "llm", uiCategory: "extraction", uiSection: "provider", uiHero: true, uiTip: "Default LLM provider for extraction" },
  { key: "llmProviderRegistryJson", type: "string", default: DEFAULT_LLM_PROVIDER_REGISTRY_JSON, allowEmpty: true, policyGroup: "_json", policyField: "providerRegistry", configKey: "llmProviderRegistryJson", envKey: "", uiCategory: "extraction", uiSection: "limits", uiGroup: "Advanced Config", uiTip: "JSON registry of all configured LLM providers and their models" },
  { key: "llmReasoningBudget", type: "int", default: 32768, min: 128, max: 262144, policyGroup: "reasoning", policyField: "budget", configKey: "llmReasoningBudget", envKey: "LLM_REASONING_BUDGET", group: "llm", uiCategory: "extraction", uiSection: "models", uiGroup: "Reasoning Phase", uiTip: "Token budget allocated to reasoning/thinking in supported models" },
  { key: "llmReasoningFallbackModel", type: "string", default: "gemini-2.5-pro", policyGroup: "models", policyField: "reasoningFallback", configKey: "llmReasoningFallbackModel", envKey: "LLM_REASONING_FALLBACK_MODEL", group: "misc", uiCategory: "extraction", uiSection: "models", uiGroup: "Reasoning Phase", uiTip: "Fallback model ID for the reasoning phase" },
  { key: "llmReasoningMode", type: "bool", default: true, policyGroup: "reasoning", policyField: "mode", configKey: "llmReasoningMode", envKey: "LLM_REASONING_MODE", group: "llm", uiCategory: "extraction", uiSection: "models", uiGroup: "Reasoning Phase", uiTip: "Enable reasoning mode globally for supported models" },
  { key: "llmTimeoutMs", type: "int", default: 30000, min: 1000, max: 600000, policyGroup: "_topLevel", policyField: "timeoutMs", configKey: "llmTimeoutMs", envKey: "LLM_TIMEOUT_MS", group: "llm", uiCategory: "extraction", uiSection: "limits", uiGroup: "Call Limits", uiTip: "Timeout for a single LLM API request" },
  { key: "localInputRoot", type: "string", default: "fixtures/s3", allowEmpty: true, configKey: "localInputRoot", envKey: "LOCAL_INPUT_ROOT", group: "paths", uiCategory: "global", uiSection: "output", uiGroup: "Paths", uiTip: "Local directory for input fixture files" },

  // WHY: LOCAL_OUTPUT_ROOT is owned by pathsGroup.js (calls defaultLocalOutputRoot() dynamically).
  // No envKey here — prevents miscGroup from creating a duplicate manifest entry with a stale default.
  { key: "localOutputRoot", type: "string", default: "", allowEmpty: true, configKey: "localOutputRoot", envKey: "", uiCategory: "global", uiSection: "output", uiGroup: "Paths", uiTip: "Local directory for pipeline output. Leave empty for dynamic default" },
  { key: "maxPagesPerDomain", type: "int", default: 5, min: 1, max: 100, configKey: "maxPagesPerDomain", envKey: "MAX_PAGES_PER_DOMAIN", group: "misc", uiCategory: "planner", uiSection: "domain-classifier", uiTip: "Maximum pages to crawl from a single domain" },
  { key: "maxRunSeconds", type: "int", default: 480, min: 30, max: 86400, configKey: "maxRunSeconds", envKey: "MAX_RUN_SECONDS", group: "misc", uiCategory: "global", uiSection: "run-setup", uiHero: true, uiTip: "Maximum wall-clock time before the pipeline auto-stops" },
  { key: "openaiApiKey", type: "string", default: "", secret: true, allowEmpty: true, policyGroup: "apiKeys", policyField: "openai", configKey: "openaiApiKey", envKey: "OPENAI_API_KEY", group: "llm", uiCategory: "extraction", uiSection: "provider", uiGroup: "API Keys", uiTip: "API key for OpenAI models" },
  { key: "pipelineSchemaEnforcementMode", type: "enum", default: "warn", allowed: ["off", "warn", "enforce"], configKey: "pipelineSchemaEnforcementMode", envKey: "PIPELINE_SCHEMA_ENFORCEMENT_MODE", group: "misc", uiCategory: "validation", uiSection: "schema", uiHero: true, uiTip: "How pipeline context schema violations are handled: off, warn, or enforce" },
  { key: "repairDedupeRule", type: "enum", default: "domain_once", allowed: ["domain_once","domain_and_status","none"], configKey: "repairDedupeRule", envKey: "REPAIR_DEDUPE_RULE", group: "misc", uiCategory: "fetcher", uiSection: "network", uiTip: "Deduplication strategy for repair/retry URLs" },
  { key: "robotsTxtCompliant", type: "bool", default: true, configKey: "robotsTxtCompliant", envKey: "ROBOTS_TXT_COMPLIANT", group: "misc", uiCategory: "fetcher", uiSection: "browser", uiGroup: "Robots.txt", uiTip: "Respect robots.txt rules when crawling" },
  { key: "robotsTxtTimeoutMs", type: "int", default: 6000, min: 100, max: 120000, configKey: "robotsTxtTimeoutMs", envKey: "ROBOTS_TXT_TIMEOUT_MS", group: "misc", uiCategory: "fetcher", uiSection: "browser", uiGroup: "Robots.txt", uiTip: "Timeout for fetching a site's robots.txt file", disabledBy: "robotsTxtCompliant" },
  { key: "runtimeControlFile", type: "string", default: "_runtime/control/runtime_overrides.json", configKey: "runtimeControlFile", envKey: "RUNTIME_CONTROL_FILE", group: "runtime", uiCategory: "global", uiSection: "output", uiGroup: "Runtime Output", uiTip: "Path to the runtime override JSON file used by the planner" },
  { key: "runtimeEventsKey", type: "string", default: "_runtime/events.jsonl", configKey: "runtimeEventsKey", envKey: "RUNTIME_EVENTS_KEY", group: "runtime", uiCategory: "global", uiSection: "output", uiGroup: "Runtime Output", uiTip: "Output path for the runtime event log (JSONL format)" },
  { key: "runtimeScreencastEnabled", type: "bool", default: true, configKey: "runtimeScreencastEnabled", envKey: "RUNTIME_SCREENCAST_ENABLED", group: "runtime", uiCategory: "fetcher", uiSection: "observability", uiHero: true, uiTip: "Record a screencast of browser activity during crawling" },
  { key: "runtimeScreencastFps", type: "int", default: 10, min: 1, max: 60, configKey: "runtimeScreencastFps", envKey: "RUNTIME_SCREENCAST_FPS", group: "runtime", uiCategory: "fetcher", uiSection: "observability", uiGroup: "Screencast", uiTip: "Frames per second for the runtime screencast", disabledBy: "runtimeScreencastEnabled" },
  { key: "runtimeScreencastMaxHeight", type: "int", default: 720, min: 240, max: 2160, configKey: "runtimeScreencastMaxHeight", envKey: "RUNTIME_SCREENCAST_MAX_HEIGHT", group: "runtime", uiCategory: "fetcher", uiSection: "observability", uiGroup: "Screencast", uiTip: "Maximum pixel height for screencast frames", disabledBy: "runtimeScreencastEnabled" },
  { key: "runtimeScreencastMaxWidth", type: "int", default: 1280, min: 320, max: 3840, configKey: "runtimeScreencastMaxWidth", envKey: "RUNTIME_SCREENCAST_MAX_WIDTH", group: "runtime", uiCategory: "fetcher", uiSection: "observability", uiGroup: "Screencast", uiTip: "Maximum pixel width for screencast frames", disabledBy: "runtimeScreencastEnabled" },
  { key: "runtimeScreencastQuality", type: "int", default: 50, min: 10, max: 100, configKey: "runtimeScreencastQuality", envKey: "RUNTIME_SCREENCAST_QUALITY", group: "runtime", uiCategory: "fetcher", uiSection: "observability", uiGroup: "Screencast", uiTip: "JPEG quality for screencast frames (10-100)", disabledBy: "runtimeScreencastEnabled" },
  { key: "runtimeTraceEnabled", type: "bool", default: true, configKey: "runtimeTraceEnabled", envKey: "RUNTIME_TRACE_ENABLED", group: "runtime", uiCategory: "fetcher", uiSection: "observability", uiHero: true, uiTip: "Enable runtime trace logging for fetch and LLM operations" },
  { key: "runtimeTraceFetchRing", type: "int", default: 30, min: 10, max: 2000, configKey: "runtimeTraceFetchRing", envKey: "RUNTIME_TRACE_FETCH_RING", group: "runtime", uiCategory: "fetcher", uiSection: "observability", uiGroup: "Trace", uiTip: "Number of recent fetch events kept in the trace ring buffer", disabledBy: "runtimeTraceEnabled" },
  { key: "runtimeTraceLlmPayloads", type: "bool", default: true, configKey: "runtimeTraceLlmPayloads", envKey: "RUNTIME_TRACE_LLM_PAYLOADS", group: "runtime", uiCategory: "fetcher", uiSection: "observability", uiGroup: "Trace", uiTip: "Include full LLM request/response payloads in trace logs", disabledBy: "runtimeTraceEnabled" },
  { key: "runtimeTraceLlmRing", type: "int", default: 50, min: 10, max: 2000, configKey: "runtimeTraceLlmRing", envKey: "RUNTIME_TRACE_LLM_RING", group: "runtime", uiCategory: "fetcher", uiSection: "observability", uiGroup: "Trace", uiTip: "Number of recent LLM events kept in the trace ring buffer", disabledBy: "runtimeTraceEnabled" },
  { key: "searchEngines", type: "csv_enum", default: "google", allowed: SEARXNG_AVAILABLE_ENGINES, aliases: ["searchProvider"], configKey: "searchEngines", envKey: "SEARCH_ENGINES", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Engine Selection", uiTip: "Primary search engine(s) for SearXNG queries" },
  { key: "searchEnginesFallback", type: "csv_enum", default: "bing", allowed: SEARXNG_AVAILABLE_ENGINES, configKey: "searchEnginesFallback", envKey: "SEARCH_ENGINES_FALLBACK", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Engine Selection", uiTip: "Fallback engine(s) when the primary engine fails or returns no results" },
  { key: "searchMaxRetries", type: "int", default: 3, min: 0, max: 5, configKey: "searchMaxRetries", envKey: "SEARCH_MAX_RETRIES", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Engine Selection", uiTip: "Maximum retries across all search providers before giving up" },
  { key: "serpSelectorUrlCap", type: "int", default: 50, min: 1, max: 500, configKey: "serpSelectorUrlCap", envKey: "SERP_SELECTOR_URL_CAP", group: "misc", uiCategory: "planner", uiSection: "serp-selector", uiTip: "Maximum URLs sent to the LLM-based SERP selector per query" },
  { key: "searxngBaseUrl", type: "string", default: "http://127.0.0.1:8080", allowEmpty: true, configKey: "searxngBaseUrl", envKey: "SEARXNG_BASE_URL", group: "discovery", uiCategory: "planner", uiSection: "search-execution", uiGroup: "SearXNG", uiTip: "Base URL of the local SearXNG instance" },
  { key: "searxngMinQueryIntervalMs", type: "int", default: 3000, min: 0, max: 30000, configKey: "searxngMinQueryIntervalMs", envKey: "SEARXNG_MIN_QUERY_INTERVAL_MS", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "SearXNG", uiTip: "Minimum delay between consecutive SearXNG queries" },
  { key: "specDbDir", type: "string", default: ".specfactory_tmp", allowEmpty: true, configKey: "specDbDir", envKey: "SPEC_DB_DIR", group: "paths", uiCategory: "global", uiSection: "output", uiGroup: "Paths", uiTip: "Directory for per-category SQLite runtime databases" },


  // --- Non-route keys: exist in SETTINGS_DEFAULTS.runtime but not in route maps ---
  // WHY: These are config-only keys used internally, not exposed via the settings API.
  { key: "discoveryEnabled", type: "bool", default: true, defaultsOnly: true, configKey: "discoveryEnabled", envKey: "DISCOVERY_ENABLED", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiHero: true, uiTip: "Master switch for the discovery search pipeline" },

  // --- Pipeline phase knobs (extracted from hardcoded values) ---

  // NeedSet
  { key: "needsetMaxFocusFields", type: "int", default: 10, min: 1, max: 50, configKey: "needsetMaxFocusFields", envKey: "NEEDSET_MAX_FOCUS_FIELDS", group: "misc", uiCategory: "planner", uiSection: "needset", uiGroup: "Field Assessment", uiTip: "Maximum number of focus fields the NeedSet can select per product" },
  { key: "needsetConfidenceThresholdMatched", type: "float", default: 0.95, min: 0, max: 1, configKey: "needsetConfidenceThresholdMatched", envKey: "NEEDSET_CONFIDENCE_THRESHOLD_MATCHED", group: "misc", uiCategory: "planner", uiSection: "needset", uiGroup: "Field Assessment", uiTip: "Confidence score above which a field is considered matched" },
  { key: "needsetConfidenceThresholdPossible", type: "float", default: 0.70, min: 0, max: 1, configKey: "needsetConfidenceThresholdPossible", envKey: "NEEDSET_CONFIDENCE_THRESHOLD_POSSIBLE", group: "misc", uiCategory: "planner", uiSection: "needset", uiGroup: "Field Assessment", uiTip: "Confidence score above which a field is considered possible" },
  { key: "needsetGroupQueryTermsCap", type: "int", default: 5, min: 1, max: 20, configKey: "needsetGroupQueryTermsCap", envKey: "NEEDSET_GROUP_QUERY_TERMS_CAP", group: "misc", uiCategory: "planner", uiSection: "needset", uiGroup: "Field Assessment", uiTip: "Maximum query terms generated per field group" },
  { key: "needsetGroupSearchCoverageThreshold", type: "float", default: 0.80, min: 0, max: 1, configKey: "needsetGroupSearchCoverageThreshold", envKey: "NEEDSET_GROUP_SEARCH_COVERAGE_THRESHOLD", group: "misc", uiCategory: "planner", uiSection: "needset", uiGroup: "Group Search", uiTip: "Coverage ratio above which a field group is considered sufficiently resolved" },
  { key: "needsetGroupSearchMinUnresolved", type: "int", default: 3, min: 1, max: 20, configKey: "needsetGroupSearchMinUnresolved", envKey: "NEEDSET_GROUP_SEARCH_MIN_UNRESOLVED", group: "misc", uiCategory: "planner", uiSection: "needset", uiGroup: "Group Search", uiTip: "Minimum unresolved fields required to trigger group-level search" },
  { key: "needsetGroupSearchMaxRepeats", type: "int", default: 3, min: 1, max: 10, configKey: "needsetGroupSearchMaxRepeats", envKey: "NEEDSET_GROUP_SEARCH_MAX_REPEATS", group: "misc", uiCategory: "planner", uiSection: "needset", uiGroup: "Group Search", uiTip: "Maximum times a field group can be re-searched before exhaustion" },
  { key: "needsetSeedCooldownDays", type: "int", default: 30, min: 1, max: 90, configKey: "needsetSeedCooldownDays", envKey: "NEEDSET_SEED_COOLDOWN_DAYS", group: "misc", uiCategory: "planner", uiSection: "needset", uiGroup: "Seed Control", uiTip: "Days before a completed seed query can re-fire" },

  // Search Profile
  { key: "queryBuilderMaxAliases", type: "int", default: 12, min: 1, max: 50, configKey: "queryBuilderMaxAliases", envKey: "QUERY_BUILDER_MAX_ALIASES", group: "misc", uiCategory: "planner", uiSection: "search-profile", uiGroup: "Synonyms & Aliases", uiTip: "Maximum product name aliases used in query generation" },
  { key: "queryBuilderFieldQueryCap", type: "int", default: 3, min: 1, max: 20, configKey: "queryBuilderFieldQueryCap", envKey: "QUERY_BUILDER_FIELD_QUERY_CAP", group: "misc", uiCategory: "planner", uiSection: "search-profile", uiGroup: "Query Caps", uiTip: "Maximum queries generated per field" },
  { key: "queryBuilderDocHintQueryCap", type: "int", default: 3, min: 1, max: 20, configKey: "queryBuilderDocHintQueryCap", envKey: "QUERY_BUILDER_DOC_HINT_QUERY_CAP", group: "misc", uiCategory: "planner", uiSection: "search-profile", uiGroup: "Query Caps", uiTip: "Maximum queries generated from document hints" },
  { key: "queryBuilderTooltipPhraseCap", type: "int", default: 4, min: 1, max: 20, configKey: "queryBuilderTooltipPhraseCap", envKey: "QUERY_BUILDER_TOOLTIP_PHRASE_CAP", group: "misc", uiCategory: "planner", uiSection: "search-profile", uiGroup: "Synonyms & Aliases", uiTip: "Maximum tooltip phrases included in queries" },
  { key: "queryBuilderLearnedSynonymsCap", type: "int", default: 6, min: 1, max: 30, configKey: "queryBuilderLearnedSynonymsCap", envKey: "QUERY_BUILDER_LEARNED_SYNONYMS_CAP", group: "misc", uiCategory: "planner", uiSection: "search-profile", uiGroup: "Synonyms & Aliases", uiTip: "Maximum learned synonyms used in query building" },
  { key: "queryBuilderFieldSynonymsCap", type: "int", default: 12, min: 1, max: 50, configKey: "queryBuilderFieldSynonymsCap", envKey: "QUERY_BUILDER_FIELD_SYNONYMS_CAP", group: "misc", uiCategory: "planner", uiSection: "search-profile", uiGroup: "Synonyms & Aliases", uiTip: "Maximum field-level synonyms used in query building" },
  { key: "manufacturerPlanUrlCap", type: "int", default: 40, min: 1, max: 200, configKey: "manufacturerPlanUrlCap", envKey: "MANUFACTURER_PLAN_URL_CAP", group: "misc", uiCategory: "planner", uiSection: "search-profile", uiGroup: "Query Caps", uiTip: "Maximum manufacturer URLs generated per host when building plan-only results" },
  { key: "queryDedupeRowsCap", type: "int", default: 24, min: 1, max: 100, configKey: "queryDedupeRowsCap", envKey: "QUERY_DEDUPE_ROWS_CAP", group: "misc", uiCategory: "planner", uiSection: "search-profile", uiGroup: "Query Caps", uiTip: "Maximum deduplicated query rows retained after merging" },

  // Search Execution — Google
  { key: "googleSearchMinIntervalMs", type: "int", default: 4000, min: 0, max: 60000, configKey: "googleSearchMinIntervalMs", envKey: "GOOGLE_SEARCH_MIN_INTERVAL_MS_PACING", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Google Search", uiTip: "Minimum pacing interval between Google searches" },
  { key: "googleSearchPostResultsDelayMs", type: "int", default: 2000, min: 0, max: 30000, configKey: "googleSearchPostResultsDelayMs", envKey: "GOOGLE_SEARCH_POST_RESULTS_DELAY_MS", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Google Search", uiTip: "Delay after receiving Google results before processing" },
  { key: "googleSearchScreenshotQuality", type: "int", default: 35, min: 1, max: 100, configKey: "googleSearchScreenshotQuality", envKey: "GOOGLE_SEARCH_SCREENSHOT_QUALITY", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Google Search", uiTip: "JPEG quality for Google SERP screenshots (1-100)" },
  { key: "googleSearchSerpSelectorWaitMs", type: "int", default: 15000, min: 1000, max: 60000, configKey: "googleSearchSerpSelectorWaitMs", envKey: "GOOGLE_SEARCH_SERP_SELECTOR_WAIT_MS", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Google Search", uiTip: "How long to wait for the Google SERP page to fully load" },
  { key: "googleSearchScrollDelayMs", type: "int", default: 300, min: 0, max: 5000, configKey: "googleSearchScrollDelayMs", envKey: "GOOGLE_SEARCH_SCROLL_DELAY_MS", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Google Search", uiTip: "Delay between scroll actions on Google result pages" },
  { key: "googleSearchResultCap", type: "int", default: 10, min: 1, max: 100, configKey: "googleSearchResultCap", envKey: "GOOGLE_SEARCH_RESULT_CAP", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Google Search", uiTip: "Maximum results to extract per Google search query" },

  // Search Execution — Serper
  { key: "serperSearchMinIntervalMs", type: "int", default: 500, min: 0, max: 30000, configKey: "serperSearchMinIntervalMs", envKey: "SERPER_SEARCH_MIN_INTERVAL_MS", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Serper", uiTip: "Minimum delay between consecutive Serper API calls" },
  { key: "serperSearchRetryBaseMs", type: "int", default: 1000, min: 100, max: 30000, configKey: "serperSearchRetryBaseMs", envKey: "SERPER_SEARCH_RETRY_BASE_MS", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Serper", uiTip: "Base delay for exponential backoff on Serper retries" },
  { key: "serperSearchTimeoutMs", type: "int", default: 10000, min: 1000, max: 120000, configKey: "serperSearchTimeoutMs", envKey: "SERPER_SEARCH_TIMEOUT_MS", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Serper", uiTip: "Timeout for a single Serper API request" },
  { key: "serperSearchMaxRetries", type: "int", default: 3, min: 0, max: 10, configKey: "serperSearchMaxRetries", envKey: "SERPER_SEARCH_MAX_RETRIES", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Serper", uiTip: "Max retries for a single Serper API request" },

  // Search Execution — SearXNG + Brave
  { key: "searxngSearchTimeoutMs", type: "int", default: 8000, min: 1000, max: 60000, configKey: "searxngSearchTimeoutMs", envKey: "SEARXNG_SEARCH_TIMEOUT_MS", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "SearXNG", uiTip: "Timeout for a single SearXNG search request" },
  { key: "braveSearchTimeoutMs", type: "int", default: 8000, min: 1000, max: 60000, configKey: "braveSearchTimeoutMs", envKey: "BRAVE_SEARCH_TIMEOUT_MS", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Brave Search", uiTip: "Timeout for a single Brave Search API request" },
  { key: "braveSearchResultCap", type: "int", default: 20, min: 1, max: 100, configKey: "braveSearchResultCap", envKey: "BRAVE_SEARCH_RESULT_CAP", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Brave Search", uiTip: "Maximum results to extract per Brave search query" },

  // Search Execution — Shared
  { key: "searchPacingJitterFactor", type: "float", default: 0.3, min: 0, max: 1, configKey: "searchPacingJitterFactor", envKey: "SEARCH_PACING_JITTER_FACTOR", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Loop Control", uiTip: "Random jitter added to search pacing delays (0 = none, 1 = up to 100%)" },
  { key: "searchLoopMaxNoProgressRounds", type: "int", default: 2, min: 1, max: 10, configKey: "searchLoopMaxNoProgressRounds", envKey: "SEARCH_LOOP_MAX_NO_PROGRESS_ROUNDS", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Loop Control", uiTip: "Stop the search loop after this many rounds with no new results" },
  { key: "searchLoopMaxLowQualityRounds", type: "int", default: 3, min: 1, max: 10, configKey: "searchLoopMaxLowQualityRounds", envKey: "SEARCH_LOOP_MAX_LOW_QUALITY_ROUNDS", group: "misc", uiCategory: "planner", uiSection: "search-execution", uiGroup: "Loop Control", uiTip: "Stop the search loop after this many rounds of low-quality results" },

  // Fetcher — Browser (Crawlee internals)
  { key: "crawleeMaxRequestRetries", type: "int", default: 1, min: 0, max: 5, configKey: "crawleeMaxRequestRetries", envKey: "CRAWLEE_MAX_REQUEST_RETRIES", group: "runtime", uiCategory: "fetcher", uiSection: "browser", uiGroup: "Crawlee Internals", uiTip: "Max retries for a failed page request in Crawlee" },
  { key: "crawleeMaxPagesPerBrowser", type: "int", default: 1, min: 1, max: 10, configKey: "crawleeMaxPagesPerBrowser", envKey: "CRAWLEE_MAX_PAGES_PER_BROWSER", group: "runtime", uiCategory: "fetcher", uiSection: "browser", uiGroup: "Crawlee Internals", uiTip: "Pages to process before recycling the browser tab" },
  { key: "crawleeBrowserRetirePageCount", type: "int", default: 5, min: 1, max: 50, configKey: "crawleeBrowserRetirePageCount", envKey: "CRAWLEE_BROWSER_RETIRE_PAGE_COUNT", group: "runtime", uiCategory: "fetcher", uiSection: "browser", uiGroup: "Crawlee Internals", uiTip: "Pages before the entire browser instance is retired and relaunched" },
  { key: "crawleeNavigationTimeoutMs", type: "int", default: 12000, min: 1000, max: 120000, configKey: "crawleeNavigationTimeoutMs", envKey: "CRAWLEE_NAVIGATION_TIMEOUT_MS", group: "runtime", uiCategory: "fetcher", uiSection: "browser", uiGroup: "Crawlee Internals", uiTip: "Timeout for initial page navigation (before content loads)" },
  { key: "crawlMaxConcurrentSlots", type: "int", default: 4, min: 1, max: 16, configKey: "crawlMaxConcurrentSlots", envKey: "CRAWL_MAX_CONCURRENT_SLOTS", group: "runtime", uiCategory: "fetcher", uiSection: "browser", uiGroup: "Crawlee Internals", uiTip: "Maximum parallel browser pages during crawl" },
  { key: "autoScrollPostLoadWaitMs", type: "int", default: 200, min: 0, max: 5000, configKey: "autoScrollPostLoadWaitMs", envKey: "AUTO_SCROLL_POST_LOAD_WAIT_MS", group: "misc", uiCategory: "fetcher", uiSection: "browser", uiGroup: "Auto Scroll", uiTip: "Wait time after scroll passes complete before page capture", disabledBy: "autoScrollEnabled" },

  // Extraction — Screenshots
  { key: "capturePageScreenshotMaxSelectors", type: "int", default: 12, min: 1, max: 50, configKey: "capturePageScreenshotMaxSelectors", envKey: "CAPTURE_PAGE_SCREENSHOT_MAX_SELECTORS", group: "runtime", uiCategory: "extraction", uiSection: "screenshots", uiGroup: "Capture Settings", uiTip: "Maximum number of matching selectors to screenshot per page", disabledBy: "capturePageScreenshotEnabled" },

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
