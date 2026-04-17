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
import { buildVariantRegistry, applyIdentityMappings, validateColorsAgainstPalette, validateIdentityMappings, validateOrphanRemaps } from './variantRegistry.js';
import { createVariantIdentityCheckCallLlm, buildVariantIdentityCheckPrompt } from './colorEditionLlmAdapter.js';
import { submitCandidate, validateField } from '../publisher/index.js';
import { propagateVariantRenames, remapOrphanedVariantKeys } from '../product-image/index.js';
import { backfillPifVariantIdsForProduct, collectOrphanedPifKeys } from '../product-image/backfillPifVariantIds.js';
import { propagateVariantDelete } from '../product-image/index.js';
import { derivePublishedFromVariants } from './variantLifecycle.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';

/**
 * Merge each edition's color combo into the master colors array as ONE intact
 * combo string per edition (e.g. "black+white"). Idempotent — skips combos
 * already present. Mutates `colors` in place.
 *
 * WHY: The LLM contract (see colorEditionLlmAdapter prompt) is that
 * `editions[slug].colors` is a single-element array containing the full combo
 * string — e.g. `["black+white"]`. Join is applied defensively in case the
 * input has already been split into atoms; the combo must stay intact
 * everywhere. Atoms only get split during repair/palette validation, never
 * here and never in storage/published/candidate values.
 */
function mergeEditionColorsInto(colors, editions) {
  for (const edMeta of Object.values(editions)) {
    if (!Array.isArray(edMeta.colors) || edMeta.colors.length === 0) continue;
    const combo = edMeta.colors.join('+');
    if (combo && !colors.includes(combo)) colors.push(combo);
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
    if (entry.variant_type !== 'edition' || !entry.edition_slug) continue;
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
  const discoveryPromptTemplate = finderStore.getSetting('discoveryPromptTemplate') || '';
  const identityCheckPromptTemplate = finderStore.getSetting('identityCheckPromptTemplate') || '';
  const modelTracking = resolveModelTracking({ config, phaseKey: 'colorFinder', onModelResolved });
  const { wrappedOnModelResolved } = modelTracking;

  const { familyModelCount, ambiguityLevel, siblingModels } = await resolveAmbiguityContext({
    config, category: product.category, brand: product.brand,
    baseModel: product.base_model, currentModel: product.model,
    specDb, resolveFn: resolveIdentityAmbiguitySnapshot,
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
    templateOverride: discoveryPromptTemplate,
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
    ({ result: response, usage } = await callLlm({ colorNames, colors: allColors, product, previousRuns, familyModelCount, ambiguityLevel, siblingModels }));
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
  // Candidate writes are DEFERRED — the closure is set here but only invoked
  // after Gate 1 (palette) and Gate 2 (identity check) both pass.
  let deferredCandidateWrite = null;
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
      return storeFailureAndReturn({ specDb, product, existing, model: modelTracking.actualModel, fallbackUsed: modelTracking.actualFallbackUsed, thinking: modelTracking.actualThinking, webSearch: modelTracking.actualWebSearch, rejections: colorsValidation.rejections, raw: { colors, editions, default_color: defaultColor, color_names: colorNamesMap }, productRoot });
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
        return storeFailureAndReturn({ specDb, product, existing, model: modelTracking.actualModel, fallbackUsed: modelTracking.actualFallbackUsed, thinking: modelTracking.actualThinking, webSearch: modelTracking.actualWebSearch, rejections: editionsValidation.rejections, raw: { colors, editions, default_color: defaultColor, color_names: colorNamesMap }, productRoot });
      }
    }

    // Step 4b: Merge edition-exclusive colors into master colors array.
    // WHY: colors[] must be the superset of standard + edition colorways.
    // Any edition color surviving repair but missing from gateColors gets
    // appended so the publisher validates the complete color inventory.
    mergeEditionColorsInto(gateColors, gateEditions);

    // WHY: Candidate writes are DEFERRED until after Gate 1 + Gate 2 pass.
    // Writing here would leak candidates into product.json for runs that
    // later get rejected by palette validation or identity check validation.
    deferredCandidateWrite = () => {
      // WHY: Persist LLM model metadata so candidate cards can display
      // the same SVG badges (thinking, web search, access mode, effort)
      // shown in the operations sidebar and finder run history rows.
      const llmMeta = {
        llm_access_mode: modelTracking.actualAccessMode || 'api',
        llm_thinking: modelTracking.actualThinking,
        llm_web_search: modelTracking.actualWebSearch,
        llm_effort_level: modelTracking.actualEffortLevel || '',
      };
      const colorsMeta = {
        ...(Object.keys(colorNamesMap).length > 0 ? { color_names: colorNamesMap } : {}),
        ...llmMeta,
      };
      submitCandidate({
        category: product.category, productId: product.product_id,
        fieldKey: 'colors', value: gateColors, confidence: 100,
        sourceMeta: cefSourceMeta, fieldRules, knownValues, componentDb: null, specDb, productRoot,
        metadata: colorsMeta, appDb, config,
      });
      const editionsMeta = {
        ...(Object.keys(gateEditions).length > 0 ? { edition_details: gateEditions } : {}),
        ...llmMeta,
      };
      submitCandidate({
        category: product.category, productId: product.product_id,
        fieldKey: 'editions', value: Object.keys(gateEditions), confidence: 100,
        sourceMeta: cefSourceMeta, fieldRules, knownValues, componentDb: null, specDb, productRoot,
        metadata: editionsMeta, appDb, config,
      });
    };
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
      raw: { colors: gateColors, editions: gateEditions, default_color: defaultColor, color_names: colorNamesMap },
      productRoot,
    });
  }

  // WHY: An edition IS a color variant — its combo (e.g. 'dark-gray+black+orange')
  // stays in the published colors list alongside standalone colors. Combos stay
  // intact everywhere. Atom splitting is only for palette validation / repair.

  onStageAdvance?.('Validate');

  // ── Variant Identity Check (Run 2+) ────────────────────────────
  // WHY: If a variant registry already exists, fire a second LLM call to
  // compare new discoveries against existing variants. The LLM decides:
  // match (same variant), new (genuinely new), or reject (hallucinated).
  let identityCheckResult = null;
  let identityCheckPrompt = null;
  let identityCheckUser = null;
  const hasExistingRegistry = existing?.variant_registry?.length > 0;

  // WHY: Collect orphaned PIF keys before identity check so LLM 2 can reconcile
  // them alongside normal discovery matching. Orphans = PIF image keys not in registry.
  let orphanedPifKeys = [];
  if (hasExistingRegistry) {
    orphanedPifKeys = collectOrphanedPifKeys({
      productId: product.product_id,
      registry: existing.variant_registry,
      productRoot,
    });
  }

  // WHY: Skip identity check when _callLlmOverride is set but no identity check
  // override is provided — test mode without real LLM routing.
  if (hasExistingRegistry && (!_callLlmOverride || _callIdentityCheckOverride)) {
    if (signal?.aborted) throw new DOMException('Operation cancelled', 'AbortError');
    onStageAdvance?.('Identity');

    identityCheckPrompt = buildVariantIdentityCheckPrompt({
      product, existingRegistry: existing.variant_registry,
      newColors: gateColors, newColorNames: colorNamesMap, newEditions: gateEditions,
      promptOverride: identityCheckPromptTemplate,
      familyModelCount, ambiguityLevel, siblingModels, runCount: previousRuns.length,
      orphanedPifKeys,
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
        promptOverride: identityCheckPromptTemplate,
        familyModelCount, ambiguityLevel, siblingModels, runCount: previousRuns.length,
        orphanedPifKeys,
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
      // WHY: LLM 2 failure must reject the entire run. Without identity mappings
      // on Run 2+, we'd silently rebuild the registry from scratch, losing stable
      // variant_ids and breaking PIF image links.
      return storeFailureAndReturn({
        specDb, product, existing,
        model: modelTracking.actualModel,
        fallbackUsed: modelTracking.actualFallbackUsed,
        thinking: modelTracking.actualThinking,
        webSearch: modelTracking.actualWebSearch,
        rejections: [{ reason_code: 'identity_check_error', message: err.message }],
        raw: { colors: gateColors, editions: gateEditions, default_color: defaultColor, color_names: colorNamesMap },
        productRoot,
      });
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
        raw: { colors: gateColors, editions: gateEditions, default_color: defaultColor, color_names: colorNamesMap },
        productRoot,
      });
    }
  }

  // WHY: All gates passed — safe to commit candidates now.
  // Deferred from candidate gate to prevent leaking candidates for rejected runs.
  if (deferredCandidateWrite) deferredCandidateWrite();

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
    const { registry: updatedRegistry, removed } = applyIdentityMappings({
      existingRegistry: existing.variant_registry,
      mappings: identityCheckResult.mappings || [],
      remove: identityCheckResult.remove || [],
      productId: product.product_id,
      colors: gateColors,
      colorNames: colorNamesMap,
      editions: gateEditions,
    });
    merged.variant_registry = updatedRegistry;

    // WHY: Cascade PIF delete for variants LLM 2 confirmed don't belong on this product.
    for (const entry of removed) {
      propagateVariantDelete({
        productId: product.product_id,
        variantId: entry.variant_id,
        variantKey: entry.variant_key,
        productRoot,
        specDb,
      });
    }

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

    // ── Orphan reconciliation (non-fatal) ────────────────────────
    // WHY: LLM 2 returns orphan_remaps alongside normal mappings. Remaps
    // heal slug-drifted PIF images; dead purges hallucinated/corrupted data only.
    // Failure here does NOT reject the run — core identity check passed.
    const orphanRemaps = identityCheckResult?.orphan_remaps || [];
    if (orphanRemaps.length > 0) {
      const orphanValidation = validateOrphanRemaps({
        orphanRemaps,
        registry: merged.variant_registry,
      });

      if (orphanValidation.valid) {
        const remaps = [];
        const deadKeys = [];

        for (const or of orphanRemaps) {
          if (or.action === 'remap' && or.remap_to) {
            const target = merged.variant_registry.find(e => e.variant_key === or.remap_to);
            if (target) {
              remaps.push({
                oldKey: or.orphan_key,
                newKey: target.variant_key,
                newVariantId: target.variant_id,
                newLabel: target.variant_label || '',
              });
            }
          } else if (or.action === 'dead') {
            deadKeys.push(or.orphan_key);
          }
        }

        if (remaps.length > 0) {
          remapOrphanedVariantKeys({ productId: product.product_id, productRoot, remaps, specDb });
        }

        for (const deadKey of deadKeys) {
          propagateVariantDelete({ productId: product.product_id, variantId: null, variantKey: deadKey, productRoot, specDb });
        }
      } else {
        logger?.warn?.('orphan_remap_validation_failed', {
          product_id: product.product_id, reason: orphanValidation.reason,
        });
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

  // WHY: Bookkeeping-only upsert — creates the summary row on first run (INSERT)
  // or updates run metadata on subsequent runs. Published state (colors, editions,
  // default_color) is NOT written here — derivePublishedFromVariants owns those
  // columns and fires automatically via the onAfterSync callback below.
  specDb.getFinderStore('colorEditionFinder').upsert({
    category: product.category,
    product_id: product.product_id,
    latest_ran_at: ranAt,
    run_count: merged.run_count,
  });

  // WHY: Dual-write — project variant registry into standalone variants table.
  // onAfterSync triggers derivePublishedFromVariants, which writes the authoritative
  // published state (colors, editions, default_color) to the summary table and
  // product.json. This is the single commit point for all downstream derivation.
  if (merged.variant_registry?.length > 0 && specDb.variants) {
    specDb.variants.syncFromRegistry(product.product_id, merged.variant_registry, {
      onAfterSync: () => derivePublishedFromVariants({ specDb, productId: product.product_id, productRoot }),
    });
  }

  // WHY: Heal orphaned PIF variant_ids — images may reference stale ids
  // from the bug era (identity check silently failing, causing fresh registry
  // builds with new ids for same keys). Idempotent — no-op if nothing to fix.
  if (merged.variant_registry?.length > 0) {
    backfillPifVariantIdsForProduct({
      productId: product.product_id,
      registry: merged.variant_registry,
      productRoot,
      specDb,
    });
  }

  return { colors: gateColors, editions: gateEditions, default_color: gateColors[0] || selected.default_color, fallbackUsed: false, rejected: false };
}
