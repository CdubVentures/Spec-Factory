import { emitDataChange } from '../../../core/events/dataChangeContract.js';

export function createStorageManagerHandler(opts) {
  const {
    jsonRes,
    readJsonBody,
    toInt,
    broadcastWs,
    listIndexLabRuns,
    resolveIndexLabRunDirectory,
    indexLabRoot,
    outputRoot,
    storage,
    isRunStillActive,
    readRunMeta,
    deleteArchivedRun,
    fsRoots,
  } = opts;
  // WHY: getSpecDb(category) requires a category — resolved per-request.
  const resolveDeletionStore = opts.resolveDeletionStore || (() => null);

  function uniqueTokens(values) {
    return [...new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    )];
  }

  function emitStorageChange({ event, category = '', categories = [], productIds = [] }) {
    emitDataChange({
      broadcastWs,
      event,
      category,
      categories: uniqueTokens(categories),
      entities: { productIds: uniqueTokens(productIds) },
    });
  }

  function resolveBackend() {
    return { type: 'local' };
  }

  function resolveBackendDetail() {
    return { root_path: String(indexLabRoot || '') };
  }

  return async function handleStorageManagerRoutes(parts, params, method, req, res) {
    if (parts[0] !== 'storage') return false;

    // GET /storage/overview
    if (parts[1] === 'overview' && !parts[2] && method === 'GET') {
      const runs = await listIndexLabRuns({ limit: 10000 });
      const categories = [...new Set(runs.map(r => String(r?.category || '').trim()).filter(Boolean))].sort();
      const products = new Set(runs.map(r => String(r?.product_id || '').trim()).filter(Boolean));
      let totalSizeBytes = 0;
      let oldestRun = '';
      let newestRun = '';

      for (const run of runs) {
        totalSizeBytes += run?.storage_metrics?.total_size_bytes || 0;
        const started = String(run?.started_at || '').trim();
        if (started && (!oldestRun || started < oldestRun)) oldestRun = started;
        if (started && (!newestRun || started > newestRun)) newestRun = started;
      }

      const avgRunSizeBytes = runs.length > 0 ? Math.round(totalSizeBytes / runs.length) : 0;

      return jsonRes(res, 200, {
        total_runs: runs.length,
        total_size_bytes: totalSizeBytes,
        categories,
        products_indexed: products.size,
        oldest_run: oldestRun || null,
        newest_run: newestRun || null,
        avg_run_size_bytes: avgRunSizeBytes,
        storage_backend: resolveBackend().type,
        backend_detail: resolveBackendDetail(),
      });
    }

    // GET /storage/runs (list) or GET /storage/runs/:runId (detail)
    if (parts[1] === 'runs') {
      const runId = parts[2] ? String(parts[2]).trim() : '';

      // GET /storage/runs/:runId — single run detail (includes sources from run.json)
      if (runId && !parts[3] && method === 'GET') {
        const meta = typeof readRunMeta === 'function'
          ? await readRunMeta(runId)
          : null;
        if (!meta) return jsonRes(res, 404, { error: 'run_not_found', run_id: runId });
        // WHY: Enrich with sources + identity from run.json for URL-level expansion.
        let sources = [];
        let identity = {};
        try {
          const runDir = typeof resolveIndexLabRunDirectory === 'function'
            ? await resolveIndexLabRunDirectory(runId)
            : '';
          if (runDir) {
            const { default: fsPromises } = await import('node:fs/promises');
            const { join } = await import('node:path');
            const raw = await fsPromises.readFile(join(runDir, 'run.json'), 'utf-8').catch(() => '');
            if (raw) {
              const parsed = JSON.parse(raw);
              sources = Array.isArray(parsed.sources) ? parsed.sources : [];
              identity = parsed.identity && typeof parsed.identity === 'object' ? parsed.identity : {};
              // WHY: Enrich each source with per-artifact file sizes from disk.
              for (const source of sources) {
                let urlSize = 0;
                if (source.html_file) {
                  try {
                    const st = await fsPromises.stat(join(runDir, 'html', source.html_file));
                    source.html_size = st.size; urlSize += st.size;
                  } catch { /* file may not exist */ }
                }
                if (source.video_file) {
                  try {
                    const st = await fsPromises.stat(join(runDir, 'video', source.video_file));
                    source.video_size = st.size; urlSize += st.size;
                  } catch { /* file may not exist */ }
                }
                // WHY: Screenshots are named screenshot-{worker_id}-{hash}-{idx}-{type}.jpg
                if (source.screenshot_count > 0 && source.worker_id) {
                  try {
                    const ssDir = join(runDir, 'screenshots');
                    const prefix = `screenshot-${source.worker_id}-`;
                    const ssFiles = await fsPromises.readdir(ssDir);
                    let ssSize = 0;
                    for (const f of ssFiles) {
                      if (f.startsWith(prefix)) {
                        const st = await fsPromises.stat(join(ssDir, f)).catch(() => null);
                        if (st) ssSize += st.size;
                      }
                    }
                    if (ssSize > 0) { source.screenshot_size = ssSize; urlSize += ssSize; }
                  } catch { /* screenshots dir may not exist */ }
                }
                source.total_size = urlSize;
              }
            }
          }
        } catch { /* best-effort */ }
        return jsonRes(res, 200, { run_id: runId, ...meta, sources, identity });
      }

      // DELETE /storage/runs/:runId — delete single run (full cascade)
      if (runId && !parts[3] && method === 'DELETE') {
        if (typeof isRunStillActive === 'function' && isRunStillActive(runId)) {
          return jsonRes(res, 409, { ok: false, error: 'run_in_progress', run_id: runId });
        }
        try {
          // WHY: Resolve productId + category from run metadata so caller doesn't need to provide them.
          const meta = typeof readRunMeta === 'function' ? await readRunMeta(runId) : null;
          const productId = String(meta?.product_id || '').trim();
          const category = String(meta?.category || '').trim();
          const _ds = resolveDeletionStore(category);
          if (_ds && productId && category && fsRoots) {
            const result = _ds.deleteRun({ runId, productId, category, fsRoots });
            emitStorageChange({
              event: 'storage-runs-deleted',
              category,
              productIds: [productId],
            });
            return jsonRes(res, 200, { ...result, category, product_id: productId });
          }
          // Fallback: filesystem-only delete
          const result = await deleteArchivedRun(runId);
          emitStorageChange({
            event: 'storage-runs-deleted',
            category,
            productIds: [productId],
          });
          return jsonRes(res, 200, { ok: true, ...result, category, product_id: productId });
        } catch (err) {
          return jsonRes(res, 500, { ok: false, error: String(err?.message || err), run_id: runId });
        }
      }

      // POST /storage/runs/bulk-delete — bulk delete (body: { runIds: string[] })
      if (runId === 'bulk-delete' && !parts[3] && method === 'POST') {
        const body = await readJsonBody(req);
        const runIds = Array.isArray(body?.runIds) ? body.runIds.map(id => String(id).trim()).filter(Boolean) : [];
        const deleted = [];
        const errors = [];
        const deletedCategories = [];
        const deletedProductIds = [];
        for (const id of runIds) {
          if (typeof isRunStillActive === 'function' && isRunStillActive(id)) {
            errors.push({ run_id: id, error: 'run_in_progress' });
            continue;
          }
          try {
            const meta = typeof readRunMeta === 'function' ? await readRunMeta(id) : null;
            const productId = String(meta?.product_id || '').trim();
            const category = String(meta?.category || '').trim();
            const _ds2 = resolveDeletionStore(category);
            if (_ds2 && productId && category && fsRoots) {
              const result = _ds2.deleteRun({ runId: id, productId, category, fsRoots });
              deleted.push({ run_id: id, deleted_from: 'local', sql_rows: result.sql?.rows_deleted || 0 });
            } else {
              const result = await deleteArchivedRun(id);
              deleted.push({ run_id: id, deleted_from: result?.deleted_from || 'unknown' });
            }
            if (category) deletedCategories.push(category);
            if (productId) deletedProductIds.push(productId);
          } catch (err) {
            errors.push({ run_id: id, error: String(err?.message || err) });
          }
        }
        if (deleted.length > 0) {
          emitStorageChange({
            event: 'storage-runs-bulk-deleted',
            categories: deletedCategories,
            productIds: deletedProductIds,
          });
        }
        return jsonRes(res, 200, {
          ok: errors.length === 0,
          deleted,
          errors,
          categories: uniqueTokens(deletedCategories),
          product_ids: uniqueTokens(deletedProductIds),
        });
      }

      // GET /storage/runs — run list
      if (!runId && method === 'GET') {
        const category = String(params.get('category') || '').trim();
        const limit = toInt(params.get('limit'), 200);
        const runs = await listIndexLabRuns({ limit, category: category || undefined });
        return jsonRes(res, 200, { runs });
      }
    }

    // POST /storage/prune — prune old runs
    if (parts[1] === 'prune' && !parts[2] && method === 'POST') {
      const body = await readJsonBody(req);
      const olderThanDays = toInt(body?.olderThanDays, 30);
      const failedOnly = Boolean(body?.failedOnly);
      const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString();
      const runs = await listIndexLabRuns({ limit: 10000 });
      const candidates = runs.filter(r => {
        const ended = String(r?.ended_at || '').trim();
        const status = String(r?.status || '').trim();
        if (status === 'running') return false;
        if (failedOnly && status !== 'failed') return false;
        return ended && ended < cutoff;
      });

      const pruned = [];
      const errors = [];
      const prunedCategories = [];
      const prunedProductIds = [];
      for (const run of candidates) {
        const id = String(run?.run_id || '').trim();
        if (!id) continue;
        if (typeof isRunStillActive === 'function' && isRunStillActive(id)) continue;
        try {
          const productId = String(run?.product_id || '').trim();
          const category = String(run?.category || '').trim();
          const _ds3 = resolveDeletionStore(category);
          if (_ds3 && productId && category && fsRoots) {
            _ds3.deleteRun({ runId: id, productId, category, fsRoots });
          } else {
            await deleteArchivedRun(id);
          }
          pruned.push(id);
          if (category) prunedCategories.push(category);
          if (productId) prunedProductIds.push(productId);
        } catch (err) {
          errors.push({ run_id: id, error: String(err?.message || err) });
        }
      }
      if (pruned.length > 0) {
        emitStorageChange({
          event: 'storage-pruned',
          categories: prunedCategories,
          productIds: prunedProductIds,
        });
      }
      return jsonRes(res, 200, {
        ok: true,
        pruned: pruned.length,
        errors,
        categories: uniqueTokens(prunedCategories),
        product_ids: uniqueTokens(prunedProductIds),
      });
    }

    // POST /storage/purge — purge all runs (requires confirmToken)
    if (parts[1] === 'purge' && !parts[2] && method === 'POST') {
      const body = await readJsonBody(req);
      if (String(body?.confirmToken || '').trim() !== 'DELETE') {
        return jsonRes(res, 400, { ok: false, error: 'confirm_token_required' });
      }
      const runs = await listIndexLabRuns({ limit: 10000 });
      let purged = 0;
      const purgedCategories = [];
      const purgedProductIds = [];
      for (const run of runs) {
        const id = String(run?.run_id || '').trim();
        if (!id) continue;
        if (typeof isRunStillActive === 'function' && isRunStillActive(id)) continue;
        try {
          const productId = String(run?.product_id || '').trim();
          const category = String(run?.category || '').trim();
          const _ds4 = resolveDeletionStore(category);
          if (_ds4 && productId && category && fsRoots) {
            _ds4.deleteRun({ runId: id, productId, category, fsRoots });
          } else {
            await deleteArchivedRun(id);
          }
          purged += 1;
          if (category) purgedCategories.push(category);
          if (productId) purgedProductIds.push(productId);
        } catch {
          // Best-effort purge
        }
      }
      if (purged > 0) {
        emitStorageChange({
          event: 'storage-purged',
          categories: purgedCategories,
          productIds: purgedProductIds,
        });
      }
      return jsonRes(res, 200, {
        ok: true,
        purged,
        categories: uniqueTokens(purgedCategories),
        product_ids: uniqueTokens(purgedProductIds),
      });
    }

    // POST /storage/urls/delete — delete a URL and all its artifacts (body: { url, productId, category })
    if (parts[1] === 'urls' && parts[2] === 'delete' && !parts[3] && method === 'POST') {
      const body = await readJsonBody(req);
      const url = String(body?.url || '').trim();
      const productId = String(body?.productId || '').trim();
      const category = String(body?.category || '').trim();
      const _dsUrl = resolveDeletionStore(category);
      if (!_dsUrl || !fsRoots) {
        return jsonRes(res, 501, { ok: false, error: 'deletion_store_not_available' });
      }
      if (!url || !productId) {
        return jsonRes(res, 400, { ok: false, error: 'url_and_productId_required' });
      }
      try {
        const result = _dsUrl.deleteUrl({ url, productId, category, fsRoots });
        emitStorageChange({
          event: 'storage-urls-deleted',
          category,
          productIds: [productId],
        });
        return jsonRes(res, 200, { ...result, category, product_id: productId });
      } catch (err) {
        return jsonRes(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // POST /storage/products/:pid/purge-history — delete all run history for a product
    if (parts[1] === 'products' && parts[2] && parts[3] === 'purge-history' && !parts[4] && method === 'POST') {
      const productId = String(parts[2]).trim();
      const body = await readJsonBody(req);
      const category = String(body?.category || '').trim();
      if (!productId || !category) {
        return jsonRes(res, 400, { ok: false, error: 'productId_and_category_required' });
      }
      const _dsPurge = resolveDeletionStore(category);
      if (!_dsPurge || !fsRoots) {
        return jsonRes(res, 501, { ok: false, error: 'deletion_store_not_available' });
      }
      // WHY: Check no active runs exist for this product before wiping history.
      const runs = await listIndexLabRuns({ limit: 10000 });
      const activeRun = runs.find(r =>
        String(r?.product_id || '').trim() === productId &&
        typeof isRunStillActive === 'function' &&
        isRunStillActive(String(r?.run_id || ''))
      );
      if (activeRun) {
        return jsonRes(res, 409, { ok: false, error: 'product_has_active_run', run_id: activeRun.run_id });
      }
      try {
        const result = _dsPurge.deleteProductHistory({ productId, category, fsRoots });
        emitStorageChange({
          event: 'storage-history-purged',
          category,
          productIds: [productId],
        });
        return jsonRes(res, 200, { ...result, category, product_id: productId });
      } catch (err) {
        return jsonRes(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // GET /storage/export
    if (parts[1] === 'export' && !parts[2] && method === 'GET') {
      const runs = await listIndexLabRuns({ limit: 10000 });
      if (res && typeof res.setHeader === 'function') {
        res.setHeader('Content-Disposition', 'attachment; filename="storage-inventory.json"');
      }
      return jsonRes(res, 200, {
        exported_at: new Date().toISOString(),
        storage_backend: resolveBackend().type,
        runs,
      });
    }

    return false;
  };
}
