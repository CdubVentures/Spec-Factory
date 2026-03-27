// WHY: Store module for the `runs` table — mid-run metadata that replaces
// per-run run.json overwrites (Wave 2 of the SQLite migration).

function safeParse(text, fallback) {
  if (text == null) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}

function serializeJson(value, fallback = '{}') {
  if (value == null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value || fallback);
}

function hydrateRunRow(row) {
  if (!row) return null;
  return {
    ...row,
    counters: safeParse(row.counters, {}),
    stages: safeParse(row.stages, {}),
    startup_ms: safeParse(row.startup_ms, {}),
    browser_pool: safeParse(row.browser_pool, null),
    needset_summary: safeParse(row.needset_summary, null),
    search_profile_summary: safeParse(row.search_profile_summary, null),
    artifacts: safeParse(row.artifacts, {}),
    extra: safeParse(row.extra, {}),
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
      boot_step: row.boot_step || '',
      boot_progress: Number(row.boot_progress) || 0,
      identity_fingerprint: row.identity_fingerprint || '',
      identity_lock_status: row.identity_lock_status || '',
      dedupe_mode: row.dedupe_mode || '',
      s3key: row.s3key || '',
      out_root: row.out_root || '',
      counters: typeof row.counters === 'string' ? row.counters : JSON.stringify(row.counters || {}),
      stages: typeof row.stages === 'string' ? row.stages : JSON.stringify(row.stages || {}),
      startup_ms: typeof row.startup_ms === 'string' ? row.startup_ms : JSON.stringify(row.startup_ms || {}),
      browser_pool: serializeJson(row.browser_pool),
      needset_summary: serializeJson(row.needset_summary),
      search_profile_summary: serializeJson(row.search_profile_summary),
      artifacts: typeof row.artifacts === 'string' ? row.artifacts : JSON.stringify(row.artifacts || {}),
      extra: typeof row.extra === 'string' ? row.extra : JSON.stringify(row.extra || {}),
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
