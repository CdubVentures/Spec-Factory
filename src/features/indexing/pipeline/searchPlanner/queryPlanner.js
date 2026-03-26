import { callLlmWithRouting, hasLlmRouteApiKey, resolvePhaseModel } from '../../../../core/llm/client/routing.js';
import { configInt } from '../../../../shared/settingsAccessor.js';
import { toArray } from '../../../../shared/primitives.js';
import { createQueryEnhancerCallLlm, queryEnhancerResponseZodSchema } from './queryPlannerLlmAdapter.js';

// WHY: LLMs sometimes inject site: operators despite prompt instructions.
// Strip them and keep the domain as a plain-text bias term.
function normalizeQuery(value) {
  return String(value || '')
    .replace(/(?:^|\s)site:(\S+)/gi, ' $1')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeQueryRows(rawQueries = []) {
  const rows = Array.isArray(rawQueries) ? rawQueries : [];
  return rows.map((item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return {
        query: String(item.query || '').replace(/\s+/g, ' ').trim(),
        target_fields: Array.isArray(item.target_fields) ? item.target_fields.map((f) => String(f || '').trim()).filter(Boolean) : []
      };
    }
    return {
      query: String(item || '').replace(/\s+/g, ' ').trim(),
      target_fields: []
    };
  }).filter((row) => row.query);
}


// WHY: Re-export so existing consumers don't break.
export { queryEnhancerResponseZodSchema } from './queryPlannerLlmAdapter.js';

function passesIdentityLock(query, identityLock) {
  const q = String(query || '').toLowerCase();
  const brand = String(identityLock?.brand || '').toLowerCase().trim();
  const model = String(identityLock?.model || '').toLowerCase().trim();
  if (!brand || !model) return true;
  return q.includes(brand) && q.includes(model);
}

function buildDeterministicFallback(queryRows) {
  return {
    source: 'deterministic_fallback',
    rows: queryRows.map((row) => ({ ...row })),
  };
}

export async function enhanceQueryRows({
  queryRows = [],
  queryHistory = [],
  missingFields = [],
  identityLock = {},
  config = {},
  logger = null,
  // DI seams for testing
  callLlmFn = null,
  hasApiKeyFn = (cfg) => hasLlmRouteApiKey(cfg, { role: 'plan' }),
  resolveModelFn = (cfg) => resolvePhaseModel(cfg, 'searchPlanner'),
} = {}) {
  const effectiveCallLlm = callLlmFn || createQueryEnhancerCallLlm({
    callRoutedLlmFn: callLlmWithRouting, config, logger,
  });
  const rows = Array.isArray(queryRows) ? queryRows : [];
  if (rows.length === 0) return buildDeterministicFallback(rows);
  if (!hasApiKeyFn(config)) return buildDeterministicFallback(rows);
  if (!resolveModelFn(config)) return buildDeterministicFallback(rows);

  const payload = {
    identity_lock: {
      brand: String(identityLock.brand || ''),
      model: String(identityLock.model || ''),
      variant: String(identityLock.variant || ''),
    },
    query_history: toArray(queryHistory),
    missing_fields: toArray(missingFields),
    rows: rows.map((row, i) => {
      const base = {
        index: i,
        query: String(row.query || ''),
        tier: String(row.tier || ''),
        target_fields: toArray(row.target_fields),
        group_key: String(row.group_key || ''),
        normalized_key: String(row.normalized_key || ''),
      };
      // WHY: Tier 3 rows carry progressive enrichment context from NeedSet.
      // The LLM uses this to craft materially different queries at each repeat level.
      if (row.tier === 'key_search') {
        base.repeat_count = row.repeat_count ?? 0;
        base.all_aliases = toArray(row.all_aliases);
        base.domain_hints = toArray(row.domain_hints);
        base.preferred_content_types = toArray(row.preferred_content_types);
        base.domains_tried = toArray(row.domains_tried_for_key);
        base.content_types_tried = toArray(row.content_types_tried_for_key);
      }
      return base;
    }),
  };

  const payloadJson = JSON.stringify(payload);
  const maxRetries = configInt(config, 'llmEnhancerMaxRetries');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await effectiveCallLlm({
        payload: payloadJson,
        rowCount: rows.length,
        usageContext: {
          reason: 'search_planner_enhance',
          host: '',
          url_count: 0,
          evidence_chars: payloadJson.length,
        },
      });

      const enhanced = toArray(result?.enhanced_queries);
      if (enhanced.length !== rows.length) {
        logger?.warn?.('enhance_query_rows_length_mismatch', {
          expected: rows.length,
          got: enhanced.length,
          attempt,
        });
        if (attempt < maxRetries) continue;
        return buildDeterministicFallback(rows);
      }

      const outputRows = rows.map((original, i) => {
        const match = enhanced.find((e) => e.index === i);
        const enhancedQuery = normalizeQuery(match?.query);
        if (!enhancedQuery || !passesIdentityLock(enhancedQuery, identityLock)) {
          return { ...original };
        }
        return {
          ...original,
          query: enhancedQuery,
          hint_source: `${String(original.hint_source || 'unknown')}_llm`,
          original_query: original.query,
        };
      });

      return { source: 'llm', rows: outputRows };
    } catch (error) {
      logger?.warn?.('enhance_query_rows_failed', {
        message: error.message,
        attempt,
      });
      if (attempt >= maxRetries) {
        return buildDeterministicFallback(rows);
      }
    }
  }

  return buildDeterministicFallback(rows);
}

