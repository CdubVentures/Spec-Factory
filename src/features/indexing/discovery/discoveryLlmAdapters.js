import { configInt } from '../../../shared/settingsAccessor.js';

function brandResolverSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      official_domain: { type: 'string' },
      aliases: { type: 'array', items: { type: 'string' } },
      support_domain: { type: 'string' },
      confidence: { type: 'number', description: '0-1 confidence that this is the correct official domain' },
      reasoning: { type: 'array', items: { type: 'string' } }
    },
    required: ['official_domain', 'confidence']
  };
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
      timeoutMs: configInt(config, 'llmTimeoutMs'),
      logger
    });
    return result;
  };
}
