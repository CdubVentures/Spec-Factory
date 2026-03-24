/**
 * Billing store — extracted from SpecDb.
 * Owns: billing_entries table.
 *
 * @param {{ db: import('better-sqlite3').Database, stmts: object }} deps
 */
import { BILLING_ENTRY_BOOLEAN_KEYS } from '../specDbSchema.js';
import { hydrateRows } from '../specDbHelpers.js';

export function createBillingStore({ db, stmts }) {
  function insertBillingEntry(entry) {
    stmts._insertBillingEntry.run({
      ts: entry.ts || new Date().toISOString(),
      month: entry.month || String(entry.ts || '').slice(0, 7),
      day: entry.day || String(entry.ts || '').slice(0, 10),
      provider: entry.provider || 'unknown',
      model: entry.model || 'unknown',
      category: entry.category || '',
      product_id: entry.product_id || entry.productId || '',
      run_id: entry.run_id || entry.runId || '',
      round: entry.round ?? 0,
      prompt_tokens: entry.prompt_tokens ?? 0,
      completion_tokens: entry.completion_tokens ?? 0,
      cached_prompt_tokens: entry.cached_prompt_tokens ?? 0,
      total_tokens: entry.total_tokens ?? 0,
      cost_usd: entry.cost_usd ?? 0,
      reason: entry.reason || 'extract',
      host: entry.host || '',
      url_count: entry.url_count ?? 0,
      evidence_chars: entry.evidence_chars ?? 0,
      estimated_usage: entry.estimated_usage ? 1 : 0,
      meta: typeof entry.meta === 'object' ? JSON.stringify(entry.meta) : (entry.meta || '{}')
    });
  }

  function insertBillingEntriesBatch(entries) {
    const tx = db.transaction((items) => {
      for (const entry of items) { insertBillingEntry(entry); }
    });
    tx(entries);
  }

  function getBillingRollup(month) {
    const totals = db.prepare(`
      SELECT COUNT(*) as calls, COALESCE(SUM(cost_usd), 0) as cost_usd,
             COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens
      FROM billing_entries WHERE month = ?
    `).get(month) || { calls: 0, cost_usd: 0, prompt_tokens: 0, completion_tokens: 0 };

    const by_day = {};
    for (const row of db.prepare(`
      SELECT day, COUNT(*) as calls, COALESCE(SUM(cost_usd), 0) as cost_usd,
             COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens
      FROM billing_entries WHERE month = ? GROUP BY day
    `).all(month)) {
      by_day[row.day] = { cost_usd: row.cost_usd, prompt_tokens: row.prompt_tokens, completion_tokens: row.completion_tokens, calls: row.calls };
    }

    const by_category = {};
    for (const row of db.prepare(`
      SELECT category, COUNT(*) as calls, COALESCE(SUM(cost_usd), 0) as cost_usd,
             COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens
      FROM billing_entries WHERE month = ? GROUP BY category
    `).all(month)) {
      by_category[row.category || ''] = { cost_usd: row.cost_usd, prompt_tokens: row.prompt_tokens, completion_tokens: row.completion_tokens, calls: row.calls };
    }

    const by_product = {};
    for (const row of db.prepare(`
      SELECT product_id, COUNT(*) as calls, COALESCE(SUM(cost_usd), 0) as cost_usd,
             COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens
      FROM billing_entries WHERE month = ? GROUP BY product_id
    `).all(month)) {
      by_product[row.product_id || ''] = { cost_usd: row.cost_usd, prompt_tokens: row.prompt_tokens, completion_tokens: row.completion_tokens, calls: row.calls };
    }

    const by_model = {};
    for (const row of db.prepare(`
      SELECT provider || ':' || model as model_key, COUNT(*) as calls, COALESCE(SUM(cost_usd), 0) as cost_usd,
             COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens
      FROM billing_entries WHERE month = ? GROUP BY model_key
    `).all(month)) {
      by_model[row.model_key] = { cost_usd: row.cost_usd, prompt_tokens: row.prompt_tokens, completion_tokens: row.completion_tokens, calls: row.calls };
    }

    const by_reason = {};
    for (const row of db.prepare(`
      SELECT reason, COUNT(*) as calls, COALESCE(SUM(cost_usd), 0) as cost_usd,
             COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens
      FROM billing_entries WHERE month = ? GROUP BY reason
    `).all(month)) {
      by_reason[row.reason || 'extract'] = { cost_usd: row.cost_usd, prompt_tokens: row.prompt_tokens, completion_tokens: row.completion_tokens, calls: row.calls };
    }

    return {
      month,
      generated_at: new Date().toISOString(),
      totals,
      by_day,
      by_category,
      by_product,
      by_model,
      by_reason
    };
  }

  function getBillingEntriesForMonth(month) {
    return hydrateRows(BILLING_ENTRY_BOOLEAN_KEYS, db.prepare('SELECT * FROM billing_entries WHERE month = ? ORDER BY ts').all(month));
  }

  function getBillingSnapshot(month, productId) {
    const monthly = getBillingRollup(month);
    const product = monthly.by_product[productId] || { cost_usd: 0, calls: 0, prompt_tokens: 0, completion_tokens: 0 };
    return {
      month,
      monthly_cost_usd: monthly.totals.cost_usd,
      monthly_calls: monthly.totals.calls,
      product_cost_usd: product.cost_usd,
      product_calls: product.calls,
      monthly
    };
  }

  return {
    insertBillingEntry,
    insertBillingEntriesBatch,
    getBillingRollup,
    getBillingEntriesForMonth,
    getBillingSnapshot,
  };
}
