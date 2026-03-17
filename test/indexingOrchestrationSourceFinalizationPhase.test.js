import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSourceExtractionPhaseContext,
  runSourceFinalizationPhase,
} from '../src/features/indexing/orchestration/index.js';

function toFloat(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

test('runSourceFinalizationPhase consumes grouped context contracts without flat collaborator spreading', async () => {
  const calls = [];
  const sourceResults = [];
  const buildSourceProcessedPayloadFn = () => ({ event: 'source_processed' });
  const extractionContext = buildSourceExtractionPhaseContext({
    logger: { info() {}, warn() {}, error() {} },
    planner: { enqueue() {} },
    config: {},
    category: 'mouse',
    productId: 'mouse-test',
    sourceResults,
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
    sha256Fn: (value = '') => `hash:${String(value)}`,
    toFloatFn: toFloat,
    artifactsByHost: {},
    adapterArtifacts: [],
    fetcherMode: 'http',
    llmSatisfiedFields: new Set(),
    anchors: {},
    traceWriter: null,
    collectKnownCandidatesFromSourceFn: () => ({
      sourceFieldValueMap: { weight_g: '59' },
      knownCandidatesFromSource: [{ field: 'weight_g', value: '59' }],
    }),
    markSatisfiedLlmFieldsFn: () => {
      calls.push(['markSatisfied']);
    },
    bumpHostOutcomeFn: () => {
      calls.push(['bumpHostOutcome']);
    },
    noteHostRetryTsFn: () => {},
    applyHostBudgetBackoffFn: () => {},
    resolveHostBudgetStateFn: () => ({ score: 95, state: 'active' }),
    runSourceResultsAppendPhaseFn: (payload) => {
      calls.push(['append', payload]);
      sourceResults.push({ url: payload.source.url });
    },
    runSourceEvidenceIndexPhaseFn: (payload) => {
      calls.push(['evidence', payload]);
    },
    runSourcePostFetchStatusPhaseFn: (payload) => {
      calls.push(['status', payload]);
    },
    runSourceKnownCandidatesPhaseFn: async (payload) => {
      calls.push(['known', payload]);
      return {
        sourceFieldValueMap: { weight_g: '59' },
        knownCandidatesFromSource: [{ field: 'weight_g', value: '59' }],
      };
    },
    runSourceConflictTelemetryPhaseFn: (payload) => {
      calls.push(['conflicts', payload]);
    },
    runSourceFrontierPersistencePhaseFn: (payload) => {
      calls.push(['frontier', payload]);
      return {
        frontierFetchRow: { id: 1 },
        pageContentHash: 'hash:page',
        pageBytes: 42,
      };
    },
    runSourceArtifactAggregationPhaseFn: (payload) => {
      calls.push(['artifacts', payload]);
      return {
        llmSourcesUsedDelta: 2,
        llmCandidatesAcceptedDelta: 3,
      };
    },
    runSourceHostBudgetPhaseFn: (payload) => {
      calls.push(['budget', payload]);
      return {
        hostBudgetAfterSource: { state: 'active' },
      };
    },
    runSourceProcessedTelemetryPhaseFn: (payload) => {
      calls.push(['telemetry', payload]);
    },
    buildSourceProcessedPayloadFn,
    runSourceFinalizationPhaseFn: async () => ({
      llmSourcesUsed: 0,
      llmCandidatesAccepted: 0,
    }),
  });

  const result = await runSourceFinalizationPhase({
    context: extractionContext.contracts.sourceFinalization,
    source: {
      url: 'https://example.com/spec',
      host: 'example.com',
      role: 'review',
    },
    pageData: {
      finalUrl: 'https://example.com/spec',
      html: '<html></html>',
    },
    sourceStatusCode: 200,
    sourceUrl: 'https://example.com/spec',
    identity: {},
    mergedIdentityCandidates: {},
    mergedFieldCandidatesWithEvidence: [],
    anchorCheck: {},
    anchorStatus: 'ok',
    endpointIntel: {},
    temporalSignals: {},
    evidencePack: {},
    artifactHostKey: 'example.com__0001',
    artifactRefs: { host_key: 'example.com__0001' },
    fingerprint: {},
    parserHealth: {},
    llmExtraction: {},
    fetchContentType: 'text/html',
    fetchDurationMs: 50,
    sourceFetchOutcome: 'ok',
    hostBudgetRow: {},
    parseStartedAtMs: 1000,
    llmFieldCandidates: [],
    domSnippetArtifact: null,
    adapterExtra: { adapterArtifacts: [] },
    staticDomStats: {},
    staticDomAuditRejectedCount: 0,
    structuredStats: {},
    structuredSnippetRows: [],
    structuredErrors: [],
    pdfExtractionMeta: {},
    screenshotUri: '',
    domSnippetUri: '',
    pageArtifactsPersisted: false,
    pageHtmlUri: '',
    ldjsonUri: '',
    embeddedStateUri: '',
    networkResponsesUri: '',
    llmSourcesUsed: 1,
    llmCandidatesAccepted: 2,
  });

  assert.equal(result.llmSourcesUsed, 3);
  assert.equal(result.llmCandidatesAccepted, 5);
  assert.equal(sourceResults.length, 1);
  assert.equal(calls[0][0], 'append');
  assert.equal(calls[3][0], 'known');
  assert.equal(
    calls.find(([name]) => name === 'known')[1].collectKnownCandidatesFromSourceFn,
    extractionContext.contracts.sourceFinalization.phaseFns.collectKnownCandidatesFromSourceFn,
  );
  assert.equal(
    calls.find(([name]) => name === 'frontier')[1].repairQueryContext.repairSearchEnabled,
    true,
  );
  assert.equal(
    calls.find(([name]) => name === 'telemetry')[1].buildSourceProcessedPayloadFn,
    buildSourceProcessedPayloadFn,
  );
});

