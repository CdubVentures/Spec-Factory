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
import { accumulateDiscoveryLog } from '../../core/finder/discoveryLog.js';
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
 * Union two evidence_refs arrays by (url, tier), keeping the max confidence
 * when the same source appears in both. Same source URL may legitimately
 * appear on multiple VARIANTS — this only dedupes WITHIN a single variant's
 * evidence list.
 */
function unionEvidenceRefs(a = [], b = []) {
  const seen = new Map();
  for (const ref of [...a, ...b]) {
    if (!ref || typeof ref !== 'object' || typeof ref.url !== 'string') continue;
    const key = `${ref.url}|${ref.tier || ''}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, ref);
    } else if (Number(ref.confidence || 0) > Number(existing.confidence || 0)) {
      seen.set(key, ref);
    }
  }
  return [...seen.values()];
}

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
  const urlHistoryEnabled = finderStore.getSetting('urlHistoryEnabled') === 'true';
  const queryHistoryEnabled = finderStore.getSetting('queryHistoryEnabled') === 'true';
  const modelTracking = resolveModelTracking({ config, phaseKey: 'colorFinder', onModelResolved });
  const { wrappedOnModelResolved } = modelTracking;

  const { familyModelCount, ambiguityLevel, siblingModels } = await resolveAmbiguityContext({
    config, category: product.category, brand: product.brand,
    baseModel: product.base_model, currentModel: product.model,
    specDb, resolveFn: resolveIdentityAmbiguitySnapshot, logger,
  });

  const allColors = appDb.listColors();
  const colorNames = allColors.map(c => c.name);

  // Read existing runs for historical context
  const existing = readColorEdition({ productId: product.product_id, productRoot });
  const previousRuns = Array.isArray(existing?.runs) ? existing.runs : [];

  // Universal discovery-log history — product-scoped (no runMatcher) for CEF.
  // WHY: CEF is two-gate (discovery + identity_check) so its response nests
  // discovery_log under .response.discovery.discovery_log. Lift it to the
  // canonical flat path before the helper reads it.
  const normalizedRuns = previousRuns.map((r) => ({
    ...r,
    response: { ...(r.response || {}), discovery_log: r.response?.discovery?.discovery_log },
  }));
  // CEF is product-scoped → suppressions match variant_id='' && mode=''.
  const cefSuppRows = (finderStore.listSuppressions?.(product.product_id) || [])
    .filter((s) => s.variant_id === '' && s.mode === '');
  const previousDiscovery = accumulateDiscoveryLog(normalizedRuns, {
    includeUrls: urlHistoryEnabled,
    includeQueries: queryHistoryEnabled,
    suppressions: {
      urlsChecked: new Set(cefSuppRows.filter((s) => s.kind === 'url').map((s) => s.item)),
      queriesRun: new Set(cefSuppRows.filter((s) => s.kind === 'query').map((s) => s.item)),
    },
  });

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

  // Capture prompt snapshot BEFORE call so the operations modal shows it immediately.
  // WHY: Must include the same identity-context args the LLM call uses (below),
  // otherwise the stored snapshot and the operations modal both show easy-tier
  // "no known siblings" even when the product has a real sibling family.
  // Keep this arg set in sync with the callLlm() call further down.
  const systemPrompt = buildColorEditionFinderPrompt({
    colorNames,
    colors: allColors,
    product,
    previousRuns,
    previousDiscovery,
    familyModelCount,
    ambiguityLevel,
    siblingModels,
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
    isFallback: modelTracking.actualFallbackUsed,
    thinking: modelTracking.actualThinking,
    webSearch: modelTracking.actualWebSearch,
    effortLevel: modelTracking.actualEffortLevel,
    accessMode: modelTracking.actualAccessMode,
    label: 'Discovery',
  });

  // WHY: callLlmWithRouting (via createPhaseCallLlm) already handles
  // primary→fallback internally. A single try/catch is sufficient —
  // if both primary and fallback fail, the error propagates here.
  if (signal?.aborted) throw new DOMException('Operation cancelled', 'AbortError');

  let response, usage;
  try {
    ({ result: response, usage } = await callLlm({ colorNames, colors: allColors, product, previousRuns, previousDiscovery, familyModelCount, ambiguityLevel, siblingModels }));
  } catch (err) {
    logger?.error?.('color_edition_finder_llm_failed', {
      product_id: product.product_id,
      error: err.message,
    });
    return { colors: [], editions: {}, default_color: '', fallbackUsed: false, rejected: true, rejections: [{ reason_code: 'llm_error', message: err.message }] };
  }

  // WHY: LLM schema returns per-item: colors[]={name, evidence_refs}, editions[slug]={display_name, colors, evidence_refs}.
  // Extract atom names for validation/registry work, keep per-item evidence in parallel maps.
  const rawColors = Array.isArray(response?.colors) ? response.colors : [];
  const colors = rawColors
    .map((c) => (c && typeof c === 'object' ? c.name : (typeof c === 'string' ? c : '')))
    .filter((n) => typeof n === 'string' && n.length > 0);
  // Map: raw atom name (pre-repair) → evidence_refs from discovery
  const discoveryEvidenceByAtomRaw = new Map();
  // Map: raw atom name (pre-repair) → LLM's overall value-level confidence
  const discoveryConfidenceByAtomRaw = new Map();
  for (const c of rawColors) {
    if (c && typeof c === 'object' && typeof c.name === 'string') {
      if (Array.isArray(c.evidence_refs)) {
        discoveryEvidenceByAtomRaw.set(c.name, c.evidence_refs);
      }
      if (Number.isFinite(c.confidence)) {
        discoveryConfidenceByAtomRaw.set(c.name, c.confidence);
      }
    }
  }
  const colorNamesMap = (response?.color_names && typeof response.color_names === 'object' && !Array.isArray(response.color_names))
    ? response.color_names
    : {};
  // WHY: LLM may return editions as Record<slug, {display_name, colors, evidence_refs}> or
  // Array<{slug, display_name, colors, evidence_refs}>. Normalize to Record.
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
  // Map: edition slug → evidence_refs from discovery
  const discoveryEvidenceByEditionSlug = new Map();
  // Map: edition slug → LLM's overall value-level confidence
  const discoveryConfidenceByEditionSlug = new Map();
  for (const [slug, ed] of Object.entries(editions)) {
    if (ed && Array.isArray(ed.evidence_refs)) {
      discoveryEvidenceByEditionSlug.set(slug, ed.evidence_refs);
    }
    if (ed && Number.isFinite(ed.confidence)) {
      discoveryConfidenceByEditionSlug.set(slug, ed.confidence);
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
    isFallback: modelTracking.actualFallbackUsed,
    thinking: modelTracking.actualThinking,
    webSearch: modelTracking.actualWebSearch,
    effortLevel: modelTracking.actualEffortLevel,
    accessMode: modelTracking.actualAccessMode,
    usage,
    label: 'Discovery',
  });

  // --- Candidate gate: validate ALL fields before any writes ---
  // WHY: If any field fails validation, the entire LLM response is compromised.
  // No candidate writes, no CEF writes, no cooldown. Failure stored for history.
  // Per-variant candidate writes run AFTER Gate 1 (palette) + Gate 2 (identity check)
  // both pass, once the variant registry is finalized.
  const compiled = specDb.getCompiledRules?.();
  const fieldRules = compiled?.fields || null;
  const knownValues = compiled?.known_values || null;

  let gateColors = colors;
  let gateEditions = editions;
  let cefSourceId = null;
  let cefSourceMeta = null;
  const repairMap = {};

  if (fieldRules && fieldRules.colors) {
    const nextRunNumber = existing?.next_run_number || (previousRuns.length + 1);
    // WHY: Deterministic source_id — stable across rebuilds (product_id + run_number).
    cefSourceId = `cef-${product.product_id}-${nextRunNumber}`;
    cefSourceMeta = { source: 'cef', source_id: cefSourceId, model: modelTracking.actualModel, run_number: nextRunNumber };

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
  }
  // If no compiled rules available, per-variant submission is skipped below

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

  // ── Variant Identity Gate (every run) ─────────────────────────
  // WHY: Identity gate fires on every run — Run 1 audits fresh discoveries
  // for atom collisions and dual-naming; Run 2+ additionally matches against
  // the existing registry. The LLM returns match/new/reject actions.
  let identityCheckResult = null;
  let identityCheckPrompt = null;
  let identityCheckUser = null;
  const hasExistingRegistry = existing?.variant_registry?.length > 0;

  // WHY: Orphaned PIF keys only exist when a registry already exists; skip
  // collection on Run 1.
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
  if (!_callLlmOverride || _callIdentityCheckOverride) {
    if (signal?.aborted) throw new DOMException('Operation cancelled', 'AbortError');
    onStageAdvance?.('Identity');

    const existingRegistry = existing?.variant_registry || [];
    identityCheckPrompt = buildVariantIdentityCheckPrompt({
      product, existingRegistry,
      newColors: gateColors, newColorNames: colorNamesMap, newEditions: gateEditions,
      promptOverride: identityCheckPromptTemplate,
      familyModelCount, ambiguityLevel, siblingModels, runCount: previousRuns.length,
      orphanedPifKeys,
    });
    identityCheckUser = JSON.stringify({
      brand: product.brand || '', model: product.model || '',
      existing_variants: existingRegistry.length,
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
        isFallback: modelTracking.actualFallbackUsed,
        thinking: modelTracking.actualThinking,
        webSearch: modelTracking.actualWebSearch,
        effortLevel: modelTracking.actualEffortLevel,
        accessMode: modelTracking.actualAccessMode,
        label: 'Identity Check',
      });

      const { result: idResult, usage: idUsage } = await callIdentityCheck({
        product, existingRegistry,
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
        isFallback: modelTracking.actualFallbackUsed,
        thinking: modelTracking.actualThinking,
        webSearch: modelTracking.actualWebSearch,
        effortLevel: modelTracking.actualEffortLevel,
        accessMode: modelTracking.actualAccessMode,
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

  // WHY: On Run 1 (no existing registry), apply identity gate reject
  // mappings to filter out variants LLM 2 judged as hallucinated or
  // dual-named. Run 2+ handles rejects via applyIdentityMappings below.
  if (!hasExistingRegistry && identityCheckResult) {
    const rejectedKeys = new Set(
      (identityCheckResult.mappings || [])
        .filter((m) => m.action === 'reject')
        .map((m) => m.new_key),
    );
    if (rejectedKeys.size > 0) {
      gateColors = gateColors.filter((c) => !rejectedKeys.has(`color:${c}`));
      for (const slug of Object.keys(gateEditions)) {
        if (rejectedKeys.has(`edition:${slug}`)) delete gateEditions[slug];
      }
      for (const atom of Object.keys(colorNamesMap)) {
        if (!gateColors.includes(atom)) delete colorNamesMap[atom];
      }
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
    evidence_refs: Array.isArray(response?.evidence_refs) ? response.evidence_refs : [],
  };

  const { ranAt } = computeRanAt();

  // WHY: Nest both prompts/responses whenever identity gate ran (every run now).
  const runPrompt = identityCheckPrompt
    ? { discovery: { system: systemPrompt, user: userMessage }, identity_check: { system: identityCheckPrompt, user: identityCheckUser } }
    : { system: systemPrompt, user: userMessage };
  const runResponse = identityCheckResult
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

  // WHY: Per-variant candidate submission is deferred until after registry build
  // (below). That keeps variant_id references valid — we only write candidates
  // once the final registry (with minted variant_ids) exists.

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

  // ── Per-variant candidate submission ──────────────────────────
  // WHY: Each color atom and each edition becomes its OWN field_candidates row,
  // scoped by variant_id, with that variant's evidence_refs. This mirrors how RDF
  // persists per-variant candidates and lets the review grid render per-row
  // evidence / source / tier / confidence instead of one shared set.
  // A source URL may legitimately appear on multiple variants — no cross-variant
  // dedupe; each variant owns its own evidence list.
  if (fieldRules && fieldRules.colors && cefSourceId && merged.variant_registry?.length > 0) {
    // Apply repair map to discovery evidence so the map is keyed by the
    // repaired atom name that appears in the final variant registry.
    const discoveryEvidenceByAtom = new Map();
    for (const [atom, refs] of discoveryEvidenceByAtomRaw) {
      const repaired = repairMap[atom] ?? atom;
      const existing = discoveryEvidenceByAtom.get(repaired) || [];
      discoveryEvidenceByAtom.set(repaired, unionEvidenceRefs(existing, refs));
    }
    // Parallel: discovery confidence, repaired-keyed. If two raw atoms collapse
    // to the same repaired atom, take the max — the strongest signal wins.
    const discoveryConfidenceByAtom = new Map();
    for (const [atom, conf] of discoveryConfidenceByAtomRaw) {
      const repaired = repairMap[atom] ?? atom;
      const existing = discoveryConfidenceByAtom.get(repaired);
      discoveryConfidenceByAtom.set(repaired, existing == null ? conf : Math.max(existing, conf));
    }

    // Identity check (Run 2+) emits per-mapping evidence_refs. Union those in
    // for match/new actions — reject actions are dropped from the registry.
    const identityEvidenceByKey = new Map();
    // Parallel: identity's per-mapping overall confidence (the authoritative
    // signal on Run 2+, since identity has more context than discovery).
    const identityConfidenceByKey = new Map();
    for (const m of identityCheckResult?.mappings || []) {
      if ((m.action !== 'match' && m.action !== 'new') || typeof m.new_key !== 'string') continue;
      if (Array.isArray(m.evidence_refs) && m.evidence_refs.length > 0) {
        identityEvidenceByKey.set(m.new_key, m.evidence_refs);
      }
      if (Number.isFinite(m.confidence)) {
        identityConfidenceByKey.set(m.new_key, m.confidence);
      }
    }

    const llmMeta = {
      llm_access_mode: modelTracking.actualAccessMode || 'api',
      llm_thinking: modelTracking.actualThinking,
      llm_web_search: modelTracking.actualWebSearch,
      llm_effort_level: modelTracking.actualEffortLevel || '',
    };

    // Clean break: wipe prior CEF-source candidates for this product's CEF fields
    // so the DB state matches the current variant registry exactly. Prior-run
    // evidence remains preserved in color_edition.json.runs[].response.
    specDb.deleteFieldCandidatesBySourceType?.(product.product_id, 'colors', 'cef');
    specDb.deleteFieldCandidatesBySourceType?.(product.product_id, 'editions', 'cef');

    // WHY: Run-scoped HEAD-check dedup cache. The same tier1 URL may appear on
    // every variant when one product page covers all colorways — we fetch once.
    const evidenceCache = new Map();

    for (const variant of merged.variant_registry) {
      if (variant.retired) continue;

      let discoveryRefs = [];
      let discoveryConfidence;
      if (variant.variant_type === 'color') {
        const atom = variant.variant_key.replace(/^color:/, '');
        discoveryRefs = discoveryEvidenceByAtom.get(atom) || [];
        discoveryConfidence = discoveryConfidenceByAtom.get(atom);
      } else if (variant.variant_type === 'edition') {
        discoveryRefs = discoveryEvidenceByEditionSlug.get(variant.edition_slug || '') || [];
        discoveryConfidence = discoveryConfidenceByEditionSlug.get(variant.edition_slug || '');
      }
      const identityRefs = identityEvidenceByKey.get(variant.variant_key) || [];
      const perVariantEvidence = unionEvidenceRefs(discoveryRefs, identityRefs);
      // Precedence: identity checker (Run 2+, more context) > discovery (Run 1
      // or identity miss) > 0. Identity's confidence is scoped to the mapping
      // decision — when it exists we prefer it over discovery's self-rating.
      const identityConfidence = identityConfidenceByKey.get(variant.variant_key);
      const perVariantConfidence = identityConfidence ?? discoveryConfidence ?? 0;

      const baseMetadata = {
        variant_key: variant.variant_key,
        variant_label: variant.variant_label || '',
        variant_type: variant.variant_type,
        evidence_refs: perVariantEvidence,
        ...llmMeta,
      };

      if (variant.variant_type === 'color') {
        const atom = variant.variant_key.replace(/^color:/, '');
        const name = colorNamesMap[atom];
        await submitCandidate({
          category: product.category,
          productId: product.product_id,
          fieldKey: 'colors',
          value: [atom],
          confidence: perVariantConfidence,
          sourceMeta: cefSourceMeta,
          fieldRules,
          knownValues,
          componentDb: null,
          specDb,
          productRoot,
          metadata: name ? { ...baseMetadata, color_name: name } : baseMetadata,
          appDb,
          config,
          variantId: variant.variant_id,
          evidenceCache,
        });
      } else if (variant.variant_type === 'edition') {
        const slug = variant.edition_slug || variant.variant_key.replace(/^edition:/, '');
        const combo = Array.isArray(variant.color_atoms) ? variant.color_atoms.join('+') : '';
        const editionMeta = { ...baseMetadata, edition_display_name: variant.edition_display_name || variant.variant_label || slug };

        // Row under 'editions': the edition slug itself
        await submitCandidate({
          category: product.category,
          productId: product.product_id,
          fieldKey: 'editions',
          value: [slug],
          confidence: perVariantConfidence,
          sourceMeta: cefSourceMeta,
          fieldRules,
          knownValues,
          componentDb: null,
          specDb,
          productRoot,
          metadata: editionMeta,
          appDb,
          config,
          variantId: variant.variant_id,
          evidenceCache,
        });

        // Row under 'colors': the edition's combo, so the colors grid row for
        // this combo has the same per-variant evidence as the edition row.
        if (combo) {
          await submitCandidate({
            category: product.category,
            productId: product.product_id,
            fieldKey: 'colors',
            value: [combo],
            confidence: perVariantConfidence,
            sourceMeta: cefSourceMeta,
            fieldRules,
            knownValues,
            componentDb: null,
            specDb,
            productRoot,
            metadata: editionMeta,
            appDb,
            config,
            variantId: variant.variant_id,
            evidenceCache,
          });
        }
      }
    }
  }

  // Project run into SQL (frontend reads from DB, not JSON)
  const latestRun = merged.runs[merged.runs.length - 1];
  specDb.getFinderStore('colorEditionFinder').insertRun({
    category: product.category,
    product_id: product.product_id,
    run_number: latestRun.run_number,
    ran_at: ranAt,
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
