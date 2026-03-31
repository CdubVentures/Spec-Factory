export function createStorageManagerHandler({
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
}) {

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
            ? resolveIndexLabRunDirectory(runId)
            : '';
          if (runDir) {
            const { default: fsPromises } = await import('node:fs/promises');
            const { join } = await import('node:path');
            const raw = await fsPromises.readFile(join(runDir, 'run.json'), 'utf-8').catch(() => '');
            if (raw) {
              const parsed = JSON.parse(raw);
              sources = Array.isArray(parsed.sources) ? parsed.sources : [];
              identity = parsed.identity && typeof parsed.identity === 'object' ? parsed.identity : {};
            }
          }
        } catch { /* best-effort */ }
        return jsonRes(res, 200, { run_id: runId, ...meta, sources, identity });
      }

      // DELETE /storage/runs/:runId — delete single run
      if (runId && !parts[3] && method === 'DELETE') {
        if (typeof isRunStillActive === 'function' && isRunStillActive(runId)) {
          return jsonRes(res, 409, { ok: false, error: 'run_in_progress', run_id: runId });
        }
        try {
          const result = await deleteArchivedRun(runId);
          return jsonRes(res, 200, { ok: true, ...result });
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
        for (const id of runIds) {
          if (typeof isRunStillActive === 'function' && isRunStillActive(id)) {
            errors.push({ run_id: id, error: 'run_in_progress' });
            continue;
          }
          try {
            const result = await deleteArchivedRun(id);
            deleted.push({ run_id: id, deleted_from: result?.deleted_from || 'unknown' });
          } catch (err) {
            errors.push({ run_id: id, error: String(err?.message || err) });
          }
        }
        return jsonRes(res, 200, { ok: errors.length === 0, deleted, errors });
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
      for (const run of candidates) {
        const id = String(run?.run_id || '').trim();
        if (!id) continue;
        if (typeof isRunStillActive === 'function' && isRunStillActive(id)) continue;
        try {
          await deleteArchivedRun(id);
          pruned.push(id);
        } catch (err) {
          errors.push({ run_id: id, error: String(err?.message || err) });
        }
      }
      return jsonRes(res, 200, { ok: true, pruned: pruned.length, errors });
    }

    // POST /storage/purge — purge all runs (requires confirmToken)
    if (parts[1] === 'purge' && !parts[2] && method === 'POST') {
      const body = await readJsonBody(req);
      if (String(body?.confirmToken || '').trim() !== 'DELETE') {
        return jsonRes(res, 400, { ok: false, error: 'confirm_token_required' });
      }
      const runs = await listIndexLabRuns({ limit: 10000 });
      let purged = 0;
      for (const run of runs) {
        const id = String(run?.run_id || '').trim();
        if (!id) continue;
        if (typeof isRunStillActive === 'function' && isRunStillActive(id)) continue;
        try {
          await deleteArchivedRun(id);
          purged += 1;
        } catch {
          // Best-effort purge
        }
      }
      return jsonRes(res, 200, { ok: true, purged });
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
