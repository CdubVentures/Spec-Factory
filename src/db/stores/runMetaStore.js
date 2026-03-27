// WHY: Store module for the `runs` table — slim run record for product-relevant
// metadata. GUI telemetry (stages, startup_ms, browser_pool, needset_summary,
// search_profile_summary, artifacts, extra) now lives in run-summary.json (Wave 5.5).

function safeParse(text, fallback) {
  if (text == null) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}

function hydrateRunRow(row) {
  if (!row) return null;
  return {
    ...row,
    counters: safeParse(row.counters, {}),
  };
}

export function createRunMetaStore({ db, category, stmts }) {

  function upsertRun(row) {
    stmts._upsertRun.run({
      run_id: row.run_id || '',
      category: row.category || '',
      product_id: row.product_id || '',
      status: row.status || 'running',
      started_at: row.started_at || '',
      ended_at: row.ended_at || '',
      phase_cursor: row.phase_cursor || '',
      identity_fingerprint: row.identity_fingerprint || '',
      identity_lock_status: row.identity_lock_status || '',
      dedupe_mode: row.dedupe_mode || '',
      s3key: row.s3key || '',
      out_root: row.out_root || '',
      counters: typeof row.counters === 'string' ? row.counters : JSON.stringify(row.counters || {}),
    });
  }

  function getRunByRunId(runId) {
    const row = stmts._getRunByRunId.get(String(runId || '').trim());
    return hydrateRunRow(row);
  }

  function getRunsByCategory(cat, limit = 100) {
    const rows = stmts._getRunsByCategory.all(
      String(cat || '').trim(),
      Math.max(1, Number(limit) || 100)
    );
    return rows.map(hydrateRunRow);
  }

  return {
    upsertRun,
    getRunByRunId,
    getRunsByCategory,
  };
}
