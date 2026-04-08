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
import { submitCandidate } from '../publisher/index.js';

const COOLDOWN_DAYS = 30;

/**
 * Run the Color & Edition Finder for a single product.
 *
 * @param {object} opts
 * @param {object} opts.product — { product_id, category, brand, base_model, model, variant }
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

  // --- Candidate gate: validate before any writes ---
  // WHY: If any field fails validation, the entire LLM response is compromised.
  // No candidate writes, no CEF writes, no cooldown. Failure stored for history.
  const compiled = specDb.getCompiledRules?.();
  const fieldRules = compiled?.fields || null;
  const knownValues = compiled?.known_values || null;

  let gateColors = colors;
  let gateRejections = null;

  if (fieldRules && fieldRules.colors) {
    const colorsResult = submitCandidate({
      category: product.category,
      productId: product.product_id,
      fieldKey: 'colors',
      value: colors,
      confidence: 100,
      sourceMeta: { source: 'cef', model: String(config.llmModelPlan || 'unknown'), run_id: `cef-${Date.now()}` },
      fieldRules,
      knownValues,
      componentDb: null,
      specDb,
      productRoot,
    });

    if (colorsResult.status === 'rejected') {
      gateRejections = colorsResult.validationResult.rejections;

      // Store failure run record (historical only — no summary/cooldown update)
      const now = new Date();
      const ranAt = now.toISOString();
      const runNumber = (existing?.run_count || 0) + 1;

      specDb.insertColorEditionFinderRun({
        category: product.category,
        product_id: product.product_id,
        run_number: runNumber,
        ran_at: ranAt,
        model: String(config.llmModelPlan || 'unknown'),
        fallback_used: fallbackUsed,
        cooldown_until: '',
        selected: {},
        prompt: {},
        response: {
          status: 'rejected',
          raw: { colors, editions, default_color: defaultColor },
          rejections: gateRejections,
        },
      });

      return { colors: [], editions: {}, default_color: '', fallbackUsed, rejected: true, rejections: gateRejections };
    }

    // Use repaired values from the gate (not raw LLM output)
    gateColors = colorsResult.value;
  }
  // If no compiled rules available, gate is skipped — CEF proceeds as before

  const selected = { colors: gateColors, editions, default_color: gateColors[0] || defaultColor };

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
      response: { colors: gateColors, editions, default_color: selected.default_color },
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
    response: { colors: gateColors, editions, default_color: selected.default_color },
  });

  // Upsert SQL summary
  specDb.upsertColorEditionFinder({
    category: product.category,
    product_id: product.product_id,
    colors: gateColors,
    editions: Object.keys(editions),
    default_color: selected.default_color,
    cooldown_until: cooldownUntil,
    latest_ran_at: ranAt,
    run_count: (existing?.run_count || 0) + 1,
  });

  return { colors: gateColors, editions, default_color: selected.default_color, fallbackUsed, rejected: false };
}
