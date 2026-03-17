import { callLlmWithRouting, hasLlmRouteApiKey } from '../../../core/llm/client/routing.js';

function querySchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      queries: {
        type: 'array',
        items: {
          anyOf: [
            { type: 'string' },
            {
              type: 'object',
              properties: {
                query: { type: 'string' },
                target_fields: { type: 'array', items: { type: 'string' } }
              },
              required: ['query']
            }
          ]
        }
      }
    },
    required: ['queries']
  };
}

function normalizeQuery(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return String(value.query || '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
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

function dedupeQueries(rows = [], cap = 24) {
  const out = [];
  const seen = new Set();
  for (const row of rows || []) {
    const query = normalizeQuery(row);
    const normalized = query.toLowerCase();
    if (!query || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(query);
    if (out.length >= Math.max(1, Number(cap || 24))) {
      break;
    }
  }
  return out;
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const FIELD_TERM_MAP = {
  polling_rate: ['polling', 'report rate', 'hz'],
  dpi: ['dpi', 'cpi'],
  sensor: ['sensor', 'optical'],
  click_latency: ['latency', 'response time'],
  battery_hours: ['battery', 'battery life'],
  weight: ['weight', 'mass', 'grams'],
  switch: ['switch', 'microswitch'],
  connection: ['connectivity', 'wireless', 'wired'],
  lift: ['lift off', 'lod'],
  resolution: ['resolution', 'pixel'],
  refresh_rate: ['refresh rate', 'hertz'],
  response_time: ['response time', 'gtg'],
  panel_type: ['panel', 'ips', 'va', 'oled'],
  brightness: ['brightness', 'nits', 'luminance'],
  contrast: ['contrast ratio'],
  hdr: ['hdr'],
  size: ['size', 'inch', 'diagonal']
};

export function filterRelevantQueries(queries, missingFields = []) {
  if (!missingFields.length || !queries.length) return queries;
  const terms = new Set();
  for (const field of missingFields) {
    const normalized = String(field || '').toLowerCase().replace(/^fields\./, '');
    terms.add(normalized.replace(/_/g, ' '));
    for (const synonym of (FIELD_TERM_MAP[normalized] || [])) {
      terms.add(synonym.toLowerCase());
    }
  }
  const filtered = queries.filter((q) => {
    const lower = String(q || '').toLowerCase();
    return [...terms].some((term) => lower.includes(term));
  });
  return filtered.length >= 3 ? filtered : queries;
}

export async function planDiscoveryQueriesLLM({
  job,
  categoryConfig,
  baseQueries,
  missingCriticalFields = [],
  config,
  logger,
  llmContext = {}
}) {
  if (!hasLlmRouteApiKey(config, { role: 'plan' })) {
    return [];
  }

  const budgetGuard = llmContext?.budgetGuard;
  // Archetype context from search profile (if available via llmContext)
  const archetypeContext = llmContext?.archetypeContext || {};
  const payload = {
    product: {
      category: job.category || categoryConfig.category,
      brand: job.identityLock?.brand || '',
      model: job.identityLock?.model || '',
      variant: job.identityLock?.variant || ''
    },
    criticalFields: categoryConfig.schema?.critical_fields || [],
    missingCriticalFields,
    existingQueries: filterRelevantQueries(baseQueries, missingCriticalFields).slice(0, 50),
    archetypes_emitted: archetypeContext.archetypes_emitted || [],
    hosts_targeted: archetypeContext.hosts_targeted || [],
    uncovered_search_worthy: archetypeContext.uncovered_search_worthy || [],
    representative_gaps: archetypeContext.representative_gaps || []
  };
  const payloadSize = JSON.stringify(payload).length;

  const archetypeHint = (payload.archetypes_emitted || []).length > 0
    ? `Archetype queries already target: ${payload.archetypes_emitted.join(', ')}. Focus on GAPS not covered by these source types.`
    : '';
  const baseSystem = [
    'You generate focused web research queries for hardware specification collection.',
    'Output 5-12 short search queries.',
    'Prioritize manufacturer docs, manuals, instrumented labs, and trusted databases.',
    'Do not include junk domains, login workflows, or irrelevant topics.',
    'The existingQueries show searches already tried. Generate DIFFERENT query patterns covering new angles.',
    'Vary strategies: official product pages, spec databases, review sites, teardowns, comparison pages.',
    archetypeHint
  ].filter(Boolean);

  const passCap = 3;
  const passSpecs = [
    {
      reason: 'discovery_planner_primary',
      modelOverride: String(
        Boolean(config._resolvedSearchPlannerUseReasoning ?? config.llmPlanUseReasoning)
          ? (config._resolvedSearchPlannerReasoningModel || config.llmModelReasoning || config._resolvedSearchPlannerBaseModel || config.llmModelPlan || '')
          : (config._resolvedSearchPlannerBaseModel || config.llmModelPlan || '')
      ).trim(),
      role: 'plan',
      reasoningMode: false,
      systemSuffix: 'Keep queries compact and practical.'
    },
    {
      reason: 'discovery_planner_fast',
      modelOverride: String(config.llmModelFast || config.llmModelPlan || '').trim(),
      role: 'plan',
      reasoningMode: false,
      systemSuffix: 'Bias toward official manufacturer and support documents first.'
    },
    {
      reason: 'discovery_planner_reason',
      modelOverride: String(config.llmModelReasoning || config.llmModelExtract || '').trim(),
      role: 'plan',
      reasoningMode: true,
      systemSuffix: 'Prioritize unresolved critical fields and avoid repeating weak query patterns.'
    }
  ];
  if ((missingCriticalFields || []).length > 0) {
    passSpecs.push({
      reason: 'discovery_planner_validate',
      modelOverride: String(config.llmModelValidate || config.llmModelReasoning || '').trim(),
      role: 'plan',
      reasoningMode: true,
      systemSuffix: 'Return only high-yield queries for critical field closure.'
    });
  }

  const cappedPasses = passSpecs
    .filter((row) => row.modelOverride)
    .slice(0, passCap);
  if (!cappedPasses.length) {
    return [];
  }

  const allQueries = [];
  for (const pass of cappedPasses) {
    const budgetDecision = budgetGuard?.canCall({
      reason: pass.reason,
      essential: false
    }) || { allowed: true };
    if (!budgetDecision.allowed) {
      budgetGuard?.block?.(budgetDecision.reason);
      logger?.warn?.('llm_discovery_planner_skipped_budget', {
        reason: budgetDecision.reason,
        productId: job.productId,
        pass: pass.reason
      });
      break;
    }

    try {
      const result = await callLlmWithRouting({
        config,
        reason: pass.reason,
        role: pass.role,
        modelOverride: pass.modelOverride,
        system: [...baseSystem, pass.systemSuffix].join('\n'),
        user: JSON.stringify(payload),
        jsonSchema: querySchema(),
        usageContext: {
          category: job.category || categoryConfig.category || '',
          productId: job.productId || '',
          runId: llmContext.runId || '',
          round: llmContext.round || 0,
          reason: pass.reason,
          host: '',
          url_count: 0,
          evidence_chars: payloadSize,
          traceWriter: llmContext.traceWriter || null,
          trace_context: {
            purpose: 'discovery_query_plan',
            target_fields: missingCriticalFields || []
          }
        },
        costRates: llmContext.costRates || config,
        onUsage: async (usageRow) => {
          budgetGuard?.recordCall({ costUsd: usageRow.cost_usd });
          if (typeof llmContext.recordUsage === 'function') {
            await llmContext.recordUsage(usageRow);
          }
        },
        reasoningMode: Boolean(pass.reasoningMode || config.llmReasoningMode),
        reasoningBudget: Number(config.llmReasoningBudget || 0),
        timeoutMs: config.llmTimeoutMs || config.openaiTimeoutMs,
        logger
      });
      const normalized = normalizeQueryRows(result?.queries || []);
      allQueries.push(...normalized);
    } catch (error) {
      logger?.warn?.('llm_discovery_planner_failed', {
        message: error.message,
        pass: pass.reason
      });
    }
  }

  const maxQueryCap = 24;
  const deduped = [];
  const seen = new Set();
  for (const row of allQueries) {
    const normalized = row.query.toLowerCase();
    if (!row.query || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(row);
    if (deduped.length >= Math.max(1, Number(maxQueryCap || 24))) break;
  }
  return deduped;
}
