export function runSourceFrontierPersistencePhase({
  frontierDb = null,
  productId = '',
  source = {},
  sourceUrl = '',
  sourceStatusCode = 0,
  fetchContentType = '',
  fetchDurationMs = 0,
  knownCandidatesFromSource = [],
  sourceFieldValueMap = {},
  identity = { score: 0 },
  anchorCheck = { majorConflicts: [] },
  pageData = {},
  repairQueryContext = {},
  maybeEmitRepairQueryFn = () => {},
  sha256Fn = (value = '') => String(value || ''),
  toFloatFn = (value, fallback = 0) => Number(value || fallback),
} = {}) {
  const pageHtml = String(pageData.html || '');
  const pageContentHash = sha256Fn(pageHtml);
  const pageBytes = pageHtml.length;
  const uniqueKnownFields = [...new Set(knownCandidatesFromSource)];
  const frontierFetchRow = frontierDb?.recordFetch?.({
    productId,
    url: source.url,
    finalUrl: sourceUrl,
    status: sourceStatusCode,
    contentType: fetchContentType,
    contentHash: pageContentHash,
    bytes: pageBytes,
    elapsedMs: fetchDurationMs,
    fieldsFound: uniqueKnownFields,
    confidence: toFloatFn(identity.score, 0),
    conflictFlag: (anchorCheck.majorConflicts || []).length > 0
  });

  for (const field of uniqueKnownFields) {
    frontierDb?.recordYield?.({
      url: sourceUrl,
      fieldKey: field,
      valueHash: sha256Fn(String(sourceFieldValueMap[field] || '')),
      confidence: toFloatFn(identity.score, 0),
      conflictFlag: false
    });
  }

  if (sourceStatusCode === 404 || sourceStatusCode === 410) {
    const cooldownUntil = String(
      frontierFetchRow?.cooldown?.next_retry_ts || frontierFetchRow?.cooldown_next_retry_ts || ''
    ).trim();
    maybeEmitRepairQueryFn({
      ...repairQueryContext,
      source,
      sourceUrl,
      statusCode: sourceStatusCode,
      reason: sourceStatusCode === 410 ? 'status_410' : 'status_404',
      cooldownUntil
    });
  }

  return {
    frontierFetchRow,
    pageContentHash,
    pageBytes,
  };
}
