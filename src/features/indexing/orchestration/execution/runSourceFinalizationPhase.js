function resolveContextSection(context = {}, sectionName) {
  const section = context?.[sectionName];
  if (section && typeof section === 'object') {
    return section;
  }
  return context;
}

function resolveValue(value, fallback) {
  return value === undefined ? fallback : value;
}

export async function runSourceFinalizationPhase({
  sourceResults,
  source = {},
  pageData = {},
  discoveryOnlySource = false,
  identity = {},
  mergedIdentityCandidates = {},
  mergedFieldCandidatesWithEvidence = [],
  anchorCheck = {},
  anchorStatus = '',
  endpointIntel = {},
  temporalSignals = {},
  evidencePack = {},
  artifactHostKey = '',
  artifactRefs = {},
  fingerprint = {},
  parserHealth = {},
  config,
  category,
  productId,
  logger,
  sourceStatusCode = 0,
  sourceUrl = '',
  manufacturerBrandMismatch = false,
  successfulSourceMetaByUrl,
  planner,
  llmExtraction = {},
  fetchContentType = '',
  fetchDurationMs = 0,
  sourceFetchOutcome = '',
  hostBudgetRow = {},
  parseStartedAtMs = 0,
  llmFieldCandidates = [],
  domSnippetArtifact = null,
  adapterExtra = {},
  staticDomStats = {},
  staticDomAuditRejectedCount = 0,
  structuredStats = {},
  structuredSnippetRows = [],
  structuredErrors = [],
  pdfExtractionMeta = {},
  screenshotUri = '',
  domSnippetUri = '',
  pageArtifactsPersisted = false,
  pageHtmlUri = '',
  ldjsonUri = '',
  embeddedStateUri = '',
  networkResponsesUri = '',
  frontierDb,
  repairSearchEnabled,
  repairDedupeRule,
  repairQueryByDomain,
  requiredFields,
  jobIdentityLock,
  normalizeHostTokenFn,
  hostFromHttpUrlFn,
  buildRepairSearchQueryFn,
  maybeEmitRepairQueryFn,
  sha256Fn,
  toFloatFn,
  artifactsByHost,
  adapterArtifacts,
  llmSourcesUsed = 0,
  llmCandidatesAccepted = 0,
  fetcherMode,
  llmSatisfiedFields,
  anchors,
  traceWriter,
  collectKnownCandidatesFromSourceFn,
  markSatisfiedLlmFieldsFn,
  bumpHostOutcomeFn,
  noteHostRetryTsFn,
  applyHostBudgetBackoffFn,
  resolveHostBudgetStateFn,
  runSourceResultsAppendPhaseFn,
  runSourceEvidenceIndexPhaseFn,
  runSourcePostFetchStatusPhaseFn,
  runSourceKnownCandidatesPhaseFn,
  runSourceConflictTelemetryPhaseFn,
  runSourceFrontierPersistencePhaseFn,
  runSourceArtifactAggregationPhaseFn,
  runSourceHostBudgetPhaseFn,
  runSourceProcessedTelemetryPhaseFn,
  buildSourceProcessedPayloadFn,
  context = {},
} = {}) {
  const runtimeContext = resolveContextSection(context, 'runtimeContext');
  const repairQueryContext = resolveContextSection(context, 'repairQueryContext');
  const artifactContext = resolveContextSection(context, 'artifactContext');
  const phaseFns = resolveContextSection(context, 'phaseFns');

  sourceResults = resolveValue(sourceResults, runtimeContext.sourceResults ?? []);
  config = resolveValue(config, runtimeContext.config ?? {});
  category = resolveValue(category, runtimeContext.category ?? '');
  productId = resolveValue(productId, runtimeContext.productId ?? '');
  logger = resolveValue(logger, runtimeContext.logger ?? null);
  successfulSourceMetaByUrl = resolveValue(
    successfulSourceMetaByUrl,
    runtimeContext.successfulSourceMetaByUrl ?? new Map(),
  );
  planner = resolveValue(planner, runtimeContext.planner ?? null);

  frontierDb = resolveValue(frontierDb, repairQueryContext.frontierDb ?? null);
  repairSearchEnabled = resolveValue(
    repairSearchEnabled,
    repairQueryContext.repairSearchEnabled === undefined
      ? true
      : repairQueryContext.repairSearchEnabled,
  );
  repairDedupeRule = resolveValue(
    repairDedupeRule,
    repairQueryContext.repairDedupeRule ?? 'domain_once',
  );
  repairQueryByDomain = resolveValue(
    repairQueryByDomain,
    repairQueryContext.repairQueryByDomain ?? new Set(),
  );
  requiredFields = resolveValue(requiredFields, repairQueryContext.requiredFields ?? []);
  jobIdentityLock = resolveValue(jobIdentityLock, repairQueryContext.jobIdentityLock ?? {});
  normalizeHostTokenFn = resolveValue(
    normalizeHostTokenFn,
    repairQueryContext.normalizeHostTokenFn ?? ((value = '') => String(value || '')),
  );
  hostFromHttpUrlFn = resolveValue(
    hostFromHttpUrlFn,
    repairQueryContext.hostFromHttpUrlFn ?? (() => ''),
  );
  buildRepairSearchQueryFn = resolveValue(
    buildRepairSearchQueryFn,
    repairQueryContext.buildRepairSearchQueryFn ?? (() => ''),
  );
  maybeEmitRepairQueryFn = resolveValue(
    maybeEmitRepairQueryFn,
    repairQueryContext.maybeEmitRepairQueryFn ?? (() => {}),
  );
  sha256Fn = resolveValue(
    sha256Fn,
    repairQueryContext.sha256Fn ?? ((value = '') => String(value || '')),
  );
  toFloatFn = resolveValue(
    toFloatFn,
    repairQueryContext.toFloatFn ?? ((value, fallback = 0) => Number(value || fallback)),
  );

  artifactsByHost = resolveValue(artifactsByHost, artifactContext.artifactsByHost ?? {});
  adapterArtifacts = resolveValue(adapterArtifacts, artifactContext.adapterArtifacts ?? []);
  fetcherMode = resolveValue(fetcherMode, artifactContext.fetcherMode ?? '');
  llmSatisfiedFields = resolveValue(
    llmSatisfiedFields,
    artifactContext.llmSatisfiedFields ?? new Set(),
  );
  anchors = resolveValue(anchors, artifactContext.anchors ?? {});
  traceWriter = resolveValue(traceWriter, artifactContext.traceWriter ?? null);

  collectKnownCandidatesFromSourceFn = resolveValue(
    collectKnownCandidatesFromSourceFn,
    phaseFns.collectKnownCandidatesFromSourceFn
      ?? (() => ({ sourceFieldValueMap: {}, knownCandidatesFromSource: [] })),
  );
  markSatisfiedLlmFieldsFn = resolveValue(
    markSatisfiedLlmFieldsFn,
    phaseFns.markSatisfiedLlmFieldsFn ?? (() => {}),
  );
  bumpHostOutcomeFn = resolveValue(
    bumpHostOutcomeFn,
    phaseFns.bumpHostOutcomeFn ?? (() => {}),
  );
  noteHostRetryTsFn = resolveValue(
    noteHostRetryTsFn,
    phaseFns.noteHostRetryTsFn ?? (() => {}),
  );
  applyHostBudgetBackoffFn = resolveValue(
    applyHostBudgetBackoffFn,
    phaseFns.applyHostBudgetBackoffFn ?? (() => {}),
  );
  resolveHostBudgetStateFn = resolveValue(
    resolveHostBudgetStateFn,
    phaseFns.resolveHostBudgetStateFn ?? (() => ({ score: 0, state: 'open' })),
  );
  runSourceResultsAppendPhaseFn = resolveValue(
    runSourceResultsAppendPhaseFn,
    phaseFns.runSourceResultsAppendPhaseFn ?? (() => {}),
  );
  runSourceEvidenceIndexPhaseFn = resolveValue(
    runSourceEvidenceIndexPhaseFn,
    phaseFns.runSourceEvidenceIndexPhaseFn ?? (() => {}),
  );
  runSourcePostFetchStatusPhaseFn = resolveValue(
    runSourcePostFetchStatusPhaseFn,
    phaseFns.runSourcePostFetchStatusPhaseFn ?? (() => {}),
  );
  runSourceKnownCandidatesPhaseFn = resolveValue(
    runSourceKnownCandidatesPhaseFn,
    phaseFns.runSourceKnownCandidatesPhaseFn
      ?? (async () => ({ sourceFieldValueMap: {}, knownCandidatesFromSource: [] })),
  );
  runSourceConflictTelemetryPhaseFn = resolveValue(
    runSourceConflictTelemetryPhaseFn,
    phaseFns.runSourceConflictTelemetryPhaseFn ?? (() => {}),
  );
  runSourceFrontierPersistencePhaseFn = resolveValue(
    runSourceFrontierPersistencePhaseFn,
    phaseFns.runSourceFrontierPersistencePhaseFn
      ?? (() => ({ frontierFetchRow: null, pageContentHash: '', pageBytes: 0 })),
  );
  runSourceArtifactAggregationPhaseFn = resolveValue(
    runSourceArtifactAggregationPhaseFn,
    phaseFns.runSourceArtifactAggregationPhaseFn
      ?? (() => ({ llmSourcesUsedDelta: 0, llmCandidatesAcceptedDelta: 0 })),
  );
  runSourceHostBudgetPhaseFn = resolveValue(
    runSourceHostBudgetPhaseFn,
    phaseFns.runSourceHostBudgetPhaseFn ?? (() => ({ hostBudgetAfterSource: {} })),
  );
  runSourceProcessedTelemetryPhaseFn = resolveValue(
    runSourceProcessedTelemetryPhaseFn,
    phaseFns.runSourceProcessedTelemetryPhaseFn ?? (() => {}),
  );
  buildSourceProcessedPayloadFn = resolveValue(
    buildSourceProcessedPayloadFn,
    phaseFns.buildSourceProcessedPayloadFn ?? (() => ({})),
  );

  runSourceResultsAppendPhaseFn({
    sourceResults,
    source,
    pageData,
    discoveryOnlySource,
    identity,
    mergedIdentityCandidates,
    mergedFieldCandidatesWithEvidence,
    anchorCheck,
    anchorStatus,
    endpointIntel,
    temporalSignals,
    evidencePack,
    artifactHostKey,
    artifactRefs,
    fingerprint,
    parserHealth,
  });

  runSourceEvidenceIndexPhaseFn({
    config,
    evidencePack,
    pageData,
    source,
    category,
    productId,
    logger,
  });

  runSourcePostFetchStatusPhaseFn({
    discoveryOnlySource,
    sourceStatusCode,
    sourceUrl,
    source,
    manufacturerBrandMismatch,
    successfulSourceMetaByUrl,
    planner,
    logger,
  });

  const sourceKnownCandidatesPhase = await runSourceKnownCandidatesPhaseFn({
    mergedFieldCandidatesWithEvidence,
    source,
    sourceUrl,
    identity,
    anchorCheck,
    planner,
    llmSatisfiedFields,
    anchors,
    logger,
    traceWriter,
    collectKnownCandidatesFromSourceFn,
    markSatisfiedLlmFieldsFn,
  });
  const sourceFieldValueMap = sourceKnownCandidatesPhase.sourceFieldValueMap;
  const knownCandidatesFromSource = sourceKnownCandidatesPhase.knownCandidatesFromSource;

  runSourceConflictTelemetryPhaseFn({
    llmExtraction,
    logger,
  });

  const sourceFrontierPersistencePhase = runSourceFrontierPersistencePhaseFn({
    frontierDb,
    productId,
    source,
    sourceUrl,
    sourceStatusCode,
    fetchContentType,
    fetchDurationMs,
    knownCandidatesFromSource,
    sourceFieldValueMap,
    identity,
    anchorCheck,
    pageData,
    repairQueryContext: {
      repairSearchEnabled,
      repairDedupeRule,
      repairQueryByDomain,
      config,
      requiredFields,
      jobIdentityLock,
      logger,
      normalizeHostTokenFn,
      hostFromHttpUrlFn,
      buildRepairSearchQueryFn,
    },
    maybeEmitRepairQueryFn,
    sha256Fn,
    toFloatFn,
  });
  const frontierFetchRow = sourceFrontierPersistencePhase.frontierFetchRow;
  const pageContentHash = sourceFrontierPersistencePhase.pageContentHash;
  const pageBytes = sourceFrontierPersistencePhase.pageBytes;

  const sourceArtifactAggregationPhase = runSourceArtifactAggregationPhaseFn({
    artifactsByHost,
    artifactHostKey,
    pageArtifactsPersisted,
    pageHtmlUri,
    ldjsonUri,
    embeddedStateUri,
    networkResponsesUri,
    pageData,
    domSnippetArtifact,
    adapterExtra,
    mergedFieldCandidatesWithEvidence,
    adapterArtifacts,
    config,
    source,
    evidencePack,
    llmFieldCandidates,
    llmExtraction,
  });
  llmSourcesUsed += sourceArtifactAggregationPhase.llmSourcesUsedDelta;
  llmCandidatesAccepted += sourceArtifactAggregationPhase.llmCandidatesAcceptedDelta;

  const sourceHostBudgetPhase = runSourceHostBudgetPhaseFn({
    hostBudgetRow,
    pageData,
    sourceFetchOutcome,
    knownCandidatesFromSource,
    sourceStatusCode,
    frontierFetchRow,
    config,
    bumpHostOutcomeFn,
    noteHostRetryTsFn,
    applyHostBudgetBackoffFn,
    resolveHostBudgetStateFn,
  });
  const hostBudgetAfterSource = sourceHostBudgetPhase.hostBudgetAfterSource;

  runSourceProcessedTelemetryPhaseFn({
    logger,
    buildSourceProcessedPayloadFn,
    source,
    sourceUrl,
    fetcherKind: fetcherMode,
    fetchDurationMs,
    parseStartedAtMs,
    pageData,
    sourceFetchOutcome,
    fetchContentType,
    pageContentHash,
    pageBytes,
    identity,
    anchorStatus,
    mergedFieldCandidatesWithEvidence,
    llmFieldCandidates,
    evidencePack,
    staticDomStats,
    staticDomAuditRejectedCount,
    structuredStats,
    structuredSnippetRows,
    structuredErrors,
    pdfExtractionMeta,
    screenshotUri,
    domSnippetUri,
    hostBudgetAfterSource,
  });

  return {
    llmSourcesUsed,
    llmCandidatesAccepted
  };
}
