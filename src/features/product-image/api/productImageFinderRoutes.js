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
import { registerOperation, updateStage, updateModelInfo, completeOperation, failOperation } from '../../../core/operations/index.js';
import { createStreamBatcher } from '../../../core/llm/streamBatcher.js';
import { defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';
import { readImageDimensions, buildVariantList, imageStem } from '../productImageFinder.js';
import { evaluateCarousel } from '../carouselStrategy.js';
import { resolveViewBudget } from '../productImageLlmAdapter.js';

export function registerProductImageFinderRoutes(ctx) {
  const store = (specDb) => specDb.getFinderStore('productImageFinder');

  // Generic handler for GET list, GET single, DELETE run, DELETE all
  const genericHandler = createFinderRouteHandler({
    routePrefix: 'product-image-finder',
    moduleType: 'pif',
    phase: 'imageFinder',
    fieldKeys: [],

    runFinder: ctx.runProductImageFinder,
    deleteRun: ctx.deleteProductImageFinderRun,
    deleteAll: ctx.deleteProductImageFinderAll,

    getOne: (specDb, pid) => store(specDb).get(pid),
    listByCategory: (specDb, cat) => store(specDb).listByCategory(cat),
    listRuns: (specDb, pid) => store(specDb).listRuns(pid),
    upsertSummary: (specDb, row) => store(specDb).upsert(row),
    deleteOneSql: (specDb, pid) => store(specDb).remove(pid),
    deleteRunSql: (specDb, pid, rn) => store(specDb).removeRun(pid, rn),
    deleteAllRunsSql: (specDb, pid) => store(specDb).removeAllRuns(pid),

    buildGetResponse: (row, selected, runs, onCooldown) => {
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
      const enrichedSelected = selected?.images
        ? { ...selected, images: selected.images.map(enrichImage) }
        : selected;
      const enrichedRuns = runs.map(r => r.selected?.images
        ? { ...r, selected: { ...r.selected, images: r.selected.images.map(enrichImage) } }
        : r,
      );
      // Compute per-variant carousel progress from selected images
      const finderStore = store(ctx.getSpecDb(row.category));
      const viewBudget = resolveViewBudget(finderStore?.getSetting?.('viewBudget') || '', row.category);
      const satisfactionThreshold = parseInt(finderStore?.getSetting?.('satisfactionThreshold') || '3', 10) || 3;
      const heroEnabled = (finderStore?.getSetting?.('heroEnabled') || 'true') !== 'false';
      const heroCount = parseInt(finderStore?.getSetting?.('heroCount') || '3', 10) || 3;
      const viewAttemptBudget = parseInt(finderStore?.getSetting?.('viewAttemptBudget') || '5', 10) || 5;
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
        }).carouselProgress;
      }

      return {
        product_id: row.product_id,
        category: row.category,
        images: row.images,
        image_count: row.image_count,
        cooldown_until: row.cooldown_until,
        on_cooldown: onCooldown,
        run_count: row.run_count,
        last_ran_at: row.latest_ran_at,
        selected: enrichedSelected,
        runs: enrichedRuns,
        carouselProgress,
        carouselSettings: { viewAttemptBudget, heroAttemptBudget, heroEnabled },
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

    const category = parts[1] || '';
    const productId = parts[2] || '';

    // Serve original image: GET /product-image-finder/:category/:productId/images/originals/:filename
    if (method === 'GET' && category && productId && parts[3] === 'images' && parts[4] === 'originals' && parts[5]) {
      return serveImageFile(res, jsonRes, productId, path.join('images', 'originals'), parts[5]);
    }

    // Serve master image: GET /product-image-finder/:category/:productId/images/:filename
    if (method === 'GET' && category && productId && parts[3] === 'images' && parts[4]) {
      return serveImageFile(res, jsonRes, productId, 'images', parts[4]);
    }

    // ── Process single image (RMBG background removal) ─────────────
    // POST /product-image-finder/:category/:productId/images/:filename/process
    if (method === 'POST' && category && productId && parts[3] === 'images' && parts[4] && parts[5] === 'process') {
      const filename = parts[4];
      if (!/^[\w\-]+\.\w+$/.test(filename)) return jsonRes(res, 400, { error: 'invalid filename' });

      const productRoot = defaultProductRoot();
      const imagesDir = path.join(productRoot, productId, 'images');
      const masterPath = path.join(imagesDir, filename);

      // Find the source image — either in originals/ (if already moved) or images/ (pre-RMBG)
      const originalsDir = path.join(imagesDir, 'originals');
      const { processImage, loadModel, releaseModel } = await import('../imageProcessor.js');
      const { ensureModelReady } = await import('../modelDownloader.js');

      // Resolve model
      const modelDir = path.join(productRoot, '..', 'models', 'rmbg-2.0');
      const modelStatus = await ensureModelReady({ modelDir });
      if (!modelStatus.ready) {
        return jsonRes(res, 503, { error: 'RMBG model not available', details: modelStatus.error });
      }
      const session = await loadModel({ modelDir });
      if (!session) {
        return jsonRes(res, 503, { error: 'Failed to load RMBG model' });
      }

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

      // Process
      const masterFilename = stemPng;
      const masterOut = path.join(imagesDir, masterFilename);
      const result = await processImage({ inputPath: sourcePath, outputPath: masterOut, session });

      if (!result.ok) {
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
        const recalculated = recalculateProductImagesFromRuns(doc.runs, productId, category);

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
            cooldown_until: recalculated.cooldown_until || '',
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
              cooldown_until: run.cooldown_until || '',
              selected: run.selected || {},
              prompt: run.prompt || {},
              response: run.response || {},
            });
          }
        }
      }

      emitDataChange({
        broadcastWs,
        event: 'product-image-finder-image-processed',
        category,
        entities: { productIds: [productId] },
        meta: { productId, filename: masterFilename, bg_removed: result.bg_removed },
      });

      return jsonRes(res, 200, { ok: true, ...result, filename: masterFilename, original_filename: originalFilename });
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

        const body = await readJsonBody(req).catch(() => ({}));
        const variantKey = body?.variant_key || null;

        op = registerOperation({
          type: 'pif',
          category,
          productId,
          productLabel: `${productRow.brand || ''} ${productRow.model || ''}`.trim(),
          stages: ['Initializing', 'Looping', 'Complete'],
        });
        batcher = createStreamBatcher({ operationId: op.id, broadcastWs });

        const result = await ctx.runCarouselLoop({
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
          onStageAdvance: (name) => updateStage({ id: op.id, stageName: name }),
          onModelResolved: (info) => updateModelInfo({ id: op.id, ...info }),
          onStreamChunk: ({ content }) => { if (content) batcher.push(content); },
          onLoopProgress: ({ callNumber, estimatedRemaining, variantLabel, focusView, mode }) => {
            const target = mode === 'hero' ? 'hero' : (focusView || '?');
            updateStage({ id: op.id, stageName: `${variantLabel}: call ${callNumber} / ~${Math.max(0, estimatedRemaining)} remaining (${target})` });
          },
        });

        batcher.dispose();

        if (result.rejected) {
          failOperation({ id: op.id, error: result.rejections?.[0]?.message || 'Rejected' });
        } else {
          completeOperation({ id: op.id });
        }

        emitDataChange({
          broadcastWs,
          event: 'product-image-finder-loop',
          category,
          entities: { productIds: [productId] },
          meta: { imagesDownloaded: result.images?.length || 0, totalLlmCalls: result.totalLlmCalls || 0 },
        });

        return jsonRes(res, 200, { ok: true, ...result });
      } catch (err) {
        if (batcher) batcher.dispose();
        if (op) failOperation({ id: op.id, error: err instanceof Error ? err.message : String(err) });
        return jsonRes(res, 500, { error: 'loop failed', message: err instanceof Error ? err.message : String(err) });
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

        // Read optional variant_key and mode from body
        const body = await readJsonBody(req).catch(() => ({}));
        const variantKey = body?.variant_key || null;
        const mode = body?.mode === 'hero' ? 'hero' : 'view';

        const stages = ['Discovery', 'Download', 'Complete'];
        op = registerOperation({
          type: 'pif',
          category,
          productId,
          productLabel: `${productRow.brand || ''} ${productRow.model || ''}`.trim(),
          stages,
        });
        batcher = createStreamBatcher({ operationId: op.id, broadcastWs });

        const result = await ctx.runProductImageFinder({
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
          onStageAdvance: (name) => updateStage({ id: op.id, stageName: name }),
          onModelResolved: (info) => updateModelInfo({ id: op.id, ...info }),
          onStreamChunk: ({ content }) => { if (content) batcher.push(content); },
        });

        batcher.dispose();

        if (result.rejected) {
          failOperation({ id: op.id, error: result.rejections?.[0]?.message || 'Rejected' });
        } else {
          completeOperation({ id: op.id });
        }

        emitDataChange({
          broadcastWs,
          event: 'product-image-finder-run',
          category,
          entities: { productIds: [productId] },
          meta: { imagesDownloaded: result.images?.length || 0, variantsProcessed: result.variants_processed || 0 },
        });

        return jsonRes(res, 200, { ok: true, ...result });
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

      // Delete master file from disk (master is always .png after RMBG)
      const masterPath = path.join(productRoot, productId, 'images', deleteStem + '.png');
      try { fs.unlinkSync(masterPath); } catch { /* file may already be gone */ }
      // Also try the exact requested filename if it differs (pre-RMBG ext)
      if (filename !== deleteStem + '.png') {
        try { fs.unlinkSync(path.join(productRoot, productId, 'images', filename)); } catch { /* */ }
      }

      // Read current JSON to find original_filename, then strip + recalculate
      const { readProductImages, writeProductImages, recalculateProductImagesFromRuns } = await import('../productImageStore.js');
      const doc = readProductImages({ productId, productRoot });

      // Also delete original file if it exists (RMBG originals/ subdirectory)
      if (doc && Array.isArray(doc.runs)) {
        for (const run of doc.runs) {
          for (const img of (run.selected?.images || [])) {
            if (imageStem(img.filename) === deleteStem && img.original_filename) {
              const origPath = path.join(productRoot, productId, 'images', 'originals', img.original_filename);
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
        const recalculated = recalculateProductImagesFromRuns(doc.runs, productId, category);
        writeProductImages({ productId, productRoot, data: recalculated });

        // Update SQL summary + runs
        const finderStore = specDb.getFinderStore('productImageFinder');
        finderStore.upsert({
          category,
          product_id: productId,
          images: recalculated.selected?.images?.map(img => ({ view: img.view, filename: img.filename, variant_key: img.variant_key })) || [],
          image_count: recalculated.selected?.images?.length || 0,
          cooldown_until: recalculated.cooldown_until || '',
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
            cooldown_until: run.cooldown_until || '',
            selected: run.selected || {},
            prompt: run.prompt || {},
            response: run.response || {},
          });
        }
      }

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
      for (const img of runImages) {
        if (img.filename && !survivingFilenames.has(img.filename)) {
          try { fs.unlinkSync(path.join(imagesDir, img.filename)); } catch { /* */ }
          if (img.original_filename) {
            try { fs.unlinkSync(path.join(imagesDir, 'originals', img.original_filename)); } catch { /* */ }
          }
        }
      }

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

      // Delegate to generic handler (deletes data from JSON + SQL, sends response)
      return genericHandler(parts, params, method, req, res);
    }

    // Delegate GET to generic handler
    return genericHandler(parts, params, method, req, res);
  };

  function serveImageFile(res, jsonRes, productId, subDir, filename) {
    if (!/^[\w\-]+\.\w+$/.test(filename)) return jsonRes(res, 400, { error: 'invalid filename' });
    const productRoot = defaultProductRoot();
    const filePath = path.join(productRoot, productId, subDir, filename);
    if (!fs.existsSync(filePath)) return jsonRes(res, 404, { error: 'image not found' });

    const ext = path.extname(filename).toLowerCase();
    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    const stat = fs.statSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': stat.size, 'Cache-Control': 'public, max-age=86400' });
    fs.createReadStream(filePath).pipe(res);
    return true;
  }
}
