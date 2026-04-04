/**
 * Source Intelligence store — extracted from SpecDb.
 * Owns: bridge_events table.
 *
 * @param {{ db: import('better-sqlite3').Database, category: string, stmts: object }} deps
 */
export function createSourceIntelStore({ db, category, stmts }) {
  // --- Bridge Events (transformed runtime events for GUI readers) ---

  function insertBridgeEvent(row) {
    stmts._insertBridgeEvent.run({
      run_id: row.run_id || '',
      category: row.category || '',
      product_id: row.product_id || '',
      ts: row.ts || new Date().toISOString(),
      stage: row.stage || '',
      event: row.event || '',
      payload: typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload || {}),
    });
  }

  function getBridgeEventsByRunId(runId, limit = 2000) {
    const rows = stmts._getBridgeEventsByRunId.all(runId, limit);
    rows.reverse();
    return rows.map(r => {
      let parsed = {};
      try { parsed = JSON.parse(r.payload); } catch { /* default {} */ }
      return { ...r, payload: parsed };
    });
  }

  // WHY: Wave 5.5 — after run-summary.json captures all events, purge the
  // per-run bridge_events rows to keep the SQLite WAL lean.
  function purgeBridgeEventsForRun(runId) {
    const token = String(runId || '').trim();
    if (!token) return 0;
    return db.prepare('DELETE FROM bridge_events WHERE run_id = ?').run(token).changes;
  }

  return {
    insertBridgeEvent,
    getBridgeEventsByRunId,
    purgeBridgeEventsForRun,
  };
}
