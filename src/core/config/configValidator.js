// WHY: Config validation extracted from config.js (Phase 8).
// Pure function — no side effects, no imports beyond what's needed for validation.

import { hasAnyLlmApiKey } from '../llm/client/routing.js';

export function validateConfig(config) {
  const errors = [];
  const warnings = [];

  // Rule 1: LLM is always on — missing API key is a warning (graceful degradation)
  if (!hasAnyLlmApiKey(config)) {
    warnings.push({
      code: 'LLM_NO_API_KEY',
      message: 'No LLM API key found — LLM enrichment will fail at runtime'
    });
  }

  // Rule 2: Discovery requires a search provider
  if (!config.searchEngines) {
    warnings.push({
      code: 'DISCOVERY_NO_SEARCH_PROVIDER',
      message: 'SEARCH_ENGINES is empty — discovery search will be skipped'
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
