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
  defaultIndexLabRootFn = () => '.',
  joinPathFn = (...parts) => parts.join('/'),
  mkdirSyncFn = () => {},
  captureKnobSnapshotFn = () => ({}),
  recordKnobSnapshotFn = () => {},
  recordUrlVisitFn = () => {},
  recordQueryResultFn = () => {},
} = {}) {
  const indexingRoot = joinPathFn(defaultIndexLabRootFn(), category);

  try {
    mkdirSyncFn(indexingRoot, { recursive: true });
    const knobSnapshot = captureKnobSnapshotFn(env, manifestDefaults);
    recordKnobSnapshotFn(knobSnapshot, joinPathFn(indexingRoot, 'knob-snapshots.ndjson'));
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
          mkdirSyncFn(indexingRoot, { recursive: true });
          recordUrlVisitFn({
            url,
            host: String(row.host || '').trim(),
            tier: String(row.tier || 'unknown'),
            doc_kind: String(row.content_type || '').trim(),
            fields_filled: buildFilledFields(row.candidates),
            fetch_success: row.outcome === 'ok',
            run_id: runId,
          }, joinPathFn(indexingRoot, 'url-index.ndjson'));
        }
      }

      if (row?.event === 'discovery_query_completed') {
        mkdirSyncFn(indexingRoot, { recursive: true });
        recordQueryResultFn({
          query: row.query || '',
          provider: row.provider || '',
          result_count: row.result_count || 0,
          field_yield: null,
          run_id: runId,
          category,
          product_id: productId,
        }, joinPathFn(indexingRoot, 'query-index.ndjson'));
      }
    } catch {
      // Index recording must not crash the pipeline.
    }
    return hookResult;
  };
}
