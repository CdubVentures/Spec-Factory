function buildFilledFields(candidates = []) {
  return [...new Set(
    candidates
      .map((candidate) => String(candidate?.field || '').trim())
      .filter(Boolean),
  )];
}

export function bootstrapRunEventIndexing({
  logger = {},
  category = '',
  productId = '',
  runId = '',
  env = process.env,
  manifestDefaults = {},
  captureKnobSnapshotFn = () => ({}),
  recordKnobSnapshotFn = () => {},
  recordUrlVisitFn = () => {},
  recordQueryResultFn = () => {},
  // WHY: Legacy params kept for backward compat with callers that still pass them
  defaultIndexLabRootFn = () => '.',
  joinPathFn = (...parts) => parts.join('/'),
  mkdirSyncFn = () => {},
} = {}) {

  try {
    const knobSnapshot = captureKnobSnapshotFn(env, manifestDefaults);
    recordKnobSnapshotFn(knobSnapshot);
  } catch {
    // Index recording must not crash the pipeline.
  }

  const previousOnEvent = logger.onEvent;
  logger.onEvent = (row) => {
    let hookResult;
    try {
      hookResult = previousOnEvent?.(row);
    } catch {
      // Preserve existing handler failures as non-fatal.
    }

    try {
      if (row?.event === 'source_processed') {
        const url = String(row.url || row.final_url || '').trim();
        if (url) {
          recordUrlVisitFn({
            url,
            host: String(row.host || '').trim(),
            tier: String(row.tier || 'unknown'),
            doc_kind: String(row.content_type || '').trim(),
            fields_filled: buildFilledFields(row.candidates),
            fetch_success: row.outcome === 'ok',
            run_id: runId,
          });
        }
      }

      if (row?.event === 'discovery_query_completed') {
        recordQueryResultFn({
          query: row.query || '',
          provider: row.provider || '',
          result_count: row.result_count || 0,
          field_yield: null,
          run_id: runId,
          category,
          product_id: productId,
        });
      }
    } catch {
      // Index recording must not crash the pipeline.
    }
    return hookResult;
  };
}
