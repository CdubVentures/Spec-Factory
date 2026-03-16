import { buildPhase08SummaryFromBatches } from '../shared/provenanceHelpers.js';

export function buildPhase08ExtractionContext({
  runId,
  category,
  productId,
  phase08BatchRows = [],
  phase08FieldContexts = {},
  phase08PrimeRows = [],
  llmValidatorDecisions = {},
  buildPhase08SummaryFromBatchesFn = buildPhase08SummaryFromBatches,
  nowIsoFn = () => new Date().toISOString(),
} = {}) {
  const phase08SummaryFromBatches = buildPhase08SummaryFromBatchesFn(phase08BatchRows);
  const phase08Extraction = {
    run_id: runId,
    category,
    product_id: productId,
    generated_at: nowIsoFn(),
    summary: phase08SummaryFromBatches,
    batches: phase08BatchRows.slice(0, 500),
    field_contexts: phase08FieldContexts,
    prime_sources: {
      rows: phase08PrimeRows.slice(0, 500),
    },
    validator: {
      context_field_count: Number(llmValidatorDecisions?.phase08?.context_field_count || 0),
      prime_source_rows: Number(llmValidatorDecisions?.phase08?.prime_source_rows || 0),
      payload_chars: Number(llmValidatorDecisions?.phase08?.payload_chars || 0),
    },
  };

  return {
    phase08SummaryFromBatches,
    phase08Extraction,
  };
}
