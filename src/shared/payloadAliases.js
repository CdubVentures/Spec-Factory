// WHY: O(1) alias management — centralizes all camelCase/snake_case and
// cross-provider field name fallbacks that were previously scattered inline
// across artifact reader and builder files. Adding a new alias = 1 entry here.

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
