export async function runSourceKnownCandidatesPhase({
  mergedFieldCandidatesWithEvidence = [],
  source = {},
  sourceUrl = '',
  identity = { match: false },
  anchorCheck = { majorConflicts: [] },
  planner = null,
  llmSatisfiedFields = new Set(),
  anchors = [],
  logger = null,
  traceWriter = null,
  collectKnownCandidatesFromSourceFn = () => ({
    sourceFieldValueMap: {},
    knownCandidatesFromSource: [],
  }),
  markSatisfiedLlmFieldsFn = () => {},
  nowIsoFn = () => new Date().toISOString(),
} = {}) {
  const { sourceFieldValueMap, knownCandidatesFromSource } = collectKnownCandidatesFromSourceFn(
    mergedFieldCandidatesWithEvidence
  );

  if (
    source.approvedDomain &&
    identity.match &&
    (anchorCheck.majorConflicts || []).length === 0
  ) {
    planner?.markFieldsFilled?.(knownCandidatesFromSource);
    markSatisfiedLlmFieldsFn(llmSatisfiedFields, knownCandidatesFromSource, anchors);
  }

  if (knownCandidatesFromSource.length > 0) {
    const uniqueFields = [...new Set(knownCandidatesFromSource)];
    logger?.info?.('fields_filled_from_source', {
      url: sourceUrl,
      host: source.host,
      filled_fields: uniqueFields.slice(0, 40),
      count: uniqueFields.length
    });
    if (traceWriter) {
      await traceWriter.appendJsonl({
        section: 'fields',
        filename: 'field_timeline.jsonl',
        row: {
          ts: nowIsoFn(),
          url: sourceUrl,
          host: source.host,
          fields: uniqueFields.slice(0, 60)
        }
      });
    }
  }

  return {
    sourceFieldValueMap,
    knownCandidatesFromSource,
  };
}
