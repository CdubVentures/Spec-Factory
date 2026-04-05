/**
 * Color & Edition Finder — orchestrator.
 *
 * Calls the LLM, captures prompt + response, merges into JSON + SQL,
 * and returns the discovered colors/editions with paired structure.
 */

import { buildLlmCallDeps } from '../../core/llm/buildLlmCallDeps.js';
import {
  buildColorEditionFinderPrompt,
  createColorEditionFinderCallLlm,
} from './colorEditionLlmAdapter.js';
import { readColorEdition, mergeColorEditionDiscovery } from './colorEditionStore.js';

const COOLDOWN_DAYS = 30;

/**
 * Run the Color & Edition Finder for a single product.
 *
 * @param {object} opts
 * @param {object} opts.product — { product_id, category, brand, base_model, model, variant, seed_urls }
 * @param {object} opts.appDb — AppDb instance (listColors)
 * @param {object} opts.specDb — SpecDb instance (upsertColorEditionFinder)
 * @param {object} opts.config — LLM config
 * @param {object} [opts.logger]
 * @param {string} [opts.productRoot] — override for color_edition.json location
 * @param {Function} [opts._callLlmOverride] — test seam: replaces LLM call
 * @returns {Promise<{ colors, editions, default_color, fallbackUsed }>}
 */
export async function runColorEditionFinder({
  product,
  appDb,
  specDb,
  config = {},
  logger = null,
  productRoot,
  _callLlmOverride = null,
}) {
  const allColors = appDb.listColors();
  const colorNames = allColors.map(c => c.name);

  // Read existing runs for historical context
  const existing = readColorEdition({ productId: product.product_id, productRoot });
  const previousRuns = Array.isArray(existing?.runs) ? existing.runs : [];

  // Build or use overridden LLM caller
  const callLlm = _callLlmOverride
    || createColorEditionFinderCallLlm(buildLlmCallDeps({ config, logger }));

  // Call LLM
  let response;
  let fallbackUsed = false;

  try {
    response = await callLlm({ colorNames, colors: allColors, product, previousRuns });
  } catch (err) {
    logger?.warn?.('color_edition_finder_primary_failed', {
      product_id: product.product_id,
      error: err.message,
    });
    try {
      fallbackUsed = true;
      response = await callLlm({ colorNames, colors: allColors, product, previousRuns });
    } catch (fallbackErr) {
      logger?.error?.('color_edition_finder_fallback_failed', {
        product_id: product.product_id,
        error: fallbackErr.message,
      });
      return { colors: [], editions: {}, default_color: '', fallbackUsed: true };
    }
  }

  const colors = Array.isArray(response?.colors) ? response.colors : [];
  const editions = (response?.editions && typeof response.editions === 'object' && !Array.isArray(response.editions))
    ? response.editions
    : {};
  const defaultColor = response?.default_color || colors[0] || '';

  const selected = { colors, editions, default_color: defaultColor };

  // Cooldown: 30 days from now
  const now = new Date();
  const cooldownUntil = new Date(now.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const ranAt = now.toISOString();

  // Capture prompt snapshot
  const systemPrompt = buildColorEditionFinderPrompt({
    colorNames,
    colors: allColors,
    product,
    previousRuns,
  });
  const userMessage = JSON.stringify({
    brand: product.brand || '',
    base_model: product.base_model || '',
    model: product.model || '',
    variant: product.variant || '',
    category: product.category || '',
    seed_urls: product.seed_urls || [],
  });

  // Merge into JSON (durable memory — write first)
  const merged = mergeColorEditionDiscovery({
    productId: product.product_id,
    productRoot,
    newDiscovery: {
      category: product.category,
      cooldown_until: cooldownUntil,
      last_ran_at: ranAt,
    },
    run: {
      model: String(config.llmModelPlan || 'unknown'),
      fallback_used: fallbackUsed,
      selected,
      prompt: { system: systemPrompt, user: userMessage },
      response: { colors, editions, default_color: defaultColor },
    },
  });

  // Project run into SQL (frontend reads from DB, not JSON)
  const latestRun = merged.runs[merged.runs.length - 1];
  specDb.insertColorEditionFinderRun({
    category: product.category,
    product_id: product.product_id,
    run_number: latestRun.run_number,
    ran_at: ranAt,
    model: String(config.llmModelPlan || 'unknown'),
    fallback_used: fallbackUsed,
    cooldown_until: cooldownUntil,
    selected,
    prompt: { system: systemPrompt, user: userMessage },
    response: { colors, editions, default_color: defaultColor },
  });

  // Upsert SQL summary
  specDb.upsertColorEditionFinder({
    category: product.category,
    product_id: product.product_id,
    colors,
    editions: Object.keys(editions),
    default_color: defaultColor,
    cooldown_until: cooldownUntil,
    latest_ran_at: ranAt,
    run_count: (existing?.run_count || 0) + 1,
  });

  return { colors, editions, default_color: defaultColor, fallbackUsed };
}
