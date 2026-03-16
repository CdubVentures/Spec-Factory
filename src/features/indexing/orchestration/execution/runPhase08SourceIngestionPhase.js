export function runPhase08SourceIngestionPhase({
  llmExtraction = {},
  source = {},
  phase08BatchRows = [],
  phase08FieldContexts = {},
  phase08PrimeRows = [],
  normalizeHostTokenFn = (value) => String(value || '').trim().toLowerCase(),
  hostFromHttpUrlFn = () => '',
  mergePhase08RowsFn = (existingRows, incomingRows) => [
    ...(Array.isArray(existingRows) ? existingRows : []),
    ...(Array.isArray(incomingRows) ? incomingRows : [])
  ],
  maxPrimeRows = 500,
} = {}) {
  if (!llmExtraction?.phase08 || typeof llmExtraction.phase08 !== 'object') {
    return {
      phase08BatchRows,
      phase08FieldContexts,
      phase08PrimeRows,
    };
  }

  const sourceUrlForPhase08 = String(source.finalUrl || source.url || '').trim();
  const sourceHostForPhase08 = normalizeHostTokenFn(
    source.host || hostFromHttpUrlFn(sourceUrlForPhase08)
  );
  const phase08Rows = Array.isArray(llmExtraction.phase08.batches)
    ? llmExtraction.phase08.batches
    : [];
  phase08BatchRows.push(
    ...phase08Rows.map((row) => ({
      ...row,
      source_url: sourceUrlForPhase08 || null,
      source_host: sourceHostForPhase08 || null
    }))
  );
  const nextPhase08FieldContexts = {
    ...phase08FieldContexts,
    ...(llmExtraction.phase08.field_contexts || {})
  };
  const nextPhase08PrimeRows = mergePhase08RowsFn(
    phase08PrimeRows,
    Array.isArray(llmExtraction?.phase08?.prime_sources?.rows)
      ? llmExtraction.phase08.prime_sources.rows
      : [],
    maxPrimeRows
  );

  return {
    phase08BatchRows,
    phase08FieldContexts: nextPhase08FieldContexts,
    phase08PrimeRows: nextPhase08PrimeRows,
  };
}
