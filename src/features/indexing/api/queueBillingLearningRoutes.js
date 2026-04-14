export function registerQueueBillingLearningRoutes(ctx) {
  const {
    jsonRes,
    toInt,
    config,
    storage,
    OUTPUT_ROOT,
    path,
    getSpecDb,
    appDb,
    safeReadJson,
    safeStat,
    listFiles,
  } = ctx;

  function objToSortedArray(obj) {
    return Object.entries(obj || {})
      .map(([key, val]) => ({ key, ...val }))
      .sort((a, b) => (b.cost_usd || 0) - (a.cost_usd || 0));
  }

  return async function handleQueueBillingLearningRoutes(parts, params, method, req, res) {
    // ── Global billing endpoints ──

    if (parts[0] === 'billing' && parts[1] === 'global' && method === 'GET') {
      if (!appDb) return jsonRes(res, 503, { error: 'billing not available' });

      if (parts[2] === 'summary') {
        const month = String(params.get('month') || '').trim() || new Date().toISOString().slice(0, 7);
        const rollup = appDb.getBillingRollup(month);
        return jsonRes(res, 200, {
          month,
          totals: rollup.totals,
          models_used: Object.keys(rollup.by_model).length,
          categories_used: Object.keys(rollup.by_category).length,
        });
      }

      if (parts[2] === 'daily') {
        const months = toInt(params.get('months'), 1);
        const days = Math.max(1, months * 31);
        const data = appDb.getGlobalDaily({ days });
        return jsonRes(res, 200, data);
      }

      if (parts[2] === 'by-model') {
        const month = String(params.get('month') || '').trim() || new Date().toISOString().slice(0, 7);
        const rollup = appDb.getBillingRollup(month);
        return jsonRes(res, 200, { month, models: objToSortedArray(rollup.by_model) });
      }

      if (parts[2] === 'by-reason') {
        const month = String(params.get('month') || '').trim() || new Date().toISOString().slice(0, 7);
        const rollup = appDb.getBillingRollup(month);
        return jsonRes(res, 200, { month, reasons: objToSortedArray(rollup.by_reason) });
      }

      if (parts[2] === 'by-category') {
        const month = String(params.get('month') || '').trim() || new Date().toISOString().slice(0, 7);
        const rollup = appDb.getBillingRollup(month);
        return jsonRes(res, 200, { month, categories: objToSortedArray(rollup.by_category) });
      }

      if (parts[2] === 'entries') {
        const limit = toInt(params.get('limit'), 100);
        const offset = toInt(params.get('offset'), 0);
        const category = String(params.get('category') || '').trim();
        const model = String(params.get('model') || '').trim();
        const reason = String(params.get('reason') || '').trim();
        const data = appDb.getGlobalEntries({ limit, offset, category, model, reason });
        return jsonRes(res, 200, { ...data, limit, offset });
      }
    }

    // ── Per-category billing (existing) ──

    if (parts[0] === 'billing' && parts[1] && parts[2] === 'monthly' && method === 'GET') {
      const category = parts[1];
      const month = new Date().toISOString().slice(0, 7);
      if (appDb) {
        try {
          const data = appDb.getBillingRollup(month, category);
          return jsonRes(res, 200, data || { totals: {} });
        } catch { /* fall through */ }
      }
      return jsonRes(res, 200, { totals: {} });
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
