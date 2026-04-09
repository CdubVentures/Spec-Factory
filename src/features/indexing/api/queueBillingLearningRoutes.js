export function registerQueueBillingLearningRoutes(ctx) {
  const {
    jsonRes,
    toInt,
    config,
    storage,
    OUTPUT_ROOT,
    path,
    getSpecDb,
    buildReviewQueue,
    safeReadJson,
    safeStat,
    listFiles,
  } = ctx;

  return async function handleQueueBillingLearningRoutes(parts, params, method, req, res) {
    // Queue review
    if (parts[0] === 'queue' && parts[1] && method === 'GET') {
      const category = parts[1];
      const specDb = getSpecDb(category);
      if (parts[2] === 'review') {
        const status = params.get('status') || 'needs_review';
        const limit = toInt(params.get('limit'), 200);
        // WHY: SQL is the sole SSOT for products.
        const dbRows = specDb?.getAllProducts?.() || [];
        const dbProductMap = Object.fromEntries(dbRows.map((p) => [p.product_id, {
          id: p.id,
          identifier: p.identifier,
          brand: p.brand,
          base_model: p.base_model,
          model: p.model,
          variant: p.variant,
        }]));
        const items = await buildReviewQueue({
          storage,
          config,
          category,
          status,
          limit,
          specDb,
          catalogProducts: dbProductMap,
        });
        const validPids = new Set(Object.keys(dbProductMap));
        const filtered = items.filter(item => validPids.has(item.product_id));
        return jsonRes(res, 200, filtered);
      }
      return jsonRes(res, 200, []);
    }

    // Billing
    if (parts[0] === 'billing' && parts[1] && parts[2] === 'monthly' && method === 'GET') {
      const category = parts[1];
      const specDb = getSpecDb(category);
      const month = new Date().toISOString().slice(0, 7);
      if (specDb) {
        try {
          const data = specDb.getBillingRollup(month, category);
          return jsonRes(res, 200, data || { totals: {} });
        } catch { /* fall through to JSON */ }
      }
      // WHY: fallback for pre-migration data when SQL is empty
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
