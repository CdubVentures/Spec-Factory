/**
 * Color & Edition Finder — orchestrator.
 *
 * Calls the LLM, validates results against the color registry,
 * auto-registers unknown colors, merges into JSON + SQL, and
 * returns the discovered colors/editions.
 */

import { buildLlmCallDeps } from '../../core/llm/buildLlmCallDeps.js';
import { writeBackColorRegistry } from '../color-registry/colorRegistrySeed.js';
import { createColorEditionFinderCallLlm } from './colorEditionLlmAdapter.js';
import { mergeColorEditionDiscovery } from './colorEditionStore.js';

const COOLDOWN_DAYS = 30;

/**
 * Run the Color & Edition Finder for a single product.
 *
 * @param {object} opts
 * @param {object} opts.product — { product_id, category, brand, model, variant, seed_urls }
 * @param {object} opts.appDb — AppDb instance (listColors, upsertColor)
 * @param {object} opts.specDb — SpecDb instance (upsertColorEditionFinder)
 * @param {object} opts.config — LLM config
 * @param {object} [opts.logger]
 * @param {string} [opts.colorRegistryPath] — for writeBackColorRegistry after new color registration
 * @param {string} [opts.productRoot] — override for color_edition.json location
 * @param {Function} [opts._callLlmOverride] — test seam: replaces LLM call
 * @returns {Promise<{ colors, editions, newColorsRegistered, fallbackUsed }>}
 */
export async function runColorEditionFinder({
  product,
  appDb,
  specDb,
  config = {},
  logger = null,
  colorRegistryPath = null,
  productRoot,
  _callLlmOverride = null,
}) {
  const allColors = appDb.listColors();
  const colorNames = allColors.map(c => c.name);

  // Build or use overridden LLM caller
  const callLlm = _callLlmOverride
    || createColorEditionFinderCallLlm(buildLlmCallDeps({ config, logger }));

  // Call LLM
  let response;
  let fallbackUsed = false;

  try {
    response = await callLlm({ colorNames, colors: allColors, product });
  } catch (err) {
    logger?.warn?.('color_edition_finder_primary_failed', {
      product_id: product.product_id,
      error: err.message,
    });
    // Semantic fallback: retry with explicit fallback role
    try {
      fallbackUsed = true;
      response = await callLlm({ colorNames, colors: allColors, product });
    } catch (fallbackErr) {
      logger?.error?.('color_edition_finder_fallback_failed', {
        product_id: product.product_id,
        error: fallbackErr.message,
      });
      return { colors: [], editions: [], newColorsRegistered: [], fallbackUsed: true };
    }
  }

  const colors = Array.isArray(response?.colors) ? response.colors : [];
  const editions = Array.isArray(response?.editions) ? response.editions : [];
  const newColors = Array.isArray(response?.new_colors) ? response.new_colors : [];

  // Auto-register new colors in the global registry
  const newColorsRegistered = [];
  for (const nc of newColors) {
    const name = String(nc.name || '').trim().toLowerCase();
    const hex = String(nc.hex || '').trim();
    if (!name || !hex) continue;

    appDb.upsertColor({ name, hex, css_var: `--color-${name}` });
    newColorsRegistered.push({ name, hex });
    logger?.info?.('color_edition_finder_new_color_registered', { name, hex });
  }

  // Write back color registry to JSON if any new colors registered
  if (newColorsRegistered.length > 0 && colorRegistryPath) {
    try {
      writeBackColorRegistry(appDb, colorRegistryPath);
    } catch (err) {
      logger?.warn?.('color_edition_finder_writeback_failed', { error: err.message });
    }
  }

  // Derive default_color from first color
  const defaultColor = colors[0] || '';

  // Cooldown: 30 days from now
  const now = new Date();
  const cooldownUntil = new Date(now.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const ranAt = now.toISOString();

  // Build per-color/edition discovery metadata
  const runCount = 1; // merge will increment from existing
  const colorDiscoveries = {};
  for (const c of colors) {
    colorDiscoveries[c] = { found_run: runCount, found_at: ranAt, model: String(config.llmModelPlan || 'unknown') };
  }
  const editionDiscoveries = {};
  for (const e of editions) {
    editionDiscoveries[e] = { found_run: runCount, found_at: ranAt, model: String(config.llmModelPlan || 'unknown') };
  }

  // Merge into JSON (1A) — first-discovery-wins
  mergeColorEditionDiscovery({
    productId: product.product_id,
    productRoot,
    newDiscovery: {
      category: product.category,
      colors: colorDiscoveries,
      editions: editionDiscoveries,
      default_color: defaultColor,
      cooldown_until: cooldownUntil,
      last_ran_at: ranAt,
    },
  });

  // Upsert SQL summary (1A)
  specDb.upsertColorEditionFinder({
    category: product.category,
    product_id: product.product_id,
    colors,
    editions,
    default_color: defaultColor,
    cooldown_until: cooldownUntil,
    latest_ran_at: ranAt,
    run_count: 1,
  });

  return { colors, editions, newColorsRegistered, fallbackUsed };
}
