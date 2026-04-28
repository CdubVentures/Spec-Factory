/**
 * Carousel Builder — thin per-view and per-hero evaluation functions.
 *
 * Per-view and per-hero helpers still handle one LLM call. The carousel eval
 * loop sequences those helpers for one variant operation.
 */

import path from 'node:path';
import { readProductImages } from './productImageStore.js';
import { resolveViewConfig, resolveViewEvalCriteria, resolveHeroEvalCriteria, CANONICAL_VIEW_KEYS } from './productImageLlmAdapter.js';
import { resolveCarouselViewSettings } from './carouselSlotSettings.js';
import {
  evaluateViewCandidates,
  mergeEvaluation,
  appendEvalRecord,
  extractEvalState,
  withProductLock,
  createImageEvaluatorCallLlm,
  createHeroEvalCallLlm,
  createThumbnailBase64,
  buildHeroSelectionPrompt,
  resolveCarouselSlots,
} from './imageEvaluator.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';
import { buildLlmCallDeps } from '../../core/llm/buildLlmCallDeps.js';
import { buildBillingOnUsage } from '../../billing/costLedger.js';
import { matchVariant } from './variantMatch.js';
import {
  resolveHeroEvalPromptInputs,
} from './productImagePreviewPrompt.js';
import { resolveProductImageIdentityFacts } from './productImageIdentityDependencies.js';

const MOUSE_EVAL_VIEW_ORDER = Object.freeze(['top', 'left', 'right', 'bottom', 'angle', 'sangle', 'front', 'rear']);

function resolveCarouselEvalViewOrder({ viewBudget, category }) {
  const budget = [...new Set(viewBudget || [])];
  if (category !== 'mouse') return budget;
  const ordered = MOUSE_EVAL_VIEW_ORDER.filter((view) => budget.includes(view));
  const remaining = budget.filter((view) => !ordered.includes(view));
  return [...ordered, ...remaining];
}

function resolveCollectedExtraEvalViewOrder({ category }) {
  if (category === 'mouse') {
    const ordered = MOUSE_EVAL_VIEW_ORDER.filter((view) => CANONICAL_VIEW_KEYS.includes(view));
    const remaining = CANONICAL_VIEW_KEYS.filter((view) => !ordered.includes(view));
    return [...ordered, ...remaining];
  }

  const categoryOrder = resolveViewConfig('', category)
    .map((entry) => entry.key)
    .filter((view) => CANONICAL_VIEW_KEYS.includes(view));
  const remaining = CANONICAL_VIEW_KEYS.filter((view) => !categoryOrder.includes(view));
  return [...categoryOrder, ...remaining];
}

function resolveSmartEvalViewPlan({ viewBudget, category, availableViews }) {
  const requiredOrder = resolveCarouselEvalViewOrder({ viewBudget, category });
  const availableCanonicalViews = new Set(
    [...(availableViews || [])].filter((view) => CANONICAL_VIEW_KEYS.includes(view)),
  );
  const skipped = [];
  const viewCalls = [];

  for (const view of requiredOrder) {
    if (availableCanonicalViews.has(view)) {
      viewCalls.push(view);
    } else {
      skipped.push({ view, reason: 'no_candidates' });
    }
  }

  const queued = new Set(viewCalls);
  const required = new Set(requiredOrder);
  for (const view of resolveCollectedExtraEvalViewOrder({ category })) {
    if (!availableCanonicalViews.has(view)) continue;
    if (required.has(view)) continue;
    if (queued.has(view)) continue;
    viewCalls.push(view);
    queued.add(view);
  }

  return { viewCalls, skipped };
}

function resolveCarouselContextImages({ product, root, variantKey, variantId, viewBudget, carouselSlotViews, currentView, allImages, carouselSlots }) {
  const imagesDir = path.join(root, product.product_id, 'images');
  const imageByFilename = new Map(
    (allImages || [])
      .filter((img) => matchVariant(img, { variantId, variantKey }))
      .map((img) => [img.filename, img]),
  );
  return resolveCarouselSlots({
    viewBudget,
    carouselSlotViews,
    heroCount: 0,
    variantKey,
    variantId,
    carouselSlots,
    images: allImages,
  })
    .filter((slot) => slot.slot !== currentView && slot.filename)
    .map((slot) => {
      const img = imageByFilename.get(slot.filename);
      return {
        slot: slot.slot,
        filename: slot.filename,
        imagePath: path.join(imagesDir, slot.filename),
        width: img?.width,
        height: img?.height,
        bytes: img?.bytes,
      };
    });
}

function formatEvalLoopProgress({ label, current, total }) {
  const remaining = Math.max(total - current, 0);
  return `${label} — call ${current}/${total}, ${remaining} remaining`;
}

/**
 * Evaluate candidates for ONE view of ONE variant.
 * One LLM call. One operation in the tracker.
 */
export async function runEvalView({
  product,
  appDb = null,
  specDb,
  config = {},
  logger = null,
  variantKey,
  variantId,
  view,
  carouselContext = [],
  productRoot,
  signal,
  onStageAdvance = null,
  onModelResolved = null,
  onStreamChunk = null,
  onQueueWait = null,
  onLlmCallComplete = null,
  // Test seams
  _evalViewFn = null,
  _mergeFn = null,
}) {
  const root = productRoot || defaultProductRoot();
  const finderStore = specDb?.getFinderStore?.('productImageFinder');
  const thumbSize = parseInt(finderStore?.getSetting?.('evalThumbSize') || '512', 10) || 512;
  const evalPromptOverride = finderStore?.getSetting?.('evalPromptOverride') || '';

  const evalStartedAt = new Date().toISOString();
  onStageAdvance?.('Evaluating');

  // Read existing images, filter to this variant + view
  const pifDoc = readProductImages({ productId: product.product_id, productRoot: root });
  const allImages = pifDoc?.selected?.images || [];
  const viewImages = allImages.filter(img => matchVariant(img, { variantId, variantKey }) && img.view === view);

  if (viewImages.length === 0) {
    onStageAdvance?.('Complete');
    return { rankings: [], skipped: true };
  }

  // Build LLM caller — capture model info for eval history
  let callLlm = null;
  let resolvedModelName = '';
  let resolvedAccessMode = '';
  let resolvedEffortLevel = '';
  let resolvedFallbackUsed = false;
  let resolvedThinking = false;
  let resolvedWebSearch = false;
  if (!_evalViewFn) {
    const wrappedOnModelResolved = (info) => {
      if (info?.model) resolvedModelName = info.model;
      if (info?.accessMode) resolvedAccessMode = info.accessMode;
      if (info?.effortLevel) resolvedEffortLevel = info.effortLevel;
      if (info?.isFallback) resolvedFallbackUsed = true;
      if (info?.thinking != null) resolvedThinking = Boolean(info.thinking);
      if (info?.webSearch != null) resolvedWebSearch = Boolean(info.webSearch);
      onModelResolved?.(info);
    };
    const llmDeps = buildLlmCallDeps({
      config, logger, onModelResolved: wrappedOnModelResolved, onStreamChunk, onQueueWait, signal,
      onLlmCallComplete,
      onUsage: appDb ? buildBillingOnUsage({ config, appDb, category: product.category, productId: product.product_id }) : undefined,
    });
    callLlm = createImageEvaluatorCallLlm(llmDeps);
  }

  const imagesDir = path.join(root, product.product_id, 'images');
  const imagePaths = viewImages.map(img => path.join(imagesDir, img.filename));
  const imageMetadata = viewImages.map(img => ({ width: img.width, height: img.height, bytes: img.bytes }));

  // WHY: Category-specific view description + eval criteria.
  // DB override (finder setting) wins over code default.
  const viewConfig = resolveViewConfig('', product.category);
  const viewEntry = viewConfig.find(v => v.key === view);
  const viewDescription = viewEntry?.description || `${view} view of the product`;

  const dbCriteria = finderStore?.getSetting?.(`evalViewCriteria_${view}`) || '';
  const evalCriteria = dbCriteria || resolveViewEvalCriteria(product.category, view);
  const variantLabel = viewImages[0]?.variant_label || variantKey;
  const variantType = viewImages[0]?.variant_type || 'color';
  const productImageIdentityFacts = resolveProductImageIdentityFacts({
    specDb,
    product,
    variant: {
      variant_id: variantId,
      key: variantKey,
      label: variantLabel,
      type: variantType,
    },
  });

  const evalFn = _evalViewFn || evaluateViewCandidates;
  const result = await evalFn({
    imagePaths,
    imageMetadata,
    view,
    viewDescription,
    product,
    variantLabel,
    variantType,
    size: thumbSize,
    promptOverride: evalPromptOverride,
    evalCriteria,
    carouselContext,
    productImageIdentityFacts,
    callLlm,
  });

  // WHY: Serialize JSON writes per product — multiple view evals fire simultaneously
  // and all read/modify/write the same product_images.json file.
  const merge = _mergeFn || mergeEvaluation;
  await withProductLock(product.product_id, () => {
    const viewResults = new Map([[view, result]]);
    const doc = merge({
      productId: product.product_id,
      productRoot: root,
      variantKey,
      variantId,
      viewResults,
      heroResults: null,
    });

    // SQL projection — dual-write eval_state
    if (doc && finderStore) {
      finderStore.updateSummaryField(product.product_id, 'eval_state', JSON.stringify(extractEvalState(doc)));
    }

    // Persist eval history (prompt + response for audit trail)
    if (result._prompt) {
      const variantLabel = viewImages[0]?.variant_label || variantKey;
      const variantType = viewImages[0]?.variant_type || 'color';
      const durationMs = Date.now() - new Date(evalStartedAt).getTime();
      appendEvalRecord({
        productId: product.product_id,
        productRoot: root,
        variantKey,
        variantId,
        type: 'view',
        view,
        model: resolvedModelName,
        startedAt: evalStartedAt,
        effortLevel: resolvedEffortLevel || null,
        accessMode: resolvedAccessMode || null,
        fallbackUsed: resolvedFallbackUsed,
        thinking: resolvedThinking,
        webSearch: resolvedWebSearch,
        variantLabel,
        variantType,
        durationMs,
        prompt: result._prompt,
        response: result._response,
        result: { rankings: result.rankings },
      });

      // WHY: SQL projection — dual-write evaluations[] after appendEvalRecord
      // mutated JSON. Runtime GET reads SQL per CLAUDE.md dual-state mandate.
      if (finderStore) {
        const fresh = readProductImages({ productId: product.product_id, productRoot: root });
        if (fresh) {
          finderStore.updateSummaryField(product.product_id, 'evaluations', JSON.stringify(fresh.evaluations || []));
        }
      }
    }
  });

  onStageAdvance?.('Complete');
  return result;
}

/**
 * Evaluate one variant's carousel as a single operational loop.
 *
 * The loop keeps each slot as its own LLM decision, but sequences those
 * decisions so later slots can see the carousel winners already chosen.
 */
export async function runEvalCarouselLoop({
  product,
  appDb = null,
  specDb,
  config = {},
  logger = null,
  variantKey,
  variantId,
  productRoot,
  signal,
  onStageAdvance = null,
  onModelResolved = null,
  onStreamChunk = null,
  onQueueWait = null,
  onLlmCallComplete = null,
  onProgress = null,
  onSlotComplete = null,
  // Test seams
  _evalViewFn = null,
  _heroCallFn = null,
  _mergeFn = null,
}) {
  const root = productRoot || defaultProductRoot();
  const finderStore = specDb?.getFinderStore?.('productImageFinder');
  const { viewBudget, carouselSlotViews } = resolveCarouselViewSettings({ finderStore, category: product.category });
  const heroEnabled = finderStore?.getSetting?.('heroEnabled') !== 'false';
  const pifDoc = readProductImages({ productId: product.product_id, productRoot: root });
  const allImages = pifDoc?.selected?.images || [];
  const variantImages = allImages.filter((img) => matchVariant(img, { variantId, variantKey }));
  const availableViews = new Set(
    variantImages
      .filter((img) => img.view && img.view !== 'hero')
      .map((img) => img.view),
  );

  const { viewCalls, skipped } = resolveSmartEvalViewPlan({
    viewBudget,
    category: product.category,
    availableViews,
  });

  const hasHeroCandidates = variantImages.some((img) => img.view === 'hero');
  const willEvalHero = heroEnabled && hasHeroCandidates;
  const totalCalls = viewCalls.length + (willEvalHero ? 1 : 0);
  const views = [];
  let callNumber = 0;
  onStageAdvance?.('Evaluating');

  for (const view of viewCalls) {
    callNumber += 1;
    const freshDoc = readProductImages({ productId: product.product_id, productRoot: root });
    const freshImages = freshDoc?.selected?.images || [];
    const carouselContext = resolveCarouselContextImages({
      product,
      root,
      variantKey,
      variantId,
      viewBudget,
      carouselSlotViews,
      currentView: view,
      allImages: freshImages,
      carouselSlots: freshDoc?.carousel_slots || {},
    });
    onProgress?.(formatEvalLoopProgress({ label: `Evaluating ${view}`, current: callNumber, total: totalCalls }));
    const result = await runEvalView({
      product,
      appDb,
      specDb,
      config,
      logger,
      variantKey,
      variantId,
      view,
      carouselContext,
      productRoot: root,
      signal,
      onStageAdvance: (name) => {
        if (name === 'Evaluating') onStageAdvance?.('Evaluating');
      },
      onModelResolved,
      onStreamChunk,
      onQueueWait,
      onLlmCallComplete,
      _evalViewFn,
      _mergeFn,
    });
    views.push({ view, ...result });
    onSlotComplete?.({
      type: 'view',
      view,
      callNumber,
      totalCalls,
      result,
    });
  }

  let hero = { heroes: [], skipped: true };
  if (willEvalHero) {
    callNumber += 1;
    onProgress?.(formatEvalLoopProgress({ label: 'Evaluating hero', current: callNumber, total: totalCalls }));
    onStageAdvance?.('Heroes');
    hero = await runEvalHero({
      product,
      appDb,
      specDb,
      config,
      logger,
      variantKey,
      variantId,
      productRoot: root,
      signal,
      onStageAdvance: (name) => {
        if (name === 'Heroes') onStageAdvance?.('Heroes');
      },
      onModelResolved,
      onStreamChunk,
      onQueueWait,
      onLlmCallComplete,
      _heroCallFn,
      _mergeFn,
    });
    onSlotComplete?.({
      type: 'hero',
      view: 'hero',
      callNumber,
      totalCalls,
      result: hero,
    });
  }

  onStageAdvance?.('Complete');
  onProgress?.('Complete');
  return { ok: true, views, skipped, hero };
}

/**
 * Evaluate hero/marketing image candidates for ONE variant.
 *
 * WHY: Hero images are full-scene 16:9 marketing shots (view === 'hero').
 * They're evaluated with vision just like view candidates — the LLM sees
 * the actual thumbnails and ranks the best ones for the carousel.
 *
 * Skip logic mirrors view eval:
 * - 0 candidates → skip (no LLM call)
 * - 1 candidate → auto-elect as hero_rank: 1 (no LLM call)
 * - 2+ candidates → create thumbnails, call vision LLM, rank
 */
export async function runEvalHero({
  product,
  appDb = null,
  specDb,
  config = {},
  logger = null,
  variantKey,
  variantId,
  productRoot,
  signal,
  onStageAdvance = null,
  onModelResolved = null,
  onStreamChunk = null,
  onQueueWait = null,
  onLlmCallComplete = null,
  // Test seams
  _heroCallFn = null,
  _mergeFn = null,
}) {
  const root = productRoot || defaultProductRoot();
  const finderStore = specDb?.getFinderStore?.('productImageFinder');
  const heroPromptOverride = finderStore?.getSetting?.('heroEvalPromptOverride') || '';
  const evalStartedAt = new Date().toISOString();

  onStageAdvance?.('Heroes');

  // Read hero-view candidates for this variant
  const pifDoc = readProductImages({ productId: product.product_id, productRoot: root });
  const allImages = pifDoc?.selected?.images || [];
  const heroCandidates = allImages.filter(img => matchVariant(img, { variantId, variantKey }) && img.view === 'hero');

  if (heroCandidates.length === 0) {
    onStageAdvance?.('Complete');
    return { heroes: [], skipped: true };
  }

  // Build LLM caller — capture model info for eval history
  let heroCall = _heroCallFn;
  let resolvedModelName = '';
  let resolvedAccessMode = '';
  let resolvedEffortLevel = '';
  let resolvedFallbackUsed = false;
  let resolvedThinking = false;
  let resolvedWebSearch = false;
  if (!heroCall) {
    const wrappedOnModelResolved = (info) => {
      if (info?.model) resolvedModelName = info.model;
      if (info?.accessMode) resolvedAccessMode = info.accessMode;
      if (info?.effortLevel) resolvedEffortLevel = info.effortLevel;
      if (info?.isFallback) resolvedFallbackUsed = true;
      if (info?.thinking != null) resolvedThinking = Boolean(info.thinking);
      if (info?.webSearch != null) resolvedWebSearch = Boolean(info.webSearch);
      onModelResolved?.(info);
    };
    const llmDeps = buildLlmCallDeps({
      config, logger, onModelResolved: wrappedOnModelResolved, onStreamChunk, onQueueWait, signal,
      onLlmCallComplete,
      onUsage: appDb ? buildBillingOnUsage({ config, appDb, category: product.category, productId: product.product_id }) : undefined,
    });
    heroCall = createHeroEvalCallLlm(llmDeps);
  }

  // WHY: Category-specific hero criteria. DB override wins over code default.
  const dbHeroCriteria = finderStore?.getSetting?.('heroEvalCriteria') || '';
  const heroCriteria = dbHeroCriteria || resolveHeroEvalCriteria(product.category);
  const heroCount = parseInt(finderStore?.getSetting?.('evalHeroCount') || '3', 10) || 3;

  const variantLabel = allImages.find(img => matchVariant(img, { variantId, variantKey }))?.variant_label || variantKey;
  const variantType = allImages.find(img => matchVariant(img, { variantId, variantKey }))?.variant_type || 'color';

  // Build thumbnails for vision evaluation
  const thumbSize = parseInt(finderStore?.getSetting?.('evalThumbSize') || '512', 10) || 512;
  const imagesDir = path.join(root, product.product_id, 'images');
  const candidates = [];
  const images = [];
  const lines = [];
  for (let i = 0; i < heroCandidates.length; i++) {
    const img = heroCandidates[i];
    candidates.push({ filename: img.filename });
    const imgPath = path.join(imagesDir, img.filename);
    try {
      const b64 = await createThumbnailBase64({ imagePath: imgPath, size: thumbSize });
      images.push({
        id: `img-${i + 1}`,
        file_uri: `data:image/png;base64,${b64}`,
        mime_type: 'image/png',
      });
    } catch {
      // Image file missing or unreadable — still include in text list
    }
    const meta = img.width && img.height
      ? ` (${img.width}×${img.height}px${img.bytes ? `, ${Math.round(img.bytes / 1024)}KB` : ''})`
      : '';
    lines.push(`Image ${i + 1}: ${img.filename}${meta}`);
  }
  const userText = lines.join('\n');

  const heroEvalVariant = {
    key: variantKey,
    variant_id: variantId || null,
    label: variantLabel,
    type: variantType,
  };
  const productImageIdentityFacts = resolveProductImageIdentityFacts({
    specDb,
    product,
    variant: heroEvalVariant,
  });
  const heroSystemPrompt = buildHeroSelectionPrompt(resolveHeroEvalPromptInputs({
    product,
    variant: heroEvalVariant,
    candidates,
    heroPromptOverride,
    heroCriteria,
    heroCount,
    productImageIdentityFacts,
  }));
  const { result: heroResults } = await heroCall({
    product,
    variantLabel,
    variantType,
    candidates,
    promptOverride: heroPromptOverride,
    heroCriteria,
    heroCount,
    productImageIdentityFacts,
    userText,
    images,
  });

  // WHY: Serialize JSON writes per product — concurrent eval operations.
  const merge = _mergeFn || mergeEvaluation;
  await withProductLock(product.product_id, async () => {
    const doc = merge({
      productId: product.product_id,
      productRoot: root,
      variantKey,
      variantId,
      viewResults: new Map(),
      heroResults,
    });

    // SQL projection — dual-write eval_state
    if (doc && finderStore) {
      finderStore.updateSummaryField(product.product_id, 'eval_state', JSON.stringify(extractEvalState(doc)));
    }

    // Persist eval history
    if (!_heroCallFn) {
      const durationMs = Date.now() - new Date(evalStartedAt).getTime();
      appendEvalRecord({
        productId: product.product_id,
        productRoot: root,
        variantKey,
        variantId,
        type: 'hero',
        model: resolvedModelName,
        startedAt: evalStartedAt,
        effortLevel: resolvedEffortLevel || null,
        accessMode: resolvedAccessMode || null,
        fallbackUsed: resolvedFallbackUsed,
        thinking: resolvedThinking,
        webSearch: resolvedWebSearch,
        variantLabel,
        variantType,
        durationMs,
        prompt: { system: heroSystemPrompt, user: userText },
        response: heroResults,
        result: heroResults,
      });

      // WHY: SQL projection — dual-write evaluations[] after appendEvalRecord.
      if (finderStore) {
        const fresh = readProductImages({ productId: product.product_id, productRoot: root });
        if (fresh) {
          finderStore.updateSummaryField(product.product_id, 'evaluations', JSON.stringify(fresh.evaluations || []));
        }
      }
    }
  });

  onStageAdvance?.('Complete');
  // WHY: Strip 'rejected' from return — fireAndForget interprets any truthy
  // result.rejected as an operation failure. The rejection data has already
  // been consumed by mergeEvaluation; callers only need the heroes array.
  const { rejected: _, ...returnValue } = heroResults;
  return returnValue;
}
