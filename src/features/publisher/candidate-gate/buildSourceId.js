/**
 * Deterministic source_id generator for the source-centric candidate model.
 *
 * Each extraction event gets a unique, stable identifier:
 * - Finders (CEF, PIF): `{source}-{productId}-{runNumber}` (deterministic, stable across rebuilds)
 * - Review/Manual: `{source}-{productId}-{timestamp}` (unique per user action)
 * - Caller-provided: pass source_id directly in sourceMeta
 */

export function buildSourceId(sourceMeta, productId) {
  if (sourceMeta.source_id) return sourceMeta.source_id;

  const source = String(sourceMeta.source || 'unknown').trim();
  const pid = String(productId || sourceMeta.product_id || '').trim();

  // WHY: Finders have monotonic run_number — deterministic source_id survives rebuild.
  if (sourceMeta.run_number != null) {
    return `${source}-${pid}-${sourceMeta.run_number}`;
  }

  // WHY: Review/manual actions use timestamp — unique per user action.
  return `${source}-${pid}-${Date.now()}`;
}

/**
 * Reverse parser for finder run source_ids: `{source}-{productId}-{runNumber}`.
 * Returns `{ source, productId, runNumber }` when the trailing segment is an
 * integer (finder-run shape), else `null` (timestamp/manual/unknown shape).
 *
 * Tolerates hyphens inside productId — uses the FIRST dash after `source` and
 * the LAST numeric trailing segment.
 */
export function parseFinderRunSourceId(sourceId) {
  if (typeof sourceId !== 'string' || sourceId.length === 0) return null;
  const match = sourceId.match(/^([^-]+)-(.+)-(\d+)$/);
  if (!match) return null;
  const [, source, productId, runStr] = match;
  const runNumber = Number(runStr);
  if (!Number.isInteger(runNumber) || runNumber < 0) return null;
  return { source, productId, runNumber };
}
