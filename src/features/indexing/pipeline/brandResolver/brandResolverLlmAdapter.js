import { z } from 'zod';
import { zodToLlmSchema } from '../../../../core/llm/zodToLlmSchema.js';
import { createPhaseCallLlm } from '../shared/createPhaseCallLlm.js';

export const brandResolverLlmResponseSchema = z.object({
  official_domain: z.string(),
  aliases: z.array(z.string()).optional(),
  support_domain: z.string().optional(),
  confidence: z.number().describe('0-1 confidence that this is the correct official domain'),
  reasoning: z.array(z.string()).optional(),
});

export const BRAND_RESOLVER_SYSTEM_PROMPT = [
  'You resolve official brand website domains for product categories.',
  'Return the official domain (not social media or marketplace).',
  'Include domain aliases and the support subdomain if one exists.',
  'Include a reasoning array with 2-4 short bullets explaining how you identified the domain.',
  'Return strict JSON only.',
].join('\n');

const BRAND_RESOLVER_SPEC = {
  phase: 'brandResolver',
  reason: 'brand_resolution',
  role: 'triage',
  system: BRAND_RESOLVER_SYSTEM_PROMPT,
  jsonSchema: zodToLlmSchema(brandResolverLlmResponseSchema),
};

export function createBrandResolverCallLlm(deps) {
  return createPhaseCallLlm(deps, BRAND_RESOLVER_SPEC, ({ brand, category }) => ({
    user: JSON.stringify({ brand, category }),
  }));
}
