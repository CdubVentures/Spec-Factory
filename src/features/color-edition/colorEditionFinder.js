/**
 * Color & Edition Finder — orchestrator.
 *
 * Calls the LLM, captures prompt + response, merges into JSON + SQL,
 * and returns the discovered colors/editions with paired structure.
 */

import { buildLlmCallDeps } from '../../core/llm/buildLlmCallDeps.js';
import { resolvePhaseModel } from '../../core/llm/client/routing.js';
import {
  buildColorEditionFinderPrompt,
  createColorEditionFinderCallLlm,
} from './colorEditionLlmAdapter.js';
import { readColorEdition, mergeColorEditionDiscovery } from './colorEditionStore.js';
import { submitCandidate, validateField } from '../publisher/index.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';

const COOLDOWN_DAYS = 30;

function reconcileEditionColors(editions, repairMap) {
  const result = {};
  for (const [name, meta] of Object.entries(editions)) {
    result[name] = {
      ...meta,
      colors: Array.isArray(meta.colors)
        ? meta.colors.map(c => repairMap[c] ?? c)
        : meta.colors,
    };
  }
  return result;
}

function storeFailureAndReturn({ specDb, product, existing, model, rejections, raw, productRoot }) {
  const now = new Date();
  const ranAt = now.toISOString();

  // WHY: Rejected runs MUST persist to JSON (durable SSOT) to prevent
  // run_number collisions and SQL/JSON desync.
  const merged = mergeColorEditionDiscovery({
    productId: product.product_id,
    productRoot,
    newDiscovery: {
      category: product.category,
      cooldown_until: '',
      last_ran_at: ranAt,
    },
    run: {
      model,
      fallback_used: false,
      status: 'rejected',
      selected: {},
      prompt: {},
      response: { status: 'rejected', raw, rejections },
    },
  });

  const latestRun = merged.runs[merged.runs.length - 1];
  specDb.insertColorEditionFinderRun({
    category: product.category,
    product_id: product.product_id,
    run_number: latestRun.run_number,
    ran_at: ranAt,
    model,
    fallback_used: false,
    cooldown_until: '',
    selected: {},
    prompt: {},
    response: { status: 'rejected', raw, rejections },
  });

  // Update SQL summary with correct run_count (includes rejected)
  specDb.upsertColorEditionFinder({
    category: product.category,
    product_id: product.product_id,
    colors: merged.selected?.colors || [],
    editions: Object.keys(merged.selected?.editions || {}),
    default_color: merged.selected?.default_color || '',
    cooldown_until: merged.cooldown_until || '',
    latest_ran_at: ranAt,
    run_count: merged.run_count,
  });

  return { colors: [], editions: {}, default_color: '', fallbackUsed: false, rejected: true, rejections };
}

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
  onStageAdvance = null,
}) {
  productRoot = productRoot || defaultProductRoot();
  const resolvedModel = resolvePhaseModel(config, 'colorFinder') || String(config.llmModelPlan || 'unknown');
  const allColors = appDb.listColors();
  const colorNames = allColors.map(c => c.name);

  // Read existing runs for historical context
  const existing = readColorEdition({ productId: product.product_id, productRoot });
  const previousRuns = Array.isArray(existing?.runs) ? existing.runs : [];

  // Build or use overridden LLM caller
  const callLlm = _callLlmOverride
    || createColorEditionFinderCallLlm(buildLlmCallDeps({ config, logger }));

  // WHY: callLlmWithRouting (via createPhaseCallLlm) already handles
  // primary→fallback internally. A single try/catch is sufficient —
  // if both primary and fallback fail, the error propagates here.
  let response;
  try {
    response = await callLlm({ colorNames, colors: allColors, product, previousRuns });
    onStageAdvance?.(1);
  } catch (err) {
    logger?.error?.('color_edition_finder_llm_failed', {
      product_id: product.product_id,
      error: err.message,
    });
    return { colors: [], editions: {}, default_color: '', fallbackUsed: false };
  }

  const colors = Array.isArray(response?.colors) ? response.colors : [];
  const colorNamesMap = (response?.color_names && typeof response.color_names === 'object' && !Array.isArray(response.color_names))
    ? response.color_names
    : {};
  const editions = (response?.editions && typeof response.editions === 'object' && !Array.isArray(response.editions))
    ? response.editions
    : {};
  const defaultColor = response?.default_color || colors[0] || '';

  // --- Candidate gate: validate ALL fields before any writes ---
  // WHY: If any field fails validation, the entire LLM response is compromised.
  // No candidate writes, no CEF writes, no cooldown. Failure stored for history.
  const compiled = specDb.getCompiledRules?.();
  const fieldRules = compiled?.fields || null;
  const knownValues = compiled?.known_values || null;

  let gateColors = colors;
  let gateEditions = editions;

  if (fieldRules && fieldRules.colors) {
    const cefRunId = `cef-${Date.now()}`;
    const cefSourceMeta = { source: 'cef', model: resolvedModel, run_id: cefRunId };

    // Step 1: Validate colors (pure — no writes yet)
    const colorsValidation = validateField({
      fieldKey: 'colors', value: colors,
      fieldRule: fieldRules.colors,
      knownValues: knownValues?.colors || null,
    });
    const colorsHardRejects = colorsValidation.rejections.filter(r => r.reason_code !== 'unknown_enum_prefer_known');

    if (colorsHardRejects.length > 0) {
      return storeFailureAndReturn({ specDb, product, existing, model: resolvedModel, rejections: colorsValidation.rejections, raw: { colors, editions, default_color: defaultColor }, productRoot });
    }

    // Step 2: Build repair map from colors validation
    // WHY: Repairs may be array-level (template_dispatch: ['Black','Red'] → ['black','red']).
    // Zip before/after arrays element-by-element to build per-value map.
    const repairMap = {};
    for (const r of colorsValidation.repairs) {
      if (Array.isArray(r.before) && Array.isArray(r.after)) {
        for (let i = 0; i < r.before.length; i++) {
          if (r.before[i] !== r.after[i]) repairMap[r.before[i]] = r.after[i];
        }
      } else if (r.before !== r.after) {
        repairMap[r.before] = r.after;
      }
    }
    gateColors = colorsValidation.value;

    // Step 3: Reconcile edition colors through repair map
    gateEditions = reconcileEditionColors(editions, repairMap);

    // Step 4: Validate editions (pure — no writes yet)
    // WHY: editions field rule expects shape=list (array of slug strings).
    // CEF stores the full Record internally; extract slugs for field-level validation.
    if (fieldRules.editions) {
      const editionSlugs = Object.keys(gateEditions);
      const editionsValidation = validateField({
        fieldKey: 'editions', value: editionSlugs,
        fieldRule: fieldRules.editions,
        knownValues: knownValues?.editions || null,
      });
      const editionsHardRejects = editionsValidation.rejections.filter(r => r.reason_code !== 'unknown_enum_prefer_known');

      if (editionsHardRejects.length > 0) {
        return storeFailureAndReturn({ specDb, product, existing, model: resolvedModel, rejections: editionsValidation.rejections, raw: { colors, editions, default_color: defaultColor }, productRoot });
      }
    }

    // Step 5: ALL passed → write both candidates
    const colorsMeta = Object.keys(colorNamesMap).length > 0 ? { color_names: colorNamesMap } : undefined;
    submitCandidate({
      category: product.category, productId: product.product_id,
      fieldKey: 'colors', value: gateColors, confidence: 100,
      sourceMeta: cefSourceMeta, fieldRules, knownValues, componentDb: null, specDb, productRoot,
      metadata: colorsMeta, appDb,
    });
    submitCandidate({
      category: product.category, productId: product.product_id,
      fieldKey: 'editions', value: Object.keys(gateEditions), confidence: 100,
      sourceMeta: cefSourceMeta, fieldRules, knownValues, componentDb: null, specDb, productRoot,
      metadata: Object.keys(gateEditions).length > 0 ? { edition_details: gateEditions } : undefined,
      appDb,
    });
  }
  // If no compiled rules available, gate is skipped — CEF proceeds as before

  const selected = { colors: gateColors, color_names: colorNamesMap, editions: gateEditions, default_color: gateColors[0] || defaultColor };

  // WHY: siblings_excluded and discovery_log are per-run audit data.
  // They live in run.response (not selected) for feed-forward into run N+1.
  const emptyLog = { confirmed_from_known: [], added_new: [], rejected_from_known: [], urls_checked: [], queries_run: [] };
  const storedResponse = {
    colors: gateColors,
    color_names: colorNamesMap,
    editions: gateEditions,
    default_color: selected.default_color,
    siblings_excluded: Array.isArray(response?.siblings_excluded) ? response.siblings_excluded : [],
    discovery_log: response?.discovery_log || emptyLog,
  };

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
      model: resolvedModel,
      fallback_used: false,
      selected,
      prompt: { system: systemPrompt, user: userMessage },
      response: storedResponse,
    },
  });

  // Project run into SQL (frontend reads from DB, not JSON)
  const latestRun = merged.runs[merged.runs.length - 1];
  specDb.insertColorEditionFinderRun({
    category: product.category,
    product_id: product.product_id,
    run_number: latestRun.run_number,
    ran_at: ranAt,
    model: resolvedModel,
    fallback_used: false,
    cooldown_until: cooldownUntil,
    selected,
    prompt: { system: systemPrompt, user: userMessage },
    response: storedResponse,
  });

  // Upsert SQL summary
  specDb.upsertColorEditionFinder({
    category: product.category,
    product_id: product.product_id,
    colors: gateColors,
    editions: Object.keys(gateEditions),
    default_color: selected.default_color,
    cooldown_until: cooldownUntil,
    latest_ran_at: ranAt,
    run_count: merged.run_count,
  });

  return { colors: gateColors, editions: gateEditions, default_color: selected.default_color, fallbackUsed: false, rejected: false };
}
