export function registerQueueBillingLearningRoutes(ctx) {
  const {
    jsonRes,
    toInt,
    config,
    storage,
    OUTPUT_ROOT,
    path,
    getSpecDb,
    safeReadJson,
    safeStat,
    listFiles,
  } = ctx;

  return async function handleQueueBillingLearningRoutes(parts, params, method, req, res) {
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
