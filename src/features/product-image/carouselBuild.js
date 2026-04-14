/**
 * Carousel Builder — thin per-view and per-hero evaluation functions.
 *
 * Each function handles ONE LLM call: either evaluate candidates for a single
 * view, or pick heroes from the view winners. The GUI fires N+1 of these in
 * parallel — the LLM queue serializes them.
 */

import path from 'node:path';
import { readProductImages } from './productImageStore.js';
import { resolveViewConfig, resolveViewEvalCriteria, resolveHeroEvalCriteria } from './productImageLlmAdapter.js';
import {
  evaluateViewCandidates,
  mergeEvaluation,
  appendEvalRecord,
  withProductLock,
  createImageEvaluatorCallLlm,
  createHeroEvalCallLlm,
  createThumbnailBase64,
} from './imageEvaluator.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';
import { buildLlmCallDeps } from '../../core/llm/buildLlmCallDeps.js';
import { matchVariant } from './variantMatch.js';

/**
 * Evaluate candidates for ONE view of ONE variant.
 * One LLM call. One operation in the tracker.
 */
export async function runEvalView({
  product,
  specDb,
  config = {},
  logger = null,
  variantKey,
  variantId,
  view,
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
  if (!_evalViewFn) {
    const wrappedOnModelResolved = (info) => {
      if (info?.model) resolvedModelName = info.model;
      if (info?.accessMode) resolvedAccessMode = info.accessMode;
      if (info?.effortLevel) resolvedEffortLevel = info.effortLevel;
      if (info?.isFallback) resolvedFallbackUsed = true;
      onModelResolved?.(info);
    };
    const llmDeps = buildLlmCallDeps({ config, logger, onModelResolved: wrappedOnModelResolved, onStreamChunk, onQueueWait, signal });
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

  const evalFn = _evalViewFn || evaluateViewCandidates;
  onLlmCallComplete?.({ prompt: { system: '(view eval)', user: `${view} view — ${viewImages.length} candidates` }, response: null, model: resolvedModelName, variant: variantKey, mode: 'view-eval' });
  const result = await evalFn({
    imagePaths,
    imageMetadata,
    view,
    viewDescription,
    product,
    variantLabel: viewImages[0]?.variant_label || variantKey,
    variantType: viewImages[0]?.variant_type || 'color',
    size: thumbSize,
    promptOverride: evalPromptOverride,
    evalCriteria,
    callLlm,
  });
  onLlmCallComplete?.({ prompt: { system: result._prompt || '(view eval)', user: `${view} view — ${viewImages.length} candidates` }, response: result._response, model: resolvedModelName, variant: variantKey, mode: 'view-eval', usage: result.usage || null });

  // WHY: Serialize JSON writes per product — multiple view evals fire simultaneously
  // and all read/modify/write the same product_images.json file.
  const merge = _mergeFn || mergeEvaluation;
  await withProductLock(product.product_id, () => {
    const viewResults = new Map([[view, result]]);
    merge({
      productId: product.product_id,
      productRoot: root,
      variantKey,
      variantId,
      viewResults,
      heroResults: null,
    });

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
        variantLabel,
        variantType,
        durationMs,
        prompt: result._prompt,
        response: result._response,
        result: { rankings: result.rankings },
      });
    }
  });

  onStageAdvance?.('Complete');
  return result;
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

  // WHY: Single candidate = auto-elect, no LLM call (same pattern as view eval)
  if (heroCandidates.length === 1) {
    const autoResult = {
      heroes: [{
        filename: heroCandidates[0].filename,
        hero_rank: 1,
        reasoning: 'auto-elected: sole hero candidate for this variant',
      }],
    };
    const merge = _mergeFn || mergeEvaluation;
    await withProductLock(product.product_id, () => {
      merge({
        productId: product.product_id,
        productRoot: root,
        variantKey,
        viewResults: new Map(),
        heroResults: autoResult,
      });
    });
    onStageAdvance?.('Complete');
    return autoResult;
  }

  // Build LLM caller — capture model info for eval history
  let heroCall = _heroCallFn;
  let resolvedModelName = '';
  let resolvedAccessMode = '';
  let resolvedEffortLevel = '';
  let resolvedFallbackUsed = false;
  if (!heroCall) {
    const wrappedOnModelResolved = (info) => {
      if (info?.model) resolvedModelName = info.model;
      if (info?.accessMode) resolvedAccessMode = info.accessMode;
      if (info?.effortLevel) resolvedEffortLevel = info.effortLevel;
      if (info?.isFallback) resolvedFallbackUsed = true;
      onModelResolved?.(info);
    };
    const llmDeps = buildLlmCallDeps({ config, logger, onModelResolved: wrappedOnModelResolved, onStreamChunk, onQueueWait, signal });
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

  onLlmCallComplete?.({ prompt: { system: '(hero eval)', user: `${heroCandidates.length} candidates` }, response: null, model: resolvedModelName, variant: variantKey, mode: 'hero-eval' });
  const { result: heroResults, usage: heroUsage } = await heroCall({
    product,
    variantLabel,
    variantType,
    candidates,
    promptOverride: heroPromptOverride,
    heroCriteria,
    heroCount,
    userText,
    images,
  });
  onLlmCallComplete?.({ prompt: { system: '(hero eval)', user: `${heroCandidates.length} candidates` }, response: heroResults, model: resolvedModelName, variant: variantKey, mode: 'hero-eval', usage: heroUsage || null });

  // WHY: Serialize JSON writes per product — concurrent eval operations.
  const merge = _mergeFn || mergeEvaluation;
  await withProductLock(product.product_id, async () => {
    merge({
      productId: product.product_id,
      productRoot: root,
      variantKey,
      variantId,
      viewResults: new Map(),
      heroResults,
    });

    // Persist eval history
    if (!_heroCallFn) {
      const { buildHeroSelectionPrompt } = await import('./imageEvaluator.js');
      const heroSystemPrompt = buildHeroSelectionPrompt({
        product, variantLabel, variantType, candidates,
        promptOverride: heroPromptOverride, heroCriteria, heroCount,
      });
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
        variantLabel,
        variantType,
        durationMs,
        prompt: { system: heroSystemPrompt, user: userText },
        response: heroResults,
        result: heroResults,
      });
    }
  });

  onStageAdvance?.('Complete');
  return heroResults;
}
