import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLearningStoreHintsForRun } from '../src/features/indexing/orchestration/bootstrap/loadLearningStoreHintsForRun.js';
import {
  applyResearchArtifactsContext,
  buildConstraintAnalysisContext,
  buildValidationGateContext,
  filterResumeSeedUrls,
  runDeterministicCriticPhase,
  runHypothesisFollowups,
  runLearningGatePhase,
  runPostLearningUpdatesPhase,
} from '../src/features/indexing/orchestration/index.js';

test('buildConstraintAnalysisContext assembles manufacturer conflict stats, endpoint mining, and constraint graph payload', () => {
  const sourceResults = [
    {
      role: 'manufacturer',
      identity: { match: true },
      anchorCheck: { majorConflicts: [{ field: 'shape' }] },
    },
    {
      role: 'manufacturer',
      identity: { match: false },
      anchorCheck: { majorConflicts: [] },
    },
    {
      role: 'review',
      identity: { match: true },
      anchorCheck: { majorConflicts: [{ field: 'weight_g' }] },
    },
  ];
  const runtimeGateResult = {
    failures: [
      {
        field: 'dpi',
        violations: [
          {
            reason_code: 'compound_range_conflict',
            effective_min: 100,
            effective_max: 200,
            actual: 240,
            sources: ['manufacturer'],
          },
          {
            reason_code: 'other',
          },
        ],
      },
      {
        field: 'weight_g',
        violations: [
          {
            reason_code: 'compound_range_conflict',
            effective_min: 50,
            effective_max: 65,
            actual: 70,
            sources: ['review'],
          },
        ],
      },
    ],
  };
  const normalized = {
    fields: {
      dpi: 240,
      weight_g: 70,
    },
  };
  const provenance = {
    dpi: { confidence: 0.9 },
    weight_g: { confidence: 0.7 },
  };
  const criticalFieldSet = new Set(['dpi']);
  const endpointMining = { endpoint_count: 7 };
  const constraintAnalysis = { violations: [{ field: 'dpi' }] };

  const result = buildConstraintAnalysisContext({
    sourceResults,
    runtimeGateResult,
    normalized,
    provenance,
    categoryConfig: { criticalFieldSet },
    aggregateEndpointSignalsFn: (rows, limit) => {
      assert.equal(rows, sourceResults);
      assert.equal(limit, 80);
      return endpointMining;
    },
    evaluateConstraintGraphFn: (payload) => {
      assert.deepEqual(payload, {
        fields: normalized.fields,
        provenance,
        criticalFieldSet,
        crossValidationFailures: [
          {
            field_key: 'dpi',
            reason_code: 'compound_range_conflict',
            effective_min: 100,
            effective_max: 200,
            actual: 240,
            sources: ['manufacturer'],
          },
          {
            field_key: 'weight_g',
            reason_code: 'compound_range_conflict',
            effective_min: 50,
            effective_max: 65,
            actual: 70,
            sources: ['review'],
          },
        ],
      });
      return constraintAnalysis;
    },
  });

  assert.deepEqual(result.manufacturerSources, [sourceResults[0], sourceResults[1]]);
  assert.equal(result.manufacturerMajorConflicts, 1);
  assert.equal(result.endpointMining, endpointMining);
  assert.equal(result.constraintAnalysis, constraintAnalysis);
});

test('runDeterministicCriticPhase applies critic decisions and refreshes deficit lists', () => {
  const result = runDeterministicCriticPhase({
    normalized: { fields: { dpi: 32000 } },
    provenance: { dpi: { confidence: 0.7 } },
    categoryConfig: { criticalFieldSet: new Set(['dpi']) },
    learnedConstraints: { maxDpi: 26000 },
    fieldsBelowPassTarget: [],
    criticalFieldsBelowPassTarget: [],
    runDeterministicCriticFn: (payload) => {
      assert.equal(payload.normalized.fields.dpi, 32000);
      assert.equal(payload.provenance.dpi.confidence, 0.7);
      assert.equal(payload.fieldReasoning != null, true);
      assert.equal(payload.constraints.maxDpi, 26000);
      return {
        accept: [],
        reject: [{ field: 'dpi', reason: 'max_exceeded' }],
        unknown: [],
      };
    },
  });

  assert.deepEqual(result.criticDecisions, {
    accept: [],
    reject: [{ field: 'dpi', reason: 'max_exceeded' }],
    unknown: [],
  });
  assert.deepEqual(result.fieldsBelowPassTarget, ['dpi']);
  assert.deepEqual(result.criticalFieldsBelowPassTarget, ['dpi']);
});

test('runDeterministicCriticPhase ignores invalid reject rows and preserves existing deficits', () => {
  const result = runDeterministicCriticPhase({
    normalized: { fields: {} },
    provenance: {},
    categoryConfig: { criticalFieldSet: new Set(['weight_g']) },
    learnedConstraints: {},
    fieldsBelowPassTarget: ['dpi'],
    criticalFieldsBelowPassTarget: [],
    runDeterministicCriticFn: () => ({
      reject: [{ reason: 'missing_field' }, null, { field: '' }],
    }),
  });

  assert.deepEqual(result.fieldsBelowPassTarget, ['dpi']);
  assert.deepEqual(result.criticalFieldsBelowPassTarget, []);
});

test('runHypothesisFollowups seeds follow-up URLs, executes queue rounds, and stops when no candidate URLs remain', async () => {
  const infoLogs = [];
  const warnLogs = [];
  const processPlannerQueueCalls = [];
  const buildProvisionalCalls = [];
  const nextBestCalls = [];
  const enqueued = [];
  const provisionalByRound = [
    {
      hypothesisQueue: [
        { url: 'https://existing.example/spec' },
        { url: 'https://new.example/spec-1' },
        { url: 'https://new.example/spec-2' },
      ],
      missingRequiredFields: ['weight_g', 'shape'],
      criticalFieldsBelowPassTarget: ['weight_g'],
    },
    {
      hypothesisQueue: [{ url: 'https://existing.example/spec' }],
      missingRequiredFields: ['shape'],
      criticalFieldsBelowPassTarget: [],
    },
  ];

  const result = await runHypothesisFollowups({
    config: {
      hypothesisAutoFollowupRounds: 2,
      hypothesisFollowupUrlsPerRound: 2,
      maxRunSeconds: 999,
    },
    startMs: 0,
    logger: {
      info(name, payload) {
        infoLogs.push({ name, payload });
      },
      warn(name, payload) {
        warnLogs.push({ name, payload });
      },
    },
    planner: {
      enqueue(url, reason) {
        enqueued.push({ url, reason });
        return true;
      },
    },
    processPlannerQueueFn: async () => {
      processPlannerQueueCalls.push(true);
    },
    sourceResults: [
      { url: 'https://existing.example/spec', helper: false },
      { url: 'helper://synthetic/seed', helper: true },
    ],
    categoryConfig: { marker: 'categoryConfig' },
    fieldOrder: ['weight_g', 'shape'],
    anchors: { marker: 'anchors' },
    job: {
      identityLock: { brand: 'Logitech' },
    },
    productId: 'mouse-product',
    category: 'mouse',
    requiredFields: ['weight_g'],
    sourceIntel: {
      data: { domains: { 'existing.example': {} } },
    },
    buildProvisionalHypothesisQueueFn: (args) => {
      buildProvisionalCalls.push(args);
      return provisionalByRound[buildProvisionalCalls.length - 1];
    },
    nextBestUrlsFromHypothesesFn: ({ hypothesisQueue, limit }) => {
      nextBestCalls.push({ hypothesisQueue, limit });
      return hypothesisQueue;
    },
    isHelperSyntheticSourceFn: (source) => Boolean(source.helper),
    nowFn: () => 1000,
  });

  assert.deepEqual(result, {
    hypothesisFollowupRoundsExecuted: 1,
    hypothesisFollowupSeededUrls: 2,
  });
  assert.equal(processPlannerQueueCalls.length, 1);
  assert.equal(buildProvisionalCalls.length, 2);
  assert.equal(buildProvisionalCalls[0].sourceResults.length, 1);
  assert.equal(nextBestCalls.length, 2);
  assert.deepEqual(enqueued, [
    { url: 'https://new.example/spec-1', reason: 'hypothesis_followup:1' },
    { url: 'https://new.example/spec-2', reason: 'hypothesis_followup:1' },
  ]);
  assert.deepEqual(warnLogs, []);
  assert.equal(
    infoLogs.some(
      (row) => row.name === 'hypothesis_followup_round_started' && row.payload.round === 1 && row.payload.enqueued_urls === 2,
    ),
    true,
  );
  assert.equal(
    infoLogs.some(
      (row) => row.name === 'hypothesis_followup_skipped' && row.payload.round === 2 && row.payload.reason === 'no_candidate_urls',
    ),
    true,
  );
});

test('runHypothesisFollowups stops immediately when run time budget is exhausted', async () => {
  const warnLogs = [];
  let processPlannerQueueCalled = false;

  const result = await runHypothesisFollowups({
    config: {
      hypothesisAutoFollowupRounds: 3,
      hypothesisFollowupUrlsPerRound: 2,
      maxRunSeconds: 1,
    },
    startMs: 0,
    logger: {
      info() {},
      warn(name, payload) {
        warnLogs.push({ name, payload });
      },
    },
    planner: {
      enqueue() {
        return true;
      },
    },
    processPlannerQueueFn: async () => {
      processPlannerQueueCalled = true;
    },
    sourceResults: [],
    categoryConfig: {},
    fieldOrder: [],
    anchors: {},
    job: {},
    productId: 'mouse-product',
    category: 'mouse',
    requiredFields: [],
    sourceIntel: { data: { domains: {} } },
    buildProvisionalHypothesisQueueFn: () => ({
      hypothesisQueue: [],
      missingRequiredFields: [],
      criticalFieldsBelowPassTarget: [],
    }),
    nextBestUrlsFromHypothesesFn: () => [],
    isHelperSyntheticSourceFn: () => false,
    nowFn: () => 2000,
  });

  assert.deepEqual(result, {
    hypothesisFollowupRoundsExecuted: 0,
    hypothesisFollowupSeededUrls: 0,
  });
  assert.equal(processPlannerQueueCalled, false);
  assert.deepEqual(warnLogs, [
    {
      name: 'max_run_seconds_reached',
      payload: { maxRunSeconds: 1 },
    },
  ]);
});

test('runLearningGatePhase delegates gate evaluation and event emission with canonical payloads', () => {
  const evaluateCalls = [];
  const emitCalls = [];
  const logger = {};
  const runtimeFieldRulesEngine = { id: 'rules-engine' };
  const expectedResult = {
    gateResults: [{ fieldKey: 'weight_g', status: 'accepted' }],
    acceptedUpdates: [{ fieldKey: 'weight_g' }],
  };

  const result = runLearningGatePhase({
    fieldOrder: ['weight_g'],
    fields: { weight_g: '59g' },
    provenance: { weight_g: [{ source: 'a' }] },
    category: 'mouse',
    runId: 'run_1',
    runtimeFieldRulesEngine,
    config: { selfImproveEnabled: true },
    logger,
    evaluateFieldLearningGatesFn: (payload) => {
      evaluateCalls.push(payload);
      return expectedResult;
    },
    emitLearningGateEventsFn: (payload) => {
      emitCalls.push(payload);
    },
  });

  assert.equal(result, expectedResult);
  assert.deepEqual(evaluateCalls, [{
    fieldOrder: ['weight_g'],
    fields: { weight_g: '59g' },
    provenance: { weight_g: [{ source: 'a' }] },
    category: 'mouse',
    runId: 'run_1',
    fieldRulesEngine: runtimeFieldRulesEngine,
    config: { selfImproveEnabled: true },
  }]);
  assert.deepEqual(emitCalls, [{
    gateResults: expectedResult.gateResults,
    logger,
    runId: 'run_1',
  }]);
});

test('loadLearningStoreHintsForRun returns null when self-improve is disabled', async () => {
  const result = await loadLearningStoreHintsForRun({
    config: {
      selfImproveEnabled: false,
    },
  });

  assert.equal(result, null);
});

test('loadLearningStoreHintsForRun opens SpecDb, reads hints, and closes the database', async () => {
  const storeCtorCalls = [];
  const closeCalls = [];

  class FakeSpecDb {
    constructor({ dbPath, category }) {
      this.dbPath = dbPath;
      this.category = category;
      this.db = { marker: 'db' };
    }

    close() {
      closeCalls.push({
        dbPath: this.dbPath,
        category: this.category,
      });
    }
  }

  const result = await loadLearningStoreHintsForRun({
    config: {
      selfImproveEnabled: true,
      specDbDir: '.specfactory_tmp/',
    },
    category: 'Mouse',
    roundContext: {
      missing_required_fields: ['weight_g'],
    },
    requiredFields: ['sensor'],
    categoryConfig: {
      fieldOrder: ['weight_g', 'sensor'],
    },
    importSpecDbFn: async () => ({ SpecDb: FakeSpecDb }),
    createUrlMemoryStoreFn: (db) => {
      storeCtorCalls.push({ kind: 'urlMemory', db });
      return { kind: 'urlMemory' };
    },
    createDomainFieldYieldStoreFn: (db) => {
      storeCtorCalls.push({ kind: 'domainFieldYield', db });
      return { kind: 'domainFieldYield' };
    },
    createFieldAnchorsStoreFn: (db) => {
      storeCtorCalls.push({ kind: 'fieldAnchors', db });
      return { kind: 'fieldAnchors' };
    },
    createComponentLexiconStoreFn: (db) => {
      storeCtorCalls.push({ kind: 'componentLexicon', db });
      return { kind: 'componentLexicon' };
    },
    normalizeFieldListFn: (fields, options) => {
      assert.deepEqual(fields, ['weight_g']);
      assert.deepEqual(options, { fieldOrder: ['weight_g', 'sensor'] });
      return ['weight_g'];
    },
    readLearningHintsFromStoresFn: ({ stores, category, focusFields, config }) => ({
      stores,
      category,
      focusFields,
      config,
      loaded: true,
    }),
  });

  assert.deepEqual(storeCtorCalls, [
    { kind: 'urlMemory', db: { marker: 'db' } },
    { kind: 'domainFieldYield', db: { marker: 'db' } },
    { kind: 'fieldAnchors', db: { marker: 'db' } },
    { kind: 'componentLexicon', db: { marker: 'db' } },
  ]);
  assert.deepEqual(closeCalls, [
    {
      dbPath: '.specfactory_tmp/mouse/spec.sqlite',
      category: 'mouse',
    },
  ]);
  assert.deepEqual(result, {
    stores: {
      urlMemory: { kind: 'urlMemory' },
      domainFieldYield: { kind: 'domainFieldYield' },
      fieldAnchors: { kind: 'fieldAnchors' },
      componentLexicon: { kind: 'componentLexicon' },
    },
    category: 'mouse',
    focusFields: ['weight_g'],
    config: {
      selfImproveEnabled: true,
      specDbDir: '.specfactory_tmp/',
    },
    loaded: true,
  });
});

test('runPostLearningUpdatesPhase delegates category brain + component library updates and stamps summary fields', async () => {
  const categoryCalls = [];
  const componentCalls = [];
  const summary = {
    source_intel: { domain_stats_key: 'k1' },
  };
  const expectedCategoryBrain = {
    keys: { latest: 'category-brain/latest.json' },
    promotion_update: { promoted: 2 },
    ignored: 'x',
  };
  const expectedComponentUpdate = {
    changed_components: 5,
  };

  const result = await runPostLearningUpdatesPhase({
    storage: { id: 'storage' },
    config: { selfImproveEnabled: true },
    category: 'mouse',
    job: { id: 'job' },
    normalized: { fields: { weight_g: '59' } },
    summary,
    provenance: { weight_g: [{ url: 'a' }] },
    sourceResults: [{ url: 'a' }],
    discoveryResult: { selected_sources: [] },
    runId: 'run_1',
    updateCategoryBrainFn: async (payload) => {
      categoryCalls.push(payload);
      return expectedCategoryBrain;
    },
    updateComponentLibraryFn: async (payload) => {
      componentCalls.push(payload);
      return expectedComponentUpdate;
    },
  });

  assert.deepEqual(categoryCalls, [{
    storage: { id: 'storage' },
    config: { selfImproveEnabled: true },
    category: 'mouse',
    job: { id: 'job' },
    normalized: { fields: { weight_g: '59' } },
    summary,
    provenance: { weight_g: [{ url: 'a' }] },
    sourceResults: [{ url: 'a' }],
    discoveryResult: { selected_sources: [] },
    runId: 'run_1',
  }]);
  assert.deepEqual(componentCalls, [{
    storage: { id: 'storage' },
    normalized: { fields: { weight_g: '59' } },
    summary,
    provenance: { weight_g: [{ url: 'a' }] },
  }]);
  assert.deepEqual(summary.category_brain, {
    keys: expectedCategoryBrain.keys,
    promotion_update: expectedCategoryBrain.promotion_update,
  });
  assert.equal(summary.component_library, expectedComponentUpdate);
  assert.deepEqual(result, {
    categoryBrain: expectedCategoryBrain,
    componentUpdate: expectedComponentUpdate,
  });
});

function parseJsonBuffer(buffer) {
  return JSON.parse(Buffer.from(buffer).toString('utf8'));
}

test('applyResearchArtifactsContext is a no-op when research mode is disabled', async () => {
  const writes = [];
  const summary = {};

  await applyResearchArtifactsContext({
    uberAggressiveMode: false,
    frontierDb: null,
    uberOrchestrator: null,
    storage: {
      resolveOutputKey: () => 'unused',
      writeObject: async (...args) => writes.push(args),
    },
    category: 'mouse',
    productId: 'mouse-product',
    runId: 'run_123',
    discoveryResult: {},
    previousFinalSpec: {},
    normalized: {},
    fieldOrder: [],
    summary,
    runtimeMode: 'balanced',
  });

  assert.equal(writes.length, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(summary, 'research'), false);
});

test('applyResearchArtifactsContext persists research artifacts and stamps summary pointers', async () => {
  const writes = [];
  const summary = {};

  const storage = {
    resolveOutputKey: (...parts) => parts.join('/'),
    writeObject: async (key, body, meta) => {
      writes.push({ key, body, meta });
    },
  };

  await applyResearchArtifactsContext({
    uberAggressiveMode: true,
    frontierDb: {
      frontierSnapshot: ({ limit }) => ({ limit, rows: [{ url: 'https://example.com/spec' }] }),
    },
    uberOrchestrator: {
      buildCoverageDelta: ({ previousSpec, currentSpec, fieldOrder }) => ({
        previous_known_count: Object.keys(previousSpec).length,
        current_known_count: Object.keys(currentSpec).length,
        delta_known: 1,
        gained_fields: fieldOrder.slice(0, 1),
        lost_fields: [],
      }),
    },
    storage,
    category: 'mouse',
    productId: 'mouse-product',
    runId: 'run_456',
    discoveryResult: {
      uber_search_plan: { source: 'planner', queries: ['mouse specs'] },
      search_journal: [{ q: 'mouse specs', provider: 'searxng' }],
      queries: ['mouse specs'],
    },
    previousFinalSpec: {
      fields: {
        weight_g: '55',
      },
    },
    normalized: {
      fields: {
        weight_g: '54',
        battery_life: '95h',
      },
    },
    fieldOrder: ['weight_g', 'battery_life'],
    summary,
    runtimeMode: 'uber_aggressive',
  });

  assert.equal(writes.length, 4);
  assert.equal(writes[0].key.endsWith('/search_plan.json'), true);
  assert.equal(writes[1].key.endsWith('/search_journal.jsonl'), true);
  assert.equal(writes[2].key.endsWith('/frontier_snapshot.json'), true);
  assert.equal(writes[3].key.endsWith('/coverage_delta.json'), true);

  assert.equal(writes[0].meta.contentType, 'application/json');
  assert.equal(writes[1].meta.contentType, 'application/x-ndjson');
  assert.equal(writes[2].meta.contentType, 'application/json');
  assert.equal(writes[3].meta.contentType, 'application/json');

  const searchPlanPayload = parseJsonBuffer(writes[0].body);
  assert.equal(searchPlanPayload.source, 'planner');

  const frontierSnapshotPayload = parseJsonBuffer(writes[2].body);
  assert.equal(frontierSnapshotPayload.limit, 200);

  const coverageDeltaPayload = parseJsonBuffer(writes[3].body);
  assert.equal(coverageDeltaPayload.delta_known, 1);
  assert.equal(Array.isArray(coverageDeltaPayload.gained_fields), true);

  assert.equal(summary.research.mode, 'uber_aggressive');
  assert.equal(summary.research.search_plan_key.endsWith('/search_plan.json'), true);
  assert.equal(summary.research.search_journal_key.endsWith('/search_journal.jsonl'), true);
  assert.equal(summary.research.frontier_snapshot_key.endsWith('/frontier_snapshot.json'), true);
  assert.equal(summary.research.coverage_delta_key.endsWith('/coverage_delta.json'), true);
});

test('filterResumeSeedUrls keeps eligible urls and records frontier-cooled resume seeds', () => {
  const skippedUrls = new Set();
  const logs = [];

  const result = filterResumeSeedUrls({
    urls: [
      'https://cooldown.example/spec',
      'https://eligible.example/spec',
      'https://pathdead.example/spec'
    ],
    frontierDb: {
      shouldSkipUrl(url) {
        if (url === 'https://cooldown.example/spec') {
          return {
            skip: true,
            reason: 'cooldown',
            next_retry_ts: '2026-03-24T14:37:46.806Z'
          };
        }
        if (url === 'https://pathdead.example/spec') {
          return {
            skip: true,
            reason: 'path_dead_pattern',
            next_retry_ts: null
          };
        }
        return { skip: false, reason: null };
      }
    },
    resumeCooldownSkippedUrls: skippedUrls,
    logger: {
      info(eventName, payload) {
        logs.push({ eventName, payload });
      }
    },
    seedKind: 'resume_pending_seed'
  });

  assert.deepEqual(result, ['https://eligible.example/spec']);
  assert.deepEqual(
    [...skippedUrls],
    ['https://cooldown.example/spec', 'https://pathdead.example/spec']
  );
  assert.deepEqual(logs, [
    {
      eventName: 'indexing_resume_seed_skipped',
      payload: {
        url: 'https://cooldown.example/spec',
        seed_kind: 'resume_pending_seed',
        skip_reason: 'cooldown',
        next_retry_ts: '2026-03-24T14:37:46.806Z'
      }
    },
    {
      eventName: 'indexing_resume_seed_skipped',
      payload: {
        url: 'https://pathdead.example/spec',
        seed_kind: 'resume_pending_seed',
        skip_reason: 'path_dead_pattern',
        next_retry_ts: null
      }
    }
  ]);
});

test('filterResumeSeedUrls returns original urls unchanged when frontier state is unavailable', () => {
  const result = filterResumeSeedUrls({
    urls: ['https://eligible.example/spec'],
    frontierDb: null,
    resumeCooldownSkippedUrls: new Set(),
    logger: null,
    seedKind: 'resume_pending_seed'
  });

  assert.deepEqual(result, ['https://eligible.example/spec']);
});

test('buildValidationGateContext computes gate/publishability context and stamps normalized quality fields', () => {
  const callOrder = [];
  const normalized = {
    fields: {
      shape: 'symmetrical',
      weight_g: 63,
    },
    quality: {
      notes: [],
    },
  };
  const requiredFields = ['shape', 'weight_g'];
  const fieldOrder = ['shape', 'weight_g', 'battery_life_h'];
  const categoryConfig = {
    schema: {
      editorial_fields: ['notes'],
    },
  };
  const provenance = {
    shape: { confidence: 0.8 },
    weight_g: { confidence: 0.9 },
  };
  const consensus = { agreementScore: 0.77 };
  const identityGate = {
    validated: true,
    needsReview: false,
    reasonCodes: ['identity_ok'],
  };
  const targets = {
    targetCompleteness: 0.85,
    targetConfidence: 0.8,
  };

  const result = buildValidationGateContext({
    normalized,
    requiredFields,
    fieldOrder,
    categoryConfig,
    identityConfidence: 0.88,
    provenance,
    allAnchorConflicts: [{ severity: 'MINOR' }, { severity: 'MAJOR' }],
    consensus,
    identityGate,
    config: {},
    targets,
    anchorMajorConflictsCount: 1,
    criticalFieldsBelowPassTarget: ['battery_life_h'],
    computeCompletenessRequiredFn: (normalizedArg, requiredFieldsArg) => {
      callOrder.push('computeCompletenessRequired');
      assert.equal(normalizedArg, normalized);
      assert.equal(requiredFieldsArg, requiredFields);
      return { completenessRequired: 0.75 };
    },
    computeCoverageOverallFn: (payload) => {
      callOrder.push('computeCoverageOverall');
      assert.deepEqual(payload, {
        fields: normalized.fields,
        fieldOrder,
        editorialFields: ['notes'],
      });
      return { coverageOverall: 0.65 };
    },
    computeConfidenceFn: (payload) => {
      callOrder.push('computeConfidence');
      assert.deepEqual(payload, {
        identityConfidence: 0.88,
        provenance,
        anchorConflictsCount: 2,
        agreementScore: 0.77,
      });
      return 0.82;
    },
    evaluateValidationGateFn: (payload) => {
      callOrder.push('evaluateValidationGate');
      assert.deepEqual(payload, {
        identityGateValidated: true,
        identityConfidence: 0.88,
        anchorMajorConflictsCount: 1,
        completenessRequired: 0.75,
        targetCompleteness: 0.85,
        confidence: 0.82,
        targetConfidence: 0.8,
        criticalFieldsBelowPassTarget: ['battery_life_h'],
      });
      return {
        validated: false,
        reasons: ['coverage_low'],
        validatedReason: 'COVERAGE_LOW',
      };
    },
  });

  assert.deepEqual(callOrder, [
    'computeCompletenessRequired',
    'computeCoverageOverall',
    'computeConfidence',
    'evaluateValidationGate',
  ]);
  assert.deepEqual(result.completenessStats, { completenessRequired: 0.75 });
  assert.deepEqual(result.coverageStats, { coverageOverall: 0.65 });
  assert.equal(result.confidence, 0.82);
  assert.equal(result.gate.coverageOverallPercent, 65);
  assert.equal(result.publishable, false);
  assert.deepEqual(result.publishBlockers, ['coverage_low', 'identity_ok']);
  assert.equal(normalized.quality.completeness_required, 0.75);
  assert.equal(normalized.quality.coverage_overall, 0.65);
  assert.equal(normalized.quality.confidence, 0.82);
  assert.equal(normalized.quality.validated, false);
  assert.deepEqual(normalized.quality.notes, ['coverage_low']);
});

test('buildValidationGateContext sets fallback publish blocker when gate has no reasons and identity reason codes are empty', () => {
  const normalized = { fields: {}, quality: {} };
  const result = buildValidationGateContext({
    normalized,
    requiredFields: [],
    fieldOrder: [],
    categoryConfig: { schema: { editorial_fields: [] } },
    identityConfidence: 0.55,
    provenance: {},
    allAnchorConflicts: [],
    consensus: { agreementScore: 0 },
    identityGate: {
      validated: false,
      needsReview: true,
      reasonCodes: [],
    },
    config: {},
    targets: {
      targetCompleteness: 0.8,
      targetConfidence: 0.8,
    },
    anchorMajorConflictsCount: 0,
    criticalFieldsBelowPassTarget: [],
    computeCompletenessRequiredFn: () => ({ completenessRequired: 0 }),
    computeCoverageOverallFn: () => ({ coverageOverall: 0 }),
    computeConfidenceFn: () => 0,
    evaluateValidationGateFn: () => ({
      validated: false,
      reasons: [],
      validatedReason: '',
    }),
  });

  assert.deepEqual(result.publishBlockers, ['MODEL_AMBIGUITY_ALERT']);
});

test('buildValidationGateContext defaults the publish threshold to 0.75 when the callsite omits it', () => {
  const normalized = { fields: { shape: 'symmetrical' }, quality: {} };
  const result = buildValidationGateContext({
    normalized,
    requiredFields: ['shape'],
    fieldOrder: ['shape'],
    categoryConfig: { schema: { editorial_fields: [] } },
    identityConfidence: 0.74,
    provenance: { shape: { confirmations: 2 } },
    allAnchorConflicts: [],
    consensus: { agreementScore: 0.9 },
    identityGate: {
      validated: true,
      needsReview: false,
      reasonCodes: [],
    },
    config: {},
    targets: {
      targetCompleteness: 0.8,
      targetConfidence: 0.8,
    },
    anchorMajorConflictsCount: 0,
    criticalFieldsBelowPassTarget: [],
    identityFull: true,
    computeCompletenessRequiredFn: () => ({ completenessRequired: 1 }),
    computeCoverageOverallFn: () => ({ coverageOverall: 1 }),
    computeConfidenceFn: () => 0.95,
    evaluateValidationGateFn: () => ({
      validated: true,
      reasons: [],
      validatedReason: 'OK',
    }),
  });

  assert.equal(result.publishable, false);
  assert.deepEqual(result.publishBlockers, ['OK']);
});
