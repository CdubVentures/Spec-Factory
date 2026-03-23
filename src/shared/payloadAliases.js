// WHY: O(1) alias management — centralizes all camelCase/snake_case and
// cross-provider field name fallbacks that were previously scattered inline
// across artifact reader and builder files. Adding a new alias = 1 entry here.

// ── Alias Registries (documentation + future programmatic use) ──

export const EVENT_FIELD_ALIASES = Object.freeze([
  { canonical: 'query',        aliases: ['search_query', 'searchQuery'] },
  { canonical: 'run_base',     aliases: ['runBase'] },
  { canonical: 'latest_base',  aliases: ['latestBase'] },
  { canonical: 'url',          aliases: ['href'] },
  { canonical: 'source_url',   aliases: ['url'] },
  { canonical: 'score',        aliases: ['triage_score'] },
]);

export const CARDINALITY_ALIASES = Object.freeze([
  { canonical: 'total_fields', aliases: ['field_count', 'needset_size'] },
  { canonical: 'result_count', aliases: ['results_count', 'results'] },
]);

export const LLM_TOKEN_ALIASES = Object.freeze([
  { canonical: 'prompt_tokens',        aliases: ['input_tokens'] },
  { canonical: 'completion_tokens',    aliases: ['output_tokens'] },
  { canonical: 'cached_prompt_tokens', aliases: ['cached_input_tokens'] },
]);

// ── Generic resolution ──

/**
 * Resolve a value from an object by trying the canonical key first, then
 * each alias in order. Uses non-nullish check (not ||) to preserve 0/false/''.
 */
export function resolveAlias(obj, canonical, aliases) {
  if (obj == null || typeof obj !== 'object') return undefined;
  const val = obj[canonical];
  if (val !== undefined && val !== null) return val;
  for (const alias of aliases) {
    const aliased = obj[alias];
    if (aliased !== undefined && aliased !== null) return aliased;
  }
  return undefined;
}

// ── Domain-specific helpers ──

export function resolveTotalFields(payload, fallback = 0) {
  const val = resolveAlias(payload, 'total_fields', ['field_count', 'needset_size']);
  return val !== undefined ? val : fallback;
}

export function resolveResultCount(payload) {
  const val = payload?.result_count ?? payload?.results_count;
  if (val !== undefined && val !== null) return val;
  const results = payload?.results;
  return Array.isArray(results) ? results.length : 0;
}

export function resolveSearchQuery(row, payload) {
  const direct = row?.query ?? payload?.query;
  if (direct !== undefined && direct !== null) return String(direct).trim();
  return String(resolveAlias(payload, 'search_query', ['searchQuery']) ?? '').trim();
}

export function normalizeLlmUsage(usage, toInt) {
  if (!usage || typeof usage !== 'object') {
    return { prompt_tokens: 0, completion_tokens: 0, cached_prompt_tokens: 0, total_tokens: 0 };
  }
  return {
    prompt_tokens: toInt(usage.prompt_tokens, toInt(usage.input_tokens, 0)),
    completion_tokens: toInt(usage.completion_tokens, toInt(usage.output_tokens, 0)),
    cached_prompt_tokens: toInt(usage.cached_prompt_tokens, toInt(usage.cached_input_tokens, 0)),
    total_tokens: toInt(usage.total_tokens, 0),
  };
}

export function resolveUrl(obj) {
  return String(obj?.source_url || obj?.url || obj?.href || '').trim();
}

export function resolveFieldCandidates(responsePayload, toArray) {
  return toArray(responsePayload?.fieldCandidates || responsePayload?.field_candidates);
}

export function resolveMetaPath(meta, snakeKey, camelKey) {
  return String(meta?.[snakeKey] || meta?.[camelKey] || '').trim();
}
