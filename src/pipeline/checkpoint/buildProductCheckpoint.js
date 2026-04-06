// WHY: Pure function that builds the product-level checkpoint from identity
// + run sources. The product.json accumulates across runs — each run merges
// new sources into the existing product state (deduped by content_hash).

function extractHost(url) {
  try { return new URL(String(url || '')).hostname; } catch { return ''; }
}

function isOkStatus(s) { return s >= 200 && s < 400; }
function isBlockedStatus(s) { return s === 403 || s === 429; }

function mapProductSource(src, runId) {
  const status = Number(src.status || 0);
  return {
    url: String(src.url || ''),
    final_url: String(src.final_url || src.finalUrl || src.url || ''),
    host: extractHost(src.url),
    content_hash: src.content_hash || null,
    html_file: src.html_file || null,
    screenshot_count: Number(src.screenshot_count || 0),
    status,
    first_seen_run_id: String(runId || ''),
    last_seen_run_id: String(runId || ''),
    domain: String(src.domain || '') || extractHost(src.url),
    elapsed_ms: Number(src.elapsed_ms || 0),
    fetch_count: Number(src.fetch_count || 1),
    ok_count: Number(src.ok_count || (isOkStatus(status) ? 1 : 0)),
    blocked_count: Number(src.blocked_count || (isBlockedStatus(status) ? 1 : 0)),
    timeout_count: Number(src.timeout_count || 0),
  };
}

/**
 * @param {{ identity: object, category: string, productId: string, runId: string, sources: Array }} opts
 * @returns {object} Product checkpoint
 */
export function buildProductCheckpoint({ identity, category, productId, runId, sources, queryCooldowns } = {}) {
  const id = identity || {};
  const runSources = Array.isArray(sources) ? sources : [];

  return {
    schema_version: 1,
    checkpoint_type: 'product',
    product_id: String(productId || ''),
    category: String(category || ''),
    identity: {
      brand: String(id.brand || ''),
      base_model: String(id.base_model || ''),
      model: String(id.model || ''),
      variant: String(id.variant || ''),
      brand_identifier: String(id.brand_identifier || ''),
      sku: String(id.sku || ''),
      title: String(id.title || ''),
      identifier: String(id.identifier || ''),
      status: String(id.status || 'active'),
    },
    latest_run_id: String(runId || ''),
    runs_completed: 1,
    sources: runSources.map((src) => mapProductSource(src, runId)),
    query_cooldowns: Array.isArray(queryCooldowns) ? queryCooldowns : [],
    updated_at: new Date().toISOString(),
  };
}
