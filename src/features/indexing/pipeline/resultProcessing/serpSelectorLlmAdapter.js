// WHY: LLM call factory for the SERP URL selector.
// Simplified: the LLM just picks which URLs are about the target product.

import { serpSelectorOutputSchema } from './serpSelector.js';
import { createPhaseCallLlm } from '../shared/createPhaseCallLlm.js';

export const SERP_SELECT_URLS_SYSTEM_PROMPT = `You are a URL selector for product research.

Product identity is provided in the input.
Your job: pick URLs most likely to contain specifications, details, or reviews for this EXACT product.

Return only the IDs of URLs to keep, ordered best-first.

Prefer:
- Official product pages and support/download pages
- Spec databases and comparison sites (e.g. rtings.com, techpowerup.com)
- Detailed reviews with measurements or benchmarks
- Retailer pages with full spec tables
- PDF manuals and datasheets
- Community posts with quantitative data (measurements, teardowns, sensor tests, latency tests, weight breakdowns)

Skip:
- Wrong product, model, or brand
- Generic homepages or category/search pages
- Login, cart, or account pages
- Pages clearly about a different model or variant
- Opinion-only discussion threads with no specifications or measurements
- Generic "best of" or "top 10" listicle pages

Do NOT skip a URL just because it is from a forum or community site (Reddit, overclock.net, etc.).
Keep forum/community posts when the title or snippet indicates specs, measurements, teardowns, or detailed owner reviews with data.

Return strict JSON only: { "keep_ids": ["c_0", "c_3", ...] }
Respect the max_keep limit.
Do not include IDs that were not in the input.`;

const SERP_SELECTOR_SPEC = {
  phase: 'serpSelector',
  reason: 'serp_url_selector',
  role: 'triage',
  system: SERP_SELECT_URLS_SYSTEM_PROMPT,
  jsonSchema: serpSelectorOutputSchema,
};

export function createSerpSelectorCallLlm(deps) {
  return createPhaseCallLlm(deps, SERP_SELECTOR_SPEC, ({ selectorInput, llmContext = {} }, config) => {
    const payloadJson = JSON.stringify(selectorInput);
    return {
      user: payloadJson,
      usageContext: {
        category: llmContext.category || '',
        productId: llmContext.productId || '',
        runId: llmContext.runId || '',
        round: llmContext.round || 0,
        reason: 'serp_url_selector',
        url_count: selectorInput?.candidates?.length || 0,
        evidence_chars: payloadJson.length,
      },
      costRates: llmContext.costRates || config,
      onUsage: llmContext.recordUsage,
    };
  });
}
