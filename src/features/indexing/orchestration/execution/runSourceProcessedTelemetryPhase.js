export function runSourceProcessedTelemetryPhase({
  logger = null,
  buildSourceProcessedPayloadFn = (payload = {}) => payload,
  source = {},
  sourceUrl = '',
  fetcherKind = '',
  fetchDurationMs = 0,
  parseStartedAtMs = 0,
  nowMsFn = () => Date.now(),
  pageData = {},
  sourceFetchOutcome = '',
  fetchContentType = '',
  pageContentHash = '',
  pageBytes = 0,
  identity = {},
  anchorStatus = '',
  mergedFieldCandidatesWithEvidence = [],
  llmFieldCandidates = [],
  evidencePack = {},
  staticDomStats = {},
  staticDomAuditRejectedCount = 0,
  structuredStats = {},
  structuredSnippetRows = [],
  structuredErrors = [],
  pdfExtractionMeta = {},
  screenshotUri = '',
  domSnippetUri = '',
  hostBudgetAfterSource = {
    score: 0,
    state: 'open'
  },
} = {}) {
  const parseDurationMs = Math.max(0, nowMsFn() - parseStartedAtMs);
  const articleExtractionMeta = (
    evidencePack?.meta?.article_extraction
    && typeof evidencePack.meta.article_extraction === 'object'
  )
    ? evidencePack.meta.article_extraction
    : {};
  const staticDomMeta = {
    mode: String(staticDomStats?.mode || '').trim(),
    accepted_field_candidates: Number(staticDomStats?.accepted_field_candidates || 0),
    rejected_field_candidates: Number(staticDomStats?.rejected_field_candidates || 0),
    parse_error_count: Number(staticDomStats?.parse_error_count || 0),
    rejected_field_candidates_audit_count: Number(staticDomAuditRejectedCount || 0)
  };
  const structuredMeta = {
    json_ld_count: Number(structuredStats?.json_ld_count || 0),
    microdata_count: Number(structuredStats?.microdata_count || 0),
    opengraph_count: Number(structuredStats?.opengraph_count || 0),
    structured_candidates: Number(structuredStats?.structured_candidates || 0),
    structured_rejected_candidates: Number(structuredStats?.structured_rejected_candidates || 0),
    error_count: Array.isArray(structuredErrors) ? structuredErrors.length : 0,
    snippet_rows: Array.isArray(structuredSnippetRows)
      ? structuredSnippetRows.slice(0, 40).map((row) => ({
        source_surface: String(row?.source_surface || row?.method || '').trim(),
        key_path: String(row?.key_path || '').trim(),
        value_preview: String(row?.value_preview || '').trim(),
        target_match_score: Number(row?.target_match_score || 0),
        target_match_passed: Boolean(row?.target_match_passed)
      }))
      : []
  };
  logger?.info?.('source_processed', buildSourceProcessedPayloadFn({
    source,
    sourceUrl,
    fetcherKind,
    fetchDurationMs,
    parseDurationMs,
    pageData,
    sourceFetchOutcome,
    fetchContentType,
    pageContentHash,
    pageBytes,
    identity,
    anchorStatus,
    mergedFieldCandidatesWithEvidence,
    llmFieldCandidates,
    articleExtractionMeta,
    staticDomMeta,
    structuredMeta,
    pdfExtractionMeta,
    screenshotUri,
    domSnippetUri,
    hostBudgetAfterSource
  }));
  return {
    parseDurationMs,
  };
}
