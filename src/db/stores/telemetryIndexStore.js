// WHY: SQL store for the 4 telemetry indexes (replaces NDJSON files in INDEXLAB_ROOT/{category}/).
// Each index was previously an append-only NDJSON file scanned on every read.
// SQL provides indexed queries and bounded memory usage.

export function createTelemetryIndexStore({ db, category, stmts }) {

  function insertKnobSnapshot(row) {
    stmts._insertKnobSnapshot.run({
      category: row.category || category || '',
      run_id: row.run_id || '',
      ts: row.ts || new Date().toISOString(),
      mismatch_count: Number(row.mismatch_count) || 0,
      total_knobs: Number(row.total_knobs) || 0,
      entries: typeof row.entries === 'string' ? row.entries : JSON.stringify(row.entries || []),
    });
  }

  function getKnobSnapshots(cat, limit = 200) {
    return stmts._getKnobSnapshots.all(String(cat || category || ''), Math.max(1, Number(limit) || 200))
      .map((row) => ({
        ...row,
        entries: safeParse(row.entries, []),
      }));
  }

  function insertQueryIndexEntry(row) {
    stmts._insertQueryIndexEntry.run({
      category: row.category || category || '',
      run_id: row.run_id || '',
      product_id: row.product_id || '',
      query: row.query || '',
      provider: row.provider || '',
      result_count: Number(row.result_count) || 0,
      field_yield: typeof row.field_yield === 'string' ? row.field_yield : JSON.stringify(row.field_yield || null),
      tier: row.tier || null,
      ts: row.ts || new Date().toISOString(),
    });
  }

  function getQueryIndexByCategory(cat, limit = 5000) {
    return stmts._getQueryIndexByCategory.all(String(cat || category || ''), Math.max(1, Number(limit) || 5000))
      .map((row) => ({
        ...row,
        field_yield: safeParse(row.field_yield, null),
      }));
  }

  function insertUrlIndexEntry(row) {
    stmts._insertUrlIndexEntry.run({
      category: row.category || category || '',
      run_id: row.run_id || '',
      url: row.url || '',
      host: row.host || '',
      tier: row.tier || '',
      doc_kind: row.doc_kind || '',
      fields_filled: typeof row.fields_filled === 'string' ? row.fields_filled : JSON.stringify(row.fields_filled || []),
      fetch_success: row.fetch_success ? 1 : 0,
      ts: row.ts || new Date().toISOString(),
    });
  }

  function getUrlIndexByCategory(cat, limit = 10000) {
    return stmts._getUrlIndexByCategory.all(String(cat || category || ''), Math.max(1, Number(limit) || 10000))
      .map((row) => ({
        ...row,
        fields_filled: safeParse(row.fields_filled, []),
        fetch_success: Boolean(row.fetch_success),
      }));
  }

  function insertPromptIndexEntry(row) {
    stmts._insertPromptIndexEntry.run({
      category: row.category || category || '',
      run_id: row.run_id || '',
      prompt_version: row.prompt_version || '',
      model: row.model || '',
      token_count: Number(row.token_count) || 0,
      success: row.success ? 1 : 0,
      ts: row.ts || new Date().toISOString(),
    });
  }

  function getPromptIndexByCategory(cat, limit = 5000) {
    return stmts._getPromptIndexByCategory.all(String(cat || category || ''), Math.max(1, Number(limit) || 5000))
      .map((row) => ({
        ...row,
        success: Boolean(row.success),
      }));
  }

  return {
    insertKnobSnapshot,
    getKnobSnapshots,
    insertQueryIndexEntry,
    getQueryIndexByCategory,
    insertUrlIndexEntry,
    getUrlIndexByCategory,
    insertPromptIndexEntry,
    getPromptIndexByCategory,
  };
}

function safeParse(text, fallback) {
  if (text == null) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}
