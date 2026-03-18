function brandResolverSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      official_domain: { type: 'string' },
      aliases: { type: 'array', items: { type: 'string' } },
      support_domain: { type: 'string' },
      reasoning: { type: 'array', items: { type: 'string' } }
    },
    required: ['official_domain']
  };
}

function escalationPlannerSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      queries: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            query: { type: 'string' },
            target_fields: { type: 'array', items: { type: 'string' } },
            expected_source_type: { type: 'string' }
          },
          required: ['query']
        }
      }
    },
    required: ['queries']
  };
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function createBrandResolverCallLlm({ callRoutedLlmFn, config, logger }) {
  return async ({ brand, category }) => {
    const result = await callRoutedLlmFn({
      config,
      reason: 'brand_resolution',
      role: 'triage',
      phase: 'brandResolver',
      system: [
        'You resolve official brand website domains for product categories.',
        'Return the official domain (not social media or marketplace).',
        'Include domain aliases and the support subdomain if one exists.',
        'Include a reasoning array with 2-4 short bullets explaining how you identified the domain.',
        'Return strict JSON only.'
      ].join('\n'),
      user: JSON.stringify({ brand, category }),
      jsonSchema: brandResolverSchema(),
      reasoningMode: false,
      timeoutMs: config.llmTimeoutMs || 15000,
      logger
    });
    return result;
  };
}

export function createEscalationPlannerCallLlm({ callRoutedLlmFn, config }) {
  return async ({ missingFields, product, previousQueries }) => {
    const result = await callRoutedLlmFn({
      config,
      reason: 'escalation_planner',
      role: 'plan',
      phase: 'searchPlanner',
      system: [
        'You generate targeted search queries for missing product specification fields.',
        'Given fields that were NOT found in previous rounds, generate surgical queries targeting specific source types.',
        'Avoid repeating patterns from previousQueries.',
        'Focus on manufacturer datasheets, lab reviews, teardowns, and technical databases.',
        'Return strict JSON only.'
      ].join('\n'),
      user: JSON.stringify({ missingFields, product, previousQueries }),
      jsonSchema: escalationPlannerSchema(),
      reasoningMode: true,
      timeoutMs: config.llmTimeoutMs || 30000
    });
    return toArray(result?.queries || result);
  };
}
