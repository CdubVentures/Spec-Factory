import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSourceExtractionPhaseContext,
  runSourceExtractionPhase,
} from '../src/features/indexing/orchestration/index.js';

function createGroupedExtractionContext({ runSourceFinalizationPhaseFn } = {}) {
  return buildSourceExtractionPhaseContext({
    maybeApplyBlockedDomainCooldownFn() {},
    blockedDomainHitCount: new Map(),
    blockedDomainThreshold: 2,
    blockedDomainsApplied: new Set(),
    planner: {
      discoverFromHtml() {},
      discoverFromRobots() {},
      discoverFromSitemap() {},
      enqueue() {},
    },
    logger: { info() {}, warn() {}, error() {} },
    normalizeHostTokenFn: (value = '') => String(value || '').trim().toLowerCase(),
    hostFromHttpUrlFn: () => 'example.com',
    isRobotsTxtUrlFn: () => false,
    isSitemapUrlFn: () => false,
    hasSitemapXmlSignalsFn: () => false,
    isDiscoveryOnlySourceUrlFn: () => false,
    mineEndpointSignalsFn: () => ({ nextBestUrls: [] }),
    categoryConfig: { criticalFieldSet: new Set() },
    config: {
      endpointNetworkScanLimit: 100,
      endpointSignalLimit: 10,
      endpointSuggestionLimit: 3,
      llmEnabled: false,
    },
    buildSiteFingerprintFn: () => ({ fingerprint: 'fp' }),
    isLikelyIndexableEndpointUrlFn: () => false,
    isSafeManufacturerFollowupUrlFn: () => true,
    extractCandidatesFromPageFn: () => ({
      identityCandidates: {},
      fieldCandidates: [],
      staticDom: {
        parserStats: {},
        auditRejectedFieldCandidates: [],
      },
      structuredMetadata: {
        stats: {},
        snippetRows: [],
        errors: [],
      },
    }),
    jobIdentityLock: { brand: 'Example', model: 'Mouse' },
    adapterManager: {
      extractForPage: async () => ({
        additionalUrls: [],
        fieldCandidates: [],
        identityCandidates: {},
        pdfDocs: [],
        adapterArtifacts: [],
      }),
    },
    job: {
      identityLock: { brand: 'Example', model: 'Mouse' },
      productId: 'mouse-example',
      category: 'mouse',
    },
    runId: 'run-grouped',
    dedupeCandidatesFn: (rows = []) => rows.filter(Boolean),
    buildEvidencePackFn: () => null,
    llmTargetFields: [],
    fetcherMode: 'http',
    productId: 'mouse-example',
    category: 'mouse',
    sha256Fn: (value = '') => `hash(${value})`,
    deterministicParser: null,
    componentResolver: null,
    llmSatisfiedFields: new Set(),
    anchors: {},
    isIdentityLockedFieldFn: () => false,
    isAnchorLockedFn: () => false,
    runtimeOverrides: { disable_llm: false },
    extractCandidatesLLMFn: async () => ({
      identityCandidates: {},
      fieldCandidates: [],
      conflicts: [],
      notes: [],
    }),
    goldenExamples: [],
    llmContext: {},
    runtimeFieldRulesEngine: null,
    shouldQueueLlmRetryFn: () => false,
    llmRetryReasonByUrl: new Map(),
    runPhase08SourceIngestionPhaseFn: () => ({
      phase08FieldContexts: {},
      phase08PrimeRows: [],
    }),
    phase08BatchRows: [],
    mergePhase08RowsFn: (rows = []) => rows,
    runSourceLlmFieldCandidatePhaseFn: () => ({ llmFieldCandidates: [] }),
    enrichFieldCandidatesWithEvidenceRefsFn: (rows = []) => rows,
    extractTemporalSignalsFn: () => ({ freshness_days: 0 }),
    runSourceIdentityCandidateMergePhaseFn: () => ({ mergedIdentityCandidates: {} }),
    runSourceIdentityEvaluationPhaseFn: ({ mergedFieldCandidatesWithEvidence }) => ({
      anchorCheck: { majorConflicts: [] },
      identity: { match: true, score: 0.95 },
      identityGatedCandidates: mergedFieldCandidatesWithEvidence,
      anchorStatus: 'ok',
      manufacturerBrandMismatch: false,
      parserHealth: { score: 1 },
    }),
    buildCandidateFieldMapFn: () => ({}),
    evaluateAnchorConflictsFn: () => ({}),
    evaluateSourceIdentityFn: () => ({}),
    applyIdentityGateToCandidatesFn: (rows = []) => rows,
    computeParserHealthFn: () => ({ score: 1 }),
    buildSourceArtifactsContextPhaseFn: () => ({
      artifactRefs: { host_key: 'example.com__0001' },
      staticDomStats: {},
      staticDomAuditRejectedCount: 0,
      structuredStats: {},
      structuredSnippetRows: [],
      structuredErrors: [],
      pdfExtractionMeta: {},
    }),
    runSourceFinalizationPhaseFn,
    sourceResults: [],
    successfulSourceMetaByUrl: new Map(),
    frontierDb: {
      recordFetch: () => ({}),
      recordYield: () => ({}),
    },
    repairSearchEnabled: false,
    repairDedupeRule: 'domain_once',
    repairQueryByDomain: new Set(),
    requiredFields: [],
    buildRepairSearchQueryFn: () => '',
    maybeEmitRepairQueryFn: () => {},
    toFloatFn: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    artifactsByHost: {},
    adapterArtifacts: [],
    collectKnownCandidatesFromSourceFn: () => ({
      sourceFieldValueMap: {},
      knownCandidatesFromSource: [],
    }),
    markSatisfiedLlmFieldsFn: () => {},
    bumpHostOutcomeFn: () => {},
    noteHostRetryTsFn: () => {},
    applyHostBudgetBackoffFn: () => {},
    resolveHostBudgetStateFn: () => ({ score: 100, state: 'active' }),
    runSourceResultsAppendPhaseFn: () => {},
    runSourceEvidenceIndexPhaseFn: () => {},
    runSourcePostFetchStatusPhaseFn: () => {},
    runSourceKnownCandidatesPhaseFn: async () => ({
      sourceFieldValueMap: {},
      knownCandidatesFromSource: [],
    }),
    runSourceConflictTelemetryPhaseFn: () => {},
    runSourceFrontierPersistencePhaseFn: () => ({
      frontierFetchRow: null,
      pageContentHash: '',
      pageBytes: 0,
    }),
    runSourceArtifactAggregationPhaseFn: () => ({
      llmSourcesUsedDelta: 0,
      llmCandidatesAcceptedDelta: 0,
    }),
    runSourceHostBudgetPhaseFn: () => ({
      hostBudgetAfterSource: {},
    }),
    runSourceProcessedTelemetryPhaseFn: () => {},
    buildSourceProcessedPayloadFn: () => ({}),
  });
}



test('runSourceExtractionPhase filters manufacturer adapter follow-up urls through planner relevancy before enqueue', async () => {
  const enqueued = [];
  const relevancyChecks = [];

  const result = await runSourceExtractionPhase({
    source: { url: 'https://razer.com/gaming-mice/razer-viper-v3-pro', host: 'razer.com', role: 'manufacturer' },
    pageData: {
      html: '<html><body>specs</body></html>',
      finalUrl: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
      title: 'Razer Viper V3 Pro'
    },
    sourceStatusCode: 200,
    fetchDurationMs: 80,
    fetchContentType: 'text/html',
    sourceFetchOutcome: 'ok',
    parseStartedAtMs: 1234,
    hostBudgetRow: { started_count: 1, completed_count: 1 },
    domSnippetArtifact: { content_hash: 'sha256:dom' },
    artifactHostKey: 'razer.com__0009',
    domSnippetUri: 's3://dom',
    screenshotArtifact: null,
    screenshotUri: '',
    screenshotFileUri: '',
    phase08FieldContexts: {},
    phase08PrimeRows: [],
    llmSourcesUsed: 0,
    llmCandidatesAccepted: 0,
    context: {
      maybeApplyBlockedDomainCooldownFn() {},
      blockedDomainHitCount: new Map(),
      blockedDomainThreshold: 2,
      blockedDomainsApplied: new Set(),
      planner: {
        discoverFromHtml() {},
        discoverFromRobots() {},
        discoverFromSitemap() {},
        isRelevantDiscoveredUrl(parsed, context) {
          relevancyChecks.push({ url: parsed.toString(), context });
          return parsed.pathname === '/support/razer-viper-v3-pro';
        },
        enqueue(url, reason) {
          enqueued.push({ url, reason });
        }
      },
      logger: { info() {}, warn() {}, error() {} },
      normalizeHostTokenFn: (value) => String(value || '').trim().toLowerCase(),
      hostFromHttpUrlFn: () => 'razer.com',
      isRobotsTxtUrlFn: () => false,
      isSitemapUrlFn: () => false,
      hasSitemapXmlSignalsFn: () => false,
      isDiscoveryOnlySourceUrlFn: () => false,
      mineEndpointSignalsFn: () => ({ nextBestUrls: [] }),
      categoryConfig: { criticalFieldSet: new Set() },
      config: {
        endpointNetworkScanLimit: 100,
        endpointSignalLimit: 10,
        endpointSuggestionLimit: 3,
        llmEnabled: false,
      },
      buildSiteFingerprintFn: () => ({ fingerprint: 'fp' }),
      isLikelyIndexableEndpointUrlFn: () => false,
      isSafeManufacturerFollowupUrlFn: () => true,
      extractCandidatesFromPageFn: () => ({
        identityCandidates: {},
        fieldCandidates: [],
        staticDom: {
          parserStats: {},
          auditRejectedFieldCandidates: []
        },
        structuredMetadata: {
          stats: {},
          snippetRows: [],
          errors: []
        }
      }),
      jobIdentityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      adapterManager: {
        extractForPage: async () => ({
          additionalUrls: [
            'https://www.razer.com/razerstore-support',
            'https://www.razer.com/au-en/razerstore-support',
            'https://www.razer.com/support/razer-viper-v3-pro'
          ],
          fieldCandidates: [],
          identityCandidates: {},
          pdfDocs: [],
          adapterArtifacts: []
        })
      },
      job: {
        identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
        productId: 'mouse-razer-viper-v3-pro',
        category: 'mouse'
      },
      runId: 'run-filter',
      dedupeCandidatesFn: (rows) => rows.filter(Boolean),
      buildEvidencePackFn: () => null,
      llmTargetFields: [],
      fetcherMode: 'playwright',
      productId: 'mouse-razer-viper-v3-pro',
      category: 'mouse',
      sha256Fn: (value) => `hash(${value})`,
      deterministicParser: null,
      componentResolver: null,
      llmSatisfiedFields: new Set(),
      anchors: {},
      isIdentityLockedFieldFn: () => false,
      isAnchorLockedFn: () => false,
      runtimeOverrides: { disable_llm: false },
      extractCandidatesLLMFn: async () => ({
        identityCandidates: {},
        fieldCandidates: [],
        conflicts: [],
        notes: []
      }),
      goldenExamples: [],
      llmContext: {},
      runtimeFieldRulesEngine: null,
      shouldQueueLlmRetryFn: () => false,
      llmRetryReasonByUrl: new Map(),
      runPhase08SourceIngestionPhaseFn: () => ({
        phase08FieldContexts: {},
        phase08PrimeRows: []
      }),
      phase08BatchRows: [],
      mergePhase08RowsFn: (rows) => rows,
      runSourceLlmFieldCandidatePhaseFn: () => ({ llmFieldCandidates: [] }),
      enrichFieldCandidatesWithEvidenceRefsFn: (rows) => rows,
      extractTemporalSignalsFn: () => ({ freshness_days: 0 }),
      runSourceIdentityCandidateMergePhaseFn: () => ({ mergedIdentityCandidates: {} }),
      runSourceIdentityEvaluationPhaseFn: ({ mergedFieldCandidatesWithEvidence }) => ({
        anchorCheck: { majorConflicts: [] },
        identity: { match: true, score: 0.92 },
        identityGatedCandidates: mergedFieldCandidatesWithEvidence,
        anchorStatus: 'ok',
        manufacturerBrandMismatch: false,
        parserHealth: { score: 1 }
      }),
      buildCandidateFieldMapFn: () => ({}),
      evaluateAnchorConflictsFn: () => ({}),
      evaluateSourceIdentityFn: () => ({}),
      applyIdentityGateToCandidatesFn: (rows) => rows,
      computeParserHealthFn: () => ({ score: 1 }),
      buildSourceArtifactsContextPhaseFn: () => ({
        artifactRefs: { host_key: 'razer.com__0009' },
        staticDomStats: {},
        staticDomAuditRejectedCount: 0,
        structuredStats: {},
        structuredSnippetRows: [],
        structuredErrors: [],
        pdfExtractionMeta: {}
      }),
      runSourceFinalizationPhaseFn: async (payload) => ({
        llmSourcesUsed: payload.llmSourcesUsed,
        llmCandidatesAccepted: payload.llmCandidatesAccepted
      }),
      sourceFinalizationContext: {}
    }
  });

  assert.deepEqual(relevancyChecks, [
    {
      url: 'https://www.razer.com/razerstore-support',
      context: { manufacturerContext: true }
    },
    {
      url: 'https://www.razer.com/au-en/razerstore-support',
      context: { manufacturerContext: true }
    },
    {
      url: 'https://www.razer.com/support/razer-viper-v3-pro',
      context: { manufacturerContext: true }
    }
  ]);
  assert.deepEqual(enqueued, [
    {
      url: 'https://www.razer.com/support/razer-viper-v3-pro',
      reason: 'adapter:https://razer.com/gaming-mice/razer-viper-v3-pro'
    }
  ]);
  assert.equal(result.llmSourcesUsed, 0);
  assert.equal(result.llmCandidatesAccepted, 0);
});

test('runSourceExtractionPhase forwards grouped source finalization contracts through a context boundary', async () => {
  const finalizationCalls = [];
  const context = createGroupedExtractionContext({
    runSourceFinalizationPhaseFn: async (payload) => {
      finalizationCalls.push(payload);
      return {
        llmSourcesUsed: payload.llmSourcesUsed,
        llmCandidatesAccepted: payload.llmCandidatesAccepted,
      };
    },
  });

  await runSourceExtractionPhase({
    source: {
      url: 'https://example.com/spec',
      host: 'example.com',
      role: 'review',
    },
    pageData: {
      html: '<html><body>specs</body></html>',
      finalUrl: 'https://example.com/spec',
      title: 'Example Spec',
    },
    sourceStatusCode: 200,
    fetchDurationMs: 80,
    fetchContentType: 'text/html',
    sourceFetchOutcome: 'ok',
    parseStartedAtMs: 1234,
    hostBudgetRow: { started_count: 1, completed_count: 1 },
    domSnippetArtifact: { content_hash: 'sha256:dom' },
    artifactHostKey: 'example.com__0001',
    domSnippetUri: 's3://dom',
    screenshotArtifact: null,
    screenshotUri: '',
    screenshotFileUri: '',
    phase08FieldContexts: {},
    phase08PrimeRows: [],
    llmSourcesUsed: 0,
    llmCandidatesAccepted: 0,
    context,
  });

  assert.equal(finalizationCalls.length, 1);
  assert.equal(finalizationCalls[0].context, context.contracts.sourceFinalization);
  assert.equal(finalizationCalls[0].sourceFinalizationContext, undefined);
});

