import { z } from 'zod';
import { zodToLlmSchema } from '../../../../core/llm/zodToLlmSchema.js';

export const brandResolverLlmResponseSchema = z.object({
  official_domain: z.string(),
  aliases: z.array(z.string()).optional(),
  support_domain: z.string().optional(),
  confidence: z.number().describe('0-1 confidence that this is the correct official domain'),
  reasoning: z.array(z.string()).optional(),
});

function brandResolverSchema() {
  return zodToLlmSchema(brandResolverLlmResponseSchema);
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
      logger
    });
    return result;
  };
}
