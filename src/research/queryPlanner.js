import { callLlmWithRouting, hasLlmRouteApiKey, resolvePhaseModel } from '../core/llm/client/routing.js';

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeQuery(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function groupFieldsByTier(fields, archetypeContext = {}) {
  const uncoveredSearchWorthy = new Set(archetypeContext.uncovered_search_worthy || []);
  const critical = [];
  const covered = [];
  const uncovered = [];
  for (const field of fields) {
    if (uncoveredSearchWorthy.has(field)) {
      uncovered.push(field);
    } else {
      covered.push(field);
    }
  }
  // Return full field set as grouped structure (no truncation)
  return {
    all: fields,
    uncovered_search_worthy: uncovered,
    covered_by_archetypes: covered,
    total: fields.length
  };
}

function dedupeQueries(rows = [], cap = 24) {
  const out = [];
  const seen = new Set();
  for (const row of rows || []) {
    const query = normalizeQuery(row);
    if (!query) {
      continue;
    }
    const token = query.toLowerCase();
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    out.push(query);
    if (out.length >= cap) {
      break;
    }
  }
  return out;
}

function plannerSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      queries: {
        type: 'array',
        items: { type: 'string' }
      },
      preferred_domains: {
        type: 'array',
        items: { type: 'string' }
      },
      negative_filters: {
        type: 'array',
        items: { type: 'string' }
      },
      max_queries: { type: 'integer' },
      max_new_domains: { type: 'integer' },
      sitemap_mode_recommended: { type: 'boolean' }
    },
    required: ['queries']
  };
}

export async function planUberQueries({
  config,
  logger,
  llmContext = {},
  identity = {},
  missingFields = [],
  missingCriticalFields = [],
  baseQueries = [],
  frontierSummary = {},
  cap = 24
} = {}) {
  const fallbackQueries = dedupeQueries(baseQueries, Math.max(1, cap));
  if (!hasLlmRouteApiKey(config, { role: 'plan' })) {
    return {
      source: 'deterministic',
      queries: fallbackQueries,
      preferred_domains: [],
      negative_filters: [],
      max_queries: Math.max(1, cap),
      max_new_domains: Math.max(1, Math.ceil(cap / 2)),
      sitemap_mode_recommended: false
    };
  }

  // Group fields by tier for compressed planner context
  const archetypeContext = llmContext?.archetypeContext || {};
  const allFields = toArray(missingFields);
  const grouped = groupFieldsByTier(allFields, archetypeContext);

  const payload = {
    identity_lock: {
      brand: String(identity.brand || ''),
      model: String(identity.model || ''),
      variant: String(identity.variant || ''),
      product_id: String(identity.productId || '')
    },
    missing_fields: grouped,
    missing_critical_fields: toArray(missingCriticalFields).slice(0, 15),
    base_queries: fallbackQueries.slice(0, 24),
    frontier_summary: frontierSummary,
    archetypes_emitted: archetypeContext.archetypes_emitted || [],
    hosts_targeted: archetypeContext.hosts_targeted || [],
    uncovered_search_worthy: archetypeContext.uncovered_search_worthy || []
  };

  const archetypeHint = (payload.archetypes_emitted || []).length > 0
    ? `Archetype queries already target: ${payload.archetypes_emitted.join(', ')}. Focus on GAPS not covered by these source types.`
    : '';
  const criticalHint = (payload.missing_critical_fields || []).length > 0
    ? `Critical unresolved fields: ${payload.missing_critical_fields.join(', ')}. Prioritize high-yield queries for these.`
    : '';

  const resolvedModel = resolvePhaseModel(config, 'searchPlanner');
  if (!resolvedModel) {
    return {
      source: 'deterministic',
      queries: fallbackQueries,
      preferred_domains: [],
      negative_filters: [],
      max_queries: Math.max(1, cap),
      max_new_domains: Math.max(1, Math.ceil(cap / 2)),
      sitemap_mode_recommended: false
    };
  }

  try {
    const result = await callLlmWithRouting({
      config,
      reason: 'search_planner',
      role: 'plan',
      phase: 'searchPlanner',
      system: [
        'You generate focused web research queries for hardware specification collection.',
        'Output 12-24 short, diverse search queries in strict JSON. Each query targets a DIFFERENT angle.',
        'Prioritize manufacturer docs, manuals, instrumented labs, and trusted spec databases.',
        'Also include official support pages and product comparison sites.',
        'Do not include junk domains, login workflows, or irrelevant topics.',
        'The base_queries show searches already tried. Generate DIFFERENT query patterns covering new angles.',
        'Vary strategies: official product pages, spec databases, review sites, teardowns, comparison pages.',
        'NEVER put domain names (.com, .org, etc.) in query text. Domain preference is handled separately.',
        'Avoid repeating weak query patterns. Keep queries compact and practical.',
        archetypeHint,
        criticalHint
      ].filter(Boolean).join('\n'),
      user: JSON.stringify(payload),
      jsonSchema: plannerSchema(),
      usageContext: {
        category: llmContext.category || '',
        productId: llmContext.productId || '',
        runId: llmContext.runId || '',
        round: llmContext.round || 0,
        reason: 'search_planner',
        host: '',
        url_count: 0,
        evidence_chars: JSON.stringify(payload).length,
        traceWriter: llmContext.traceWriter || null,
        trace_context: {
          purpose: 'search_planner',
          target_fields: toArray(missingFields).slice(0, 40)
        }
      },
      costRates: llmContext.costRates || config,
      onUsage: async (usageRow) => {
        const budgetGuard = llmContext?.budgetGuard;
        budgetGuard?.recordCall?.({ costUsd: usageRow.cost_usd });
        if (typeof llmContext.recordUsage === 'function') {
          await llmContext.recordUsage(usageRow);
        }
      },
      reasoningMode: Boolean(config._resolvedSearchPlannerUseReasoning ?? config.llmPlanUseReasoning ?? config.llmReasoningMode),
      reasoningBudget: Number(config.llmReasoningBudget || 0),
      timeoutMs: config.llmTimeoutMs || config.openaiTimeoutMs,
      logger
    });

    const queries = dedupeQueries(result?.queries || [], Math.max(1, cap));
    if (!queries.length) {
      return {
        source: 'deterministic_fallback',
        queries: fallbackQueries,
        preferred_domains: [],
        negative_filters: [],
        max_queries: Math.max(1, cap),
        max_new_domains: Math.max(1, Math.ceil(cap / 2)),
        sitemap_mode_recommended: false
      };
    }
    return {
      source: 'llm',
      queries,
      preferred_domains: dedupeQueries(result?.preferred_domains || [], 20),
      negative_filters: dedupeQueries(result?.negative_filters || [], 40),
      max_queries: Math.max(1, Number.parseInt(String(result?.max_queries || cap), 10) || cap),
      max_new_domains: Math.max(1, Number.parseInt(String(result?.max_new_domains || Math.ceil(cap / 2)), 10) || Math.ceil(cap / 2)),
      sitemap_mode_recommended: Boolean(result?.sitemap_mode_recommended)
    };
  } catch (error) {
    logger?.warn?.('uber_query_planner_failed', {
      message: error.message
    });
    return {
      source: 'deterministic_fallback',
      queries: fallbackQueries,
      preferred_domains: [],
      negative_filters: [],
      max_queries: Math.max(1, cap),
      max_new_domains: Math.max(1, Math.ceil(cap / 2)),
      sitemap_mode_recommended: false
    };
  }
}
