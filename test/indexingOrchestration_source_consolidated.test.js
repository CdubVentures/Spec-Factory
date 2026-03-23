import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSourceExtractionPhaseContext,
  maybeEmitRepairQuery,
  runAggressiveExtractionPhase,
  runDedicatedSyntheticSourceIngestionPhase,
  runSourceExtractionPhase,
  runSourceFetchPhase,
} from '../src/features/indexing/orchestration/index.js';

test('runAggressiveExtractionPhase runs aggressive orchestrator and refreshes deficits when extraction is enabled', async () => {
  const runCalls = [];
  const loggerWarnCalls = [];
  const runtimeEvidencePack = {
    meta: { raw_html: 'old-html', source: 'existing-pack' },
    references: [{ id: 1 }],
    snippets: [{ id: 's1' }],
  };

  const result = await runAggressiveExtractionPhase({
    config: { aggressiveModeEnabled: true },
    roundContext: {},
    storage: { marker: 'storage' },
    logger: {
      warn: (...args) => loggerWarnCalls.push(args),
    },
    category: 'mouse',
    productId: 'mouse-1',
    runId: 'run-1',
    identity: { brand: 'Logitech' },
    normalized: { fields: {} },
    provenance: {},
    fieldOrder: ['dpi'],
    categoryConfig: { criticalFieldSet: new Set(['dpi']) },
    discoveryResult: { enabled: true },
    sourceResults: [{ url: 'https://example.com/spec' }],
    artifactsByHost: { 'example.com': { domHtml: '<html>new-html</html>' } },
    runtimeEvidencePack,
    fieldsBelowPassTarget: ['dpi'],
    criticalFieldsBelowPassTarget: ['dpi'],
    selectAggressiveDomHtmlFn: (artifactsByHost) => {
      assert.equal(artifactsByHost['example.com'].domHtml, '<html>new-html</html>');
      return '<html>new-html</html>';
    },
    createAggressiveOrchestratorFn: (payload) => {
      assert.equal(payload.storage.marker, 'storage');
      assert.equal(payload.config.aggressiveModeEnabled, true);
      assert.equal(typeof payload.logger.warn, 'function');
      return {
        run: async (runPayload) => {
          runCalls.push(runPayload);
          assert.equal(runPayload.category, 'mouse');
          assert.equal(runPayload.productId, 'mouse-1');
          assert.equal(runPayload.evidencePack.meta.raw_html, '<html>new-html</html>');
          assert.equal(runPayload.evidencePack.references.length, 1);
          return { enabled: true, stage: 'completed' };
        },
      };
    },
    refreshFieldsBelowPassTargetFn: (payload) => {
      assert.equal(payload.fieldOrder[0], 'dpi');
      return {
        fieldsBelowPassTarget: ['weight_g'],
        criticalFieldsBelowPassTarget: [],
      };
    },
  });

  assert.equal(runCalls.length, 1);
  assert.equal(loggerWarnCalls.length, 0);
  assert.deepEqual(result.aggressiveExtraction, { enabled: true, stage: 'completed' });
  assert.deepEqual(result.fieldsBelowPassTarget, ['weight_g']);
  assert.deepEqual(result.criticalFieldsBelowPassTarget, []);
});

test('runDedicatedSyntheticSourceIngestionPhase appends adapter artifacts and enriches synthetic sources', async () => {
  const callOrder = [];
  const adapterArtifacts = [{ name: 'existing-artifact' }];
  const sourceResults = [{ url: 'https://existing.example/spec' }];
  const dedicatedSyntheticSource = {
    url: 'helper://dedicated/1',
    title: 'Dedicated source',
    identityCandidates: { brand: 'Logitech' },
    fieldCandidates: [{ field: 'shape', value: 'ambidextrous' }],
  };
  const helperSyntheticSource = {
    url: 'helper://supportive/1',
    title: 'Supportive source',
    identityCandidates: { brand: 'Razer' },
    fieldCandidates: [{ field: 'weight_g', value: '54' }],
  };

  const result = await runDedicatedSyntheticSourceIngestionPhase({
    adapterManager: {
      async runDedicatedAdapters(payload) {
        callOrder.push('runDedicatedAdapters');
        assert.deepEqual(payload, {
          job: { identityLock: { brand: 'Logitech' } },
          runId: 'run-1',
          storage: { id: 'storage' },
        });
        return {
          adapterArtifacts: [{ name: 'dedicated-artifact' }],
          syntheticSources: [dedicatedSyntheticSource],
        };
      },
    },
    job: { identityLock: { brand: 'Logitech' } },
    runId: 'run-1',
    storage: { id: 'storage' },
    helperSupportiveSyntheticSources: [helperSyntheticSource],
    adapterArtifacts,
    sourceResults,
    anchors: { shape: 'shape' },
    config: {},
    buildCandidateFieldMapFn: (rows) => {
      callOrder.push('buildCandidateFieldMap');
      assert.equal(Array.isArray(rows), true);
      return { connection: 'wired' };
    },
    evaluateAnchorConflictsFn: (anchors, candidateMap) => {
      callOrder.push('evaluateAnchorConflicts');
      assert.deepEqual(anchors, { shape: 'shape' });
      assert.deepEqual(candidateMap, { connection: 'wired' });
      return callOrder.filter((step) => step === 'evaluateAnchorConflicts').length === 1
        ? { majorConflicts: [{ field: 'shape' }], conflicts: [{ field: 'shape' }] }
        : { majorConflicts: [], conflicts: [{ field: 'weight_g' }] };
    },
    evaluateSourceIdentityFn: (sourceLike, identityLock, options) => {
      callOrder.push('evaluateSourceIdentity');
      assert.equal(sourceLike.connectionHint, 'wired');
      assert.deepEqual(identityLock, { brand: 'Logitech' });
      assert.deepEqual(options, {});
      return { match: true, score: 0.88 };
    },
  });

  assert.deepEqual(callOrder, [
    'runDedicatedAdapters',
    'buildCandidateFieldMap',
    'evaluateAnchorConflicts',
    'evaluateSourceIdentity',
    'buildCandidateFieldMap',
    'evaluateAnchorConflicts',
    'evaluateSourceIdentity',
  ]);
  assert.deepEqual(adapterArtifacts, [
    { name: 'existing-artifact' },
    { name: 'dedicated-artifact' },
  ]);
  assert.equal(sourceResults.length, 3);
  assert.equal(sourceResults[1].url, 'helper://dedicated/1');
  assert.equal(sourceResults[1].anchorStatus, 'failed_major_conflict');
  assert.equal(sourceResults[2].url, 'helper://supportive/1');
  assert.equal(sourceResults[2].anchorStatus, 'minor_conflicts');
  assert.deepEqual(result, {
    dedicated: {
      adapterArtifacts: [{ name: 'dedicated-artifact' }],
      syntheticSources: [dedicatedSyntheticSource],
    },
    allSyntheticSources: [dedicatedSyntheticSource, helperSyntheticSource],
    appendedSyntheticSourceCount: 2,
  });
});

function toFloat(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

test('buildSourceExtractionPhaseContext assembles a frozen grouped source finalization contract', () => {
  const logger = { info() {}, warn() {}, error() {} };
  const planner = { enqueue() {} };
  const runSourceResultsAppendPhaseFn = () => {};
  const runSourceEvidenceIndexPhaseFn = () => {};
  const runSourcePostFetchStatusPhaseFn = () => {};
  const runSourceKnownCandidatesPhaseFn = async () => ({
    sourceFieldValueMap: {},
    knownCandidatesFromSource: [],
  });
  const runSourceConflictTelemetryPhaseFn = () => {};
  const runSourceFrontierPersistencePhaseFn = () => ({
    frontierFetchRow: null,
    pageContentHash: '',
    pageBytes: 0,
  });
  const runSourceArtifactAggregationPhaseFn = () => ({
    llmSourcesUsedDelta: 0,
    llmCandidatesAcceptedDelta: 0,
  });
  const runSourceHostBudgetPhaseFn = () => ({
    hostBudgetAfterSource: {},
  });
  const runSourceProcessedTelemetryPhaseFn = () => {};
  const buildSourceProcessedPayloadFn = () => ({});
  const runSourceFinalizationPhaseFn = async () => ({
    llmSourcesUsed: 0,
    llmCandidatesAccepted: 0,
  });

  const context = buildSourceExtractionPhaseContext({
    logger,
    planner,
    config: {},
    category: 'mouse',
    productId: 'mouse-test',
    sourceResults: [],
    successfulSourceMetaByUrl: new Map(),
    frontierDb: { id: 'frontier' },
    repairSearchEnabled: true,
    repairDedupeRule: 'domain_once',
    repairQueryByDomain: new Set(),
    requiredFields: ['weight_g'],
    jobIdentityLock: { brand: 'Logitech' },
    normalizeHostTokenFn: (value = '') => String(value || ''),
    hostFromHttpUrlFn: () => 'example.com',
    buildRepairSearchQueryFn: () => 'repair query',
    maybeEmitRepairQueryFn: () => {},
    sha256Fn: (value = '') => String(value || ''),
    toFloatFn: toFloat,
    artifactsByHost: {},
    adapterArtifacts: [],
    llmSatisfiedFields: new Set(),
    anchors: {},
    collectKnownCandidatesFromSourceFn: () => ({
      sourceFieldValueMap: {},
      knownCandidatesFromSource: [],
    }),
    markSatisfiedLlmFieldsFn: () => {},
    bumpHostOutcomeFn: () => {},
    noteHostRetryTsFn: () => {},
    applyHostBudgetBackoffFn: () => {},
    resolveHostBudgetStateFn: () => ({ score: 100, state: 'active' }),
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
    runSourceFinalizationPhaseFn,
  });

  assert.ok(Object.isFrozen(context));
  assert.ok(Object.isFrozen(context.runtimeContext));
  assert.ok(Object.isFrozen(context.phaseFns));
  assert.ok(Object.isFrozen(context.contracts));
  assert.equal(context.phaseFns.runSourceFinalizationPhaseFn, runSourceFinalizationPhaseFn);
  assert.equal(context.contracts.sourceFinalization, context.sourceFinalizationContext);
  assert.ok(Object.isFrozen(context.contracts.sourceFinalization));
  assert.equal(context.contracts.sourceFinalization.runtimeContext.logger, logger);
  assert.equal(context.contracts.sourceFinalization.runtimeContext.planner, planner);
  assert.equal(
    context.contracts.sourceFinalization.phaseFns.runSourceResultsAppendPhaseFn,
    runSourceResultsAppendPhaseFn,
  );
  assert.equal(
    context.contracts.sourceFinalization.repairQueryContext.buildRepairSearchQueryFn(),
    'repair query',
  );
});

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

test('runSourceFetchPhase routes static manual-style sources through http when the source does not require JS', async () => {
  const requestedModes = [];

  const result = await runSourceFetchPhase({
    workerId: 'fetch-static-manual',
    source: {
      url: 'https://www.manua.ls/logitech/g-pro-x-superlight-2-dex/manual',
      host: 'manua.ls',
      role: 'other',
      requires_js: false
    },
    sourceHost: 'manua.ls',
    hostBudgetRow: { started_count: 0, completed_count: 0 },
    fetchWithModeFn: async (source, mode) => {
      requestedModes.push(mode);
      return {
        status: 200,
        html: '<html>manual</html>',
        fetchTelemetry: {
          fetcher_kind: mode
        }
      };
    },
    fetcherMode: 'playwright',
    config: { sourceFetchWrapperAttempts: 1, sourceFetchWrapperBackoffMs: 0 },
    logger: {
      info() {},
      warn() {},
      error() {}
    },
    fetchHostConcurrencyGate: {
      run: async ({ task }) => task()
    },
    runWithRetryFn: async (task) => task(),
    classifyFetchOutcomeFn: () => 'ok',
    bumpHostOutcomeFn() {},
    applyHostBudgetBackoffFn() {},
    resolveHostBudgetStateFn: () => ({ score: 10, state: 'open' }),
    maybeApplyBlockedDomainCooldownFn() {},
  });

  assert.equal(result.ok, true);
  assert.equal(requestedModes[0], 'http');
});
