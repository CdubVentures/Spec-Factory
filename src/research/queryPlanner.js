import { callLlmWithRouting, hasLlmRouteApiKey, resolvePhaseModel } from '../core/llm/client/routing.js';

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeQuery(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
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


// --- enhanceQueryRows: tier-aware LLM query enhancement ---

function enhancerSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      enhanced_queries: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            index: { type: 'integer' },
            query: { type: 'string' },
          },
          required: ['index', 'query'],
        },
      },
    },
    required: ['enhanced_queries'],
  };
}

function buildEnhancerSystemPrompt(rowCount) {
  return [
    'You enhance search queries for hardware specification collection.',
    `You receive ${rowCount} query rows, each tagged with a tier. Return exactly ${rowCount} enhanced queries in the same order.`,
    '',
    'TIER RULES:',
    '- Tier "seed" (Tier 1): These are broad product seed queries. Make only minor phrasing improvements. Do not change structure.',
    '- Tier "group_search" (Tier 2): These target a spec group. You may tighten the description, drop redundant tokens, or pick a better search angle for the group.',
    '- Tier "key_search" (Tier 3): These target a single field. This is where you add the most value — add aliases, vary phrasing (review, benchmark, teardown, spec sheet, comparison), pick better search angles. Avoid repeating patterns from query_history.',
    '',
    'IDENTITY LOCK (mandatory):',
    '- Every output query MUST contain the brand name and model name.',
    '- Never drop, abbreviate, or alter the brand/model identity tokens.',
    '- Never drift to a sibling or competitor product.',
    '',
    'HISTORY AWARENESS:',
    '- query_history shows queries already tried. Do NOT repeat them or trivial rewrites of them.',
    '- For Tier 3 especially, vary alias usage, phrasing family, and search angle.',
    '',
    'OUTPUT: Return JSON with enhanced_queries array. Each entry has "index" (0-based) and "query" (the enhanced query string).',
    'Return exactly one entry per input row, in the same order.',
  ].join('\n');
}

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
  callLlmFn = callLlmWithRouting,
  hasApiKeyFn = (cfg) => hasLlmRouteApiKey(cfg, { role: 'plan' }),
  resolveModelFn = (cfg) => resolvePhaseModel(cfg, 'searchPlanner'),
} = {}) {
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
    query_history: toArray(queryHistory).slice(0, 50),
    missing_fields: toArray(missingFields).slice(0, 60),
    rows: rows.map((row, i) => ({
      index: i,
      query: String(row.query || ''),
      tier: String(row.tier || ''),
      target_fields: toArray(row.target_fields),
      group_key: String(row.group_key || ''),
      normalized_key: String(row.normalized_key || ''),
    })),
  };

  const systemPrompt = buildEnhancerSystemPrompt(rows.length);
  const maxRetries = 2;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await callLlmFn({
        config,
        reason: 'search_planner_enhance',
        role: 'plan',
        phase: 'searchPlanner',
        system: systemPrompt,
        user: JSON.stringify(payload),
        jsonSchema: enhancerSchema(),
        usageContext: {
          reason: 'search_planner_enhance',
          host: '',
          url_count: 0,
          evidence_chars: JSON.stringify(payload).length,
        },
        costRates: config,
        timeoutMs: config.llmTimeoutMs || config.openaiTimeoutMs,
        logger,
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

