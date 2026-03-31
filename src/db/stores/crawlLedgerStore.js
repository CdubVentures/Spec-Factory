// WHY: SQL store for url_crawl_ledger + query_cooldowns.
// Replaces frontier.db with per-product, per-category data in spec.sqlite.
// URL crawl history is rebuildable from product.json; cooldowns are ephemeral.

export function createCrawlLedgerStore({ db, category, stmts }) {

  // ---------------------------------------------------------------------------
  // URL crawl ledger
  // ---------------------------------------------------------------------------

  function upsertUrlCrawlEntry(row) {
    stmts._upsertUrlCrawlEntry.run({
      canonical_url: String(row.canonical_url || ''),
      product_id: String(row.product_id || ''),
      category: String(row.category || category || ''),
      original_url: String(row.original_url || ''),
      domain: String(row.domain || ''),
      path_sig: String(row.path_sig || ''),
      final_url: String(row.final_url || ''),
      content_hash: String(row.content_hash || ''),
      content_type: String(row.content_type || ''),
      http_status: Number(row.http_status) || 0,
      bytes: Number(row.bytes) || 0,
      elapsed_ms: Number(row.elapsed_ms) || 0,
      fetch_count: Math.max(1, Number(row.fetch_count) || 1),
      ok_count: Number(row.ok_count) || 0,
      blocked_count: Number(row.blocked_count) || 0,
      timeout_count: Number(row.timeout_count) || 0,
      server_error_count: Number(row.server_error_count) || 0,
      redirect_count: Number(row.redirect_count) || 0,
      notfound_count: Number(row.notfound_count) || 0,
      gone_count: Number(row.gone_count) || 0,
      first_seen_ts: String(row.first_seen_ts || new Date().toISOString()),
      last_seen_ts: String(row.last_seen_ts || new Date().toISOString()),
      first_seen_run_id: String(row.first_seen_run_id || ''),
      last_seen_run_id: String(row.last_seen_run_id || ''),
    });
  }

  function getUrlCrawlEntry(canonicalUrl, productId) {
    return stmts._getUrlCrawlEntry.get(
      String(canonicalUrl || ''),
      String(productId || ''),
    ) || null;
  }

  function getUrlCrawlEntriesByProduct(productId) {
    return stmts._getUrlCrawlEntriesByProduct.all(String(productId || ''));
  }

  function aggregateDomainStats(domains, productId) {
    const result = new Map();
    const domainList = Array.isArray(domains) ? domains : [];
    const pid = String(productId || '');
    for (const domain of domainList) {
      const row = stmts._aggregateDomainStats.get(String(domain || ''), pid);
      if (row) {
        result.set(domain, {
          fetch_count: row.fetch_count || 0,
          ok_count: row.ok_count || 0,
          blocked_count: row.blocked_count || 0,
          timeout_count: row.timeout_count || 0,
          server_error_count: row.server_error_count || 0,
          success_rate: row.success_rate || 0,
          avg_latency_ms: row.avg_latency_ms || 0,
          cooldown_remaining_ms: 0,
          last_blocked_ts: null,
          last_seen_ts: row.last_seen_ts || null,
        });
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Query cooldowns
  // ---------------------------------------------------------------------------

  function upsertQueryCooldown(row) {
    stmts._upsertQueryCooldown.run({
      query_hash: String(row.query_hash || ''),
      product_id: String(row.product_id || ''),
      category: String(row.category || category || ''),
      query_text: String(row.query_text || ''),
      provider: String(row.provider || ''),
      tier: row.tier || null,
      group_key: row.group_key || null,
      normalized_key: row.normalized_key || null,
      hint_source: row.hint_source || null,
      attempt_count: Math.max(1, Number(row.attempt_count) || 1),
      result_count: Number(row.result_count) || 0,
      last_executed_at: String(row.last_executed_at || new Date().toISOString()),
      cooldown_until: String(row.cooldown_until || new Date().toISOString()),
    });
  }

  function getQueryCooldown(queryHash, productId) {
    const now = new Date().toISOString();
    return stmts._getQueryCooldown.get(
      String(queryHash || ''),
      String(productId || ''),
      now,
    ) || null;
  }

  function buildQueryExecutionHistory(productId) {
    const rows = stmts._getQueryCooldownsByProduct.all(String(productId || ''));
    return {
      queries: rows.map((row) => ({
        query_text: row.query_text,
        tier: row.tier || null,
        group_key: row.group_key || null,
        normalized_key: row.normalized_key || null,
        hint_source: row.hint_source || null,
        source_name: row.provider || '',
        completed_at_ms: row.last_executed_at ? new Date(row.last_executed_at).getTime() : 0,
        attempt_count: row.attempt_count || 1,
        cooldown_until: row.cooldown_until || '',
      })),
    };
  }

  function purgeExpiredCooldowns() {
    const now = new Date().toISOString();
    const result = stmts._purgeExpiredCooldowns.run(now);
    return result.changes || 0;
  }

  return {
    upsertUrlCrawlEntry,
    getUrlCrawlEntry,
    getUrlCrawlEntriesByProduct,
    aggregateDomainStats,
    upsertQueryCooldown,
    getQueryCooldown,
    buildQueryExecutionHistory,
    purgeExpiredCooldowns,
  };
}
