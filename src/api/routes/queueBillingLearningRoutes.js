import { emitDataChange } from '../events/dataChangeContract.js';

export function registerQueueBillingLearningRoutes(ctx) {
  const {
    jsonRes,
    readJsonBody,
    toInt,
    config,
    storage,
    OUTPUT_ROOT,
    path,
    getSpecDb,
    buildReviewQueue,
    loadQueueState,
    saveQueueState,
    upsertQueueProduct,
    broadcastWs,
    safeReadJson,
    safeStat,
    listFiles,
    loadProductCatalog,
  } = ctx;

  return async function handleQueueBillingLearningRoutes(parts, params, method, req, res) {
    // Queue
    if (parts[0] === 'queue' && parts[1] && method === 'GET') {
      const category = parts[1];
      const specDb = getSpecDb(category);
      if (parts[2] === 'review') {
        const status = params.get('status') || 'needs_review';
        const limit = toInt(params.get('limit'), 200);
        const cat = await loadProductCatalog(config, category);
        const items = await buildReviewQueue({
          storage,
          config,
          category,
          status,
          limit,
          specDb,
          catalogProducts: cat.products || {},
        });
        const catPids = new Set(Object.keys(cat.products || {}));
        const filtered = items.filter(item => catPids.has(item.product_id));
        return jsonRes(res, 200, filtered);
      }
      const loaded = await loadQueueState({ storage, category, specDb }).catch(() => ({ state: { products: {} } }));
      const products = Object.values(loaded.state?.products || {});
      return jsonRes(res, 200, products);
    }

    // Queue mutations: retry, pause, priority, requeue-exhausted
    if (parts[0] === 'queue' && parts[1] && parts[2] === 'retry' && method === 'POST') {
      const category = parts[1];
      const specDb = getSpecDb(category);
      const body = await readJsonBody(req);
      const { productId } = body;
      if (!productId) return jsonRes(res, 400, { error: 'productId required' });
      try {
        const result = await upsertQueueProduct({ storage, category, productId, patch: { status: 'queued', attempts: 0 }, specDb });
        emitDataChange({
          broadcastWs,
          event: 'queue-retry',
          category,
          entities: {
            productIds: [productId],
          },
        });
        return jsonRes(res, 200, { ok: true, productId, product: result });
      } catch (err) {
        return jsonRes(res, 500, { error: 'retry_failed', message: err.message });
      }
    }

    if (parts[0] === 'queue' && parts[1] && parts[2] === 'pause' && method === 'POST') {
      const category = parts[1];
      const specDb = getSpecDb(category);
      const body = await readJsonBody(req);
      const { productId } = body;
      if (!productId) return jsonRes(res, 400, { error: 'productId required' });
      try {
        const result = await upsertQueueProduct({ storage, category, productId, patch: { status: 'paused' }, specDb });
        emitDataChange({
          broadcastWs,
          event: 'queue-pause',
          category,
          entities: {
            productIds: [productId],
          },
        });
        return jsonRes(res, 200, { ok: true, productId, product: result });
      } catch (err) {
        return jsonRes(res, 500, { error: 'pause_failed', message: err.message });
      }
    }

    if (parts[0] === 'queue' && parts[1] && parts[2] === 'priority' && method === 'POST') {
      const category = parts[1];
      const specDb = getSpecDb(category);
      const body = await readJsonBody(req);
      const { productId, priority } = body;
      if (!productId) return jsonRes(res, 400, { error: 'productId required' });
      const p = Math.max(1, Math.min(5, parseInt(String(priority), 10) || 3));
      try {
        const result = await upsertQueueProduct({ storage, category, productId, patch: { priority: p }, specDb });
        emitDataChange({
          broadcastWs,
          event: 'queue-priority',
          category,
          entities: {
            productIds: [productId],
          },
          meta: {
            priority: p,
          },
        });
        return jsonRes(res, 200, { ok: true, productId, priority: p, product: result });
      } catch (err) {
        return jsonRes(res, 500, { error: 'priority_failed', message: err.message });
      }
    }

    if (parts[0] === 'queue' && parts[1] && parts[2] === 'requeue-exhausted' && method === 'POST') {
      const category = parts[1];
      const specDb = getSpecDb(category);
      try {
        const loaded = await loadQueueState({ storage, category, specDb });
        const products = loaded.state?.products || {};
        const requeued = [];
        for (const [pid, row] of Object.entries(products)) {
          const st = String(row.status || '').toLowerCase();
          if (st === 'exhausted' || st === 'failed') {
            products[pid] = { ...row, status: 'queued', attempts: 0, updated_at: new Date().toISOString() };
            requeued.push(pid);
          }
        }
        if (requeued.length > 0) {
          await saveQueueState({ storage, category, state: loaded.state, specDb });
          emitDataChange({
            broadcastWs,
            event: 'queue-requeue',
            category,
            entities: {
              productIds: requeued,
            },
            meta: {
              count: requeued.length,
            },
          });
        }
        return jsonRes(res, 200, { ok: true, requeued_count: requeued.length, productIds: requeued });
      } catch (err) {
        return jsonRes(res, 500, { error: 'requeue_failed', message: err.message });
      }
    }

    // Billing
    if (parts[0] === 'billing' && parts[1] && parts[2] === 'monthly' && method === 'GET') {
      const category = parts[1];
      const billingDir = path.join(OUTPUT_ROOT, '_billing', category);
      const files = await listFiles(billingDir, '.json');
      if (files.length === 0) return jsonRes(res, 200, { totals: {} });
      const latest = files[files.length - 1];
      const data = await safeReadJson(path.join(billingDir, latest));
      return jsonRes(res, 200, data || { totals: {} });
    }

    // Learning artifacts
    if (parts[0] === 'learning' && parts[1] && parts[2] === 'artifacts' && method === 'GET') {
      const category = parts[1];
      const learningDir = path.join(OUTPUT_ROOT, '_learning', category);
      const files = await listFiles(learningDir);
      const artifacts = [];
      for (const f of files) {
        const st = await safeStat(path.join(learningDir, f));
        artifacts.push({ name: f, path: path.join(learningDir, f), size: st?.size || 0, updated: st?.mtime?.toISOString() || '' });
      }
      return jsonRes(res, 200, artifacts);
    }

    return false;
  };
}
