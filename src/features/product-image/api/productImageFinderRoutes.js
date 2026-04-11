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
import { readImageDimensions } from '../productImageFinder.js';

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

    // Serve image file: GET /product-image-finder/:category/:productId/images/:filename
    if (method === 'GET' && category && productId && parts[3] === 'images' && parts[4]) {
      const filename = parts[4];
      // Sanitize: only allow alphanumeric, dash, underscore, dot
      if (!/^[\w\-]+\.\w+$/.test(filename)) return jsonRes(res, 400, { error: 'invalid filename' });
      const productRoot = defaultProductRoot();
      const filePath = path.join(productRoot, productId, 'images', filename);
      if (!fs.existsSync(filePath)) return jsonRes(res, 404, { error: 'image not found' });

      const ext = path.extname(filename).toLowerCase();
      const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' };
      const contentType = mimeMap[ext] || 'application/octet-stream';
      const stat = fs.statSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': stat.size, 'Cache-Control': 'public, max-age=86400' });
      fs.createReadStream(filePath).pipe(res);
      return true;
    }

    // Custom POST: reads body for variant_key
    if (method === 'POST' && category && productId && !parts[3]) {
      let op = null;
      let batcher = null;
      try {
        const specDb = getSpecDb(category);
        if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

        const productRow = specDb.getProduct(productId);
        if (!productRow) return jsonRes(res, 404, { error: 'product not found', product_id: productId, category });

        // Read optional variant_key from body
        const body = await readJsonBody(req).catch(() => ({}));
        const variantKey = body?.variant_key || null;

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

    // Delegate GET/DELETE to generic handler
    return genericHandler(parts, params, method, req, res);
  };
}
