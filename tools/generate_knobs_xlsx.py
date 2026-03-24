"""Generate SPEC_FACTORY_KNOBS.xlsx from the settings registry."""

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# ── Styles ────────────────────────────────────────────────────────────

HEADER_FONT = Font(name="Calibri", bold=True, color="FFFFFF", size=11)
HEADER_FILL = PatternFill(start_color="2F5496", end_color="2F5496", fill_type="solid")
HEADER_ALIGN = Alignment(horizontal="center", vertical="center", wrap_text=True)

SUBHEADER_FILL = PatternFill(start_color="D6E4F0", end_color="D6E4F0", fill_type="solid")
SUBHEADER_FONT = Font(name="Calibri", bold=True, size=10, color="1F3864")

BODY_FONT = Font(name="Calibri", size=10)
BODY_ALIGN = Alignment(vertical="top", wrap_text=True)

SECRET_FILL = PatternFill(start_color="FFF2CC", end_color="FFF2CC", fill_type="solid")
DEPRECATED_FILL = PatternFill(start_color="F2F2F2", end_color="F2F2F2", fill_type="solid")
BOOL_TRUE_FILL = PatternFill(start_color="E2EFDA", end_color="E2EFDA", fill_type="solid")
BOOL_FALSE_FILL = PatternFill(start_color="FCE4EC", end_color="FCE4EC", fill_type="solid")
READONLY_FILL = PatternFill(start_color="EDEDED", end_color="EDEDED", fill_type="solid")

THIN_BORDER = Border(
    left=Side(style="thin", color="B4C6E7"),
    right=Side(style="thin", color="B4C6E7"),
    top=Side(style="thin", color="B4C6E7"),
    bottom=Side(style="thin", color="B4C6E7"),
)

# Tab colors (hex without #)
TAB_COLORS = {
    "Run Setup": "4472C4",
    "Browser Rendering": "5B9BD5",
    "Fetch & Network": "2E75B6",
    "Parsing & Storage": "9DC3E6",
    "Run Output": "70AD47",
    "Automation": "FFC000",
    "Observability": "ED7D31",
    "LLM Global": "7030A0",
    "LLM Phase Overrides": "9966FF",
    "LLM Provider Registry": "BF8FFF",
    "Storage Settings": "A5A5A5",
    "UI Settings": "00B0F0",
    "Convergence": "FF6699",
    "Not in GUI": "C00000",
}

COLUMNS = ["Key", "Type", "Default", "Min", "Max", "Env Var", "Config Key", "Aliases", "Flags", "Description"]
COL_WIDTHS = [38, 10, 32, 12, 14, 40, 34, 24, 22, 52]

# ── Knob data ─────────────────────────────────────────────────────────

# Each entry: (key, type, default, min, max, envKey, configKey, aliases, flags, description)

RUN_SETUP = [
    ("maxRunSeconds", "int", 480, 30, 86400, "MAX_RUN_SECONDS", "maxRunSeconds", "", "", "Maximum wall-clock seconds per pipeline run"),
    ("serperEnabled", "bool", True, "", "", "SERPER_ENABLED", "serperEnabled", "", "", "Enable Serper.dev as a search provider"),
    ("serperApiKey", "string", "", "", "", "SERPER_API_KEY", "serperApiKey", "", "", "Serper.dev API key"),
    ("searchEngines", "csv_enum", "google", "", "", "SEARCH_ENGINES", "searchEngines", "searchProvider", "allowed: google, bing, google-proxy, duckduckgo, brave", "Primary search engine(s), comma-separated"),
    ("searchEnginesFallback", "csv_enum", "bing", "", "", "SEARCH_ENGINES_FALLBACK", "searchEnginesFallback", "", "allowed: google, bing, google-proxy, duckduckgo, brave", "Fallback search engine(s)"),
    ("searxngBaseUrl", "string", "http://127.0.0.1:8080", "", "", "SEARXNG_BASE_URL", "searxngBaseUrl", "", "", "SearXNG instance base URL"),
    ("searchMaxRetries", "int", 3, 0, 5, "SEARCH_MAX_RETRIES", "searchMaxRetries", "", "", "Max retries for search engine queries"),
    ("googleSearchProxyUrlsJson", "string", '[\"http://...:80\"]', "", "", "", "googleSearchProxyUrlsJson", "", "", "JSON array of Google Search proxy URLs"),
    ("googleSearchScreenshotsEnabled", "bool", True, "", "", "GOOGLE_SEARCH_SCREENSHOTS_ENABLED", "googleSearchScreenshotsEnabled", "", "", "Capture SERP screenshots during Google Search"),
    ("googleSearchTimeoutMs", "int", 30000, 30000, 120000, "GOOGLE_SEARCH_TIMEOUT_MS", "googleSearchTimeoutMs", "", "", "Timeout for Google Search requests (ms)"),
    ("googleSearchMinQueryIntervalMs", "int", 1000, 0, 60000, "GOOGLE_SEARCH_MIN_QUERY_INTERVAL_MS", "googleSearchMinQueryIntervalMs", "", "", "Minimum interval between Google queries (ms)"),
    ("maxPagesPerDomain", "int", 5, 1, 100, "MAX_PAGES_PER_DOMAIN", "maxPagesPerDomain", "", "", "Max pages crawled per domain per product"),
    ("searchProfileQueryCap", "int", 10, 1, 100, "SEARCH_PROFILE_QUERY_CAP", "searchProfileQueryCap", "", "", "Max search queries generated per run"),
    ("serpSelectorUrlCap", "int", 50, 1, 500, "SERP_SELECTOR_URL_CAP", "serpSelectorUrlCap", "", "", "Max URLs selected from SERP results"),
    ("domainClassifierUrlCap", "int", 50, 1, 500, "DOMAIN_CLASSIFIER_URL_CAP", "domainClassifierUrlCap", "", "", "Max URLs fed to domain classifier"),
    ("llmEnhancerMaxRetries", "int", 2, 1, 5, "LLM_ENHANCER_MAX_RETRIES", "llmEnhancerMaxRetries", "", "", "Max LLM query enhancement retries"),
    ("maxJsonBytes", "int", 6000000, 1024, 100000000, "MAX_JSON_BYTES", "maxJsonBytes", "", "", "Max JSON response body size (bytes)"),
    ("userAgent", "string", "Mozilla/5.0 (Windows NT 10.0; ...)", "", "", "USER_AGENT", "userAgent", "", "", "HTTP User-Agent header for all requests"),
    ("pipelineSchemaEnforcementMode", "enum", "warn", "", "", "PIPELINE_SCHEMA_ENFORCEMENT_MODE", "pipelineSchemaEnforcementMode", "", "allowed: off, warn, enforce", "Pipeline context Zod schema enforcement mode"),
    ("resumeMode", "enum", "auto", "", "", "INDEXING_RESUME_MODE", "indexingResumeMode", "", "allowed: auto, force_resume, start_over", "Pipeline resume strategy on restart"),
    ("resumeWindowHours", "int", 48, 1, 8760, "INDEXING_RESUME_MAX_AGE_HOURS", "indexingResumeMaxAgeHours", "", "", "Max age of prior run data for resume (hours)"),
    ("reextractIndexed", "bool", True, "", "", "INDEXING_REEXTRACT_ENABLED", "indexingReextractEnabled", "", "", "Re-extract previously indexed products"),
    ("reextractAfterHours", "int", 24, 1, 8760, "INDEXING_REEXTRACT_AFTER_HOURS", "indexingReextractAfterHours", "", "", "Min hours before re-extraction is triggered"),
]

BROWSER_RENDERING = [
    ("dynamicCrawleeEnabled", "bool", True, "", "", "DYNAMIC_CRAWLEE_ENABLED", "dynamicCrawleeEnabled", "", "master switch", "Enable Crawlee-based dynamic (browser) fetching"),
    ("crawleeHeadless", "bool", True, "", "", "CRAWLEE_HEADLESS", "crawleeHeadless", "", "", "Run Crawlee browser in headless mode"),
    ("crawleeRequestHandlerTimeoutSecs", "int", 75, 0, 300, "CRAWLEE_REQUEST_HANDLER_TIMEOUT_SECS", "crawleeRequestHandlerTimeoutSecs", "", "", "Crawlee per-request handler timeout (sec)"),
    ("dynamicFetchRetryBudget", "int", 1, 0, 5, "DYNAMIC_FETCH_RETRY_BUDGET", "dynamicFetchRetryBudget", "", "", "Max retries for dynamic fetch failures"),
    ("dynamicFetchRetryBackoffMs", "int", 2500, 0, 30000, "DYNAMIC_FETCH_RETRY_BACKOFF_MS", "dynamicFetchRetryBackoffMs", "", "", "Backoff between dynamic fetch retries (ms)"),
    ("dynamicFetchPolicyMapJson", "string", "", "", "", "DYNAMIC_FETCH_POLICY_MAP_JSON", "dynamicFetchPolicyMapJson", "", "", "JSON map of domain-specific dynamic fetch policies"),
    ("autoScrollEnabled", "bool", True, "", "", "AUTO_SCROLL_ENABLED", "autoScrollEnabled", "", "", "Auto-scroll pages to trigger lazy content"),
    ("autoScrollPasses", "int", 2, 0, 20, "AUTO_SCROLL_PASSES", "autoScrollPasses", "", "", "Number of scroll passes per page"),
    ("autoScrollDelayMs", "int", 1200, 0, 10000, "AUTO_SCROLL_DELAY_MS", "autoScrollDelayMs", "", "", "Delay between scroll passes (ms)"),
    ("robotsTxtCompliant", "bool", True, "", "", "ROBOTS_TXT_COMPLIANT", "robotsTxtCompliant", "", "", "Respect robots.txt directives"),
    ("robotsTxtTimeoutMs", "int", 6000, 100, 120000, "ROBOTS_TXT_TIMEOUT_MS", "robotsTxtTimeoutMs", "", "", "Timeout for robots.txt fetch (ms)"),
    ("capturePageScreenshotEnabled", "bool", True, "", "", "CAPTURE_PAGE_SCREENSHOT_ENABLED", "capturePageScreenshotEnabled", "", "master switch", "Capture page screenshots during crawl"),
    ("capturePageScreenshotFormat", "string", "jpeg", "", "", "CAPTURE_PAGE_SCREENSHOT_FORMAT", "capturePageScreenshotFormat", "", "", "Screenshot image format (jpeg/png)"),
    ("capturePageScreenshotQuality", "int", 50, 1, 100, "CAPTURE_PAGE_SCREENSHOT_QUALITY", "capturePageScreenshotQuality", "", "", "Screenshot JPEG quality (1-100)"),
    ("capturePageScreenshotMaxBytes", "int", 5000000, 1024, 100000000, "CAPTURE_PAGE_SCREENSHOT_MAX_BYTES", "capturePageScreenshotMaxBytes", "", "", "Max screenshot file size (bytes)"),
    ("capturePageScreenshotSelectors", "string", "table,[data-spec-table],...", "", "", "CAPTURE_PAGE_SCREENSHOT_SELECTORS", "capturePageScreenshotSelectors", "", "", "CSS selectors for targeted screenshots"),
]

FETCH_NETWORK = [
    ("fetchConcurrency", "int", 4, 1, 64, "CONCURRENCY", "concurrency", "", "", "Max concurrent fetch requests globally"),
    ("perHostMinDelayMs", "int", 1500, 0, 120000, "PER_HOST_MIN_DELAY_MS", "perHostMinDelayMs", "", "", "Minimum delay between requests to same host (ms)"),
    ("fetchBudgetMs", "int", 45000, 5000, 300000, "FETCH_BUDGET_MS", "fetchBudgetMs", "", "", "Total time budget for fetch phase (ms)"),
    ("domainRequestRps", "int", 0, 0, 100, "DOMAIN_REQUEST_RPS", "domainRequestRps", "", "0 = unlimited", "Per-domain rate limit (requests/sec)"),
    ("domainRequestBurst", "int", 0, 0, 1000, "DOMAIN_REQUEST_BURST", "domainRequestBurst", "", "0 = unlimited", "Per-domain burst allowance"),
    ("globalRequestRps", "int", 0, 0, 100, "GLOBAL_REQUEST_RPS", "globalRequestRps", "", "0 = unlimited", "Global rate limit (requests/sec)"),
    ("globalRequestBurst", "int", 0, 0, 1000, "GLOBAL_REQUEST_BURST", "globalRequestBurst", "", "0 = unlimited", "Global burst allowance"),
    ("fetchPerHostConcurrencyCap", "int", 1, 1, 64, "FETCH_PER_HOST_CONCURRENCY_CAP", "fetchPerHostConcurrencyCap", "", "", "Max concurrent fetches to a single host"),
    ("preferHttpFetcher", "bool", True, "", "", "PREFER_HTTP_FETCHER", "preferHttpFetcher", "", "", "Prefer lightweight HTTP fetch over browser"),
    ("pageGotoTimeoutMs", "int", 12000, 0, 120000, "PAGE_GOTO_TIMEOUT_MS", "pageGotoTimeoutMs", "", "", "Browser page.goto() timeout (ms)"),
    ("pageNetworkIdleTimeoutMs", "int", 2000, 0, 60000, "PAGE_NETWORK_IDLE_TIMEOUT_MS", "pageNetworkIdleTimeoutMs", "", "", "Wait for network idle after load (ms)"),
    ("postLoadWaitMs", "int", 200, 0, 60000, "POST_LOAD_WAIT_MS", "postLoadWaitMs", "", "", "Extra wait after page load complete (ms)"),
    ("frontierDbPath", "string", "_intel/frontier/frontier.json", "", "", "FRONTIER_DB_PATH", "frontierDbPath", "", "", "Path to frontier persistence file"),
    ("frontierQueryCooldownSeconds", "int", 21600, 0, 31536000, "FRONTIER_QUERY_COOLDOWN_SECONDS", "frontierQueryCooldownSeconds", "", "", "Cooldown before re-querying same search (sec)"),
    ("repairDedupeRule", "enum", "domain_once", "", "", "REPAIR_DEDUPE_RULE", "repairDedupeRule", "", "allowed: domain_once, domain_and_status, none", "Deduplication rule for repair search queries"),
    ("frontierStripTrackingParams", "bool", True, "", "", "FRONTIER_STRIP_TRACKING_PARAMS", "frontierStripTrackingParams", "", "", "Strip UTM/tracking params from frontier URLs"),
    ("frontierCooldown404Seconds", "int", 259200, 0, 31536000, "FRONTIER_COOLDOWN_404", "frontierCooldown404Seconds", "", "", "Cooldown after first 404 (sec) — 3 days default"),
    ("frontierCooldown404RepeatSeconds", "int", 1209600, 0, 31536000, "FRONTIER_COOLDOWN_404_REPEAT", "frontierCooldown404RepeatSeconds", "", "", "Cooldown after repeated 404 (sec) — 14 days default"),
    ("frontierCooldown410Seconds", "int", 7776000, 0, 31536000, "FRONTIER_COOLDOWN_410", "frontierCooldown410Seconds", "", "", "Cooldown after 410 Gone (sec) — 90 days default"),
    ("frontierCooldownTimeoutSeconds", "int", 21600, 0, 31536000, "FRONTIER_COOLDOWN_TIMEOUT", "frontierCooldownTimeoutSeconds", "", "", "Cooldown after fetch timeout (sec) — 6 hours default"),
    ("frontierCooldown403BaseSeconds", "int", 1800, 0, 86400, "FRONTIER_COOLDOWN_403_BASE", "frontierCooldown403BaseSeconds", "", "", "Base cooldown after 403 Forbidden (sec)"),
    ("frontierCooldown429BaseSeconds", "int", 600, 0, 86400, "FRONTIER_COOLDOWN_429_BASE", "frontierCooldown429BaseSeconds", "", "", "Base cooldown after 429 Rate Limited (sec)"),
    ("frontierBackoffMaxExponent", "int", 4, 1, 12, "FRONTIER_BACKOFF_MAX_EXPONENT", "frontierBackoffMaxExponent", "", "", "Max exponential backoff exponent for frontier retries"),
    ("frontierPathPenaltyNotfoundThreshold", "int", 3, 1, 50, "FRONTIER_PATH_PENALTY_NOTFOUND_THRESHOLD", "frontierPathPenaltyNotfoundThreshold", "", "", "404 count before penalizing entire URL path pattern"),
    ("frontierBlockedDomainThreshold", "int", 1, 1, 50, "FRONTIER_BLOCKED_DOMAIN_THRESHOLD", "frontierBlockedDomainThreshold", "", "", "Block count before domain is blacklisted"),
]

PARSING = [
    ("specDbDir", "string", ".specfactory_tmp", "", "", "SPEC_DB_DIR", "specDbDir", "", "", "Directory for local SpecDb SQLite database"),
]

RUN_OUTPUT = [
    ("outputMode", "enum", "local", "", "", "OUTPUT_MODE", "outputMode", "", "allowed: local, dual, s3", "Where pipeline outputs are written"),
    ("localMode", "bool", True, "", "", "LOCAL_MODE", "localMode", "", "", "Run in local filesystem mode"),
    ("dryRun", "bool", False, "", "", "DRY_RUN", "dryRun", "", "", "Simulate pipeline without writing outputs"),
    ("localInputRoot", "string", "fixtures/s3", "", "", "LOCAL_INPUT_ROOT", "localInputRoot", "", "", "Root directory for local input files"),
    ("localOutputRoot", "string", "", "", "", "", "localOutputRoot", "", "", "Root directory for local output files (dynamic default)"),
    ("runtimeEventsKey", "string", "_runtime/events.jsonl", "", "", "RUNTIME_EVENTS_KEY", "runtimeEventsKey", "", "", "Path for runtime NDJSON event log"),
    ("writeMarkdownSummary", "bool", True, "", "", "WRITE_MARKDOWN_SUMMARY", "writeMarkdownSummary", "", "", "Write human-readable markdown run summary"),
    ("runtimeControlFile", "string", "_runtime/control/runtime_overrides.json", "", "", "RUNTIME_CONTROL_FILE", "runtimeControlFile", "", "", "Path to runtime override control file"),
    ("mirrorToS3", "bool", False, "", "", "MIRROR_TO_S3", "mirrorToS3", "", "", "Mirror output artifacts to S3"),
    ("mirrorToS3Input", "bool", False, "", "", "MIRROR_TO_S3_INPUT", "mirrorToS3Input", "", "", "Mirror input artifacts to S3"),
    ("s3InputPrefix", "string", "specs/inputs", "", "", "S3_INPUT_PREFIX", "s3InputPrefix", "", "", "S3 key prefix for input files"),
    ("s3OutputPrefix", "string", "specs/outputs", "", "", "S3_OUTPUT_PREFIX", "s3OutputPrefix", "", "", "S3 key prefix for output files"),
    ("awsRegion", "string", "us-east-2", "", "", "AWS_REGION", "awsRegion", "", "readOnly", "AWS region for S3 operations"),
    ("s3Bucket", "string", "my-spec-harvester-data", "", "", "S3_BUCKET", "s3Bucket", "", "readOnly", "S3 bucket name"),
]

AUTOMATION = [
    ("driftDetectionEnabled", "bool", True, "", "", "DRIFT_DETECTION_ENABLED", "driftDetectionEnabled", "", "master switch", "Enable drift detection for stale products"),
    ("driftPollSeconds", "int", 86400, 60, 604800, "DRIFT_POLL_SECONDS", "driftPollSeconds", "", "", "Interval between drift detection scans (sec)"),
    ("driftScanMaxProducts", "int", 250, 1, 10000, "DRIFT_SCAN_MAX_PRODUCTS", "driftScanMaxProducts", "", "", "Max products per drift scan batch"),
    ("driftAutoRepublish", "bool", True, "", "", "DRIFT_AUTO_REPUBLISH", "driftAutoRepublish", "", "", "Auto-republish products when drift detected"),
    ("reCrawlStaleAfterDays", "int", 30, 1, 3650, "RECRAWL_STALE_AFTER_DAYS", "reCrawlStaleAfterDays", "", "", "Days before a product is considered stale"),
    ("selfImproveEnabled", "bool", True, "", "", "SELF_IMPROVE_ENABLED", "selfImproveEnabled", "", "master switch", "Enable self-improvement learning loop"),
    ("batchStrategy", "string", "bandit", "", "", "BATCH_STRATEGY", "batchStrategy", "", "", "Batch selection strategy (bandit/fifo/random)"),
    ("fieldRewardHalfLifeDays", "int", 45, 1, 365, "FIELD_REWARD_HALF_LIFE_DAYS", "fieldRewardHalfLifeDays", "", "", "Exponential decay half-life for field reward scores"),
    ("maxHypothesisItems", "int", 120, 1, 1000, "MAX_HYPOTHESIS_ITEMS", "maxHypothesisItems", "", "", "Max hypothesis items per learning cycle"),
    ("endpointSignalLimit", "int", 120, 1, 500, "ENDPOINT_SIGNAL_LIMIT", "endpointSignalLimit", "", "", "Max signals stored per endpoint"),
    ("endpointSuggestionLimit", "int", 36, 1, 200, "ENDPOINT_SUGGESTION_LIMIT", "endpointSuggestionLimit", "", "", "Max endpoint suggestions surfaced"),
    ("endpointNetworkScanLimit", "int", 1800, 50, 10000, "ENDPOINT_NETWORK_SCAN_LIMIT", "endpointNetworkScanLimit", "", "", "Max endpoints scanned per network pass"),
    ("categoryAuthorityEnabled", "bool", True, "", "", "HELPER_FILES_ENABLED", "categoryAuthorityEnabled", "helperFilesEnabled", "master switch", "Enable category authority / helper files"),
    ("categoryAuthorityRoot", "string", "category_authority", "", "", "CATEGORY_AUTHORITY_ROOT", "categoryAuthorityRoot", "helperFilesRoot", "", "Root directory for category authority files"),
    ("helperSupportiveFillMissing", "bool", True, "", "", "HELPER_SUPPORTIVE_FILL_MISSING", "helperSupportiveFillMissing", "", "", "Fill missing fields from supportive helper data"),
    ("daemonConcurrency", "int", 1, 1, 128, "DAEMON_CONCURRENCY", "daemonConcurrency", "", "", "Concurrent product runs in daemon mode"),
    ("indexingResumeSeedLimit", "int", 24, 1, 10000, "INDEXING_RESUME_SEED_LIMIT", "indexingResumeSeedLimit", "", "", "Max seed URLs loaded from resume checkpoint"),
    ("indexingResumePersistLimit", "int", 160, 1, 100000, "INDEXING_RESUME_PERSIST_LIMIT", "indexingResumePersistLimit", "", "", "Max URLs persisted in resume checkpoint"),
    ("importsRoot", "string", "imports", "", "", "IMPORTS_ROOT", "importsRoot", "", "", "Root directory for import watch folder"),
    ("importsPollSeconds", "int", 10, 1, 3600, "IMPORTS_POLL_SECONDS", "importsPollSeconds", "", "", "Poll interval for new imports (sec)"),
]

OBSERVABILITY = [
    ("runtimeTraceEnabled", "bool", True, "", "", "RUNTIME_TRACE_ENABLED", "runtimeTraceEnabled", "", "master switch", "Enable runtime tracing (fetch + LLM ring buffers)"),
    ("runtimeTraceFetchRing", "int", 30, 10, 2000, "RUNTIME_TRACE_FETCH_RING", "runtimeTraceFetchRing", "", "", "Fetch trace ring buffer size"),
    ("runtimeTraceLlmRing", "int", 50, 10, 2000, "RUNTIME_TRACE_LLM_RING", "runtimeTraceLlmRing", "", "", "LLM trace ring buffer size"),
    ("runtimeTraceLlmPayloads", "bool", True, "", "", "RUNTIME_TRACE_LLM_PAYLOADS", "runtimeTraceLlmPayloads", "", "", "Include full LLM payloads in trace"),
    ("eventsJsonWrite", "bool", True, "", "", "EVENTS_JSON_WRITE", "eventsJsonWrite", "", "", "Write events to NDJSON log file"),
    ("runtimeScreencastEnabled", "bool", True, "", "", "RUNTIME_SCREENCAST_ENABLED", "runtimeScreencastEnabled", "", "master switch", "Enable live browser screencast stream"),
    ("runtimeScreencastFps", "int", 10, 1, 60, "RUNTIME_SCREENCAST_FPS", "runtimeScreencastFps", "", "", "Screencast frames per second"),
    ("runtimeScreencastQuality", "int", 50, 10, 100, "RUNTIME_SCREENCAST_QUALITY", "runtimeScreencastQuality", "", "", "Screencast JPEG quality"),
    ("runtimeScreencastMaxWidth", "int", 1280, 320, 3840, "RUNTIME_SCREENCAST_MAX_WIDTH", "runtimeScreencastMaxWidth", "", "", "Screencast max frame width (px)"),
    ("runtimeScreencastMaxHeight", "int", 720, 240, 2160, "RUNTIME_SCREENCAST_MAX_HEIGHT", "runtimeScreencastMaxHeight", "", "", "Screencast max frame height (px)"),
]

LLM_GLOBAL = [
    ("llmModelPlan", "string", "gemini-2.5-flash", "", "", "LLM_MODEL_PLAN", "llmModelPlan", "phase2LlmModel", "policyGroup: models", "Primary LLM model for planning phases"),
    ("llmModelReasoning", "string", "deepseek-reasoner", "", "", "LLM_MODEL_REASONING", "llmModelReasoning", "", "policyGroup: models", "LLM model for reasoning-intensive phases"),
    ("llmPlanFallbackModel", "string", "deepseek-chat", "", "", "LLM_PLAN_FALLBACK_MODEL", "llmPlanFallbackModel", "", "policyGroup: models", "Fallback model when plan model fails"),
    ("llmReasoningFallbackModel", "string", "gemini-2.5-pro", "", "", "LLM_REASONING_FALLBACK_MODEL", "llmReasoningFallbackModel", "", "policyGroup: models", "Fallback model when reasoning model fails"),
    ("llmMaxOutputTokens", "int", 1400, 128, 262144, "LLM_MAX_OUTPUT_TOKENS", "llmMaxOutputTokens", "", "policyGroup: tokens", "Default max output tokens (global fallback)"),
    ("llmCostInputPer1M", "float", 1.25, 0, 1000, "LLM_COST_INPUT_PER_1M", "llmCostInputPer1M", "", "policyGroup: budget", "Cost per 1M input tokens (USD) — synced from provider"),
    ("llmCostOutputPer1M", "float", 10, 0, 1000, "LLM_COST_OUTPUT_PER_1M", "llmCostOutputPer1M", "", "policyGroup: budget", "Cost per 1M output tokens (USD) — synced from provider"),
    ("llmCostCachedInputPer1M", "float", 0.125, 0, 1000, "LLM_COST_CACHED_INPUT_PER_1M", "llmCostCachedInputPer1M", "", "policyGroup: budget", "Cost per 1M cached input tokens (USD)"),
    ("llmMonthlyBudgetUsd", "float", 300, 0, 100000, "LLM_MONTHLY_BUDGET_USD", "llmMonthlyBudgetUsd", "", "policyGroup: budget", "Monthly LLM spend budget (USD)"),
    ("llmPerProductBudgetUsd", "float", 0.35, 0, 1000, "LLM_PER_PRODUCT_BUDGET_USD", "llmPerProductBudgetUsd", "", "policyGroup: budget", "Max LLM spend per product run (USD)"),
    ("llmMaxCallsPerProductTotal", "int", 14, 1, 100, "LLM_MAX_CALLS_PER_PRODUCT_TOTAL", "llmMaxCallsPerProductTotal", "", "", "Max total LLM calls per product"),
    ("llmMaxCallsPerRound", "int", 5, 1, 200, "LLM_MAX_CALLS_PER_ROUND", "llmMaxCallsPerRound", "", "", "Max LLM calls per processing round"),
    ("llmReasoningBudget", "int", 32768, 128, 262144, "LLM_REASONING_BUDGET", "llmReasoningBudget", "", "policyGroup: reasoning", "Token budget for reasoning chains"),
    ("llmTimeoutMs", "int", 30000, 1000, 600000, "LLM_TIMEOUT_MS", "llmTimeoutMs", "", "policyGroup: _topLevel", "LLM API request timeout (ms)"),
    ("anthropicApiKey", "string", "", "", "", "ANTHROPIC_API_KEY", "anthropicApiKey", "", "secret, policyGroup: apiKeys", "Anthropic API key"),
    ("openaiApiKey", "string", "", "", "", "OPENAI_API_KEY", "openaiApiKey", "", "secret, policyGroup: apiKeys", "OpenAI API key"),
    ("geminiApiKey", "string", "", "", "", "GEMINI_API_KEY", "geminiApiKey", "", "secret, policyGroup: apiKeys", "Google Gemini API key"),
    ("deepseekApiKey", "string", "", "", "", "DEEPSEEK_API_KEY", "deepseekApiKey", "", "secret, policyGroup: apiKeys", "DeepSeek API key"),
    ("llmPlanApiKey", "string", "", "", "", "LLM_PLAN_API_KEY", "llmPlanApiKey", "", "secret, policyGroup: apiKeys", "Override API key for plan-phase model"),
]

LLM_PHASE_OVERRIDES = [
    ("llmMaxOutputTokensPlan", "int", 4096, 128, 262144, "LLM_MAX_OUTPUT_TOKENS_PLAN", "llmMaxOutputTokensPlan", "llmTokensPlan", "tokenClamped, policyGroup: tokens", "Max output tokens for plan phases"),
    ("llmMaxOutputTokensPlanFallback", "int", 2048, 128, 262144, "LLM_MAX_OUTPUT_TOKENS_PLAN_FALLBACK", "llmMaxOutputTokensPlanFallback", "llmTokensPlanFallback", "tokenClamped, policyGroup: tokens", "Max output tokens for plan fallback model"),
    ("llmMaxOutputTokensTriage", "int", 20000, 20000, 262144, "LLM_MAX_OUTPUT_TOKENS_TRIAGE", "llmMaxOutputTokensTriage", "llmTokensTriage", "tokenClamped", "Max output tokens for triage phase"),
    ("llmMaxOutputTokensReasoning", "int", 4096, 128, 262144, "LLM_MAX_OUTPUT_TOKENS_REASONING", "llmMaxOutputTokensReasoning", "llmTokensReasoning", "tokenClamped, policyGroup: tokens", "Max output tokens for reasoning phases"),
    ("llmMaxOutputTokensReasoningFallback", "int", 2048, 128, 262144, "LLM_MAX_OUTPUT_TOKENS_REASONING_FALLBACK", "llmMaxOutputTokensReasoningFallback", "llmTokensReasoningFallback", "tokenClamped, policyGroup: tokens", "Max output tokens for reasoning fallback"),
    ("llmPlanUseReasoning", "bool", False, "", "", "LLM_PLAN_USE_REASONING", "llmPlanUseReasoning", "", "policyGroup: reasoning", "Enable reasoning chain for plan-phase LLM calls"),
    ("llmPhaseOverridesJson", "string", "{}", "", "", "", "llmPhaseOverridesJson", "", "policyGroup: _json", "JSON blob of per-phase model/token overrides (managed by GUI)"),
    ("llmReasoningMode", "bool", True, "", "", "LLM_REASONING_MODE", "llmReasoningMode", "", "policyGroup: reasoning", "Global reasoning mode toggle"),
]

LLM_PROVIDER_REGISTRY = [
    ("llmProviderRegistryJson", "string", "(large JSON default)", "", "", "", "llmProviderRegistryJson", "", "policyGroup: _json", "JSON array of LLM provider configs (Gemini, DeepSeek, Anthropic, OpenAI)"),
    ("llmProvider", "string", "gemini", "", "", "LLM_PROVIDER", "llmProvider", "", "policyGroup: provider", "Active LLM provider ID"),
    ("llmBaseUrl", "string", "https://generativelanguage.googleapis.com/v1beta/openai", "", "", "LLM_BASE_URL", "llmBaseUrl", "", "policyGroup: provider", "Base URL for primary LLM provider"),
    ("llmPlanBaseUrl", "string", "https://generativelanguage.googleapis.com/v1beta/openai", "", "", "LLM_PLAN_BASE_URL", "llmPlanBaseUrl", "", "policyGroup: provider", "Base URL for plan-phase LLM provider"),
    ("llmPlanProvider", "string", "gemini", "", "", "LLM_PLAN_PROVIDER", "llmPlanProvider", "", "policyGroup: provider", "Provider for plan-phase LLM calls"),
]

STORAGE_SETTINGS = [
    ("enabled", "bool", False, "", "", "", "", "", "mutable", "Enable persistent storage for run artifacts"),
    ("destinationType", "enum", "local", "", "", "", "", "", "mutable; allowed: local, s3", "Storage destination type"),
    ("localDirectory", "string", "", "", "", "", "", "", "mutable", "Local directory for storage output"),
    ("awsRegion", "string", "us-east-2", "", "", "", "", "", "mutable", "AWS region for S3 storage"),
    ("s3Bucket", "string", "", "", "", "", "", "", "mutable", "S3 bucket for storage output"),
    ("s3Prefix", "string", "spec-factory-runs", "", "", "", "", "", "mutable", "S3 key prefix for stored artifacts"),
    ("s3AccessKeyId", "string", "", "", "", "", "", "", "mutable", "AWS access key ID for S3"),
    ("s3SecretAccessKey", "string", "", "", "", "", "", "", "secret, mutable, clearFlag", "AWS secret access key for S3"),
    ("s3SessionToken", "string", "", "", "", "", "", "", "secret, mutable, clearFlag", "AWS session token (for temporary credentials)"),
    ("updatedAt", "string_or_null", "null", "", "", "", "", "", "computed", "Timestamp of last storage settings update"),
]

UI_SETTINGS = [
    ("studioAutoSaveAllEnabled", "bool", False, "", "", "", "", "", "mutable", "Auto-save all fields in Studio workbench"),
    ("studioAutoSaveEnabled", "bool", True, "", "", "", "", "", "mutable", "Auto-save Studio priority edits"),
    ("studioAutoSaveMapEnabled", "bool", True, "", "", "", "", "", "mutable", "Auto-save Studio field map changes"),
    ("runtimeAutoSaveEnabled", "bool", True, "", "", "", "", "", "mutable", "Auto-save runtime settings changes"),
    ("storageAutoSaveEnabled", "bool", False, "", "", "", "", "", "mutable", "Auto-save storage settings changes"),
]

CONVERGENCE = [
    ("serpTriageMinScore", "int", 3, 1, 10, "", "", "", "", "Minimum SERP triage score for URL admission"),
]

NOT_IN_GUI = [
    ("crawlSessionCount", "int", 4, 1, 20, "CRAWL_SESSION_COUNT", "crawlSessionCount", "", "", "Number of parallel crawl browser sessions"),
    ("fetchCandidateSources", "bool", True, "", "", "", "fetchCandidateSources", "", "deprecated, defaultsOnly", "Always true — legacy knob kept for backward compat"),
    ("googleSearchMaxRetries", "int", 1, 0, 3, "GOOGLE_SEARCH_MAX_RETRIES", "googleSearchMaxRetries", "", "", "Max retries for Google Search specifically"),
    ("indexingCategoryAuthorityEnabled", "bool", False, "", "", "INDEXING_HELPER_FILES_ENABLED", "indexingCategoryAuthorityEnabled", "indexingHelperFilesEnabled", "", "Per-indexing-run category authority toggle (mirrors categoryAuthorityEnabled)"),
    ("llmMaxTokens", "int", 16384, 128, 262144, "LLM_MAX_TOKENS", "llmMaxTokens", "", "policyGroup: tokens", "Global max context token window"),
    ("llmExtractionCacheDir", "string", ".specfactory_tmp/llm_cache", "", "", "LLM_EXTRACTION_CACHE_DIR", "llmExtractionCacheDir", "", "", "Directory for LLM extraction response cache"),
    ("maxCandidateUrls", "int", 80, 1, 5000, "MAX_CANDIDATE_URLS", "maxCandidateUrls", "", "", "Max candidate URLs per product (discovery cap)"),
    ("maxPdfBytes", "int", 30000000, 1024, 100000000, "MAX_PDF_BYTES", "maxPdfBytes", "", "", "Max PDF file size accepted for processing (bytes)"),
    ("maxUrlsPerProduct", "int", 50, 1, 1000, "MAX_URLS_PER_PRODUCT", "maxUrlsPerProduct", "", "", "Max URLs fetched per product run"),
    ("parsingConfidenceBaseMapJson", "string", "", "", "", "", "parsingConfidenceBaseMapJson", "", "routeOnly", "JSON map of base parsing confidence scores per field"),
    ("searxngMinQueryIntervalMs", "int", 3000, 0, 30000, "SEARXNG_MIN_QUERY_INTERVAL_MS", "searxngMinQueryIntervalMs", "", "", "Minimum interval between SearXNG queries (ms)"),
    ("discoveryEnabled", "bool", True, "", "", "DISCOVERY_ENABLED", "discoveryEnabled", "", "defaultsOnly", "Master switch for search discovery phase"),
    ("daemonGracefulShutdownTimeoutMs", "int", 30000, "", "", "", "daemonGracefulShutdownTimeoutMs", "", "defaultsOnly", "Timeout for graceful daemon shutdown (ms)"),
    ("frontierRepairSearchEnabled", "bool", True, "", "", "", "frontierRepairSearchEnabled", "", "defaultsOnly", "Enable repair search for frontier URLs"),
]

# ── Sheet builder ─────────────────────────────────────────────────────

def style_sheet(ws, rows, tab_name):
    """Apply styling to a worksheet."""
    ws.sheet_properties.tabColor = TAB_COLORS.get(tab_name, "808080")
    ws.freeze_panes = "A2"

    # Set column widths
    for i, w in enumerate(COL_WIDTHS, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    # Header row
    for col_idx, header in enumerate(COLUMNS, 1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = HEADER_ALIGN
        cell.border = THIN_BORDER

    # Data rows
    for row_idx, row_data in enumerate(rows, 2):
        for col_idx, value in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=str(value) if value != "" else "")
            cell.font = BODY_FONT
            cell.alignment = BODY_ALIGN
            cell.border = THIN_BORDER

            # Conditional styling
            flags = str(row_data[8]).lower() if len(row_data) > 8 else ""
            dtype = str(row_data[1]).lower() if len(row_data) > 1 else ""
            default_val = row_data[2] if len(row_data) > 2 else ""

            if "secret" in flags:
                cell.fill = SECRET_FILL
            elif "deprecated" in flags:
                cell.fill = DEPRECATED_FILL
            elif "readonly" in flags.lower():
                cell.fill = READONLY_FILL
            elif col_idx == 3 and dtype == "bool":
                if default_val is True or str(default_val).lower() == "true":
                    cell.fill = BOOL_TRUE_FILL
                elif default_val is False or str(default_val).lower() == "false":
                    cell.fill = BOOL_FALSE_FILL

    ws.auto_filter.ref = f"A1:{get_column_letter(len(COLUMNS))}{len(rows) + 1}"


def add_summary_sheet(wb, all_tabs):
    """Add a summary/overview sheet as the first tab."""
    ws = wb.create_sheet("Overview", 0)
    ws.sheet_properties.tabColor = "000000"

    title_font = Font(name="Calibri", bold=True, size=16, color="2F5496")
    subtitle_font = Font(name="Calibri", bold=True, size=12, color="404040")
    stat_font = Font(name="Calibri", size=11)
    stat_bold = Font(name="Calibri", bold=True, size=11)

    ws.column_dimensions["A"].width = 4
    ws.column_dimensions["B"].width = 30
    ws.column_dimensions["C"].width = 14
    ws.column_dimensions["D"].width = 50

    row = 2
    ws.cell(row=row, column=2, value="Spec Factory — Runtime Knobs Reference").font = title_font
    row += 1
    ws.cell(row=row, column=2, value="Generated from RUNTIME_SETTINGS_REGISTRY (SSOT)").font = Font(name="Calibri", size=10, italic=True, color="808080")
    row += 2

    ws.cell(row=row, column=2, value="Panel / Tab").font = SUBHEADER_FONT
    ws.cell(row=row, column=2).fill = SUBHEADER_FILL
    ws.cell(row=row, column=3, value="Knob Count").font = SUBHEADER_FONT
    ws.cell(row=row, column=3).fill = SUBHEADER_FILL
    ws.cell(row=row, column=3).alignment = Alignment(horizontal="center")
    ws.cell(row=row, column=4, value="Description").font = SUBHEADER_FONT
    ws.cell(row=row, column=4).fill = SUBHEADER_FILL
    row += 1

    descriptions = {
        "Run Setup": "Search engines, query caps, resume, re-extract, schema enforcement",
        "Browser Rendering": "Crawlee, auto-scroll, robots.txt, page screenshots",
        "Fetch & Network": "Concurrency, rate limits, timeouts, frontier cooldowns",
        "Parsing & Storage": "Spec DB directory",
        "Run Output": "Output mode, paths, S3 mirroring, markdown summary",
        "Automation": "Drift detection, self-improve, category authority, daemon, imports",
        "Observability": "Tracing, event logging, screencast streaming",
        "LLM Global": "Models, costs, budgets, call limits, API keys, timeout",
        "LLM Phase Overrides": "Per-phase model, token cap, and reasoning overrides",
        "LLM Provider Registry": "Provider configs (URLs, models, costs) — managed as JSON",
        "Storage Settings": "Persistent storage destination (local / S3), credentials",
        "UI Settings": "Auto-save toggles for Studio, Runtime, Storage panels",
        "Convergence": "SERP triage scoring threshold",
        "Not in GUI": "Backend-only, deprecated, or internally-managed knobs",
    }

    total = 0
    for tab_name, rows in all_tabs:
        count = len(rows)
        total += count
        ws.cell(row=row, column=2, value=tab_name).font = stat_font
        c = ws.cell(row=row, column=3, value=count)
        c.font = stat_font
        c.alignment = Alignment(horizontal="center")
        ws.cell(row=row, column=4, value=descriptions.get(tab_name, "")).font = stat_font
        row += 1

    row += 1
    ws.cell(row=row, column=2, value="TOTAL KNOBS").font = stat_bold
    c = ws.cell(row=row, column=3, value=total)
    c.font = stat_bold
    c.alignment = Alignment(horizontal="center")

    row += 2
    ws.cell(row=row, column=2, value="Legend").font = subtitle_font
    row += 1
    legends = [
        (SECRET_FILL, "Secret / API key (masked in UI)"),
        (DEPRECATED_FILL, "Deprecated (kept for backward compat)"),
        (READONLY_FILL, "Read-only (not user-editable)"),
        (BOOL_TRUE_FILL, "Boolean default = true"),
        (BOOL_FALSE_FILL, "Boolean default = false"),
    ]
    for fill, label in legends:
        ws.cell(row=row, column=2, value="     ").fill = fill
        ws.cell(row=row, column=3, value=label).font = stat_font
        ws.merge_cells(start_row=row, start_column=3, end_row=row, end_column=4)
        row += 1

    row += 1
    ws.cell(row=row, column=2, value="Source: src/shared/settingsRegistry.js").font = Font(name="Calibri", size=9, italic=True, color="A0A0A0")


def main():
    wb = openpyxl.Workbook()
    # Remove default sheet
    wb.remove(wb.active)

    all_tabs = [
        ("Run Setup", RUN_SETUP),
        ("Browser Rendering", BROWSER_RENDERING),
        ("Fetch & Network", FETCH_NETWORK),
        ("Parsing & Storage", PARSING),
        ("Run Output", RUN_OUTPUT),
        ("Automation", AUTOMATION),
        ("Observability", OBSERVABILITY),
        ("LLM Global", LLM_GLOBAL),
        ("LLM Phase Overrides", LLM_PHASE_OVERRIDES),
        ("LLM Provider Registry", LLM_PROVIDER_REGISTRY),
        ("Storage Settings", STORAGE_SETTINGS),
        ("UI Settings", UI_SETTINGS),
        ("Convergence", CONVERGENCE),
        ("Not in GUI", NOT_IN_GUI),
    ]

    add_summary_sheet(wb, all_tabs)

    for tab_name, rows in all_tabs:
        ws = wb.create_sheet(title=tab_name)
        style_sheet(ws, rows, tab_name)

    out_path = "SPEC_FACTORY_KNOBS.xlsx"
    wb.save(out_path)
    print(f"Wrote {out_path} — {sum(len(r) for _, r in all_tabs)} knobs across {len(all_tabs)} tabs + Overview")


if __name__ == "__main__":
    main()
