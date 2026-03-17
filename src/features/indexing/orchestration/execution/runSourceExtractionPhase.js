function resolveContextSection(context = {}, sectionName) {
  const section = context?.[sectionName];
  if (section && typeof section === 'object') {
    return section;
  }
  return context;
}

function isGroupedPhaseContract(contract = {}) {
  return Boolean(
    contract &&
    typeof contract === 'object' &&
    contract.runtimeContext &&
    contract.phaseFns
  );
}

export async function runSourceExtractionPhase({
  source = {},
  pageData = {},
  sourceStatusCode = 0,
  fetchDurationMs = 0,
  fetchContentType = '',
  sourceFetchOutcome = '',
  parseStartedAtMs = 0,
  hostBudgetRow = {},
  domSnippetArtifact = null,
  artifactHostKey = '',
  domSnippetUri = '',
  screenshotArtifact = null,
  screenshotUri = '',
  screenshotFileUri = '',
  pageArtifactsPersisted = false,
  pageHtmlUri = '',
  ldjsonUri = '',
  embeddedStateUri = '',
  networkResponsesUri = '',
  phase08FieldContexts = {},
  phase08PrimeRows = [],
  llmSourcesUsed = 0,
  llmCandidatesAccepted = 0,
  context = {},
} = {}) {
  const runtimeContext = resolveContextSection(context, 'runtimeContext');
  const phaseFns = resolveContextSection(context, 'phaseFns');
  const contracts = context?.contracts || {};
  const {
    maybeApplyBlockedDomainCooldownFn = () => {},
    blockedDomainHitCount = new Map(),
    blockedDomainThreshold = 1,
    blockedDomainsApplied = new Set(),
    planner = {},
    logger = null,
    normalizeHostTokenFn = (value = '') => String(value || ''),
    hostFromHttpUrlFn = () => '',
    isRobotsTxtUrlFn = () => false,
    isSitemapUrlFn = () => false,
    hasSitemapXmlSignalsFn = () => false,
    isDiscoveryOnlySourceUrlFn = () => false,
    mineEndpointSignalsFn = () => ({ nextBestUrls: [] }),
    categoryConfig = {},
    config = {},
    buildSiteFingerprintFn = () => ({}),
    isLikelyIndexableEndpointUrlFn = () => false,
    isSafeManufacturerFollowupUrlFn = () => false,
    extractCandidatesFromPageFn = () => ({
      identityCandidates: {},
      fieldCandidates: [],
      staticDom: { parserStats: {}, auditRejectedFieldCandidates: [] },
      structuredMetadata: { stats: {}, snippetRows: [], errors: [] }
    }),
    jobIdentityLock = {},
    adapterManager = { extractForPage: async () => ({}) },
    job = {},
    runId = '',
    dedupeCandidatesFn = (rows = []) => rows,
    buildEvidencePackFn = () => null,
    llmTargetFields = [],
    fetcherMode = '',
    productId = '',
    category = '',
    sha256Fn = (value = '') => String(value || ''),
    deterministicParser = null,
    componentResolver = null,
    llmSatisfiedFields = new Set(),
    anchors = {},
    isIdentityLockedFieldFn = () => false,
    isAnchorLockedFn = () => false,
    runtimeOverrides = {},
    goldenExamples = [],
    llmContext = {},
    runtimeFieldRulesEngine = null,
    llmRetryReasonByUrl = new Map(),
    phase08BatchRows = [],
  } = runtimeContext;
  const {
    extractCandidatesLLMFn = async () => ({
      identityCandidates: {},
      fieldCandidates: [],
      conflicts: [],
      notes: []
    }),
    shouldQueueLlmRetryFn = () => false,
    runPhase08SourceIngestionPhaseFn = () => ({ phase08FieldContexts, phase08PrimeRows }),
    mergePhase08RowsFn = (rows = []) => rows,
    runSourceLlmFieldCandidatePhaseFn = () => ({ llmFieldCandidates: [] }),
    enrichFieldCandidatesWithEvidenceRefsFn = (rows = []) => rows,
    extractTemporalSignalsFn = () => ({}),
    runSourceIdentityCandidateMergePhaseFn = () => ({ mergedIdentityCandidates: {} }),
    runSourceIdentityEvaluationPhaseFn = () => ({
      anchorCheck: { majorConflicts: [] },
      identity: {},
      identityGatedCandidates: [],
      anchorStatus: '',
      manufacturerBrandMismatch: false,
      parserHealth: {}
    }),
    buildCandidateFieldMapFn = () => ({}),
    evaluateAnchorConflictsFn = () => ({}),
    evaluateSourceIdentityFn = () => ({}),
    applyIdentityGateToCandidatesFn = (rows = []) => rows,
    computeParserHealthFn = () => ({}),
    buildSourceArtifactsContextPhaseFn = () => ({
      artifactRefs: {},
      staticDomStats: {},
      staticDomAuditRejectedCount: 0,
      structuredStats: {},
      structuredSnippetRows: [],
      structuredErrors: [],
      pdfExtractionMeta: {}
    }),
    runSourceFinalizationPhaseFn = async (payload = {}) => ({
      llmSourcesUsed: payload.llmSourcesUsed || 0,
      llmCandidatesAccepted: payload.llmCandidatesAccepted || 0
    }),
  } = phaseFns;
  const sourceFinalizationContext = contracts.sourceFinalization || context.sourceFinalizationContext || {};

  maybeApplyBlockedDomainCooldownFn({
    source,
    statusCode: sourceStatusCode,
    message: String(pageData?.error || ''),
    blockedDomainHitCount,
    blockedDomainThreshold,
    blockedDomainsApplied,
    planner,
    logger,
    normalizeHostTokenFn,
    hostFromHttpUrlFn,
  });

  const manufacturerRobotsSource =
    source.role === 'manufacturer' &&
    isRobotsTxtUrlFn(source.url);
  const manufacturerSitemapSource =
    source.role === 'manufacturer' &&
    (
      isSitemapUrlFn(source.url) ||
      hasSitemapXmlSignalsFn(pageData.html)
    );
  if (!manufacturerRobotsSource && !manufacturerSitemapSource) {
    planner?.discoverFromHtml?.(source.url, pageData.html);
  }
  if (source.role === 'manufacturer') {
    if (manufacturerRobotsSource) {
      planner?.discoverFromRobots?.(source.url, pageData.html);
    }
    if (manufacturerSitemapSource) {
      planner?.discoverFromSitemap?.(source.url, pageData.html);
    }
  }

  const sourceUrl = pageData.finalUrl || source.url;
  const discoveryOnlySource = isDiscoveryOnlySourceUrlFn(sourceUrl);
  const endpointIntel = mineEndpointSignalsFn({
    source,
    pageData,
    criticalFields: [...(categoryConfig.criticalFieldSet || new Set())],
    networkScanLimit: Math.max(50, Number(config.endpointNetworkScanLimit || 600)),
    limit: Math.max(1, Number(config.endpointSignalLimit || 30)),
    suggestionLimit: Math.max(1, Number(config.endpointSuggestionLimit || 12))
  });
  const fingerprint = buildSiteFingerprintFn({ source, pageData });

  if (source.role === 'manufacturer') {
    for (const suggestion of endpointIntel.nextBestUrls || []) {
      if (!isLikelyIndexableEndpointUrlFn(suggestion.url)) {
        continue;
      }
      if (!isSafeManufacturerFollowupUrlFn(source, suggestion.url)) {
        continue;
      }
      planner?.enqueue?.(suggestion.url, `endpoint:${source.url}`);
    }
  }

  const extraction = discoveryOnlySource
    ? {
      identityCandidates: {},
      fieldCandidates: [],
      staticDom: {
        parserStats: {
          mode: '',
          accepted_field_candidates: 0,
          rejected_field_candidates: 0,
          parse_error_count: 0
        },
        auditRejectedFieldCandidates: []
      },
      structuredMetadata: {
        stats: {
          json_ld_count: 0,
          microdata_count: 0,
          opengraph_count: 0,
          structured_candidates: 0,
          structured_rejected_candidates: 0
        },
        snippetRows: [],
        errors: []
      }
    }
    : extractCandidatesFromPageFn({
      host: source.host,
      html: pageData.html,
      canonicalUrl: sourceUrl,
      title: pageData.title,
      ldjsonBlocks: pageData.ldjsonBlocks,
      embeddedState: pageData.embeddedState,
      networkResponses: pageData.networkResponses,
      structuredMetadata: pageData.structuredMetadata || null,
      staticDomExtractorEnabled: config.staticDomExtractorEnabled !== false,
      staticDomMode: config.staticDomMode || 'cheerio',
      htmlTableExtractorV2: config.htmlTableExtractorV2 !== false,
      staticDomTargetMatchThreshold: Number(config.staticDomTargetMatchThreshold || 0.55),
      staticDomMaxEvidenceSnippets: Number(config.staticDomMaxEvidenceSnippets || 120),
      identityTarget: jobIdentityLock || {}
    });

  const adapterExtra = discoveryOnlySource
    ? {
      additionalUrls: [],
      fieldCandidates: [],
      identityCandidates: {},
      pdfDocs: [],
      adapterArtifacts: []
    }
    : await adapterManager.extractForPage({
      source,
      pageData,
      job,
      runId
    });

  for (const url of adapterExtra.additionalUrls || []) {
    if (source.role === 'manufacturer' && typeof planner?.isRelevantDiscoveredUrl === 'function') {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        continue;
      }
      if (!planner.isRelevantDiscoveredUrl(parsed, { manufacturerContext: true })) {
        continue;
      }
    }
    planner?.enqueue?.(url, `adapter:${source.url}`);
  }

  const baseDeterministicFieldCandidates = dedupeCandidatesFn([
    ...(extraction.fieldCandidates || []),
    ...(adapterExtra.fieldCandidates || [])
  ]);
  let deterministicFieldCandidates = [...baseDeterministicFieldCandidates];

  let llmExtraction = {
    identityCandidates: {},
    fieldCandidates: [],
    conflicts: [],
    notes: []
  };
  let evidencePack = null;
  const evidenceEligibleSource =
    !discoveryOnlySource &&
    sourceStatusCode > 0 &&
    sourceStatusCode < 500;
  if (evidenceEligibleSource) {
    evidencePack = buildEvidencePackFn({
      source: {
        ...source,
        status: sourceStatusCode,
        finalUrl: pageData.finalUrl || source.url,
        fetchedAt: new Date().toISOString(),
        fetchMethod: fetcherMode,
        productId,
        category
      },
      pageData: {
        ...pageData,
        domSnippet: domSnippetArtifact
      },
      adapterExtra,
      config,
      targetFields: llmTargetFields,
      deterministicCandidates: baseDeterministicFieldCandidates
    });

    if (evidencePack && screenshotUri) {
      const visualAssetId = `img_${sha256Fn(`${artifactHostKey}|${screenshotUri}`).slice(0, 12)}`;
      const visualAsset = {
        id: visualAssetId,
        kind: 'screenshot_capture',
        source_id: String(evidencePack?.meta?.source_id || source.host || '').trim(),
        source_url: String(pageData.finalUrl || source.url || '').trim(),
        file_uri: screenshotFileUri || screenshotUri,
        mime_type: String(screenshotArtifact?.mime_type || '').trim() || null,
        content_hash: String(screenshotArtifact?.content_hash || '').trim() || null,
        width: Number(screenshotArtifact?.width || 0) || null,
        height: Number(screenshotArtifact?.height || 0) || null,
        size_bytes: Buffer.isBuffer(screenshotArtifact?.bytes)
          ? screenshotArtifact.bytes.length
          : (Number.isFinite(Number(screenshotArtifact?.bytes)) ? Number(screenshotArtifact.bytes) : null),
        captured_at: String(screenshotArtifact?.captured_at || new Date().toISOString()).trim()
      };
      const existingVisualAssets = Array.isArray(evidencePack.visual_assets)
        ? evidencePack.visual_assets
        : [];
      evidencePack.visual_assets = [
        ...existingVisualAssets,
        visualAsset
      ];
      evidencePack.meta = {
        ...(evidencePack.meta || {}),
        visual_artifacts: {
          ...(evidencePack.meta?.visual_artifacts || {}),
          screenshot_uri: screenshotFileUri || screenshotUri,
          screenshot_content_hash: String(screenshotArtifact?.content_hash || '').trim() || '',
          dom_snippet_uri: domSnippetUri || '',
          dom_snippet_content_hash: String(domSnippetArtifact?.content_hash || '').trim() || ''
        }
      };
    }
  }

  if (deterministicParser && evidencePack) {
    const parserCandidates = deterministicParser.extractFromEvidencePack(evidencePack, {
      targetFields: llmTargetFields
    });
    if (parserCandidates.length > 0) {
      deterministicFieldCandidates = dedupeCandidatesFn([
        ...deterministicFieldCandidates,
        ...parserCandidates
      ]);
    }
  }

  if (componentResolver) {
    deterministicFieldCandidates = componentResolver.resolveFromCandidates(deterministicFieldCandidates);
  }

  const deterministicFilledFieldSet = new Set(
    deterministicFieldCandidates
      .filter((row) => String(row?.value || '').trim().toLowerCase() !== 'unk')
      .map((row) => String(row?.field || '').trim())
      .filter(Boolean)
  );
  const llmTargetFieldsForSource = llmTargetFields.filter((field) => (
    !deterministicFilledFieldSet.has(field) &&
    !llmSatisfiedFields.has(field) &&
    !isIdentityLockedFieldFn(field) &&
    !isAnchorLockedFn(field, anchors)
  ));

  const llmEligibleSource =
    !runtimeOverrides.disable_llm &&
    Boolean(evidencePack) &&
    sourceStatusCode < 400 &&
    llmTargetFieldsForSource.length > 0;
  let llmSkipReason = '';
  if (llmEligibleSource) {
    llmExtraction = await extractCandidatesLLMFn({
      job,
      categoryConfig,
      evidencePack,
      goldenExamples,
      targetFields: llmTargetFieldsForSource,
      config,
      logger,
      llmContext,
      componentDBs: runtimeFieldRulesEngine?.componentDBs || {},
      knownValues: runtimeFieldRulesEngine?.knownValues || {}
    });
  } else {
    llmSkipReason = discoveryOnlySource
      ? 'discovery_only_source'
      : sourceStatusCode >= 500
        ? 'http_status_source_unavailable'
        : sourceStatusCode >= 400
          ? 'http_status_not_extractable'
          : runtimeOverrides.disable_llm
            ? 'runtime_override_disable_llm'
            : llmTargetFieldsForSource.length === 0
              ? 'no_remaining_llm_target_fields'
              : 'source_not_extractable';
    logger?.info?.('llm_extract_skipped_source', {
      url: source.url,
      status: sourceStatusCode || null,
      reason: llmSkipReason
    });
    if (shouldQueueLlmRetryFn({
      reason: llmSkipReason,
      status: sourceStatusCode,
      discoveryOnly: discoveryOnlySource
    })) {
      llmRetryReasonByUrl.set(sourceUrl, llmSkipReason);
      logger?.info?.('llm_retry_source_queued', {
        url: sourceUrl,
        reason: llmSkipReason
      });
    }
  }

  const phase08SourceIngestionPhase = runPhase08SourceIngestionPhaseFn({
    llmExtraction,
    source,
    phase08BatchRows,
    phase08FieldContexts,
    phase08PrimeRows,
    normalizeHostTokenFn,
    hostFromHttpUrlFn,
    mergePhase08RowsFn,
  });
  phase08FieldContexts = phase08SourceIngestionPhase.phase08FieldContexts;
  phase08PrimeRows = phase08SourceIngestionPhase.phase08PrimeRows;

  const sourceLlmFieldCandidatePhase = runSourceLlmFieldCandidatePhaseFn({
    llmExtraction,
    llmEligibleSource,
    anchors,
    sourceUrl,
    llmRetryReasonByUrl,
    logger,
    isIdentityLockedFieldFn,
    isAnchorLockedFn,
  });
  const llmFieldCandidates = sourceLlmFieldCandidatePhase.llmFieldCandidates;

  const mergedFieldCandidates = dedupeCandidatesFn([
    ...deterministicFieldCandidates,
    ...llmFieldCandidates
  ]);
  const mergedFieldCandidatesWithEvidence = enrichFieldCandidatesWithEvidenceRefsFn(
    mergedFieldCandidates,
    evidencePack
  );
  const temporalSignals = extractTemporalSignalsFn({
    source,
    pageData,
    fieldCandidates: mergedFieldCandidatesWithEvidence
  });

  const identityCandidateMergePhase = runSourceIdentityCandidateMergePhaseFn({
    extractionIdentityCandidates: extraction.identityCandidates,
    adapterIdentityCandidates: adapterExtra.identityCandidates,
    llmIdentityCandidates: llmExtraction.identityCandidates,
    identityLock: jobIdentityLock,
  });
  const mergedIdentityCandidates = identityCandidateMergePhase.mergedIdentityCandidates;

  const sourceIdentityEvaluationPhase = runSourceIdentityEvaluationPhaseFn({
    source,
    pageData,
    mergedIdentityCandidates,
    mergedFieldCandidatesWithEvidence,
    anchors,
    jobIdentityLock,
    config,
    categoryConfig,
    endpointIntel,
    buildCandidateFieldMapFn,
    evaluateAnchorConflictsFn,
    evaluateSourceIdentityFn,
    applyIdentityGateToCandidatesFn,
    computeParserHealthFn,
  });
  const anchorCheck = sourceIdentityEvaluationPhase.anchorCheck;
  const identity = sourceIdentityEvaluationPhase.identity;
  const identityGatedCandidates = sourceIdentityEvaluationPhase.identityGatedCandidates;
  const anchorStatus = sourceIdentityEvaluationPhase.anchorStatus;
  const manufacturerBrandMismatch = sourceIdentityEvaluationPhase.manufacturerBrandMismatch;
  const parserHealth = sourceIdentityEvaluationPhase.parserHealth;

  const sourceArtifactsContextPhase = buildSourceArtifactsContextPhaseFn({
    artifactHostKey,
    screenshotUri,
    screenshotFileUri,
    screenshotArtifact,
    domSnippetUri,
    domSnippetArtifact,
    extraction,
    evidencePack,
  });
  const artifactRefs = sourceArtifactsContextPhase.artifactRefs;
  const staticDomStats = sourceArtifactsContextPhase.staticDomStats;
  const staticDomAuditRejectedCount = sourceArtifactsContextPhase.staticDomAuditRejectedCount;
  const structuredStats = sourceArtifactsContextPhase.structuredStats;
  const structuredSnippetRows = sourceArtifactsContextPhase.structuredSnippetRows;
  const structuredErrors = sourceArtifactsContextPhase.structuredErrors;
  const pdfExtractionMeta = sourceArtifactsContextPhase.pdfExtractionMeta;

  const sourceFinalizationPhasePayload = {
    source,
    pageData,
    discoveryOnlySource,
    identity,
    sourceUrl,
    sourceStatusCode,
    mergedIdentityCandidates,
    mergedFieldCandidatesWithEvidence: identityGatedCandidates,
    anchorCheck,
    anchorStatus,
    endpointIntel,
    temporalSignals,
    evidencePack,
    artifactHostKey,
    artifactRefs,
    fingerprint,
    parserHealth,
    manufacturerBrandMismatch,
    llmExtraction,
    fetchContentType,
    fetchDurationMs,
    sourceFetchOutcome,
    hostBudgetRow,
    parseStartedAtMs,
    llmFieldCandidates,
    domSnippetArtifact,
    adapterExtra,
    staticDomStats,
    staticDomAuditRejectedCount,
    structuredStats,
    structuredSnippetRows,
    structuredErrors,
    pdfExtractionMeta,
    screenshotUri,
    domSnippetUri,
    pageArtifactsPersisted,
    pageHtmlUri,
    ldjsonUri,
    embeddedStateUri,
    networkResponsesUri,
    llmSourcesUsed,
    llmCandidatesAccepted,
  };
  const sourceFinalizationPhase = await runSourceFinalizationPhaseFn(
    isGroupedPhaseContract(sourceFinalizationContext)
      ? {
        ...sourceFinalizationPhasePayload,
        context: sourceFinalizationContext,
      }
      : {
        ...sourceFinalizationContext,
        ...sourceFinalizationPhasePayload,
      }
  );
  llmSourcesUsed = sourceFinalizationPhase.llmSourcesUsed;
  llmCandidatesAccepted = sourceFinalizationPhase.llmCandidatesAccepted;

  return {
    phase08FieldContexts,
    phase08PrimeRows,
    llmSourcesUsed,
    llmCandidatesAccepted
  };
}
