/**
 * Color & Edition Finder — orchestrator.
 *
 * Calls the LLM, captures prompt + response, merges into JSON + SQL,
 * and returns the discovered colors/editions with paired structure.
 */

import { buildLlmCallDeps } from '../../core/llm/buildLlmCallDeps.js';
import { buildBillingOnUsage } from '../../billing/costLedger.js';
import { resolveIdentityAmbiguitySnapshot } from '../indexing/orchestration/shared/identityHelpers.js';
import {
  computeRanAt,
  resolveModelTracking,
  resolveAmbiguityContext,
  buildFinderLlmCaller,
} from '../../core/finder/finderOrchestrationHelpers.js';
import {
  buildColorEditionFinderPrompt,
  createColorEditionFinderCallLlm,
} from './colorEditionLlmAdapter.js';
import { readColorEdition, writeColorEdition, mergeColorEditionDiscovery } from './colorEditionStore.js';
import { buildVariantRegistry, applyIdentityMappings, validateColorsAgainstPalette, validateIdentityMappings } from './variantRegistry.js';
import { createVariantIdentityCheckCallLlm, buildVariantIdentityCheckPrompt } from './colorEditionLlmAdapter.js';
import { submitCandidate, validateField } from '../publisher/index.js';
import { propagateVariantRenames } from '../product-image/index.js';
import { derivePublishedFromVariants } from './variantLifecycle.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';

/**
 * Merge edition-exclusive colors into the master colors array.
 * Idempotent — skips atoms already present. Mutates `colors` in place.
 */
function mergeEditionColorsInto(colors, editions) {
  for (const edMeta of Object.values(editions)) {
    if (Array.isArray(edMeta.colors)) {
      for (const c of edMeta.colors) {
        if (!colors.includes(c)) colors.push(c);
      }
    }
  }
}

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

// WHY: The discovery LLM may return slightly different edition slugs across runs
// (e.g. 'doom-the-dark-ages' vs 'doom-the-dark-ages-edition'). The variant
// registry's edition_slug is immutable (Gate 2 enforces), so it's the authority.
//
// Two matching strategies (combo primary, elimination fallback):
// 1. Match by color combo — edition.colors[0] === registry.color_atoms.join('+')
// 2. If registry color_atoms were cleared by prior slug drift (the same bug),
//    fall back to identity check elimination — pair unmatched canonical slugs
//    with unmatched discovery slugs when the count is 1:1.
function reconcileEditionSlugsFromRegistry(editions, existingRegistry, identityCheckMappings) {
  if (!existingRegistry?.length || !editions || Object.keys(editions).length === 0) return editions;

  // Strategy 1: combo → canonical slug
  const comboToCanonical = new Map();
  for (const entry of existingRegistry) {
    if (entry.variant_type !== 'edition' || !entry.edition_slug || entry.retired) continue;
    const combo = entry.color_atoms.join('+');
    if (combo) comboToCanonical.set(combo, entry.edition_slug);
  }

  // Strategy 2: identity check elimination (fallback for empty color_atoms)
  const eliminationRemap = new Map();
  if (identityCheckMappings?.length) {
    const editionKeys = new Set(Object.keys(editions));
    const allCanonical = new Set();
    for (const m of identityCheckMappings) {
      if (m.action === 'match' && m.new_key?.startsWith('edition:')) {
        allCanonical.add(m.new_key.replace('edition:', ''));
      }
    }
    const unmatchedCanonical = [...allCanonical].filter(s => !editionKeys.has(s));
    const unmatchedDiscovery = [...editionKeys].filter(k => !allCanonical.has(k));

    // WHY: Only pair when counts match — ambiguous multi-drift is too risky to guess.
    if (unmatchedCanonical.length > 0 && unmatchedCanonical.length === unmatchedDiscovery.length) {
      for (let i = 0; i < unmatchedDiscovery.length; i++) {
        eliminationRemap.set(unmatchedDiscovery[i], unmatchedCanonical[i]);
      }
    }
  }

  if (comboToCanonical.size === 0 && eliminationRemap.size === 0) return editions;

  let changed = false;
  const reconciled = {};
  for (const [slug, ed] of Object.entries(editions)) {
    const combo = (ed.colors || [])[0];
    const comboCanonical = combo ? comboToCanonical.get(combo) : null;
    if (comboCanonical && comboCanonical !== slug) {
      reconciled[comboCanonical] = ed;
      changed = true;
    } else if (eliminationRemap.has(slug)) {
      reconciled[eliminationRemap.get(slug)] = ed;
      changed = true;
    } else {
      reconciled[slug] = ed;
    }
  }

  return changed ? reconciled : editions;
}

function storeFailureAndReturn({ specDb, product, existing, model, fallbackUsed, thinking, webSearch, rejections, raw, productRoot }) {
  const now = new Date();
  const ranAt = now.toISOString();

  // WHY: Rejected runs MUST persist to JSON (durable SSOT) to prevent
  // run_number collisions and SQL/JSON desync.
  const merged = mergeColorEditionDiscovery({
    productId: product.product_id,
    productRoot,
    newDiscovery: {
      category: product.category,
      last_ran_at: ranAt,
    },
    run: {
      model,
      fallback_used: fallbackUsed,
      thinking: Boolean(thinking),
      web_search: Boolean(webSearch),
      status: 'rejected',
      selected: {},
      prompt: {},
      response: { status: 'rejected', raw, rejections },
    },
  });

  const latestRun = merged.runs[merged.runs.length - 1];
  specDb.getFinderStore('colorEditionFinder').insertRun({
    category: product.category,
    product_id: product.product_id,
    run_number: latestRun.run_number,
    ran_at: ranAt,
    model,
    fallback_used: fallbackUsed,
    thinking: Boolean(thinking),
    web_search: Boolean(webSearch),
    selected: {},
    prompt: {},
    response: { status: 'rejected', raw, rejections },
  });

  // Update SQL summary with correct run_count (includes rejected)
  specDb.getFinderStore('colorEditionFinder').upsert({
    category: product.category,
    product_id: product.product_id,
    colors: merged.selected?.colors || [],
    editions: Object.keys(merged.selected?.editions || {}),
    default_color: merged.selected?.default_color || '',
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
  _callIdentityCheckOverride = null,
  onStageAdvance = null,
  onModelResolved = null,
  onStreamChunk = null,
  onQueueWait = null,
  onLlmCallComplete = null,
  signal,
}) {
  productRoot = productRoot || defaultProductRoot();
  const finderStore = specDb.getFinderStore('colorEditionFinder');
  const reinjectQueriesRun = finderStore.getSetting('reinjectQueriesRun') === 'true';
  const modelTracking = resolveModelTracking({ config, phaseKey: 'colorFinder', onModelResolved });
  const { wrappedOnModelResolved } = modelTracking;

  const { familyModelCount, ambiguityLevel } = await resolveAmbiguityContext({
    config, category: product.category, brand: product.brand,
    baseModel: product.base_model, specDb, resolveFn: resolveIdentityAmbiguitySnapshot,
  });

  const allColors = appDb.listColors();
  const colorNames = allColors.map(c => c.name);

  // Read existing runs for historical context
  const existing = readColorEdition({ productId: product.product_id, productRoot });
  const previousRuns = Array.isArray(existing?.runs) ? existing.runs : [];

  // Build or use overridden LLM caller
  const callLlm = buildFinderLlmCaller({
    _callLlmOverride,
    wrappedOnModelResolved,
    createCallLlm: createColorEditionFinderCallLlm,
    llmDeps: buildLlmCallDeps({
      config,
      logger,
      onPhaseChange: onStageAdvance ? (phase) => {
        if (phase === 'writer') onStageAdvance('Writer');
      } : undefined,
      onModelResolved: wrappedOnModelResolved,
      onStreamChunk,
      onQueueWait,
      onUsage: appDb ? buildBillingOnUsage({ config, appDb, category: product.category, productId: product.product_id }) : undefined,
      signal,
    }),
  });

  // Capture prompt snapshot BEFORE call so the operations modal shows it immediately
  const systemPrompt = buildColorEditionFinderPrompt({
    colorNames,
    colors: allColors,
    product,
    previousRuns,
    reinjectQueriesRun,
  });
  const userMessage = JSON.stringify({
    brand: product.brand || '',
    base_model: product.base_model || '',
    model: product.model || '',
    variant: product.variant || '',
  });
  const cefStartedAt = new Date().toISOString();
  const cefStartMs = Date.now();

  onLlmCallComplete?.({
    prompt: { system: systemPrompt, user: userMessage },
    response: null,
    model: modelTracking.actualModel,
    label: 'Discovery',
  });

  // WHY: callLlmWithRouting (via createPhaseCallLlm) already handles
  // primary→fallback internally. A single try/catch is sufficient —
  // if both primary and fallback fail, the error propagates here.
  if (signal?.aborted) throw new DOMException('Operation cancelled', 'AbortError');

  let response, usage;
  try {
    ({ result: response, usage } = await callLlm({ colorNames, colors: allColors, product, previousRuns, familyModelCount, ambiguityLevel, reinjectQueriesRun }));
  } catch (err) {
    logger?.error?.('color_edition_finder_llm_failed', {
      product_id: product.product_id,
      error: err.message,
    });
    return { colors: [], editions: {}, default_color: '', fallbackUsed: false, rejected: true, rejections: [{ reason_code: 'llm_error', message: err.message }] };
  }

  const colors = Array.isArray(response?.colors) ? response.colors : [];
  const colorNamesMap = (response?.color_names && typeof response.color_names === 'object' && !Array.isArray(response.color_names))
    ? response.color_names
    : {};
  // WHY: LLM may return editions as either a Record<slug, {display_name, colors}>
  // (schema-constrained) or an Array<{slug, display_name, colors}> (free-form).
  // Normalize both shapes into the expected Record format.
  let editions = {};
  if (response?.editions && typeof response.editions === 'object' && !Array.isArray(response.editions)) {
    editions = response.editions;
  } else if (Array.isArray(response?.editions)) {
    for (const entry of response.editions) {
      if (entry && typeof entry === 'object' && typeof entry.slug === 'string' && entry.slug) {
        const { slug, ...rest } = entry;
        editions[slug] = rest;
      }
    }
  }
  const defaultColor = response?.default_color || colors[0] || '';

  // WHY: Discovery post-emit must fire BEFORE identity check section.
  // The smart-update logic in operationsRegistry merges the first non-null
  // response into the last pending entry. If identity check fires first,
  // it overwrites the discovery entry.
  onLlmCallComplete?.({
    prompt: { system: systemPrompt, user: userMessage },
    response: { colors, color_names: colorNamesMap, editions, default_color: defaultColor,
      siblings_excluded: Array.isArray(response?.siblings_excluded) ? response.siblings_excluded : [],
      discovery_log: response?.discovery_log || {} },
    model: modelTracking.actualModel,
    usage,
    label: 'Discovery',
  });

  // --- Candidate gate: validate ALL fields before any writes ---
  // WHY: If any field fails validation, the entire LLM response is compromised.
  // No candidate writes, no CEF writes, no cooldown. Failure stored for history.
  const compiled = specDb.getCompiledRules?.();
  const fieldRules = compiled?.fields || null;
  const knownValues = compiled?.known_values || null;

  let gateColors = colors;
  let gateEditions = editions;

  if (fieldRules && fieldRules.colors) {
    const nextRunNumber = existing?.next_run_number || (previousRuns.length + 1);
    // WHY: Deterministic source_id — stable across rebuilds (product_id + run_number).
    const cefSourceId = `cef-${product.product_id}-${nextRunNumber}`;
    const cefSourceMeta = { source: 'cef', source_id: cefSourceId, model: modelTracking.actualModel, run_number: nextRunNumber };

    // Step 1: Validate colors (pure — no writes yet)
    const colorsValidation = validateField({
      fieldKey: 'colors', value: colors,
      fieldRule: fieldRules.colors,
      knownValues: knownValues?.colors || null,
    });
    const colorsHardRejects = colorsValidation.rejections.filter(r => r.reason_code !== 'unknown_enum_prefer_known');

    if (colorsHardRejects.length > 0) {
      return storeFailureAndReturn({ specDb, product, existing, model: modelTracking.actualModel, fallbackUsed: modelTracking.actualFallbackUsed, thinking: modelTracking.actualThinking, webSearch: modelTracking.actualWebSearch, rejections: colorsValidation.rejections, raw: { colors, editions, default_color: defaultColor }, productRoot });
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
        return storeFailureAndReturn({ specDb, product, existing, model: modelTracking.actualModel, fallbackUsed: modelTracking.actualFallbackUsed, thinking: modelTracking.actualThinking, webSearch: modelTracking.actualWebSearch, rejections: editionsValidation.rejections, raw: { colors, editions, default_color: defaultColor }, productRoot });
      }
    }

    // Step 4b: Merge edition-exclusive colors into master colors array.
    // WHY: colors[] must be the superset of standard + edition colorways.
    // Any edition color surviving repair but missing from gateColors gets
    // appended so the publisher validates the complete color inventory.
    mergeEditionColorsInto(gateColors, gateEditions);

    // Step 5: ALL passed → write both candidates
    const colorsMeta = Object.keys(colorNamesMap).length > 0 ? { color_names: colorNamesMap } : undefined;
    submitCandidate({
      category: product.category, productId: product.product_id,
      fieldKey: 'colors', value: gateColors, confidence: 100,
      sourceMeta: cefSourceMeta, fieldRules, knownValues, componentDb: null, specDb, productRoot,
      metadata: colorsMeta, appDb, config,
    });
    submitCandidate({
      category: product.category, productId: product.product_id,
      fieldKey: 'editions', value: Object.keys(gateEditions), confidence: 100,
      sourceMeta: cefSourceMeta, fieldRules, knownValues, componentDb: null, specDb, productRoot,
      metadata: Object.keys(gateEditions).length > 0 ? { edition_details: gateEditions } : undefined,
      appDb, config,
    });
  }
  // If no compiled rules available, gate is skipped — CEF proceeds as before

  // Safety net: ensure edition-exclusive colors are always in the master array.
  // Idempotent — skips atoms already merged by the gated path above.
  mergeEditionColorsInto(gateColors, gateEditions);

  // ── Gate 1: Palette validation ──────────────────────────────────
  // WHY: Every color atom must exist in the registered palette. If ANY atom
  // is unknown, the LLM hallucinated — toss the entire run (tainted batch).
  const paletteNames = allColors.map(c => c.name);
  const paletteCheck = validateColorsAgainstPalette({ colors: gateColors, editions: gateEditions, palette: paletteNames });
  if (!paletteCheck.valid) {
    return storeFailureAndReturn({
      specDb, product, existing,
      model: modelTracking.actualModel,
      fallbackUsed: modelTracking.actualFallbackUsed,
      thinking: modelTracking.actualThinking,
      webSearch: modelTracking.actualWebSearch,
      rejections: [{ reason_code: 'unknown_color_atom', message: paletteCheck.reason, unknownAtoms: paletteCheck.unknownAtoms }],
      raw: { colors: gateColors, editions: gateEditions, default_color: defaultColor },
      productRoot,
    });
  }

  // WHY: gateColors includes edition combo strings (e.g., 'dark-gray+black+orange')
  // needed by buildVariantRegistry to detect edition entries. But candidates, summary,
  // and return value must only contain standalone colors — multi-atom edition combos
  // stay scoped to their edition and are never published as standalone colors.
  // Single-atom edition colors (e.g., 'black' for an edition that comes in black)
  // are always standalone colors — they describe the product, not just the edition.
  const editionCombos = new Set();
  for (const ed of Object.values(gateEditions)) {
    const combo = (ed.colors || [])[0];
    if (combo && combo.includes('+')) editionCombos.add(combo);
  }
  const standaloneColors = gateColors.filter(c => !editionCombos.has(c));

  onStageAdvance?.('Validate');

  // ── Variant Identity Check (Run 2+) ────────────────────────────
  // WHY: If a variant registry already exists, fire a second LLM call to
  // compare new discoveries against existing variants. The LLM decides:
  // match (same variant), new (genuinely new), or reject (hallucinated).
  let identityCheckResult = null;
  let identityCheckPrompt = null;
  let identityCheckUser = null;
  const hasExistingRegistry = existing?.variant_registry?.length > 0;

  // WHY: Skip identity check when _callLlmOverride is set but no identity check
  // override is provided — test mode without real LLM routing.
  if (hasExistingRegistry && (!_callLlmOverride || _callIdentityCheckOverride)) {
    if (signal?.aborted) throw new DOMException('Operation cancelled', 'AbortError');
    onStageAdvance?.('Identity');

    const identityPromptOverride = '';

    identityCheckPrompt = buildVariantIdentityCheckPrompt({
      product, existingRegistry: existing.variant_registry,
      newColors: gateColors, newColorNames: colorNamesMap, newEditions: gateEditions,
      promptOverride: identityPromptOverride,
    });
    identityCheckUser = JSON.stringify({
      brand: product.brand || '', model: product.model || '',
      existing_variants: existing.variant_registry.length,
      new_colors: gateColors.length, new_editions: Object.keys(gateEditions).length,
    });

    try {
      let callIdentityCheck = _callIdentityCheckOverride;
      if (!callIdentityCheck) {
        const llmDeps = buildLlmCallDeps({
          config, logger,
          onModelResolved: modelTracking.wrappedOnModelResolved,
          onStreamChunk, onQueueWait, signal,
          onUsage: appDb ? buildBillingOnUsage({ config, appDb, category: product.category, productId: product.product_id }) : undefined,
        });
        callIdentityCheck = createVariantIdentityCheckCallLlm(llmDeps);
      }

      // WHY: Two-phase emit for identity check — pre-emit shows prompt immediately
      // in operations modal, post-emit fills in response + tokens.
      onLlmCallComplete?.({
        prompt: { system: identityCheckPrompt, user: identityCheckUser },
        response: null,
        model: modelTracking.actualModel,
        label: 'Identity Check',
      });

      const { result: idResult, usage: idUsage } = await callIdentityCheck({
        product, existingRegistry: existing.variant_registry,
        newColors: gateColors, newColorNames: colorNamesMap, newEditions: gateEditions,
        promptOverride: identityPromptOverride,
      });
      identityCheckResult = idResult;

      onLlmCallComplete?.({
        prompt: { system: identityCheckPrompt, user: identityCheckUser },
        response: identityCheckResult,
        model: modelTracking.actualModel,
        usage: idUsage || null,
        label: 'Identity Check',
      });
    } catch (err) {
      logger?.error?.('variant_identity_check_failed', {
        product_id: product.product_id, error: err.message,
      });
      // WHY: Identity check failure is not fatal — fall back to Phase 1 behavior
      // (write-once registry). The discovery data is still valid.
    }
  }

  onStageAdvance?.('Confirm');

  // WHY: Reconcile edition slugs to canonical registry values before building
  // selected. Prevents slug drift from breaking PIF variant linking and
  // applyIdentityMappings display name lookups.
  if (hasExistingRegistry) {
    gateEditions = reconcileEditionSlugsFromRegistry(gateEditions, existing.variant_registry, identityCheckResult?.mappings);
  }

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

  const { ranAt } = computeRanAt();

  // WHY: Nest both prompts/responses when identity check ran. On Run 1 (no identity
  // check), keep the flat structure for backward compat with existing GUI/SQL readers.
  const runPrompt = hasExistingRegistry && identityCheckPrompt
    ? { discovery: { system: systemPrompt, user: userMessage }, identity_check: { system: identityCheckPrompt, user: identityCheckUser } }
    : { system: systemPrompt, user: userMessage };
  const runResponse = hasExistingRegistry && identityCheckResult
    ? { discovery: storedResponse, identity_check: identityCheckResult }
    : storedResponse;

  // ── Gate 2: Identity check validation ─────────────────────────
  // WHY: Must run BEFORE persisting the merge. If identity check produced
  // invalid mappings (duplicate matches, slug changes, unknown atoms),
  // reject the entire run without writing a ghost successful run to JSON.
  if (hasExistingRegistry && identityCheckResult) {
    const idValidation = validateIdentityMappings({
      mappings: identityCheckResult.mappings || [],
      existingRegistry: existing.variant_registry,
      palette: paletteNames,
    });
    if (!idValidation.valid) {
      logger?.warn?.('variant_identity_check_invalid', { product_id: product.product_id, reason: idValidation.reason });
      return storeFailureAndReturn({
        specDb, product, existing,
        model: modelTracking.actualModel,
        fallbackUsed: modelTracking.actualFallbackUsed,
        thinking: modelTracking.actualThinking,
        webSearch: modelTracking.actualWebSearch,
        rejections: [{ reason_code: 'identity_check_invalid', message: idValidation.reason }],
        raw: { colors: gateColors, editions: gateEditions, default_color: defaultColor },
        productRoot,
      });
    }
  }

  // Merge into JSON (durable memory — both gates passed)
  const merged = mergeColorEditionDiscovery({
    productId: product.product_id,
    productRoot,
    newDiscovery: {
      category: product.category,
      last_ran_at: ranAt,
    },
    run: {
      started_at: cefStartedAt,
      duration_ms: Date.now() - cefStartMs,
      model: modelTracking.actualModel,
      fallback_used: modelTracking.actualFallbackUsed,
      effort_level: modelTracking.actualEffortLevel,
      access_mode: modelTracking.actualAccessMode,
      thinking: modelTracking.actualThinking,
      web_search: modelTracking.actualWebSearch,
      selected,
      prompt: runPrompt,
      response: runResponse,
    },
  });

  // ── Variant registry update ────────────────────────────────────
  if (hasExistingRegistry && identityCheckResult) {
    // Run 2+: Apply validated identity check mappings to existing registry
    merged.variant_registry = applyIdentityMappings({
      existingRegistry: existing.variant_registry,
      mappings: identityCheckResult.mappings || [],
      retired: identityCheckResult.retired || [],
      productId: product.product_id,
      colors: gateColors,
      colorNames: colorNamesMap,
      editions: gateEditions,
    });
    writeColorEdition({ productId: product.product_id, productRoot, data: merged });

    // WHY: Both gates passed — propagate validated variant key changes to PIF
    // so images, carousel slots, and eval records stay linked.
    const registryUpdates = [];
    for (const mapping of (identityCheckResult.mappings || [])) {
      if (mapping.action === 'match' && mapping.match) {
        const oldEntry = existing.variant_registry.find(e => e.variant_id === mapping.match);
        const newEntry = merged.variant_registry.find(e => e.variant_id === mapping.match);
        if (oldEntry && newEntry && oldEntry.variant_key !== newEntry.variant_key) {
          registryUpdates.push({
            variant_id: mapping.match,
            old_variant_key: oldEntry.variant_key,
            new_variant_key: newEntry.variant_key,
            new_variant_label: newEntry.variant_label || '',
          });
        }
      }
    }
    if (registryUpdates.length > 0) {
      const propResult = propagateVariantRenames({ productId: product.product_id, productRoot, registryUpdates, specDb });
      if (!propResult?.updated) {
        logger?.warn?.('variant_rename_propagation_failed', { product_id: product.product_id, updates: registryUpdates.length });
      }
    }
  } else if (!merged.variant_registry || merged.variant_registry.length === 0) {
    // Run 1: Generate fresh registry
    merged.variant_registry = buildVariantRegistry({
      productId: product.product_id,
      colors: gateColors,
      colorNames: colorNamesMap,
      editions: gateEditions,
    });
    writeColorEdition({ productId: product.product_id, productRoot, data: merged });
  }

  // Project run into SQL (frontend reads from DB, not JSON)
  const latestRun = merged.runs[merged.runs.length - 1];
  specDb.getFinderStore('colorEditionFinder').insertRun({
    category: product.category,
    product_id: product.product_id,
    run_number: latestRun.run_number,
    ran_at: ranAt,
    model: modelTracking.actualModel,
    fallback_used: modelTracking.actualFallbackUsed,
    effort_level: modelTracking.actualEffortLevel,
    access_mode: modelTracking.actualAccessMode,
    thinking: modelTracking.actualThinking,
    web_search: modelTracking.actualWebSearch,
    selected,
    prompt: runPrompt,
    response: runResponse,
  });

  // Upsert SQL summary
  specDb.getFinderStore('colorEditionFinder').upsert({
    category: product.category,
    product_id: product.product_id,
    colors: standaloneColors,
    editions: Object.keys(gateEditions),
    default_color: standaloneColors[0] || selected.default_color,
    variant_registry: merged.variant_registry || [],
    latest_ran_at: ranAt,
    run_count: merged.run_count,
  });

  // WHY: Dual-write — project variant registry into standalone variants table.
  if (merged.variant_registry?.length > 0 && specDb.variants) {
    specDb.variants.syncFromRegistry(product.product_id, merged.variant_registry);
  }

  // WHY: Variant-derived publishing — overwrite candidate-published values
  // with authoritative variant-derived state from the variants table.
  if (specDb.variants) {
    derivePublishedFromVariants({ specDb, productId: product.product_id, productRoot });
  }

  return { colors: standaloneColors, editions: gateEditions, default_color: standaloneColors[0] || selected.default_color, fallbackUsed: false, rejected: false };
}
