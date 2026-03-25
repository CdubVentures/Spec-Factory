// WHY: LLM call factory for the query enhancer.
// Encapsulates reason/role/phase/schema/prompt constants so callers pass only domain data.

import { z } from 'zod';
import { zodToLlmSchema } from '../../../../core/llm/zodToLlmSchema.js';

export const queryEnhancerResponseZodSchema = z.object({
  enhanced_queries: z.array(z.object({
    index: z.number().int(),
    query: z.string(),
  })),
});

const QUERY_ENHANCER_SCHEMA = zodToLlmSchema(queryEnhancerResponseZodSchema);

export function buildEnhancerSystemPrompt(rowCount) {
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

export function createQueryEnhancerCallLlm({ callRoutedLlmFn, config, logger }) {
  return async ({ payload, rowCount, usageContext = {} }) => {
    return callRoutedLlmFn({
      config,
      reason: 'search_planner_enhance',
      role: 'plan',
      phase: 'searchPlanner',
      system: buildEnhancerSystemPrompt(rowCount),
      user: typeof payload === 'string' ? payload : JSON.stringify(payload),
      jsonSchema: QUERY_ENHANCER_SCHEMA,
      usageContext,
      costRates: config,
      logger,
    });
  };
}
