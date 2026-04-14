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
