import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProcessPlannerQueueExecutionContexts } from '../src/features/indexing/orchestration/index.js';

function createMinimalExtractionContext() {
  return {
    runtimeOverrides: {},
    maybeApplyBlockedDomainCooldown: () => {},
    blockedDomainHitCount: new Map(),
    blockedDomainThreshold: 1,
    blockedDomainsApplied: new Set(),
    planner: {
      discoverFromHtml: () => {},
      discoverFromRobots: () => {},
      discoverFromSitemap: () => {},
      enqueue: () => {},
      markFieldsFilled: () => {},
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    normalizeHostToken: (value = '') => String(value || ''),
    hostFromHttpUrl: () => '',
    isRobotsTxtUrl: () => false,
    isSitemapUrl: () => false,
    hasSitemapXmlSignals: () => false,
    isDiscoveryOnlySourceUrl: () => false,
    mineEndpointSignals: () => ({
      endpointSignals: [],
      nextBestUrls: [],
    }),
    categoryConfig: { criticalFieldSet: new Set() },
    config: { llmEnabled: false },
    buildSiteFingerprint: () => ({}),
    isLikelyIndexableEndpointUrl: () => false,
    isSafeManufacturerFollowupUrl: () => false,
    extractCandidatesFromPage: () => ({
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
    job: { identityLock: {} },
    adapterManager: {
      extractForPage: async () => ({
        additionalUrls: [],
        fieldCandidates: [],
        identityCandidates: {},
        pdfDocs: [],
        adapterArtifacts: [],
      }),
    },
    runId: 'run-test',
    dedupeCandidates: (rows = []) => rows,
    buildEvidencePack: () => null,
    llmTargetFields: [],
    fetcherMode: 'http',
    productId: 'mouse-test',
    category: 'mouse',
    sha256: (value = '') => `sha256:${String(value)}`,
    deterministicParser: null,
    componentResolver: null,
    llmSatisfiedFields: new Set(),
    anchors: {},
    isIdentityLockedField: () => false,
    isAnchorLocked: () => false,
    extractCandidatesLLM: async () => ({
      identityCandidates: {},
      fieldCandidates: [],
      conflicts: [],
      notes: [],
    }),
    goldenExamples: [],
    llmContext: {},
    runtimeFieldRulesEngine: null,
    shouldQueueLlmRetry: () => false,
    llmRetryReasonByUrl: new Map(),
    phase08BatchRows: [],
    mergePhase08Rows: (rows = []) => rows,
    enrichFieldCandidatesWithEvidenceRefs: (rows = []) => rows,
    extractTemporalSignals: () => ({}),
    buildCandidateFieldMap: () => ({}),
    evaluateAnchorConflicts: () => ({
      majorConflicts: [],
      conflicts: [],
    }),
    evaluateSourceIdentity: () => ({
      match: false,
      score: 0,
      reasons: [],
      criticalConflicts: [],
    }),
    applyIdentityGateToCandidates: (rows = []) => rows,
    computeParserHealth: () => ({}),
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
    buildRepairSearchQuery: () => '',
    toFloat: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    artifactsByHost: {},
    adapterArtifacts: [],
    markSatisfiedLlmFields: () => {},
    bumpHostOutcome: () => {},
    noteHostRetryTs: () => {},
    applyHostBudgetBackoff: () => {},
    resolveHostBudgetState: () => ({ score: 100, state: 'active' }),
    traceWriter: null,
    buildSourceFetchClassificationPhase: () => ({
      fetchContentType: 'text/html',
      sourceFetchOutcome: 'ok',
    }),
    classifyFetchOutcome: () => 'ok',
    runSourceArtifactsPhase: async ({ artifactSequence = 0 } = {}) => ({
      domSnippetArtifact: null,
      artifactHostKey: 'example.com__0000',
      domSnippetUri: '',
      screenshotArtifact: null,
      screenshotUri: '',
      screenshotFileUri: '',
      nextArtifactSequence: artifactSequence + 1,
    }),
    runArtifactsBase: 'runs/test',
    storage: null,
    buildDomSnippetArtifact: () => null,
    toInt: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    screenshotExtension: () => 'jpeg',
    screenshotMimeType: () => 'image/jpeg',
    sha256Buffer: () => 'sha256:buffer',
    fetcher: { fetch: async () => ({}) },
    fetchHostConcurrencyGate: { run: async ({ task }) => task() },
    fetchWithModeFn: async () => ({}),
    runWithRetry: async (task) => task(),
    resumeFetchFailedUrls: new Set(),
    resumeCooldownSkippedUrls: new Set(),
    syncRuntimeOverrides: () => {},
    applyRuntimeOverridesToPlanner: () => {},
    runtimeControlKey: 'runtime',
    wait: async () => {},
    startMs: Date.now(),
    ensureHostBudgetRow: () => ({}),
    hostBudgetByHost: new Map(),
    attemptedSourceUrls: new Set(),
  };
}

test('buildProcessPlannerQueueExecutionContexts wires real source extraction through processing context', async () => {
  const context = createMinimalExtractionContext();
  const executionContexts = buildProcessPlannerQueueExecutionContexts(context);

  const result = await executionContexts.sourceFetchProcessingDispatchContext.sourceProcessingContext.runSourceExtractionFn({
    source: {
      url: 'https://example.com/specs',
      host: 'example.com',
      role: 'review',
      approvedDomain: true,
    },
    pageData: {
      html: '<html><body>weight 54g</body></html>',
      finalUrl: 'https://example.com/specs',
      status: 200,
      title: 'Example Spec',
    },
    sourceStatusCode: 200,
    fetchDurationMs: 120,
    fetchContentType: 'text/html',
    sourceFetchOutcome: 'ok',
    parseStartedAtMs: 0,
    hostBudgetRow: {},
    artifactHostKey: 'example.com__0000',
    domSnippetArtifact: null,
    domSnippetUri: '',
    screenshotArtifact: null,
    screenshotUri: '',
    screenshotFileUri: '',
    phase08FieldContexts: {},
    phase08PrimeRows: [],
    llmSourcesUsed: 0,
    llmCandidatesAccepted: 0,
  });

  assert.equal(context.sourceResults.length, 1);
  assert.equal(context.sourceResults[0].status, 200);
  assert.equal(context.sourceResults[0].finalUrl, 'https://example.com/specs');
  assert.deepEqual(result.phase08FieldContexts, {});
  assert.deepEqual(result.phase08PrimeRows, []);
  assert.equal(result.llmSourcesUsed, 0);
  assert.equal(result.llmCandidatesAccepted, 0);
  assert.ok(Object.isFrozen(executionContexts.sourceExtractionPhaseContext.contracts.sourceFinalization));
  assert.equal(
    executionContexts.sourceExtractionPhaseContext.contracts.sourceFinalization,
    executionContexts.sourceExtractionPhaseContext.sourceFinalizationContext,
  );
});
