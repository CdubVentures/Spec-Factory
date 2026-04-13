/**
 * Carousel Builder — top-level orchestrator.
 *
 * Reads existing PIF images, groups by variant + view, evaluates each
 * view group via vision LLM, picks hero shots, persists results.
 * One pass per variant — no loop, no re-calling.
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildVariantList } from './productImageFinder.js';
import { readProductImages } from './productImageStore.js';
import { GENERIC_VIEW_DESCRIPTIONS } from './productImageLlmAdapter.js';
import {
  evaluateViewCandidates,
  mergeEvaluation,
  buildHeroSelectionPrompt,
} from './imageEvaluator.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';

/**
 * Run the Carousel Builder for a product.
 *
 * @param {object} opts
 * @param {object} opts.product — { product_id, category, brand, model, base_model, variant }
 * @param {object} opts.specDb — category-scoped DB
 * @param {object} opts.config — global config
 * @param {object} [opts.logger]
 * @param {string} [opts.variantKey] — filter to single variant (null = all)
 * @param {string} [opts.productRoot] — override product root path
 * @param {AbortSignal} [opts.signal]
 * @param {Function} [opts.onStageAdvance] — (stageName) => void
 * @param {Function} [opts.onModelResolved] — (info) => void
 * @param {Function} [opts.onStreamChunk] — (delta) => void
 * @param {Function} [opts.onQueueWait] — (ms) => void
 * @param {Function} [opts.onLlmCallComplete] — (call) => void
 * @param {Function} [opts.onVariantProgress] — (index, total, variantKey) => void
 * @param {Function} [opts._readCefFn] — test seam: read CEF data
 * @param {Function} [opts._readImagesFn] — test seam: read PIF images
 * @param {Function} [opts._evalViewFn] — test seam: evaluateViewCandidates
 * @param {Function} [opts._mergeFn] — test seam: mergeEvaluation
 * @param {Function} [opts._heroCallFn] — test seam: hero LLM call
 */
export async function runCarouselBuild({
  product,
  specDb,
  config = {},
  logger = null,
  variantKey = null,
  productRoot,
  signal,
  onStageAdvance = null,
  onModelResolved = null,
  onStreamChunk = null,
  onQueueWait = null,
  onLlmCallComplete = null,
  onVariantProgress = null,
  // Test seams
  _readCefFn = null,
  _readImagesFn = null,
  _evalViewFn = null,
  _mergeFn = null,
  _heroCallFn = null,
}) {
  const root = productRoot || defaultProductRoot();
  const finderStore = specDb?.getFinderStore?.('productImageFinder');

  // Gate: eval must be enabled
  const evalEnabled = finderStore?.getSetting?.('evalEnabled') || 'true';
  if (evalEnabled === 'false') {
    return { rejected: true, rejections: [{ reason_code: 'eval_disabled', message: 'Carousel Builder is disabled in settings' }], variantsProcessed: 0 };
  }

  // Read settings
  const thumbSize = parseInt(finderStore?.getSetting?.('evalThumbSize') || '512', 10) || 512;
  const evalPromptOverride = finderStore?.getSetting?.('evalPromptOverride') || '';
  const heroPromptOverride = finderStore?.getSetting?.('heroEvalPromptOverride') || '';

  // Read CEF data
  const readCef = _readCefFn || (() => {
    const cefPath = path.join(root, product.product_id, 'color_edition.json');
    try { return JSON.parse(fs.readFileSync(cefPath, 'utf8')); }
    catch { return null; }
  });

  const cefData = readCef();
  if (!cefData) {
    return { rejected: true, rejections: [{ reason_code: 'no_cef_data', message: 'Run CEF first — no color data found' }], variantsProcessed: 0 };
  }

  const colors = cefData?.selected?.colors || [];
  if (colors.length === 0) {
    return { rejected: true, rejections: [{ reason_code: 'no_colors', message: 'No colors discovered — run CEF first' }], variantsProcessed: 0 };
  }

  const colorNames = cefData?.selected?.color_names || {};
  const editions = cefData?.selected?.editions || {};
  const allVariants = buildVariantList({ colors, colorNames, editions });

  // Filter to single variant if requested
  const variants = variantKey
    ? allVariants.filter(v => v.key === variantKey)
    : allVariants;

  // Read existing images
  const readImages = _readImagesFn || (() => readProductImages({ productId: product.product_id, productRoot: root }));
  const pifDoc = readImages();
  const allImages = pifDoc?.selected?.images || [];

  // Resolve callables
  const evalView = _evalViewFn || evaluateViewCandidates;
  const merge = _mergeFn || mergeEvaluation;
  const heroCall = _heroCallFn || null;

  const imagesDir = path.join(root, product.product_id, 'images');
  let variantsProcessed = 0;

  for (let vi = 0; vi < variants.length; vi++) {
    if (signal?.aborted) break;

    const variant = variants[vi];

    // Filter images for this variant
    const variantImages = allImages.filter(img => img.variant_key === variant.key);
    if (variantImages.length === 0) {
      onVariantProgress?.(vi, variants.length, variant.key);
      continue;
    }

    onStageAdvance?.('Evaluating');
    onVariantProgress?.(vi, variants.length, variant.key);

    // Group by view
    const viewGroups = new Map();
    for (const img of variantImages) {
      if (!viewGroups.has(img.view)) viewGroups.set(img.view, []);
      viewGroups.get(img.view).push(img);
    }

    // Evaluate each view
    const viewResults = new Map();
    for (const [view, images] of viewGroups) {
      if (signal?.aborted) break;

      const imagePaths = images.map(img => path.join(imagesDir, img.filename));
      const viewDescription = GENERIC_VIEW_DESCRIPTIONS[view] || `${view} view of the product`;

      const result = await evalView({
        imagePaths,
        view,
        viewDescription,
        product,
        variantLabel: variant.label,
        variantType: variant.type,
        size: thumbSize,
        promptOverride: evalPromptOverride,
        callLlm: _evalViewFn ? undefined : null,
      });

      viewResults.set(view, result);
    }

    // Collect winners for hero selection
    const winners = [];
    for (const [view, result] of viewResults) {
      const best = (result.rankings || []).find(r => r.best);
      if (best) winners.push({ view, filename: best.filename });
    }

    // Hero selection
    let heroResults = null;
    if (winners.length > 0 && heroCall) {
      onStageAdvance?.('Heroes');
      heroResults = await heroCall({
        product,
        variantLabel: variant.label,
        variantType: variant.type,
        viewWinners: winners,
        promptOverride: heroPromptOverride,
      });
    }

    // Persist
    merge({
      productId: product.product_id,
      productRoot: root,
      variantKey: variant.key,
      viewResults,
      heroResults,
    });

    variantsProcessed++;
  }

  onStageAdvance?.('Complete');

  return { rejected: false, variantsProcessed };
}
