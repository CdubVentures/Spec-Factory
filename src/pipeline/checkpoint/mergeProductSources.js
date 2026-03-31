// WHY: Content-addressed merge of crawl sources across runs.
// Product.json accumulates sources from every run. Same content_hash means
// same page content — update last_seen, keep first_seen. New hash → new entry.

/**
 * @param {{ existing: Array, incoming: Array, runId: string }} opts
 * @returns {Array} Merged sources array (new object, does not mutate inputs)
 */
export function mergeProductSources({ existing = [], incoming = [], runId }) {
  const hashIndex = new Map();
  const merged = [];

  for (const src of existing) {
    const clone = { ...src };
    merged.push(clone);
    if (clone.content_hash) {
      hashIndex.set(clone.content_hash, clone);
    }
  }

  for (const src of incoming) {
    if (src.content_hash && hashIndex.has(src.content_hash)) {
      const target = hashIndex.get(src.content_hash);
      target.last_seen_run_id = String(runId || '');
      // WHY: Accumulate fetch counters across runs for URL crawl ledger rebuild.
      target.fetch_count = (target.fetch_count || 0) + (src.fetch_count || 0);
      target.ok_count = (target.ok_count || 0) + (src.ok_count || 0);
      target.blocked_count = (target.blocked_count || 0) + (src.blocked_count || 0);
      target.timeout_count = (target.timeout_count || 0) + (src.timeout_count || 0);
      if (src.elapsed_ms) target.elapsed_ms = src.elapsed_ms;
      if (src.domain) target.domain = src.domain;
    } else {
      merged.push({
        ...src,
        first_seen_run_id: String(runId || ''),
        last_seen_run_id: String(runId || ''),
      });
    }
  }

  return merged;
}
