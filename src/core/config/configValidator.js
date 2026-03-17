// WHY: Config validation extracted from config.js (Phase 8).
// Pure function — no side effects, no imports beyond what's needed for validation.

export function validateConfig(config) {
  const errors = [];
  const warnings = [];

  // Rule 1: LLM is always on — missing API key is a warning (graceful degradation)
  if (!config.llmApiKey) {
    warnings.push({
      code: 'LLM_NO_API_KEY',
      message: 'LLM is enabled but LLM_API_KEY is not set — LLM enrichment will fail at runtime'
    });
  }

  // Rule 2: Discovery requires a search provider
  if (config.searchProvider === 'none') {
    warnings.push({
      code: 'DISCOVERY_NO_SEARCH_PROVIDER',
      message: 'SEARCH_PROVIDER is "none" — discovery search will be skipped'
    });
  }

  // Rule 3: Cortex enabled requires base URL
  if (config.cortexEnabled && !config.cortexBaseUrl) {
    errors.push({
      code: 'CORTEX_NO_BASE_URL',
      message: 'CORTEX_ENABLED=true but CORTEX_BASE_URL is not set'
    });
  }

  // Rule 4: S3 output mode requires AWS credentials
  if (config.outputMode === 's3' && !config.mirrorToS3) {
    warnings.push({
      code: 'S3_MODE_NO_CREDS',
      message: 'OUTPUT_MODE=s3 but AWS credentials not detected'
    });
  }

  // Rule 5: manufacturerReserveUrls should not exceed maxUrlsPerProduct
  if (config.maxUrlsPerProduct < config.manufacturerReserveUrls) {
    warnings.push({
      code: 'MANUFACTURER_RESERVE_EXCEEDS_MAX',
      message: `manufacturerReserveUrls (${config.manufacturerReserveUrls}) > maxUrlsPerProduct (${config.maxUrlsPerProduct})`
    });
  }

  // Rule 8: Budget guards disabled is risky
  if (config.llmDisableBudgetGuards) {
    warnings.push({
      code: 'BUDGET_GUARDS_DISABLED',
      message: 'LLM_DISABLE_BUDGET_GUARDS=true — no cost ceiling in effect'
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
