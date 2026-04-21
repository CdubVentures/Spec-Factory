// WHY: Load the most-recent completed run's `field_histories` run_artifact
// for a given productId. NeedSet needs this as `roundContext.previousFieldHistories`
// so tier-3 key_search query_count accumulates across runs, driving the
// progressive enrichment ladder (3a → 3b → 3c → 3d).

/**
 * @param {object|null} specDb - SpecDb instance (null-safe).
 * @param {string} productId
 * @returns {object} Prior field histories keyed by field_key, or {} if none.
 */
export function loadPriorFieldHistories(specDb, productId) {
  if (!specDb || !productId) return {};
  const pid = String(productId).trim();
  if (!pid) return {};

  // WHY: Most-recent COMPLETED run for this product. Running/failed runs are
  // skipped so a crashed run doesn't surface its partial histories.
  let latestRunId = '';
  try {
    const row = specDb.db
      .prepare(`
        SELECT run_id FROM runs
        WHERE product_id = ? AND status = 'completed'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `)
      .get(pid);
    latestRunId = row?.run_id || '';
  } catch { return {}; }
  if (!latestRunId) return {};

  try {
    const artifact = specDb.getRunArtifact(latestRunId, 'field_histories');
    const payload = artifact?.payload;
    if (payload && typeof payload === 'object') return payload;
    return {};
  } catch { return {}; }
}
