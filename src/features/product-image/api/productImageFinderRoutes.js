/**
 * Product Image Finder — route handler config.
 *
 * Uses the generic finder route handler for GET/DELETE endpoints.
 * Custom POST handler reads optional { variant_key } from body
 * to support single-variant and batch runs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createFinderRouteHandler } from '../../../core/finder/finderRoutes.js';
import { emitDataChange } from '../../../core/events/dataChangeContract.js';
import { registerOperation, getOperationSignal, countRunningOperations, updateStage, updateModelInfo, updateProgressText, updateLoopProgress, updateQueueDelay, appendLlmCall, completeOperation, failOperation, cancelOperation, fireAndForget } from '../../../core/operations/index.js';
import { createStreamBatcher } from '../../../core/llm/streamBatcher.js';
import { defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';
import { removeLocalAssetVariants, serveLocalAsset } from '../../../core/media/imageVariantAssets.js';
import { readImageDimensions, buildVariantList, imageStem, runProductImageFinder, runCarouselLoop } from '../productImageFinder.js';
import { evaluateCarousel } from '../carouselStrategy.js';
import { resolveViewBudget, resolveViewConfig, CANONICAL_VIEW_KEYS } from '../productImageLlmAdapter.js';
import { resolveViewAttemptBudgets } from '../viewAttemptDefaults.js';
import {
  readProductImages,
  deleteProductImageFinderRun,
  deleteProductImageFinderRuns,
  deleteProductImageFinderAll,
} from '../productImageStore.js';
import { fullResetProductImages } from '../productImageFullReset.js';
import { runEvalView, runEvalHero, runEvalCarouselLoop } from '../carouselBuild.js';
import { writeCarouselSlot, clearCarouselWinners, resolveCarouselSlots, deleteEvalRecord, extractEvalState } from '../imageEvaluator.js';
import { compilePifPreviewPrompt } from '../productImagePreviewPrompt.js';
import { resolveProductImageDependencyStatus } from '../productImageIdentityDependencies.js';

/**
 * Materialize per-variant carousel progress into the pif_variant_progress table.
 * Called after any PIF run / loop returns so the Overview catalog's per-variant
 * ring widget reads progress at O(1) instead of recomputing evaluateCarousel()
 * on every catalog refresh across ~359 products.
 *
 * Three buckets tracked per variant:
 *   priority = Views (Single Run) — viewConfig entries where priority:true
 *   loop     = Loop Run extras    — viewBudget views NOT in priority
 *   hero     = Hero Slots         — heroCount when heroEnabled
 */
function computePifProgressBuckets({ specDb, category }) {
  const finderStore = specDb.getFinderStore?.('productImageFinder');
  const viewConfig = resolveViewConfig(finderStore?.getSetting?.('viewConfig') || '', category);
  const viewBudget = resolveViewBudget(finderStore?.getSetting?.('viewBudget') || '', category);
  const priorityKeys = viewConfig.filter((v) => v.priority).map((v) => v.key);
  const prioritySet = new Set(priorityKeys);
  const loopExtrasKeys = viewBudget.filter((k) => !prioritySet.has(k));
  const heroEnabled = String(finderStore?.getSetting?.('heroEnabled') ?? 'true') !== 'false';
  const heroCount = parseInt(finderStore?.getSetting?.('heroCount') || '3', 10) || 3;
  const satisfactionThreshold = parseInt(finderStore?.getSetting?.('satisfactionThreshold') || '3', 10) || 3;
  return { priorityKeys, loopExtrasKeys, heroEnabled, heroCount, satisfactionThreshold };
}

/**
 * Count carousel slots with a resolved filename (user override OR eval winner /
 * ranked hero). This is the slot-occupancy count the Overview rings and the
 * Indexing Lab dots read — "image is in the carousel", NOT "image exists".
 *
 * Returns { priorityFilled, loopFilled, heroFilled } — each the count of slots
 * currently occupying the carousel for this variant, plus `imageCount` of
 * images owned by this variant across all runs.
 */
function countSlotFillsAndImages({ fullImages, carouselSlots, variantKey, variantId, buckets }) {
  const { priorityKeys, loopExtrasKeys, heroEnabled, heroCount } = buckets;
  const priorityResolved = resolveCarouselSlots({
    viewBudget: priorityKeys, heroCount: 0, variantKey, variantId,
    carouselSlots, images: fullImages,
  });
  const loopResolved = resolveCarouselSlots({
    viewBudget: loopExtrasKeys, heroCount: 0, variantKey, variantId,
    carouselSlots, images: fullImages,
  });
  const heroResolved = resolveCarouselSlots({
    viewBudget: [], heroCount: heroEnabled ? heroCount : 0, variantKey, variantId,
    carouselSlots, images: fullImages,
  });
  const filled = (slots) => slots.filter((s) => s.filename && s.filename !== '__cleared__').length;
  const imageCount = (fullImages || []).filter(
    (img) => (img?.variant_key || '') === (variantKey || '') || (variantId && img?.variant_id === variantId),
  ).length;
  return {
    priorityFilled: filled(priorityResolved),
    loopFilled: filled(loopResolved),
    heroFilled: filled(heroResolved),
    imageCount,
  };
}

function writePifVariantProgress({ specDb, category, productId, carouselProgressByKey }) {
  if (!specDb?.upsertPifVariantProgress) return;
  const variants = specDb.variants?.listActive?.(productId) || [];
  if (variants.length === 0) return;

  // Source of truth = product_images.json (full selected image set, with
  // eval_best / hero / hero_rank flags persisted). Combined with the
  // carousel_slots overrides map, this is exactly what resolveCarouselSlots
  // needs to decide which slot is occupied for each variant.
  const buckets = computePifProgressBuckets({ specDb, category });
  const productRoot = defaultProductRoot();
  const doc = readProductImages({ productId, productRoot });
  const fullImages = doc?.selected?.images || [];
  const carouselSlots = doc?.carousel_slots || {};

  for (const v of variants) {
    const { priorityFilled, loopFilled, heroFilled, imageCount } = countSlotFillsAndImages({
      fullImages, carouselSlots, variantKey: v.variant_key, variantId: v.variant_id, buckets,
    });
    specDb.upsertPifVariantProgress({
      productId,
      variantId: v.variant_id,
      variantKey: v.variant_key,
      priorityFilled,
      priorityTotal: buckets.priorityKeys.length,
      loopFilled,
      loopTotal: buckets.loopExtrasKeys.length,
      heroFilled,
      heroTarget: buckets.heroEnabled ? buckets.heroCount : 0,
      imageCount,
    });
  }
}

function dependencyProduct({ productRow, category, productId }) {
  return {
    ...(productRow || {}),
    product_id: productRow?.product_id || productId,
    category,
  };
}

function resolvePifDependencyStatus({ specDb, category, productId, productRow }) {
  return resolveProductImageDependencyStatus({
    specDb,
    product: dependencyProduct({ productRow, category, productId }),
  });
}

function dependencyLockMessage(status) {
  const missing = status?.missing_keys || [];
  if (missing.length === 0) return 'PIF dependencies are ready.';
  return `PIF is locked until Product Image Dependent key(s) are resolved: ${missing.join(', ')}.`;
}

function resolveMissingPifDependencyResponse({ specDb, category, productId, productRow }) {
  const dependencyStatus = resolvePifDependencyStatus({ specDb, category, productId, productRow });
  if (dependencyStatus.ready) return null;
  return {
    status: 409,
    body: {
    error: 'pif_dependency_missing',
    message: dependencyLockMessage(dependencyStatus),
    dependency_status: dependencyStatus,
    },
  };
}

function parseJsonValue(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function parseJsonArray(value) {
  const parsed = parseJsonValue(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function resolvePifCarouselSettings({ finderStore, category }) {
  const viewBudget = resolveViewBudget(finderStore?.getSetting?.('viewBudget') || '', category);
  const viewAttemptBudget = parseInt(finderStore?.getSetting?.('viewAttemptBudget') || '5', 10) || 5;
  const viewAttemptBudgets = resolveViewAttemptBudgets(
    finderStore?.getSetting?.('viewAttemptBudgets') || '',
    category,
    viewBudget,
    viewAttemptBudget,
  );
  return {
    viewAttemptBudget,
    viewAttemptBudgets,
    heroAttemptBudget: parseInt(finderStore?.getSetting?.('heroAttemptBudget') || '3', 10) || 3,
    heroEnabled: (finderStore?.getSetting?.('heroEnabled') || 'true') !== 'false',
    viewBudget,
  };
}

function buildSummaryListImage(img) {
  const result = {
    view: img?.view || '',
    filename: img?.filename || '',
    variant_key: img?.variant_key || '',
  };
  if (img?.variant_id) result.variant_id = img.variant_id;
  return result;
}

function buildSummaryImage(img) {
  const result = {
    view: img?.view || '',
    filename: img?.filename || '',
    url: '',
    source_page: '',
    alt_text: '',
    bytes: Number(img?.bytes) || 0,
    width: Number(img?.width) || 0,
    height: Number(img?.height) || 0,
    quality_pass: img?.quality_pass !== false,
    variant_key: img?.variant_key || '',
    variant_label: img?.variant_label || '',
    variant_type: img?.variant_type === 'edition' ? 'edition' : 'color',
    downloaded_at: '',
  };
  for (const key of [
    'variant_id',
    'bg_removed',
    'content_hash',
    'trim_failed',
    'eval_best',
    'eval_flags',
    'eval_reasoning',
    'eval_actual_view',
    'eval_matches_requested_view',
    'eval_usable_as_required_view',
    'eval_usable_as_carousel_extra',
    'eval_duplicate',
    'eval_quality',
    'hero',
    'hero_rank',
  ]) {
    if (img?.[key] !== undefined) result[key] = img[key];
  }
  return result;
}

function buildSummaryHistoryCounts(runs) {
  const buckets = new Map();
  for (const run of runs) {
    const response = run.response || {};
    const key = response.variant_id || response.variant_key || '';
    if (!key) continue;
    const bucket = buckets.get(key) || { urls: new Set(), queries: new Set() };
    const log = response.discovery_log || {};
    for (const url of Array.isArray(log.urls_checked) ? log.urls_checked : []) {
      bucket.urls.add(url);
    }
    for (const query of Array.isArray(log.queries_run) ? log.queries_run : []) {
      bucket.queries.add(query);
    }
    buckets.set(key, bucket);
  }
  return Object.fromEntries(
    [...buckets].map(([key, bucket]) => [key, { urls: bucket.urls.size, queries: bucket.queries.size }]),
  );
}

function buildSummaryRun(run, overlayEval) {
  const response = run.response || {};
  return {
    run_number: run.run_number,
    ran_at: run.ran_at,
    model: run.model,
    fallback_used: run.fallback_used,
    effort_level: run.effort_level,
    access_mode: run.access_mode,
    thinking: run.thinking,
    web_search: run.web_search,
    mode: run.mode,
    loop_id: run.loop_id,
    focus_view: run.focus_view,
    started_at: run.started_at,
    duration_ms: run.duration_ms,
    selected: {
      ...(run.selected || {}),
      images: (run.selected?.images || []).map((img) => buildSummaryImage(overlayEval(img))),
    },
    response: {
      variant_id: response.variant_id,
      variant_key: response.variant_key,
      variant_label: response.variant_label,
      variant_type: response.variant_type,
      mode: response.mode,
      loop_id: response.loop_id,
      focus_view: response.focus_view,
      started_at: response.started_at,
      duration_ms: response.duration_ms,
      run_scope_key: response.run_scope_key,
    },
  };
}

function buildPifSummaryResponse({ row, runs, specDb, category, productId, productRow }) {
  const finderStore = specDb.getFinderStore('productImageFinder');
  const dependencyStatus = resolvePifDependencyStatus({ specDb, category, productId, productRow });
  if (!row) {
    return {
      product_id: productId,
      category,
      images: [],
      image_count: 0,
      run_count: 0,
      last_ran_at: '',
      runs: [],
      historyCounts: {},
      carouselSettings: resolvePifCarouselSettings({ finderStore, category }),
      carousel_slots: {},
      dependencyStatus,
    };
  }

  const evalState = parseJsonValue(row.eval_state, {});
  const overlayEval = (img) => {
    const evalData = evalState?.[img?.filename];
    return evalData ? { ...img, ...evalData } : img;
  };

  return {
    product_id: row.product_id,
    category: row.category,
    images: parseJsonArray(row.images).map(buildSummaryListImage),
    image_count: row.image_count,
    run_count: row.run_count,
    last_ran_at: row.latest_ran_at,
    runs: runs.map((run) => buildSummaryRun(run, overlayEval)),
    historyCounts: buildSummaryHistoryCounts(runs),
    carouselSettings: resolvePifCarouselSettings({ finderStore, category: row.category }),
    carousel_slots: parseJsonValue(row.carousel_slots, {}),
    dependencyStatus,
  };
}

export function registerProductImageFinderRoutes(ctx) {
  const store = (specDb) => specDb.getFinderStore('productImageFinder');

  // Generic handler for GET list, GET single, DELETE run, DELETE all
  const genericHandler = createFinderRouteHandler({
    routePrefix: 'product-image-finder',
    moduleId: 'productImageFinder',
    moduleType: 'pif',
    phase: 'imageFinder',
    fieldKeys: [],

    runFinder: runProductImageFinder,
    deleteRun: deleteProductImageFinderRun,
    deleteRuns: deleteProductImageFinderRuns,
    deleteAll: deleteProductImageFinderAll,

    // WHY: Drawer "Delete All" must be a true full reset for PIF —
    // matches what scalar finders (RDF/SKU/KF) get for free because
    // their entire state lives in runs[]. PIF has on-disk images,
    // evaluations, carousel slots, and a SQL projection that must
    // be wiped alongside the runs cleanup the generic handler does.
    onAfterDeleteAll: ({ specDb, productId, productRoot }) => {
      fullResetProductImages({ specDb, productId, productRoot });
    },

    getOne: (specDb, pid) => store(specDb).get(pid),
    listByCategory: (specDb, cat) => store(specDb).listByCategory(cat),
    listRuns: (specDb, pid) => store(specDb).listRuns(pid),
    upsertSummary: (specDb, row) => store(specDb).upsert(row),
    deleteOneSql: (specDb, pid) => store(specDb).remove(pid),
    deleteRunSql: (specDb, pid, rn) => store(specDb).removeRun(pid, rn),
    deleteAllRunsSql: (specDb, pid) => store(specDb).removeAllRuns(pid),

    preview: { compilePrompt: compilePifPreviewPrompt },

    buildGetResponse: (row, selected, runs) => {
      // Backfill dimensions for images that predate dimension capture
      const productRoot = defaultProductRoot();
      const enrichImage = (img) => {
        if (img && img.filename && !img.width && !img.height) {
          const filePath = path.join(productRoot, row.product_id, 'images', img.filename);
          const dims = readImageDimensions(filePath);
          if (dims) { img.width = dims.width; img.height = dims.height; }
        }
        return img;
      };

      // WHY: Eval fields are dual-written to the eval_state SQL column.
      // Read from SQL projection instead of parsing JSON on every GET.
      const evalState = typeof row.eval_state === 'string' ? JSON.parse(row.eval_state || '{}') : (row.eval_state || {});
      const overlayEval = (img) => {
        const evalData = evalState[img.filename];
        return evalData ? { ...img, ...evalData } : img;
      };
      // WHY: evaluations projected to SQL per CLAUDE.md dual-state mandate — runtime UI reads SQL only.
      const evaluations = typeof row.evaluations === 'string' ? JSON.parse(row.evaluations || '[]') : (row.evaluations || []);

      const enrichedSelected = selected?.images
        ? { ...selected, images: selected.images.map(enrichImage).map(overlayEval) }
        : selected;
      const enrichedRuns = runs.map(r => r.selected?.images
        ? { ...r, selected: { ...r.selected, images: r.selected.images.map(enrichImage).map(overlayEval) } }
        : r,
      );
      // Compute per-variant carousel progress from selected images
      const finderStore = store(ctx.getSpecDb(row.category));
      const viewBudget = resolveViewBudget(finderStore?.getSetting?.('viewBudget') || '', row.category);
      const satisfactionThreshold = parseInt(finderStore?.getSetting?.('satisfactionThreshold') || '3', 10) || 3;
      const heroEnabled = (finderStore?.getSetting?.('heroEnabled') || 'true') !== 'false';
      const heroCount = parseInt(finderStore?.getSetting?.('heroCount') || '3', 10) || 3;
      const viewAttemptBudget = parseInt(finderStore?.getSetting?.('viewAttemptBudget') || '5', 10) || 5;
      const viewAttemptBudgets = resolveViewAttemptBudgets(
        finderStore?.getSetting?.('viewAttemptBudgets') || '', row.category, viewBudget, viewAttemptBudget,
      );
      const heroAttemptBudget = parseInt(finderStore?.getSetting?.('heroAttemptBudget') || '3', 10) || 3;

      // WHY: Use row.images (accumulated SQL summary) not enrichedSelected
      // (which is latest run only). Carousel progress must reflect ALL images.
      const rowImages = typeof row.images === 'string' ? JSON.parse(row.images) : (row.images || []);
      const allImages = rowImages.map((img) => ({
        view: img.view, variant_key: img.variant_key, quality_pass: true,
      }));

      // Collect unique variant keys from images
      const variantKeys = [...new Set(allImages.map((img) => img.variant_key).filter(Boolean))];
      const carouselProgress = {};
      for (const vk of variantKeys) {
        carouselProgress[vk] = evaluateCarousel({
          collectedImages: allImages,
          viewBudget, satisfactionThreshold, heroEnabled, heroCount,
          variantKey: vk,
          viewAttemptBudgets,
        }).carouselProgress;
      }

      return {
        product_id: row.product_id,
        category: row.category,
        images: row.images,
        image_count: row.image_count,
        run_count: row.run_count,
        last_ran_at: row.latest_ran_at,
        selected: enrichedSelected,
        runs: enrichedRuns,
        carouselProgress,
        carouselSettings: { viewAttemptBudget, viewAttemptBudgets, heroAttemptBudget, heroEnabled, viewBudget },
        carousel_slots: typeof row.carousel_slots === 'string' ? JSON.parse(row.carousel_slots || '{}') : (row.carousel_slots || {}),
        evaluations,
        dependencyStatus: resolvePifDependencyStatus({
          specDb: ctx.getSpecDb(row.category),
          category: row.category,
          productId: row.product_id,
          productRow: ctx.getSpecDb(row.category)?.getProduct?.(row.product_id),
        }),
      };
    },

    buildResultMeta: (result) => ({
      imagesDownloaded: Array.isArray(result.images) ? result.images.length : 0,
      variantsProcessed: result.variants_processed || 0,
    }),
  })(ctx);

  const { jsonRes, readJsonBody, config, appDb, getSpecDb, broadcastWs, logger } = ctx;

  return async function handleProductImageFinderRoutes(parts, params, method, req, res) {
    if (parts[0] !== 'product-image-finder') return false;

    // GET /product-image-finder/rmbg/status — report whether RMBG model weights are on disk
    if (method === 'GET' && parts[1] === 'rmbg' && parts[2] === 'status') {
      const productRoot = defaultProductRoot();
      const modelPath = path.join(productRoot, '..', 'models', 'rmbg-2.0', 'model_int8.onnx');
      return jsonRes(res, 200, { ready: fs.existsSync(modelPath), path: modelPath });
    }

    const category = parts[1] || '';
    const productId = parts[2] || '';

    // GET /product-image-finder/:category/:productId/summary - lightweight Overview/preview payload.
    if (method === 'GET' && category && productId && parts[3] === 'summary' && !parts[4]) {
      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });
      const productRow = specDb.getProduct?.(productId);
      if (!productRow) return jsonRes(res, 404, { error: 'product not found', product_id: productId, category });
      const finderStore = store(specDb);
      const row = finderStore.get(productId);
      const runs = row ? finderStore.listRuns(productId) : [];
      return jsonRes(res, 200, buildPifSummaryResponse({ row, runs, specDb, category, productId, productRow }));
    }

    // GET /product-image-finder/:category/:productId/dependencies — PIF identity lock status.
    // Works before any PIF summary row exists so the UI can show Run Dep first.
    if (method === 'GET' && category && productId && parts[3] === 'dependencies' && !parts[4]) {
      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });
      const productRow = specDb.getProduct?.(productId);
      if (!productRow) return jsonRes(res, 404, { error: 'product not found', product_id: productId, category });
      return jsonRes(res, 200, resolvePifDependencyStatus({ specDb, category, productId, productRow }));
    }

    // Serve original image: GET /product-image-finder/:category/:productId/images/originals/:filename
    if (method === 'GET' && category && productId && parts[3] === 'images' && parts[4] === 'originals' && parts[5]) {
      return serveImageFile(req, res, jsonRes, params, productId, path.join('images', 'originals'), parts[5]);
    }

    // Serve master image: GET /product-image-finder/:category/:productId/images/:filename
    if (method === 'GET' && category && productId && parts[3] === 'images' && parts[4]) {
      return serveImageFile(req, res, jsonRes, params, productId, 'images', parts[4]);
    }

    // ── Process single image (RMBG background removal) ─────────────
    // POST /product-image-finder/:category/:productId/images/:filename/process
    if (method === 'POST' && category && productId && parts[3] === 'images' && parts[4] && parts[5] === 'process') {
      const filename = parts[4];
      if (!/^[\w\-]+\.\w+$/.test(filename)) return jsonRes(res, 400, { error: 'invalid filename' });

      const productRoot = defaultProductRoot();
      const imagesDir = path.join(productRoot, productId, 'images');
      const masterPath = path.join(imagesDir, filename);

      // Find the source image — either in originals/ (if already moved) or images/ (pre-processing)
      const originalsDir = path.join(imagesDir, 'originals');
      const { processImage, processHeroImage, loadModel } = await import('../imageProcessor.js');

      // Determine source: check originals/ first, fall back to master on disk
      let sourcePath;
      let originalFilename;
      const targetStem = imageStem(filename);
      const stemPng = targetStem + '.png';

      const { readProductImages, writeProductImages, recalculateProductImagesFromRuns } = await import('../productImageStore.js');
      const doc = readProductImages({ productId, productRoot });

      // Search JSON entries by stem — handles cross-extension matching naturally
      let existingEntry = null;
      if (doc?.runs) {
        for (const run of doc.runs) {
          for (const img of (run.selected?.images || [])) {
            if (imageStem(img.filename) === targetStem || imageStem(img.original_filename) === targetStem) {
              existingEntry = img;
              break;
            }
          }
          if (existingEntry) break;
        }
      }

      if (existingEntry?.original_filename && fs.existsSync(path.join(originalsDir, existingEntry.original_filename))) {
        // Has an original in originals/ — reprocess from it
        sourcePath = path.join(originalsDir, existingEntry.original_filename);
        originalFilename = existingEntry.original_filename;
      } else if (fs.existsSync(path.join(originalsDir, filename))) {
        // Original exists in originals/ but entry doesn't track it yet
        sourcePath = path.join(originalsDir, filename);
        originalFilename = filename;
      } else if (fs.existsSync(masterPath)) {
        // Pre-RMBG: master on disk, copy to originals/
        fs.mkdirSync(originalsDir, { recursive: true });
        originalFilename = filename;
        sourcePath = path.join(originalsDir, filename);
        fs.copyFileSync(masterPath, sourcePath);
      } else if (filename !== stemPng && fs.existsSync(path.join(imagesDir, stemPng))) {
        // Master already converted to .png but no original — can't reprocess
        return jsonRes(res, 409, { error: 'image already processed, no original available to reprocess' });
      } else {
        return jsonRes(res, 404, { error: 'image not found' });
      }

      // Register operation for sidebar visibility
      const specDb = getSpecDb(category);
      const productRow = specDb?.getProduct?.(productId);
      const op = registerOperation({
        type: 'pif',
        subType: 'process',
        category,
        productId,
        productLabel: productRow ? `${productRow.brand || ''} ${productRow.model || ''}`.trim() : productId,
        stages: ['Processing'],
      });

      // Process — hero images get 16:9 center-crop, view images get RMBG
      const isHero = existingEntry?.view === 'hero';
      const masterFilename = stemPng;
      const masterOut = path.join(imagesDir, masterFilename);
      let result;

      if (isHero) {
        result = await processHeroImage({ inputPath: sourcePath, outputPath: masterOut });
        // WHY: bg_removed is the universal "processed" flag the UI checks to hide RAW badge / process button
        result.bg_removed = true;
      } else {
        const { ensureModelReady } = await import('../modelDownloader.js');
        const modelDir = path.join(productRoot, '..', 'models', 'rmbg-2.0');
        const modelStatus = await ensureModelReady({ modelDir, token: config?.hfToken || '' });
        if (!modelStatus.ready) {
          failOperation({ id: op.id, error: 'RMBG model not available' });
          return jsonRes(res, 503, { error: 'RMBG model not available', details: modelStatus.error });
        }
        const session = await loadModel({ modelDir });
        if (!session) {
          failOperation({ id: op.id, error: 'Failed to load RMBG model' });
          return jsonRes(res, 503, { error: 'Failed to load RMBG model' });
        }
        result = await processImage({ inputPath: sourcePath, outputPath: masterOut, session });
      }

      if (!result.ok) {
        failOperation({ id: op.id, error: result.error || 'processing failed' });
        return jsonRes(res, 500, { error: 'processing failed', details: result.error });
      }

      // If master filename changed (e.g. .jpg → .png), delete old master
      if (masterFilename !== filename && fs.existsSync(masterPath)) {
        try { fs.unlinkSync(masterPath); } catch { /* */ }
      }

      // Update JSON entries — match by stem so extension changes don't miss entries
      const originalFormat = path.extname(originalFilename).toLowerCase().replace('.', '');
      if (doc?.runs) {
        for (const run of doc.runs) {
          for (const img of (run.selected?.images || [])) {
            if (imageStem(img.filename) === targetStem || imageStem(img.original_filename) === targetStem) {
              img.filename = masterFilename;
              img.original_filename = originalFilename;
              img.bg_removed = result.bg_removed;
              img.original_format = originalFormat;
              img.bytes = result.bytes;
              img.width = result.width;
              img.height = result.height;
            }
          }
          for (const img of (run.response?.images || [])) {
            if (imageStem(img.filename) === targetStem || imageStem(img.original_filename) === targetStem) {
              img.filename = masterFilename;
              img.original_filename = originalFilename;
              img.bg_removed = result.bg_removed;
              img.original_format = originalFormat;
            }
          }
        }
        const recalculated = recalculateProductImagesFromRuns(doc.runs, productId, category, doc);

        // WHY: recalculation may pick a different entry for the same view/variant
        // (dedup numbering). Ensure the processed entry's RMBG fields propagate.
        for (const img of (recalculated.selected?.images || [])) {
          if (img.filename === masterFilename) {
            img.original_filename = originalFilename;
            img.bg_removed = result.bg_removed;
            img.original_format = originalFormat;
            img.bytes = result.bytes;
            img.width = result.width;
            img.height = result.height;
          }
        }

        writeProductImages({ productId, productRoot, data: recalculated });

        // Update SQL
        const specDb = getSpecDb(category);
        if (specDb) {
          const finderStore = specDb.getFinderStore('productImageFinder');
          finderStore.upsert({
            category,
            product_id: productId,
            images: recalculated.selected?.images?.map(i => ({ view: i.view, filename: i.filename, variant_key: i.variant_key })) || [],
            image_count: recalculated.selected?.images?.length || 0,
            latest_ran_at: recalculated.last_ran_at || '',
            run_count: recalculated.run_count || 0,
          });
          // Re-insert runs so SQL runs table reflects updated RMBG fields
          for (const run of recalculated.runs || []) {
            finderStore.insertRun({
              category,
              product_id: productId,
              run_number: run.run_number,
              ran_at: run.ran_at || '',
              model: run.model || '',
              fallback_used: run.fallback_used,
              effort_level: run.effort_level || '',
              access_mode: run.access_mode || '',
              thinking: Boolean(run.thinking),
              web_search: Boolean(run.web_search),
              selected: run.selected || {},
              prompt: run.prompt || {},
              response: run.response || {},
            });
          }
        }
      }

      completeOperation({ id: op.id });

      emitDataChange({
        broadcastWs,
        event: 'product-image-finder-image-processed',
        category,
        entities: { productIds: [productId] },
        meta: { productId, filename: masterFilename, bg_removed: result.bg_removed },
      });

      return jsonRes(res, 200, { ok: true, ...result, filename: masterFilename, original_filename: originalFilename });
    }

    // ── Process all unprocessed images (batch RMBG) ─────────────────
    // POST /product-image-finder/:category/:productId/process-all
    if (method === 'POST' && category && productId && parts[3] === 'process-all' && !parts[4]) {
      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

      const productRow = specDb.getProduct(productId);
      if (!productRow) return jsonRes(res, 404, { error: 'product not found' });

      const productRoot = defaultProductRoot();
      const imagesDir = path.join(productRoot, productId, 'images');
      const originalsDir = path.join(imagesDir, 'originals');

      const { processImage, processHeroImage, loadModel } = await import('../imageProcessor.js');
      const { readProductImages, writeProductImages, recalculateProductImagesFromRuns } = await import('../productImageStore.js');

      // Find unprocessed images (heroes need crop, views need RMBG)
      const doc = readProductImages({ productId, productRoot });
      const unprocessed = [];
      if (doc?.runs) {
        for (const run of doc.runs) {
          for (const img of (run.selected?.images || [])) {
            if (!img.bg_removed && img.filename) unprocessed.push(img);
          }
        }
      }

      if (unprocessed.length === 0) {
        return jsonRes(res, 200, { ok: true, processed: 0, message: 'no unprocessed images' });
      }

      // Only load RMBG model if there are non-hero images to process
      const hasViewImages = unprocessed.some(img => img.view !== 'hero');
      let session = null;
      if (hasViewImages) {
        const { ensureModelReady } = await import('../modelDownloader.js');
        const modelDir = path.join(productRoot, '..', 'models', 'rmbg-2.0');
        const modelStatus = await ensureModelReady({ modelDir, token: config?.hfToken || '' });
        if (!modelStatus.ready) {
          return jsonRes(res, 503, { error: 'RMBG model not available', details: modelStatus.error });
        }
        session = await loadModel({ modelDir });
        if (!session) {
          return jsonRes(res, 503, { error: 'Failed to load RMBG model' });
        }
      }

      // Register operation
      const op = registerOperation({
        type: 'pif',
        subType: 'process',
        category,
        productId,
        productLabel: `${productRow.brand || ''} ${productRow.model || ''}`.trim(),
        stages: ['Processing', 'Complete'],
      });

      const total = unprocessed.length;
      const signal = getOperationSignal(op.id);

      return fireAndForget({
        res,
        jsonRes,
        op,
        broadcastWs,
        signal,
        emitArgs: {
          event: 'product-image-finder-batch-processed',
          category,
          entities: { productIds: [productId] },
          meta: { productId },
        },
        asyncWork: async () => {
          let processed = 0;

          for (const img of unprocessed) {
            // Resolve source: originals/ first, then master on disk
            let sourcePath;
            if (img.original_filename && fs.existsSync(path.join(originalsDir, img.original_filename))) {
              sourcePath = path.join(originalsDir, img.original_filename);
            } else if (fs.existsSync(path.join(imagesDir, img.filename))) {
              // Master on disk, copy to originals for preservation
              fs.mkdirSync(originalsDir, { recursive: true });
              const origName = img.filename;
              sourcePath = path.join(originalsDir, origName);
              fs.copyFileSync(path.join(imagesDir, img.filename), sourcePath);
              img.original_filename = origName;
            } else {
              continue; // image file missing, skip
            }

            const masterFilename = img.filename.replace(/\.\w+$/, '.png');
            const masterOut = path.join(imagesDir, masterFilename);
            let result;
            if (img.view === 'hero') {
              result = await processHeroImage({ inputPath: sourcePath, outputPath: masterOut });
              result.bg_removed = true;
            } else {
              result = await processImage({ inputPath: sourcePath, outputPath: masterOut, session });
            }

            if (result.ok) {
              const originalFormat = path.extname(img.original_filename || img.filename).toLowerCase().replace('.', '');
              img.filename = masterFilename;
              img.bg_removed = result.bg_removed;
              img.original_format = originalFormat;
              img.bytes = result.bytes;
              img.width = result.width;
              img.height = result.height;
              processed++;
            }

            updateProgressText({ id: op.id, text: `${processed}/${total} images` });
          }

          // Persist updated JSON + SQL
          if (processed > 0 && doc?.runs) {
            // Propagate updated fields into all run entries
            for (const run of doc.runs) {
              for (const img of (run.selected?.images || [])) {
                const match = unprocessed.find(u => u.filename === img.filename || u.filename === img.filename.replace(/\.\w+$/, '.png'));
                if (match && match.bg_removed) Object.assign(img, { filename: match.filename, bg_removed: match.bg_removed, original_format: match.original_format, original_filename: match.original_filename, bytes: match.bytes, width: match.width, height: match.height });
              }
              for (const img of (run.response?.images || [])) {
                const match = unprocessed.find(u => u.filename === img.filename || u.filename === img.filename.replace(/\.\w+$/, '.png'));
                if (match && match.bg_removed) Object.assign(img, { filename: match.filename, bg_removed: match.bg_removed, original_format: match.original_format, original_filename: match.original_filename });
              }
            }

            const recalculated = recalculateProductImagesFromRuns(doc.runs, productId, category, doc);
            writeProductImages({ productId, productRoot, data: recalculated });

            const finderStore = specDb.getFinderStore('productImageFinder');
            finderStore.upsert({
              category,
              product_id: productId,
              images: recalculated.selected?.images?.map(i => ({ view: i.view, filename: i.filename, variant_key: i.variant_key })) || [],
              image_count: recalculated.selected?.images?.length || 0,
              latest_ran_at: recalculated.last_ran_at || '',
              run_count: recalculated.run_count || 0,
            });
            for (const run of recalculated.runs || []) {
              finderStore.insertRun({
                category, product_id: productId,
                run_number: run.run_number, ran_at: run.ran_at || '',
                model: run.model || '', fallback_used: run.fallback_used,
                effort_level: run.effort_level || '', access_mode: run.access_mode || '',
                thinking: Boolean(run.thinking), web_search: Boolean(run.web_search),
                selected: run.selected || {}, prompt: run.prompt || {}, response: run.response || {},
              });
            }
          }

          updateStage({ id: op.id, stageName: 'Complete' });
          return { ok: true, processed, total };
        },
        completeOperation,
        failOperation,
        cancelOperation,
        emitDataChange,
      });
    }

    // ── Loop: autonomous carousel fill (views → heroes → done) ─────
    // POST /product-image-finder/:category/:productId/loop
    if (method === 'POST' && category && productId && parts[3] === 'loop') {
      let op = null;
      let batcher = null;
      try {
        const specDb = getSpecDb(category);
        if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

        const productRow = specDb.getProduct(productId);
        if (!productRow) return jsonRes(res, 404, { error: 'product not found', product_id: productId, category });
        const dependencyLock = resolveMissingPifDependencyResponse({ specDb, category, productId, productRow });
        if (dependencyLock) return jsonRes(res, dependencyLock.status, dependencyLock.body);

        const body = await readJsonBody(req).catch(() => ({}));
        const variantKey = body?.variant_key || null;
        const finderStore = specDb.getFinderStore?.('productImageFinder');
        const loopThreshold = parseInt(finderStore?.getSetting?.('satisfactionThreshold') || '3', 10) || 3;
        const viewAttemptBudget = parseInt(finderStore?.getSetting?.('viewAttemptBudget') || '5', 10) || 5;
        const loopViewBudget = resolveViewBudget(finderStore?.getSetting?.('viewBudget') || '', category);
        const viewAttemptBudgets = resolveViewAttemptBudgets(
          finderStore?.getSetting?.('viewAttemptBudgets') || '', category, loopViewBudget, viewAttemptBudget,
        );
        const heroAttemptBudget = parseInt(finderStore?.getSetting?.('heroAttemptBudget') || '3', 10) || 3;

        op = registerOperation({
          type: 'pif',
          subType: 'loop',
          category,
          productId,
          productLabel: `${productRow.brand || ''} ${productRow.model || ''}`.trim(),
          variantKey: variantKey || '',
          stages: ['Discovery', 'Download', 'Processing', 'Complete'],
        });
        batcher = createStreamBatcher({ operationId: op.id, broadcastWs, config, getActiveOperationCount: countRunningOperations });
        const signal = getOperationSignal(op.id);

        return fireAndForget({
          res,
          jsonRes,
          op,
          batcher,
          broadcastWs,
          signal,
          emitArgs: {
            event: 'product-image-finder-loop',
            category,
            entities: { productIds: [productId] },
            meta: { productId },
          },
          asyncWork: async () => {
            const result = await runCarouselLoop({
            product: {
              product_id: productId,
              category,
              brand: productRow.brand || '',
              model: productRow.model || '',
              base_model: productRow.base_model || '',
              variant: productRow.variant || '',
            },
            appDb,
            specDb,
            config,
            logger: logger || null,
            variantKey,
            signal,
            onStageAdvance: (name) => updateStage({ id: op.id, stageName: name }),
            onModelResolved: (info) => updateModelInfo({ id: op.id, ...info }),
            onStreamChunk: (delta) => {
              const meta = { callId: delta?.callId, lane: delta?.lane, label: delta?.label };
              if (delta?.reasoning) batcher.push(delta.reasoning, { ...meta, channel: 'reasoning' });
              if (delta?.content) batcher.push(delta.content, { ...meta, channel: 'content' });
            },
            onQueueWait: (ms) => updateQueueDelay({ id: op.id, queueDelayMs: ms }),
            onLlmCallComplete: (call) => appendLlmCall({ id: op.id, call }),
            onLoopProgress: ({ callNumber, estimatedRemaining, variantLabel, focusView, mode, variantIndex, variantTotal, carouselProgress }) => {
              updateLoopProgress({
                id: op.id,
                loopProgress: {
                  variantLabel,
                  variantIndex: variantIndex ?? 0,
                  variantTotal: variantTotal ?? 1,
                  callNumber,
                  estimatedRemaining: Math.max(0, estimatedRemaining),
                  mode,
                  focusView: focusView || null,
                  views: carouselProgress?.viewDetails
                    ? Object.entries(carouselProgress.viewDetails).map(([view, d]) => ({
                      view, count: d.count, target: loopThreshold, satisfied: d.satisfied, exhausted: d.exhausted,
                      attempts: d.attempts ?? 0, attemptBudget: d.attemptBudget ?? viewAttemptBudget,
                    }))
                    : [],
                  hero: carouselProgress?.heroTarget > 0
                    ? { count: carouselProgress.heroCount, target: carouselProgress.heroTarget, satisfied: carouselProgress.heroSatisfied, exhausted: carouselProgress.heroExhausted,
                        attempts: carouselProgress.heroAttempts ?? 0, attemptBudget: carouselProgress.heroAttemptBudget ?? heroAttemptBudget }
                    : null,
                },
              });
            },
            // WHY: Fires after each loop iteration's per-variant store.upsert.
            // Refreshes the pif_variant_progress projection + broadcasts the
            // standard loop event so the Overview catalog query invalidates
            // mid-loop, ticking the "img" counter live instead of at the end.
            onVariantPersisted: ({ variantKey: vk }) => {
              writePifVariantProgress({ specDb, category, productId });
              emitDataChange({
                broadcastWs,
                event: 'product-image-finder-loop',
                category,
                entities: { productIds: [productId] },
                meta: { productId, variantKey: vk },
              });
            },
            });
            writePifVariantProgress({ specDb, category, productId, carouselProgressByKey: result?.carouselProgress });
            return result;
          },
          completeOperation,
          failOperation,
          cancelOperation,
          emitDataChange,
        });
      } catch (err) {
        if (batcher) batcher.dispose();
        if (op) failOperation({ id: op.id, error: err instanceof Error ? err.message : String(err) });
        return jsonRes(res, 500, { error: 'loop failed', message: err instanceof Error ? err.message : String(err) });
      }
    }

    // ── Carousel Builder: evaluate one variant carousel ───────────
    // POST /product-image-finder/:category/:productId/evaluate-carousel
    // Body: { variant_key, variant_id }
    if (method === 'POST' && category && productId && parts[3] === 'evaluate-carousel') {
      let op = null;
      let batcher = null;
      try {
        const specDb = getSpecDb(category);
        if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

        const productRow = specDb.getProduct(productId);
        if (!productRow) return jsonRes(res, 404, { error: 'product not found', product_id: productId, category });
        const dependencyLock = resolveMissingPifDependencyResponse({ specDb, category, productId, productRow });
        if (dependencyLock) return jsonRes(res, dependencyLock.status, dependencyLock.body);

        const body = await readJsonBody(req).catch(() => ({}));
        const variantKey = body?.variant_key || '';
        const variantId = body?.variant_id || null;

        op = registerOperation({
          type: 'pif',
          subType: 'evaluate',
          category,
          productId,
          productLabel: `${productRow.brand || ''} ${productRow.model || ''}`.trim(),
          variantKey,
          stages: ['Evaluating', 'Heroes', 'Complete'],
        });
        updateProgressText({ id: op.id, text: 'carousel eval loop' });

        batcher = createStreamBatcher({ operationId: op.id, broadcastWs, config, getActiveOperationCount: countRunningOperations });
        const signal = getOperationSignal(op.id);

        return fireAndForget({
          res,
          jsonRes,
          op,
          batcher,
          broadcastWs,
          signal,
          emitArgs: {
            event: 'product-image-finder-evaluate',
            category,
            entities: { productIds: [productId] },
            meta: { productId },
          },
          asyncWork: () => runEvalCarouselLoop({
            product: {
              product_id: productId,
              category,
              brand: productRow.brand || '',
              model: productRow.model || '',
              base_model: productRow.base_model || '',
              variant: productRow.variant || '',
            },
            appDb,
            specDb,
            config,
            logger: logger || null,
            variantKey,
            variantId,
            signal,
            onStageAdvance: (name) => updateStage({ id: op.id, stageName: name }),
            onModelResolved: (info) => updateModelInfo({ id: op.id, ...info }),
            onStreamChunk: (delta) => {
              if (delta?.reasoning) batcher?.push(delta.reasoning);
              if (delta?.content) batcher?.push(delta.content);
            },
            onQueueWait: (ms) => updateQueueDelay({ id: op.id, queueDelayMs: ms }),
            onLlmCallComplete: (call) => appendLlmCall({ id: op.id, call }),
            onProgress: (text) => updateProgressText({ id: op.id, text }),
            onSlotComplete: (event) => {
              writePifVariantProgress({ specDb, category, productId });
              emitDataChange({
                broadcastWs,
                event: 'product-image-finder-evaluate',
                category,
                entities: { productIds: [productId] },
                meta: { productId, variantKey, slot: event?.view || null, callNumber: event?.callNumber || null, totalCalls: event?.totalCalls || null },
              });
            },
          }),
          completeOperation,
          failOperation,
          cancelOperation,
          emitDataChange,
        });
      } catch (err) {
        if (batcher) batcher.dispose();
        if (op) failOperation({ id: op.id, error: err instanceof Error ? err.message : String(err) });
        return jsonRes(res, 500, { error: 'evaluate-carousel failed', message: err instanceof Error ? err.message : String(err) });
      }
    }

    // POST /product-image-finder/:category/:productId/evaluate-view
    // Body: { variant_key, view }
    // Legacy endpoint retained for focused one-view retries and existing callers.
    if (method === 'POST' && category && productId && parts[3] === 'evaluate-view') {
      let op = null;
      let batcher = null;
      try {
        const specDb = getSpecDb(category);
        if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

        const productRow = specDb.getProduct(productId);
        if (!productRow) return jsonRes(res, 404, { error: 'product not found', product_id: productId, category });
        const dependencyLock = resolveMissingPifDependencyResponse({ specDb, category, productId, productRow });
        if (dependencyLock) return jsonRes(res, dependencyLock.status, dependencyLock.body);

        const body = await readJsonBody(req).catch(() => ({}));
        const variantKey = body?.variant_key || '';
        const variantId = body?.variant_id || null;
        const view = body?.view || '';
        if (!view) return jsonRes(res, 400, { error: 'view is required' });

        op = registerOperation({
          type: 'pif',
          subType: 'evaluate',
          category,
          productId,
          productLabel: `${productRow.brand || ''} ${productRow.model || ''}`.trim(),
          variantKey,
          stages: ['Evaluating', 'Complete'],
        });
        updateProgressText({ id: op.id, text: `${view} view` });

        batcher = createStreamBatcher({ operationId: op.id, broadcastWs, config, getActiveOperationCount: countRunningOperations });
        const signal = getOperationSignal(op.id);

        return fireAndForget({
          res,
          jsonRes,
          op,
          batcher,
          broadcastWs,
          signal,
          emitArgs: {
            event: 'product-image-finder-evaluate',
            category,
            entities: { productIds: [productId] },
            meta: { productId },
          },
          asyncWork: () => runEvalView({
            product: {
              product_id: productId,
              category,
              brand: productRow.brand || '',
              model: productRow.model || '',
              base_model: productRow.base_model || '',
              variant: productRow.variant || '',
            },
            appDb,
            specDb,
            config,
            logger: logger || null,
            variantKey,
            variantId,
            view,
            signal,
            onStageAdvance: (name) => updateStage({ id: op.id, stageName: name }),
            onModelResolved: (info) => updateModelInfo({ id: op.id, ...info }),
            onStreamChunk: (delta) => {
              if (delta?.reasoning) batcher?.push(delta.reasoning);
              if (delta?.content) batcher?.push(delta.content);
            },
            onQueueWait: (ms) => updateQueueDelay({ id: op.id, queueDelayMs: ms }),
            onLlmCallComplete: (call) => appendLlmCall({ id: op.id, call }),
          }),
          completeOperation,
          failOperation,
          cancelOperation,
          emitDataChange,
        });
      } catch (err) {
        if (batcher) batcher.dispose();
        if (op) failOperation({ id: op.id, error: err instanceof Error ? err.message : String(err) });
        return jsonRes(res, 500, { error: 'evaluate-view failed', message: err instanceof Error ? err.message : String(err) });
      }
    }

    // ── Carousel Builder: pick heroes from winners ─────────────────
    // POST /product-image-finder/:category/:productId/evaluate-hero
    // Body: { variant_key }
    if (method === 'POST' && category && productId && parts[3] === 'evaluate-hero') {
      let op = null;
      let batcher = null;
      try {
        const specDb = getSpecDb(category);
        if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

        const productRow = specDb.getProduct(productId);
        if (!productRow) return jsonRes(res, 404, { error: 'product not found', product_id: productId, category });
        const dependencyLock = resolveMissingPifDependencyResponse({ specDb, category, productId, productRow });
        if (dependencyLock) return jsonRes(res, dependencyLock.status, dependencyLock.body);

        const body = await readJsonBody(req).catch(() => ({}));
        const variantKey = body?.variant_key || '';
        const variantId = body?.variant_id || null;

        op = registerOperation({
          type: 'pif',
          subType: 'evaluate',
          category,
          productId,
          productLabel: `${productRow.brand || ''} ${productRow.model || ''}`.trim(),
          variantKey,
          stages: ['Heroes', 'Complete'],
        });
        updateProgressText({ id: op.id, text: 'hero selection' });

        batcher = createStreamBatcher({ operationId: op.id, broadcastWs, config, getActiveOperationCount: countRunningOperations });
        const signal = getOperationSignal(op.id);

        return fireAndForget({
          res,
          jsonRes,
          op,
          batcher,
          broadcastWs,
          signal,
          emitArgs: {
            event: 'product-image-finder-evaluate',
            category,
            entities: { productIds: [productId] },
            meta: { productId },
          },
          asyncWork: () => runEvalHero({
            product: {
              product_id: productId,
              category,
              brand: productRow.brand || '',
              model: productRow.model || '',
              base_model: productRow.base_model || '',
              variant: productRow.variant || '',
            },
            appDb,
            specDb,
            config,
            logger: logger || null,
            variantKey,
            variantId,
            signal,
            onStageAdvance: (name) => updateStage({ id: op.id, stageName: name }),
            onModelResolved: (info) => updateModelInfo({ id: op.id, ...info }),
            onStreamChunk: (delta) => {
              if (delta?.reasoning) batcher?.push(delta.reasoning);
              if (delta?.content) batcher?.push(delta.content);
            },
            onQueueWait: (ms) => updateQueueDelay({ id: op.id, queueDelayMs: ms }),
            onLlmCallComplete: (call) => appendLlmCall({ id: op.id, call }),
          }),
          completeOperation,
          failOperation,
          cancelOperation,
          emitDataChange,
        });
      } catch (err) {
        if (batcher) batcher.dispose();
        if (op) failOperation({ id: op.id, error: err instanceof Error ? err.message : String(err) });
        return jsonRes(res, 500, { error: 'evaluate-hero failed', message: err instanceof Error ? err.message : String(err) });
      }
    }

    // ── Carousel Builder: set/clear a slot override ──────────────
    // PATCH /product-image-finder/:category/:productId/carousel-slot
    if (method === 'PATCH' && category && productId && parts[3] === 'carousel-slot') {
      try {
        const specDb = getSpecDb(category);
        if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

        const body = await readJsonBody(req).catch(() => ({}));
        const variantKey = body?.variant_key;
        const slot = body?.slot;
        if (!variantKey || !slot) return jsonRes(res, 400, { error: 'variant_key and slot are required' });

        const filename = body?.filename ?? null;
        const productRoot = defaultProductRoot();

        // Dual-write: JSON first (durable), then SQL projection
        const updatedSlots = writeCarouselSlot({ productId, productRoot, variantKey, slot, filename });

        // Project to SQL
        const finderStore = store(specDb);
        finderStore.updateSummaryField(productId, 'carousel_slots', JSON.stringify(updatedSlots));

        emitDataChange({
          broadcastWs,
          event: 'product-image-finder-carousel-updated',
          category,
          entities: { productIds: [productId] },
          meta: { productId, variantKey, slot },
        });

        return jsonRes(res, 200, { ok: true, carousel_slots: updatedSlots });
      } catch (err) {
        return jsonRes(res, 500, { error: 'carousel-slot failed', message: err instanceof Error ? err.message : String(err) });
      }
    }

    // ── Carousel Builder: clear all current winners for one variant ─────────
    // POST /product-image-finder/:category/:productId/carousel-winners/clear
    if (method === 'POST' && category && productId && parts[3] === 'carousel-winners' && parts[4] === 'clear') {
      try {
        const specDb = getSpecDb(category);
        if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

        const body = await readJsonBody(req).catch(() => ({}));
        const variantKey = body?.variant_key;
        const variantId = body?.variant_id || null;
        if (!variantKey) return jsonRes(res, 400, { error: 'variant_key is required' });

        const productRoot = defaultProductRoot();
        const result = clearCarouselWinners({ productId, productRoot, variantKey, variantId });
        if (!result) return jsonRes(res, 404, { error: 'product image data not found' });

        const finderStore = store(specDb);
        const carouselSlots = result.carousel_slots || {};
        const evalState = extractEvalState(result);
        finderStore.updateSummaryField(productId, 'carousel_slots', JSON.stringify(carouselSlots));
        finderStore.updateSummaryField(productId, 'eval_state', JSON.stringify(evalState));
        for (const run of (result.runs || [])) {
          if (run.run_number == null) continue;
          finderStore.updateRunJson(productId, run.run_number, {
            selected: run.selected || {},
            response: run.response || {},
          });
        }
        writePifVariantProgress({ specDb, category, productId });

        emitDataChange({
          broadcastWs,
          event: 'product-image-finder-evaluate',
          category,
          entities: { productIds: [productId] },
          meta: { productId, variantKey },
        });

        return jsonRes(res, 200, { ok: true, carousel_slots: carouselSlots, eval_state: evalState });
      } catch (err) {
        return jsonRes(res, 500, { error: 'clear carousel winners failed', message: err instanceof Error ? err.message : String(err) });
      }
    }

    // ── Carousel Builder: delete an eval record ─────────────────
    // DELETE /product-image-finder/:category/:productId/evaluations/:evalNumber
    if (method === 'DELETE' && category && productId && parts[3] === 'evaluations' && parts[4]) {
      try {
        const evalNumber = parseInt(parts[4], 10);
        if (isNaN(evalNumber)) return jsonRes(res, 400, { error: 'invalid eval number' });

        const productRoot = defaultProductRoot();
        const result = deleteEvalRecord({ productId, productRoot, evalNumber });
        if (!result) return jsonRes(res, 404, { error: 'eval record not found' });

        // SQL projection — update eval_state AND evaluations after eval deletion
        const specDb = getSpecDb(category);
        if (specDb) {
          const finderStore = store(specDb);
          finderStore.updateSummaryField(productId, 'eval_state', JSON.stringify(extractEvalState(result)));
          finderStore.updateSummaryField(productId, 'evaluations', JSON.stringify(result.evaluations || []));
        }

        emitDataChange({
          broadcastWs,
          event: 'product-image-finder-evaluate',
          category,
          entities: { productIds: [productId] },
          meta: { productId },
        });

        return jsonRes(res, 200, { ok: true, remaining: result.evaluations?.length ?? 0 });
      } catch (err) {
        return jsonRes(res, 500, { error: 'delete eval failed', message: err instanceof Error ? err.message : String(err) });
      }
    }

    // Custom POST: reads body for variant_key (single run)
    if (method === 'POST' && category && productId && !parts[3]) {
      let op = null;
      let batcher = null;
      try {
        const specDb = getSpecDb(category);
        if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

        const productRow = specDb.getProduct(productId);
        if (!productRow) return jsonRes(res, 404, { error: 'product not found', product_id: productId, category });
        const dependencyLock = resolveMissingPifDependencyResponse({ specDb, category, productId, productRow });
        if (dependencyLock) return jsonRes(res, dependencyLock.status, dependencyLock.body);

        // Read optional variant_key, mode, and view from body.
        const body = await readJsonBody(req).catch(() => ({}));
        const variantKey = body?.variant_key || null;
        const mode = body?.mode === 'hero' ? 'hero' : 'view';
        const view = mode === 'view' && typeof body?.view === 'string' && body.view ? body.view : null;
        if (view && !CANONICAL_VIEW_KEYS.includes(view)) {
          return jsonRes(res, 400, { error: 'unknown view', view });
        }

        // subType differentiates Priority View Run from Individual View Run in the
        // operations tracker. Hero stays as 'hero'.
        let subType;
        if (mode === 'hero') subType = 'hero';
        else if (view) subType = 'view-single';
        else subType = 'priority-view';

        const stages = ['Discovery', 'Download', 'Processing', 'Complete'];
        op = registerOperation({
          type: 'pif',
          subType,
          category,
          productId,
          productLabel: `${productRow.brand || ''} ${productRow.model || ''}`.trim(),
          variantKey: variantKey || '',
          stages,
        });
        if (view) updateProgressText({ id: op.id, text: `${view} view` });
        batcher = createStreamBatcher({ operationId: op.id, broadcastWs, config, getActiveOperationCount: countRunningOperations });
        const signal = getOperationSignal(op.id);

        return fireAndForget({
          res,
          jsonRes,
          op,
          batcher,
          broadcastWs,
          signal,
          emitArgs: {
            event: 'product-image-finder-run',
            category,
            entities: { productIds: [productId] },
            meta: { productId },
          },
          asyncWork: async () => {
            const result = await runProductImageFinder({
            product: {
              product_id: productId,
              category,
              brand: productRow.brand || '',
              model: productRow.model || '',
              base_model: productRow.base_model || '',
              variant: productRow.variant || '',
            },
            appDb,
            specDb,
            config,
            logger: logger || null,
            variantKey,
            mode,
            view,
            signal,
            onStageAdvance: (name) => updateStage({ id: op.id, stageName: name }),
            onModelResolved: (info) => updateModelInfo({ id: op.id, ...info }),
            onStreamChunk: (delta) => { if (delta.reasoning) batcher.push(delta.reasoning); if (delta.content) batcher.push(delta.content); },
            onQueueWait: (ms) => updateQueueDelay({ id: op.id, queueDelayMs: ms }),
            onLlmCallComplete: (call) => appendLlmCall({ id: op.id, call }),
            // WHY: Fires after each variant's store.upsert in produceForVariant.
            // Refreshes the pif_variant_progress projection + broadcasts the
            // standard run event so the Overview catalog query invalidates
            // per-variant, ticking the "img" counter live across multi-variant
            // runs instead of jumping at the end.
            onVariantPersisted: ({ variantKey: vk }) => {
              writePifVariantProgress({ specDb, category, productId });
              emitDataChange({
                broadcastWs,
                event: 'product-image-finder-run',
                category,
                entities: { productIds: [productId] },
                meta: { productId, variantKey: vk },
              });
            },
            });
            writePifVariantProgress({ specDb, category, productId, carouselProgressByKey: result?.carouselProgress });
            return result;
          },
          completeOperation,
          failOperation,
          cancelOperation,
          emitDataChange,
        });
      } catch (err) {
        if (batcher) batcher.dispose();
        if (op) failOperation({ id: op.id, error: err instanceof Error ? err.message : String(err) });
        return jsonRes(res, 500, { error: 'finder failed', message: err instanceof Error ? err.message : String(err) });
      }
    }

    // ── DELETE single image file ────────────────────────────────────
    // DELETE /product-image-finder/:category/:productId/images/:filename
    if (method === 'DELETE' && category && productId && parts[3] === 'images' && parts[4]) {
      const filename = parts[4];
      if (!/^[\w\-]+\.\w+$/.test(filename)) return jsonRes(res, 400, { error: 'invalid filename' });

      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

      const productRoot = defaultProductRoot();
      const deleteStem = imageStem(filename);
      const imagesDir = path.join(productRoot, productId, 'images');
      const masterCacheDir = path.join(imagesDir, '.cache', 'master');
      const originalsCacheDir = path.join(imagesDir, '.cache', 'originals');

      // Delete master file from disk (master is always .png after RMBG)
      const masterPath = path.join(imagesDir, deleteStem + '.png');
      removeLocalAssetVariants({ sourcePath: masterPath, cacheDir: masterCacheDir });
      try { fs.unlinkSync(masterPath); } catch { /* file may already be gone */ }
      // Also try the exact requested filename if it differs (pre-RMBG ext)
      if (filename !== deleteStem + '.png') {
        const exactPath = path.join(imagesDir, filename);
        removeLocalAssetVariants({ sourcePath: exactPath, cacheDir: masterCacheDir });
        try { fs.unlinkSync(exactPath); } catch { /* */ }
      }

      // Read current JSON to find original_filename, then strip + recalculate
      const { readProductImages, writeProductImages, recalculateProductImagesFromRuns } = await import('../productImageStore.js');
      const doc = readProductImages({ productId, productRoot });

      // Also delete original file if it exists (RMBG originals/ subdirectory)
      if (doc && Array.isArray(doc.runs)) {
        for (const run of doc.runs) {
          for (const img of (run.selected?.images || [])) {
            if (imageStem(img.filename) === deleteStem && img.original_filename) {
              const origPath = path.join(imagesDir, 'originals', img.original_filename);
              removeLocalAssetVariants({ sourcePath: origPath, cacheDir: originalsCacheDir });
              try { fs.unlinkSync(origPath); } catch { /* */ }
            }
          }
        }
      }

      if (doc && Array.isArray(doc.runs)) {
        for (const run of doc.runs) {
          if (run.selected?.images) {
            run.selected.images = run.selected.images.filter(img => imageStem(img.filename) !== deleteStem);
          }
          if (run.response?.images) {
            run.response.images = run.response.images.filter(img => imageStem(img.filename) !== deleteStem);
          }
        }
        // Recalculate selected from modified runs
        const recalculated = recalculateProductImagesFromRuns(doc.runs, productId, category, doc);
        writeProductImages({ productId, productRoot, data: recalculated });

        // Update SQL summary + runs
        const finderStore = specDb.getFinderStore('productImageFinder');
        finderStore.upsert({
          category,
          product_id: productId,
          images: recalculated.selected?.images?.map(img => ({ view: img.view, filename: img.filename, variant_key: img.variant_key })) || [],
          image_count: recalculated.selected?.images?.length || 0,
          latest_ran_at: recalculated.last_ran_at || '',
          run_count: recalculated.run_count || 0,
        });
        // Re-insert each modified run so SQL runs table reflects stripped images
        for (const run of recalculated.runs || []) {
          finderStore.insertRun({
            category,
            product_id: productId,
            run_number: run.run_number,
            ran_at: run.ran_at || '',
            model: run.model || '',
            fallback_used: run.fallback_used,
            effort_level: run.effort_level || '',
            access_mode: run.access_mode || '',
            thinking: Boolean(run.thinking),
            web_search: Boolean(run.web_search),
            selected: run.selected || {},
            prompt: run.prompt || {},
            response: run.response || {},
          });
        }
      }

      // Invalidate materialized per-variant progress — next PIF run recomputes.
      try { specDb.deletePifVariantProgressByProduct?.(productId); } catch { /* best-effort */ }

      emitDataChange({
        broadcastWs,
        event: 'product-image-finder-image-deleted',
        category,
        entities: { productIds: [productId] },
        meta: { productId, deletedImage: filename },
      });

      return jsonRes(res, 200, { ok: true, deleted: filename });
    }

    // ── DELETE run — also delete associated image files from disk ──
    if (method === 'DELETE' && category && productId && parts[3] === 'runs' && parts[4]) {
      const runNumber = Number(parts[4]);
      const productRoot = defaultProductRoot();

      // Read run images BEFORE the generic handler deletes the data
      const { readProductImages } = await import('../productImageStore.js');
      const doc = readProductImages({ productId, productRoot });
      const run = doc?.runs?.find(r => r.run_number === runNumber);
      const runImages = run?.selected?.images || [];

      // Collect filenames still referenced by OTHER runs so we don't delete shared files
      const survivingFilenames = new Set();
      for (const r of (doc?.runs || [])) {
        if (r.run_number === runNumber) continue;
        for (const img of (r.selected?.images || [])) {
          if (img.filename) survivingFilenames.add(img.filename);
        }
      }

      // WHY: Delete files BEFORE genericHandler sends the HTTP response.
      // Otherwise the frontend refetches before file cleanup finishes.
      const imagesDir = path.join(productRoot, productId, 'images');
      const masterCacheDir = path.join(imagesDir, '.cache', 'master');
      const originalsCacheDir = path.join(imagesDir, '.cache', 'originals');
      for (const img of runImages) {
        if (img.filename && !survivingFilenames.has(img.filename)) {
          const masterPath = path.join(imagesDir, img.filename);
          removeLocalAssetVariants({ sourcePath: masterPath, cacheDir: masterCacheDir });
          try { fs.unlinkSync(masterPath); } catch { /* */ }
          if (img.original_filename) {
            const originalPath = path.join(imagesDir, 'originals', img.original_filename);
            removeLocalAssetVariants({ sourcePath: originalPath, cacheDir: originalsCacheDir });
            try { fs.unlinkSync(originalPath); } catch { /* */ }
          }
        }
      }

      // Invalidate materialized per-variant progress — next PIF run recomputes.
      try { getSpecDb(category)?.deletePifVariantProgressByProduct?.(productId); } catch { /* best-effort */ }

      // Delegate to generic handler (deletes data from JSON + SQL, sends response)
      return genericHandler(parts, params, method, req, res);
    }

    // ── DELETE all — also delete entire images directory ───────────
    if (method === 'DELETE' && category && productId && !parts[3]) {
      const productRoot = defaultProductRoot();
      const imagesDir = path.join(productRoot, productId, 'images');

      // WHY: Delete files BEFORE genericHandler sends the HTTP response.
      // genericHandler deletes JSON + SQL and immediately sends 200.
      // If we delete after, the frontend refetches before cleanup finishes,
      // gets 404, and React Query keeps stale cached data showing ghost images.
      try { fs.rmSync(imagesDir, { recursive: true, force: true }); } catch { /* dir may not exist */ }

      // Invalidate materialized per-variant progress — product is wiped.
      try { getSpecDb(category)?.deletePifVariantProgressByProduct?.(productId); } catch { /* best-effort */ }

      // Delegate to generic handler (deletes data from JSON + SQL, sends response)
      return genericHandler(parts, params, method, req, res);
    }

    // Delegate GET to generic handler
    return genericHandler(parts, params, method, req, res);
  };

  async function serveImageFile(req, res, jsonRes, params, productId, subDir, filename) {
    if (!/^[\w\-]+\.\w+$/.test(filename)) return jsonRes(res, 400, { error: 'invalid filename' });
    const productRoot = defaultProductRoot();
    const filePath = path.join(productRoot, productId, subDir, filename);
    if (!fs.existsSync(filePath)) return jsonRes(res, 404, { error: 'image not found' });

    const cacheScope = subDir.includes('originals') ? 'originals' : 'master';
    const cacheDir = path.join(productRoot, productId, 'images', '.cache', cacheScope);
    return serveLocalAsset({
      sourcePath: filePath,
      cacheDir,
      variant: params?.get?.('variant'),
      req,
      res,
    });
  }
}
