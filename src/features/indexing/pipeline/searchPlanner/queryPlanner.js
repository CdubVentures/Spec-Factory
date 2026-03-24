import { z, toJSONSchema } from 'zod';
import { callLlmWithRouting, hasLlmRouteApiKey, resolvePhaseModel } from '../../../../core/llm/client/routing.js';
import { configInt } from '../../../../shared/settingsAccessor.js';
import { toArray } from '../../../../shared/primitives.js';

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

export const queryEnhancerResponseZodSchema = z.object({
  enhanced_queries: z.array(z.object({
    index: z.number().int(),
    query: z.string(),
  })),
});

function enhancerSchema() {
  const { $schema, ...schema } = toJSONSchema(queryEnhancerResponseZodSchema);
  return schema;
}

function buildEnhancerSystemPrompt(rowCount) {
  return [
    'You enhance search queries for hardware specification collection.',
    `You receive ${rowCount} query rows. Return exactly ${rowCount} enhanced queries in the same order.`,
    '',
    'IDENTITY LOCK (mandatory):',
    '- Every output query MUST contain the brand name and model name.',
    '- Never drop, abbreviate, or alter the brand/model identity tokens.',
    '- Never drift to a sibling or competitor product.',
    '',
    'TIER 1 — "seed": Broad product seed queries (e.g. "{brand} {model} specifications").',
    '- Return the query unchanged or with only trivial phrasing cleanup.',
    '- Do NOT restructure, add fields, or change intent.',
    '',
    'TIER 2 — "group_search": Queries targeting a spec group (e.g. connectivity, sensor).',
    '- The query contains a group description. You may tighten redundant tokens or pick a better search angle.',
    '- target_fields shows which fields this group needs. Use that to focus the query.',
    '- Keep the group intent. Do not narrow to a single field.',
    '',
    'TIER 3 — "key_search": Queries targeting a single unresolved field. This is where you add the most value.',
    '- Each row includes enrichment context: repeat_count, all_aliases, domain_hints, preferred_content_types, domains_tried, content_types_tried.',
    '- Use the enrichment context to craft a materially different query from the deterministic base.',
    '',
    'TIER 3 SUB-RULES by repeat_count:',
    '- repeat=0 (3a): First attempt. The deterministic query is bare "{brand} {model} {key}". Pick the best alias combination for a clean first search.',
    '- repeat=1 (3b): Second attempt. Aliases are now available. Use a DIFFERENT alias combination than what the base query already contains. Vary word order.',
    '- repeat=2 (3c): Third attempt. Domain hints and domains_tried are available. Add an UNTRIED domain as a bias term (e.g. "rtings.com", "techpowerup"). Do NOT repeat domains_tried.',
    '- repeat=3+ (3d): Fourth+ attempt. Content type hints and content_types_tried are available. Get creative — vary phrasing family (teardown, benchmark, measured, review, spec sheet, comparison, reference). Use untried content types. Use untried domain hints. Each query must be materially unique from prior attempts.',
    '',
    'HISTORY AWARENESS:',
    '- query_history shows queries already executed. Do NOT repeat them or trivial rewrites.',
    '',
    'OUTPUT: Return JSON with enhanced_queries array. Each entry: {"index": N, "query": "enhanced query"}.',
    `Return exactly ${rowCount} entries in the same order as input.`,
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

  const systemPrompt = buildEnhancerSystemPrompt(rows.length);
  const maxRetries = configInt(config, 'llmEnhancerMaxRetries');

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

