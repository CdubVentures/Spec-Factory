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
      hashIndex.get(src.content_hash).last_seen_run_id = String(runId || '');
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
