// WHY: Pure function that builds the product-level checkpoint from identity
// + run sources. The product.json accumulates across runs — each run merges
// new sources into the existing product state (deduped by content_hash).

function extractHost(url) {
  try { return new URL(String(url || '')).hostname; } catch { return ''; }
}

function mapProductSource(src, runId) {
  return {
    url: String(src.url || ''),
    final_url: String(src.final_url || src.finalUrl || src.url || ''),
    host: extractHost(src.url),
    content_hash: src.content_hash || null,
    html_file: src.html_file || null,
    screenshot_count: Number(src.screenshot_count || 0),
    status: Number(src.status || 0),
    first_seen_run_id: String(runId || ''),
    last_seen_run_id: String(runId || ''),
  };
}

/**
 * @param {{ identity: object, category: string, productId: string, runId: string, sources: Array }} opts
 * @returns {object} Product checkpoint
 */
export function buildProductCheckpoint({ identity, category, productId, runId, sources } = {}) {
  const id = identity || {};
  const runSources = Array.isArray(sources) ? sources : [];

  return {
    schema_version: 1,
    checkpoint_type: 'product',
    product_id: String(productId || ''),
    category: String(category || ''),
    identity: {
      brand: String(id.brand || ''),
      model: String(id.model || ''),
      variant: String(id.variant || ''),
      sku: String(id.sku || ''),
      title: String(id.title || ''),
    },
    latest_run_id: String(runId || ''),
    runs_completed: 1,
    sources: runSources.map((src) => mapProductSource(src, runId)),
    fields: {},
    provenance: {},
    updated_at: new Date().toISOString(),
  };
}
