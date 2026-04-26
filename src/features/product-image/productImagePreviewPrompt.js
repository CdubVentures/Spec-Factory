/**
 * Product Image Finder — prompt preview compiler.
 *
 * Exports:
 *   - Four pure arg-bag resolvers shared with the orchestrator (resolveViewPromptInputs,
 *     resolveHeroPromptInputs, resolveViewEvalPromptInputs, resolveHeroEvalPromptInputs).
 *     Single source of truth for the builder's input shape — any new field goes here once.
 *   - resolvePifPromptContext(ctx) — top-level async resolver for the preview route. Reads
 *     PIF finderStore settings, resolves variant + identity + view config + previous discovery
 *     state from scratch.
 *   - compilePifPreviewPrompt(ctx) — HTTP preview entry. Routes on ctx.body.mode ∈ {view, hero,
 *     loop, view-eval, hero-eval}. No LLM dispatch, no persistence, no operations.
 */

import path from 'node:path';
import {
  buildProductImageFinderPrompt,
  buildHeroImageFinderPrompt,
  resolveViewConfig,
  resolveViewBudget,
  resolveViewEvalCriteria,
} from './productImageLlmAdapter.js';
import {
  buildViewEvalPrompt,
  buildHeroSelectionPrompt,
} from './imageEvaluator.js';
import { resolveViewQualityConfig } from './viewQualityDefaults.js';
import {
  resolveSingleRunSecondaryHints,
  resolveLoopRunSecondaryHints,
  resolveIndividualViewRunSecondaryHints,
} from './secondaryHintsDefaults.js';
import { resolveViewPrompt, viewPromptSettingKey } from './viewPromptDefaults.js';
import { readProductImages } from './productImageStore.js';
import { matchVariant } from './variantMatch.js';
import { resolveProductImageIdentityFacts } from './productImageIdentityDependencies.js';
import { accumulateDiscoveryLog } from '../../core/finder/discoveryLog.js';
import { resolveRunScopeKey, scopeLabelFor } from './runScope.js';
import { resolveAmbiguityContext } from '../../core/finder/finderOrchestrationHelpers.js';
import { resolveIdentityAmbiguitySnapshot } from '../indexing/orchestration/shared/identityHelpers.js';
import { resolvePhaseModel } from '../../core/llm/client/routing.js';
import { zodToLlmSchema } from '../../core/llm/zodToLlmSchema.js';
import { productImageFinderResponseSchema } from './productImageSchema.js';
import { viewEvalResponseSchema, heroEvalResponseSchema } from './imageEvaluatorSchema.js';

/* ── Pure arg-bag resolvers (shared with orchestrator) ─────────────────────── */

/**
 * Build the arg bag for buildProductImageFinderPrompt (single-variant view mode OR per-iteration loop).
 *
 * Inputs are already-computed orchestrator context. Preview callers resolve these
 * via resolvePifPromptContext; orchestrator passes what it has locally.
 */
export function resolveViewPromptInputs({
  product,
  variant,
  allVariants,
  priorityViews,
  additionalViews,
  viewQualityMap,
  minWidth,
  minHeight,
  siblingsExcluded,
  familyModelCount,
  ambiguityLevel,
  previousDiscovery,
  scopeLabel,
  viewPromptOverride = '',
  productImageIdentityFacts = [],
}) {
  return {
    product,
    variantLabel: variant.label,
    variantType: variant.type,
    variantKey: variant.key,
    allVariants,
    priorityViews,
    additionalViews,
    minWidth,
    minHeight,
    viewQualityMap,
    siblingsExcluded,
    familyModelCount,
    ambiguityLevel,
    previousDiscovery,
    scopeLabel,
    promptOverride: viewPromptOverride,
    productImageIdentityFacts,
  };
}

/**
 * Build the arg bag for buildHeroImageFinderPrompt.
 */
export function resolveHeroPromptInputs({
  product,
  variant,
  viewQualityMap,
  siblingsExcluded,
  familyModelCount,
  ambiguityLevel,
  previousDiscovery,
  scopeLabel,
  heroPromptOverride = '',
  productImageIdentityFacts = [],
}) {
  const heroQuality = (viewQualityMap && viewQualityMap.hero) || {};
  return {
    product,
    variantLabel: variant.label,
    variantType: variant.type,
    minWidth: heroQuality.minWidth || 600,
    minHeight: heroQuality.minHeight || 400,
    siblingsExcluded,
    familyModelCount,
    ambiguityLevel,
    previousDiscovery,
    scopeLabel,
    promptOverride: heroPromptOverride,
    productImageIdentityFacts,
  };
}

/**
 * Build the arg bag for buildViewEvalPrompt.
 * `candidates` is the filtered image list for (variant, view); candidateCount is its length.
 */
export function resolveViewEvalPromptInputs({
  product,
  variant,
  view,
  viewDescription,
  candidates,
  evalPromptOverride = '',
  evalCriteria = '',
  productImageIdentityFacts = [],
}) {
  return {
    product,
    variantLabel: variant.label,
    variantType: variant.type,
    view,
    viewDescription,
    candidateCount: candidates.length,
    promptOverride: evalPromptOverride,
    evalCriteria,
    productImageIdentityFacts,
  };
}

/**
 * Build the arg bag for buildHeroSelectionPrompt.
 */
export function resolveHeroEvalPromptInputs({
  product,
  variant,
  candidates,
  heroPromptOverride = '',
  heroCriteria = '',
  heroCount = 3,
  productImageIdentityFacts = [],
}) {
  return {
    product,
    variantLabel: variant.label,
    variantType: variant.type,
    candidates: candidates.map((c) => ({ filename: c.filename })),
    promptOverride: heroPromptOverride,
    heroCriteria,
    heroCount,
    productImageIdentityFacts,
  };
}

/* ── Top-level preview context resolver ───────────────────────────────────── */

/**
 * Resolve everything the preview compiler needs: variant, identity context, view config,
 * previous discovery, settings. Used by compilePifPreviewPrompt; not called from the
 * orchestrator (which has its own upstream state).
 */
export async function resolvePifPromptContext({
  product,
  variantKey,
  appDb,
  specDb,
  config = {},
  productRoot,
  logger = null,
}) {
  const finderStore = specDb.getFinderStore('productImageFinder');

  const rawVariants = specDb.variants?.listActive(product.product_id) || [];
  const variant = rawVariants.find((v) => v.variant_key === variantKey || v.variant_id === variantKey);
  if (!variant) {
    const err = new Error(`variant not found: ${variantKey}`);
    err.statusCode = 400;
    throw err;
  }
  const variantShape = {
    key: variant.variant_key,
    variant_id: variant.variant_id,
    label: variant.variant_label || variant.variant_key,
    type: variant.variant_type || 'color',
  };
  const productImageIdentityFacts = resolveProductImageIdentityFacts({
    specDb,
    product,
    variant: variantShape,
  });

  // WHY: Canonicalize variant shape for buildSiblingVariantsPromptBlock which
  // filters by `.key` and reads `.label` / `.type`. Raw DB rows use
  // variant_key / variant_label / variant_type; without this transform the
  // sibling-variants block renders "undefined" labels.
  const variants = rawVariants.map((v) => ({
    variant_id: v.variant_id,
    key: v.variant_key,
    label: v.variant_label,
    type: v.variant_type,
  }));

  const { familyModelCount, ambiguityLevel, siblingModels: siblingsExcluded } = await resolveAmbiguityContext({
    config,
    category: product.category,
    brand: product.brand,
    baseModel: product.base_model,
    currentModel: product.model,
    specDb,
    resolveFn: resolveIdentityAmbiguitySnapshot,
    logger,
  });

  const viewConfigRaw = finderStore.getSetting('viewConfig') || '';
  const viewConfig = resolveViewConfig(viewConfigRaw, product.category);
  const viewQualityMap = resolveViewQualityConfig(
    finderStore.getSetting('viewQualityConfig') || '',
    product.category,
    Number(finderStore.getSetting('minWidth')) || undefined,
    Number(finderStore.getSetting('minHeight')) || undefined,
    Number(finderStore.getSetting('minFileSize')) || undefined,
  );
  const viewBudget = resolveViewBudget(finderStore.getSetting('viewBudget') || '', product.category);
  const singleRunHintKeys = resolveSingleRunSecondaryHints(finderStore.getSetting('singleRunSecondaryHints') || '', product.category);
  const loopRunHintKeys = resolveLoopRunSecondaryHints(finderStore.getSetting('loopRunSecondaryHints') || '', product.category);
  const individualViewRunHintKeys = resolveIndividualViewRunSecondaryHints(finderStore.getSetting('individualViewRunSecondaryHints') || '', product.category);

  const priorityViews = viewConfig
    .filter((v) => v.priority)
    .map((v) => ({
      key: v.key,
      description: resolveViewPrompt({
        role: 'priority', category: product.category, view: v.key,
        dbOverride: finderStore.getSetting(viewPromptSettingKey('priority', v.key)) || '',
      }),
    }));
  const priorityKeySet = new Set(priorityViews.map((v) => v.key));
  const singleAdditionalViews = singleRunHintKeys
    .filter((k) => !priorityKeySet.has(k))
    .map((k) => ({
      key: k,
      description: resolveViewPrompt({
        role: 'additional', category: product.category, view: k,
        dbOverride: finderStore.getSetting(viewPromptSettingKey('additional', k)) || '',
      }),
    }));

  const minWidth = Number(finderStore.getSetting('minWidth')) || 800;
  const minHeight = Number(finderStore.getSetting('minHeight')) || 600;
  const heroEnabled = finderStore.getSetting('heroEnabled') !== 'false';
  const heroCount = Number(finderStore.getSetting('heroCount')) || 3;
  const viewPromptOverride = finderStore.getSetting('viewPromptOverride') || '';
  const heroPromptOverride = finderStore.getSetting('heroPromptOverride') || '';
  const evalPromptOverride = finderStore.getSetting('evalPromptOverride') || '';
  const heroEvalPromptOverride = finderStore.getSetting('heroEvalPromptOverride') || '';
  const heroEvalCriteria = finderStore.getSetting('heroEvalCriteria') || '';

  const urlHistoryEnabled = finderStore.getSetting('urlHistoryEnabled') === 'true';
  const queryHistoryEnabled = finderStore.getSetting('queryHistoryEnabled') === 'true';

  const pifDoc = readProductImages({ productId: product.product_id, productRoot });
  const previousPifRuns = Array.isArray(pifDoc?.runs) ? pifDoc.runs : [];

  // WHY: Match the orchestrator's per-pool partitioning so preview history
  // is byte-identical to what the matching real run would receive.
  function buildPreviousDiscoveryByPool(runScopeKey) {
    return accumulateDiscoveryLog(previousPifRuns, {
      runMatcher: (r) => {
        const rId = r.response?.variant_id;
        const rKey = r.response?.variant_key;
        const variantMatch = (variantShape.variant_id && rId) ? rId === variantShape.variant_id : rKey === variantShape.key;
        return variantMatch && r.response?.run_scope_key === runScopeKey;
      },
      includeUrls: urlHistoryEnabled,
      includeQueries: queryHistoryEnabled,
    });
  }

  const modelInfo = {
    id: resolvePhaseModel(config, 'imageFinder') || String(config.llmModelPlan || 'unknown'),
    thinking_effort: config._resolvedImageFinderThinkingEffort || '',
    web_search: Boolean(config._resolvedImageFinderWebSearch),
    json_strict: config._resolvedImageFinderJsonStrict !== false,
  };

  return {
    product, variant: variantShape, allVariants: variants,
    familyModelCount, ambiguityLevel, siblingsExcluded,
    viewConfig, viewQualityMap, viewBudget,
    priorityViews, singleAdditionalViews, loopRunHintKeys, individualViewRunHintKeys,
    minWidth, minHeight,
    heroEnabled, heroCount,
    viewPromptOverride, heroPromptOverride,
    evalPromptOverride, heroEvalPromptOverride, heroEvalCriteria,
    productImageIdentityFacts,
    previousPifRuns, buildPreviousDiscoveryByPool, pifDoc,
    productRoot, modelInfo, finderStore,
  };
}

/* ── Per-mode preview compilers ───────────────────────────────────────────── */

function envelope({ mode, prompts, inputsResolved, notes = [] }) {
  return {
    finder: 'pif',
    mode,
    compiled_at: Date.now(),
    prompts,
    inputs_resolved: inputsResolved,
    notes,
  };
}

function userMsgFor(product, variantKey) {
  return JSON.stringify({
    brand: product.brand || '',
    model: product.model || '',
    base_model: product.base_model || '',
    variant: variantKey,
  });
}

function buildViewPromptEntry(baseCtx, focusView, additionalViews, label, runScopeKey) {
  const priorityForFocus = focusView
    ? [{
        key: focusView,
        description: baseCtx.priorityViews.find((v) => v.key === focusView)?.description
          || resolveViewPrompt({
            role: 'priority', category: baseCtx.product.category, view: focusView,
            dbOverride: baseCtx.finderStore.getSetting(viewPromptSettingKey('priority', focusView)) || '',
          }),
      }]
    : baseCtx.priorityViews;
  const promptInputs = resolveViewPromptInputs({
    product: baseCtx.product,
    variant: baseCtx.variant,
    allVariants: baseCtx.allVariants,
    priorityViews: priorityForFocus,
    additionalViews,
    viewQualityMap: baseCtx.viewQualityMap,
    minWidth: baseCtx.minWidth,
    minHeight: baseCtx.minHeight,
    siblingsExcluded: baseCtx.siblingsExcluded,
    familyModelCount: baseCtx.familyModelCount,
    ambiguityLevel: baseCtx.ambiguityLevel,
    previousDiscovery: baseCtx.buildPreviousDiscoveryByPool(runScopeKey),
    scopeLabel: scopeLabelFor(runScopeKey),
    viewPromptOverride: baseCtx.viewPromptOverride,
    productImageIdentityFacts: baseCtx.productImageIdentityFacts,
  });
  return {
    label,
    system: buildProductImageFinderPrompt(promptInputs),
    user: userMsgFor(baseCtx.product, baseCtx.variant.key),
    schema: zodToLlmSchema(productImageFinderResponseSchema),
    model: baseCtx.modelInfo,
    notes: [],
  };
}

function buildHeroPromptEntry(baseCtx, runScopeKey, label = 'hero') {
  const promptInputs = resolveHeroPromptInputs({
    product: baseCtx.product,
    variant: baseCtx.variant,
    viewQualityMap: baseCtx.viewQualityMap,
    siblingsExcluded: baseCtx.siblingsExcluded,
    familyModelCount: baseCtx.familyModelCount,
    ambiguityLevel: baseCtx.ambiguityLevel,
    previousDiscovery: baseCtx.buildPreviousDiscoveryByPool(runScopeKey),
    scopeLabel: scopeLabelFor(runScopeKey),
    heroPromptOverride: baseCtx.heroPromptOverride,
    productImageIdentityFacts: baseCtx.productImageIdentityFacts,
  });
  return {
    label,
    system: buildHeroImageFinderPrompt(promptInputs),
    user: userMsgFor(baseCtx.product, baseCtx.variant.key),
    schema: zodToLlmSchema(productImageFinderResponseSchema),
    model: baseCtx.modelInfo,
    notes: [],
  };
}

function variantImagesFromDoc(baseCtx, modeFilter) {
  const allImages = (baseCtx.pifDoc?.selected?.images) || [];
  const filtered = allImages.filter((img) => matchVariant(img, { variantId: baseCtx.variant.variant_id, variantKey: baseCtx.variant.key }));
  if (!modeFilter) return filtered;
  return filtered.filter((img) => img.view === modeFilter);
}

function heroCandidatesFromDoc(baseCtx) {
  const allImages = (baseCtx.pifDoc?.selected?.images) || [];
  return allImages.filter((img) =>
    matchVariant(img, { variantId: baseCtx.variant.variant_id, variantKey: baseCtx.variant.key })
    && img.view === 'hero',
  );
}

function imagesSidecar(candidates) {
  return candidates.map((img) => ({
    url: img.filename || '',
    thumb_base64_size: img.bytes ?? undefined,
  }));
}

export async function compilePifPreviewPrompt(ctx) {
  const { body = {} } = ctx;
  const variantKey = body.variant_key || body.variantKey;
  const mode = body.mode || 'view';
  if (!variantKey) {
    const err = new Error('variant_key is required for PIF preview');
    err.statusCode = 400;
    throw err;
  }

  const baseCtx = await resolvePifPromptContext({
    product: ctx.product,
    variantKey,
    appDb: ctx.appDb,
    specDb: ctx.specDb,
    config: ctx.config,
    productRoot: ctx.productRoot,
    logger: ctx.logger,
  });

  const inputsResolved = {
    product_id: ctx.product.product_id,
    category: ctx.product.category,
    variant_key: baseCtx.variant.key,
    variant_id: baseCtx.variant.variant_id || null,
    variant_label: baseCtx.variant.label,
    variant_type: baseCtx.variant.type,
    family_model_count: baseCtx.familyModelCount,
    ambiguity_level: baseCtx.ambiguityLevel,
    sibling_models: baseCtx.siblingsExcluded,
    view_budget: baseCtx.viewBudget,
    hero_enabled: baseCtx.heroEnabled,
  };

  if (mode === 'view') {
    const focus = body.view || null;
    const runScopeKey = resolveRunScopeKey({ orchestrator: 'single', mode: 'view', focusView: focus });
    const additionalViews = focus
      ? baseCtx.individualViewRunHintKeys
          .filter((k) => k !== focus)
          .map((k) => ({
            key: k,
            description: resolveViewPrompt({
              role: 'additional', category: baseCtx.product.category, view: k,
              dbOverride: baseCtx.finderStore.getSetting(viewPromptSettingKey('additional', k)) || '',
            }),
          }))
      : baseCtx.singleAdditionalViews;
    const entry = buildViewPromptEntry(baseCtx, focus, additionalViews, focus ? `view:${focus}` : 'view', runScopeKey);
    return envelope({ mode, prompts: [entry], inputsResolved });
  }

  if (mode === 'hero') {
    const runScopeKey = resolveRunScopeKey({ orchestrator: 'single', mode: 'hero' });
    const entry = buildHeroPromptEntry(baseCtx, runScopeKey);
    return envelope({ mode, prompts: [entry], inputsResolved });
  }

  if (mode === 'loop-view') {
    // WHY: Single representative iteration — picks the body.view focus if provided,
    // else the first viewBudget entry. Iteration prompt structure (PRIORITY = focus,
    // ADDITIONAL = loop hints minus focus, role='loop' for focus description) mirrors
    // executeOneCall in the orchestrator.
    const focus = body.view || baseCtx.viewBudget[0] || null;
    const runScopeKey = resolveRunScopeKey({ orchestrator: 'loop', mode: 'view', focusView: focus });
    if (!focus) {
      return envelope({ mode, prompts: [], inputsResolved, notes: ['No views configured in viewBudget — loop has nothing to iterate.'] });
    }
    const loopAdditional = baseCtx.loopRunHintKeys
      .filter((k) => k !== focus)
      .map((k) => ({
        key: k,
        description: resolveViewPrompt({
          role: 'additional', category: baseCtx.product.category, view: k,
          dbOverride: baseCtx.finderStore.getSetting(viewPromptSettingKey('additional', k)) || '',
        }),
      }));
    // Loop iterations use role='loop' for the priority description (not 'priority').
    const priorityDescription = resolveViewPrompt({
      role: 'loop', category: baseCtx.product.category, view: focus,
      dbOverride: baseCtx.finderStore.getSetting(viewPromptSettingKey('loop', focus)) || '',
    });
    const tweakedCtx = {
      ...baseCtx,
      priorityViews: [{ key: focus, description: priorityDescription }],
    };
    const entry = buildViewPromptEntry(tweakedCtx, focus, loopAdditional, `loop-view:${focus}`, runScopeKey);
    return envelope({
      mode,
      prompts: [entry],
      inputsResolved,
      notes: [`Representative iteration for "${focus}" — actual loop iterates over all viewBudget entries.`],
    });
  }

  if (mode === 'loop-hero') {
    const runScopeKey = resolveRunScopeKey({ orchestrator: 'loop', mode: 'hero' });
    const entry = buildHeroPromptEntry(baseCtx, runScopeKey, 'loop-hero');
    return envelope({ mode, prompts: [entry], inputsResolved });
  }

  if (mode === 'view-eval') {
    const viewImages = variantImagesFromDoc(baseCtx).filter((img) => img.view && img.view !== 'hero');
    if (viewImages.length === 0) {
      return envelope({ mode, prompts: [], inputsResolved, notes: ['No view candidates for this variant — eval cannot run.'] });
    }

    const byView = new Map();
    for (const img of viewImages) {
      if (!byView.has(img.view)) byView.set(img.view, []);
      byView.get(img.view).push(img);
    }

    const prompts = [];
    for (const [view, candidates] of byView) {
      const viewConfigEntry = baseCtx.viewConfig.find((v) => v.key === view);
      const viewDescription = viewConfigEntry?.description || `${view} view of the product`;
      const dbCriteria = baseCtx.finderStore.getSetting(`evalViewCriteria_${view}`) || '';
      const evalCriteria = dbCriteria || resolveViewEvalCriteria(baseCtx.product.category, view);
      const promptInputs = resolveViewEvalPromptInputs({
        product: baseCtx.product,
        variant: baseCtx.variant,
        view,
        viewDescription,
        candidates,
        evalPromptOverride: baseCtx.evalPromptOverride,
        evalCriteria,
        productImageIdentityFacts: baseCtx.productImageIdentityFacts,
      });
      prompts.push({
        label: `view-eval:${view}`,
        system: buildViewEvalPrompt(promptInputs),
        user: `${view} view — ${candidates.length} candidates`,
        schema: zodToLlmSchema(viewEvalResponseSchema),
        model: baseCtx.modelInfo,
        notes: [],
        images: imagesSidecar(candidates),
      });
    }
    return envelope({ mode, prompts, inputsResolved });
  }

  if (mode === 'hero-eval') {
    const candidates = heroCandidatesFromDoc(baseCtx);
    if (candidates.length === 0) {
      return envelope({ mode, prompts: [], inputsResolved, notes: ['No hero candidates for this variant — hero-eval cannot run.'] });
    }
    const promptInputs = resolveHeroEvalPromptInputs({
      product: baseCtx.product,
      variant: baseCtx.variant,
      candidates,
      heroPromptOverride: baseCtx.heroEvalPromptOverride,
      heroCriteria: baseCtx.heroEvalCriteria,
      heroCount: baseCtx.heroCount,
      productImageIdentityFacts: baseCtx.productImageIdentityFacts,
    });
    const userText = candidates.map((img, i) => {
      const meta = img.width && img.height
        ? ` (${img.width}×${img.height}px${img.bytes ? `, ${Math.round(img.bytes / 1024)}KB` : ''})`
        : '';
      return `Image ${i + 1}: ${img.filename}${meta}`;
    }).join('\n');
    return envelope({
      mode,
      prompts: [{
        label: 'hero-eval',
        system: buildHeroSelectionPrompt(promptInputs),
        user: userText,
        schema: zodToLlmSchema(heroEvalResponseSchema),
        model: baseCtx.modelInfo,
        notes: [],
        images: imagesSidecar(candidates),
      }],
      inputsResolved,
    });
  }

  const err = new Error(`unknown preview mode: ${mode}`);
  err.statusCode = 400;
  throw err;
}
