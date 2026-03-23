import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapRunEventIndexing } from '../src/features/indexing/orchestration/bootstrap/bootstrapRunEventIndexing.js';
import { buildRunProductFinalizationSummary } from '../src/features/indexing/orchestration/finalize/buildRunProductFinalizationSummary.js';
import { runPlannerProcessingLifecycle } from '../src/features/indexing/orchestration/execution/runPlannerProcessingLifecycle.js';
import { runProductCompletionLifecycle } from '../src/features/indexing/orchestration/finalize/runProductCompletionLifecycle.js';
import { runProductFinalizationDerivation } from '../src/features/indexing/orchestration/finalize/runProductFinalizationDerivation.js';
import {
  buildFinalizationEventPayloads,
  buildFinalizationMetricsContext,
  buildRunCompletedPayload,
  buildRunCompletedPayloadContext,
  buildRunSummaryPayload,
  buildRunSummaryPayloadContext,
  buildSourceExtractionPhaseContext,
  buildSummaryArtifactsContext,
  finalizeRunLifecycle,
  runFinalizationTelemetryPhase,
  runSourceFinalizationPhase,
  runSourceIntelFinalizationPhase,
  runTerminalLearningExportLifecycle,
} from '../src/features/indexing/orchestration/index.js';

test('buildFinalizationEventPayloads builds final needset/phase07/phase08/indexing-schema logger payloads', () => {
  const result = buildFinalizationEventPayloads({
    productId: 'mouse-product',
    runId: 'run_123',
    category: 'mouse',
    needSet: {
      total_fields: 40,
      identity: { state: 'locked' },
      summary: { total: 40, resolved: 36 },
      blockers: { missing: 2 },
      fields: [
        { field_key: 'weight_g', state: 'missing', need_score: 10 },
        { field_key: 'sensor', state: 'missing', need_score: 8 },
        { field_key: 'dpi', state: 'missing', need_score: 6 },
        { field_key: 'polling_rate', state: 'missing', need_score: 4 },
      ],
    },
    needSetRunKey: 'runs/r1/analysis/needset.json',
    phase07PrimeSources: {
      summary: {
        fields_attempted: 8,
        fields_with_hits: 6,
        fields_satisfied_min_refs: 5,
        refs_selected_total: 18,
        distinct_sources_selected: 9,
      },
      fields: [
        {
          field_key: 'weight_g',
          min_refs_required: 2,
          refs_selected: 2,
          min_refs_satisfied: true,
          distinct_sources_required: 2,
          distinct_sources_selected: 2,
          hits: [{ score: 0.77 }],
        },
      ],
    },
    phase07RunKey: 'runs/r1/analysis/phase07_retrieval.json',
    phase08Extraction: {
      summary: {
        batch_count: 2,
        batch_error_count: 1,
        schema_fail_rate: 0.4,
        raw_candidate_count: 10,
        accepted_candidate_count: 7,
        dangling_snippet_ref_count: 3,
        evidence_policy_violation_count: 1,
        min_refs_satisfied_count: 4,
        min_refs_total: 6,
      },
      field_contexts: {
        weight_g: {},
        battery_life: {},
      },
      prime_sources: {
        rows: [{}, {}, {}],
      },
    },
    phase08RunKey: 'runs/r1/analysis/phase08_extraction.json',
    indexingSchemaPackets: {
      sourceCollection: { source_packet_count: 11 },
    },
    sourcePacketsRunKey: 'runs/r1/analysis/source_indexing_extraction_packets.json',
    itemPacketRunKey: 'runs/r1/analysis/item_indexing_extraction_packet.json',
    runMetaPacketRunKey: 'runs/r1/analysis/run_meta_packet.json',
  });

  assert.equal(result.needsetComputedPayload.needset_size, 4);
  assert.equal(result.needsetComputedPayload.needset_key.endsWith('needset.json'), true);
  assert.equal(result.phase07PrimeSourcesBuiltPayload.fields_attempted, 8);
  assert.equal(result.phase07PrimeSourcesBuiltPayload.fields.length, 1);
  assert.equal(result.phase07PrimeSourcesBuiltPayload.fields[0].top_hit_score, 0.77);
  assert.equal(result.phase08ExtractionContextBuiltPayload.batch_count, 2);
  assert.equal(result.phase08ExtractionContextBuiltPayload.field_context_count, 2);
  assert.equal(result.phase08ExtractionContextBuiltPayload.prime_source_rows, 3);
  assert.equal(result.indexingSchemaPacketsWrittenPayload.source_packet_count, 11);
  assert.equal(result.indexingSchemaPacketsWrittenPayload.source_packets_key.endsWith('source_indexing_extraction_packets.json'), true);
});

test('buildFinalizationEventPayloads projects Schema 4 panel data when present on needSet', () => {
  const bundles = [
    { key: 'sensor_performance', label: 'Sensor & Performance', priority: 'core', phase: 'now', fields: [{ key: 'sensor', state: 'missing', bucket: 'core' }] },
  ];
  const profileInfluence = {
    manufacturer_html: 2, manual_pdf: 0, support_docs: 1,
    review_lookup: 0, benchmark_lookup: 0, fallback_web: 1, targeted_single: 0,
    duplicates_suppressed: 1, focused_bundles: 1, targeted_exceptions: 0,
    total_queries: 4, trusted_host_share: 3, docs_manual_share: 0,
  };
  const deltas = [{ field: 'sensor', from: 'missing', to: 'satisfied' }];
  const result = buildFinalizationEventPayloads({
    productId: 'mouse-product',
    runId: 'run_123',
    category: 'mouse',
    needSet: {
      total_fields: 40,
      identity: { state: 'locked' },
      summary: { total: 40, resolved: 36 },
      blockers: { missing: 2 },
      fields: [
        { field_key: 'weight_g', state: 'missing' },
      ],
      bundles,
      profile_influence: profileInfluence,
      deltas,
      round: 1,
      schema_version: 'needset_planner_output.v2',
    },
    needSetRunKey: 'runs/r1/analysis/needset.json',
    phase07PrimeSources: {},
    phase07RunKey: '',
    phase08Extraction: {},
    phase08RunKey: '',
    indexingSchemaPackets: {},
    sourcePacketsRunKey: '',
    itemPacketRunKey: '',
    runMetaPacketRunKey: '',
  });

  const payload = result.needsetComputedPayload;
  assert.deepEqual(payload.bundles, bundles);
  assert.deepEqual(payload.profile_influence, profileInfluence);
  assert.deepEqual(payload.deltas, deltas);
  assert.equal(payload.round, 1);
  assert.equal(payload.schema_version, 'needset_planner_output.v2');
});

test('buildFinalizationEventPayloads defaults Schema 4 fields when absent from needSet', () => {
  const result = buildFinalizationEventPayloads({
    productId: 'mouse-product',
    runId: 'run_123',
    category: 'mouse',
    needSet: { fields: [] },
    needSetRunKey: 'runs/r1/analysis/needset.json',
    phase07PrimeSources: {},
    phase07RunKey: '',
    phase08Extraction: {},
    phase08RunKey: '',
    indexingSchemaPackets: {},
    sourcePacketsRunKey: '',
    itemPacketRunKey: '',
    runMetaPacketRunKey: '',
  });

  const payload = result.needsetComputedPayload;
  assert.deepEqual(payload.bundles, []);
  assert.equal(payload.profile_influence, null);
  assert.deepEqual(payload.deltas, []);
  assert.equal(payload.round, 0);
  assert.equal(payload.schema_version, null);
});

test('buildFinalizationEventPayloads applies safe defaults for absent arrays and optional sections', () => {
  const result = buildFinalizationEventPayloads({
    productId: 'mouse-product',
    runId: 'run_123',
    category: 'mouse',
    needSet: {},
    needSetRunKey: 'runs/r1/analysis/needset.json',
    phase07PrimeSources: {},
    phase07RunKey: 'runs/r1/analysis/phase07_retrieval.json',
    phase08Extraction: {},
    phase08RunKey: 'runs/r1/analysis/phase08_extraction.json',
    indexingSchemaPackets: {},
    sourcePacketsRunKey: 'runs/r1/analysis/source_indexing_extraction_packets.json',
    itemPacketRunKey: 'runs/r1/analysis/item_indexing_extraction_packet.json',
    runMetaPacketRunKey: 'runs/r1/analysis/run_meta_packet.json',
  });

  assert.equal(result.needsetComputedPayload.needset_size, 0);
  assert.deepEqual(result.needsetComputedPayload.top_fields, []);
  assert.deepEqual(result.phase07PrimeSourcesBuiltPayload.fields, []);
  assert.equal(result.phase08ExtractionContextBuiltPayload.field_context_count, 0);
  assert.equal(result.phase08ExtractionContextBuiltPayload.prime_source_rows, 0);
  assert.equal(result.indexingSchemaPacketsWrittenPayload.source_packet_count, 0);
});

test('buildFinalizationMetricsContext computes parser health averages, fingerprint cardinality, and contribution payload', () => {
  const calls = {
    collectContribution: 0,
  };
  const contributionResult = {
    llmFields: ['weight_g'],
    extractionFields: ['battery_life'],
  };

  const result = buildFinalizationMetricsContext({
    sourceResults: [
      {
        parserHealth: { health_score: 0.9, parser: 'a' },
        fingerprint: { id: 'fp-1' },
      },
      {
        parserHealth: { health_score: 0.6, parser: 'b' },
        fingerprint: { id: 'fp-2' },
      },
      {
        parserHealth: { parser: 'c' },
        fingerprint: { id: 'fp-1' },
      },
      {
        parserHealth: null,
        fingerprint: { id: '' },
      },
    ],
    fieldOrder: ['weight_g'],
    normalized: { fields: { weight_g: 54 } },
    provenance: { weight_g: { source: 'a' } },
    collectContributionFieldsFn: (args) => {
      calls.collectContribution += 1;
      assert.equal(args.fieldOrder[0], 'weight_g');
      assert.equal(args.normalized.fields.weight_g, 54);
      assert.equal(args.provenance.weight_g.source, 'a');
      return contributionResult;
    },
  });

  assert.equal(calls.collectContribution, 1);
  assert.equal(result.parserHealthRows.length, 3);
  assert.equal(Number(result.parserHealthAverage.toFixed(6)), Number(((0.9 + 0.6 + 0) / 3).toFixed(6)));
  assert.equal(result.fingerprintCount, 2);
  assert.equal(result.contribution, contributionResult);
});

test('buildFinalizationMetricsContext defaults to empty aggregates when source rows are absent', () => {
  const result = buildFinalizationMetricsContext({
    sourceResults: [],
    fieldOrder: [],
    normalized: { fields: {} },
    provenance: {},
    collectContributionFieldsFn: () => ({ llmFields: [] }),
  });

  assert.equal(result.parserHealthRows.length, 0);
  assert.equal(result.parserHealthAverage, 0);
  assert.equal(result.fingerprintCount, 0);
});

test('runFinalizationTelemetryPhase builds payloads then emits finalization telemetry', () => {
  const callOrder = [];
  const logger = { info() {} };
  const finalizationEventPayloads = { key: 'value' };

  const result = runFinalizationTelemetryPhase({
    logger,
    productId: 'mouse-1',
    runId: 'run-1',
    category: 'mouse',
    needSet: { needset_size: 3 },
    needSetRunKey: 'needset/run.json',
    phase07PrimeSources: { summary: { fields_attempted: 1 } },
    phase07RunKey: 'phase07/run.json',
    phase08Extraction: { summary: { batch_count: 2 } },
    phase08RunKey: 'phase08/run.json',
    indexingSchemaPackets: { sourceCollection: { source_packet_count: 5 } },
    sourcePacketsRunKey: 'schema/source/run.json',
    itemPacketRunKey: 'schema/item/run.json',
    runMetaPacketRunKey: 'schema/meta/run.json',
    buildFinalizationEventPayloadsFn: (args) => {
      callOrder.push('buildFinalizationEventPayloads');
      assert.deepEqual(args, {
        productId: 'mouse-1',
        runId: 'run-1',
        category: 'mouse',
        needSet: { needset_size: 3 },
        needSetRunKey: 'needset/run.json',
        phase07PrimeSources: { summary: { fields_attempted: 1 } },
        phase07RunKey: 'phase07/run.json',
        phase08Extraction: { summary: { batch_count: 2 } },
        phase08RunKey: 'phase08/run.json',
        indexingSchemaPackets: { sourceCollection: { source_packet_count: 5 } },
        sourcePacketsRunKey: 'schema/source/run.json',
        itemPacketRunKey: 'schema/item/run.json',
        runMetaPacketRunKey: 'schema/meta/run.json',
      });
      return finalizationEventPayloads;
    },
    emitFinalizationEventsFn: ({ logger: emittedLogger, finalizationEventPayloads: emittedPayloads }) => {
      callOrder.push('emitFinalizationEvents');
      assert.equal(emittedLogger, logger);
      assert.equal(emittedPayloads, finalizationEventPayloads);
    },
  });

  assert.deepEqual(callOrder, [
    'buildFinalizationEventPayloads',
    'emitFinalizationEvents',
  ]);
  assert.deepEqual(result, { finalizationEventPayloads });
});

test('finalizeRunLifecycle emits field decisions, saves frontier, then flushes logger', async () => {
  const calls = [];
  const logger = {
    async flush() {
      calls.push('flush');
    },
  };
  const frontierDb = {
    async save() {
      calls.push('frontier_save');
    },
  };
  await finalizeRunLifecycle({
    logger,
    frontierDb,
    fieldOrder: ['dpi'],
    normalized: { fields: { dpi: 32000 } },
    provenance: { dpi: [] },
    fieldReasoning: { dpi: 'ok' },
    trafficLight: { counts: {} },
    emitFieldDecisionEventsFn: () => {
      calls.push('emit_field_decisions');
    },
  });

  assert.deepEqual(calls, ['emit_field_decisions', 'frontier_save', 'flush']);
});

test('finalizeRunLifecycle skips frontier save when frontier db is absent', async () => {
  const calls = [];
  const logger = {
    async flush() {
      calls.push('flush');
    },
  };
  await finalizeRunLifecycle({
    logger,
    frontierDb: null,
    fieldOrder: ['dpi'],
    normalized: { fields: { dpi: 32000 } },
    provenance: { dpi: [] },
    fieldReasoning: { dpi: 'ok' },
    trafficLight: { counts: {} },
    emitFieldDecisionEventsFn: () => {
      calls.push('emit_field_decisions');
    },
  });

  assert.deepEqual(calls, ['emit_field_decisions', 'flush']);
});

test('runPlannerProcessingLifecycle processes planner queue, repair search, and hypothesis followups while preserving updated state', async () => {
  const repairCalls = [];
  const hypothesisCalls = [];
  const stopCalls = [];
  const processPlannerQueueCalls = [];
  const buildHypothesisContextCalls = [];
  const stateByCall = [
    {
      runtimePauseAnnounced: true,
      artifactSequence: 2,
      phase08FieldContexts: { first: true },
      phase08PrimeRows: [{ batch: 1 }],
      llmSourcesUsed: 3,
      llmCandidatesAccepted: 4,
      terminalReason: '',
    },
    {
      runtimePauseAnnounced: false,
      artifactSequence: 5,
      phase08FieldContexts: { second: true },
      phase08PrimeRows: [{ batch: 2 }],
      llmSourcesUsed: 6,
      llmCandidatesAccepted: 7,
      terminalReason: '',
    },
  ];

  const result = await runPlannerProcessingLifecycle({
    initialState: {
      runtimePauseAnnounced: false,
      artifactSequence: 1,
      phase08FieldContexts: {},
      phase08PrimeRows: [],
      llmSourcesUsed: 0,
      llmCandidatesAccepted: 0,
      terminalReason: '',
      hypothesisFollowupRoundsExecuted: 0,
      hypothesisFollowupSeededUrls: 0,
    },
    logger: {
      events: [
        {
          event: 'repair_query_enqueued',
          domain: 'example.com',
          query: 'example mouse weight',
          field_targets: ['weight_g'],
          reason: 'missing_field',
          source_url: 'https://example.com/spec',
        },
      ],
    },
    config: {
      searchEngines: 'serpapi',
      maxRunSeconds: 999,
    },
    planner: { id: 'planner' },
    startMs: 0,
    nowFn: () => 1000,
    processPlannerQueueFn: async (currentState) => {
      processPlannerQueueCalls.push({
        artifactSequence: currentState.artifactSequence,
        llmSourcesUsed: currentState.llmSourcesUsed,
      });
      return stateByCall.shift();
    },
    runRepairSearchPhaseFn: async (input) => {
      repairCalls.push(input);
      await input.processPlannerQueueFn();
      return { repairSearchesCompleted: 1 };
    },
    runSearchFn: async ({ query }) => [{ url: `https://search.example/?q=${encodeURIComponent(query)}` }],
    buildHypothesisFollowupsContextFn: (state) => {
      buildHypothesisContextCalls.push(state);
      return {
        marker: 'hypothesis',
        hypothesisFollowupRoundsExecuted: state.hypothesisFollowupRoundsExecuted,
        hypothesisFollowupSeededUrls: state.hypothesisFollowupSeededUrls,
      };
    },
    runHypothesisFollowupsFn: async (input) => {
      hypothesisCalls.push(input);
      return {
        hypothesisFollowupRoundsExecuted: 2,
        hypothesisFollowupSeededUrls: 5,
      };
    },
    resolveHypothesisFollowupStateFn: ({ followupResult }) => followupResult,
    stopFetchersFn: async () => {
      stopCalls.push('stop');
    },
  });

  assert.deepEqual(processPlannerQueueCalls, [
    { artifactSequence: 1, llmSourcesUsed: 0 },
    { artifactSequence: 2, llmSourcesUsed: 3 },
  ]);
  assert.equal(repairCalls.length, 1);
  assert.deepEqual(repairCalls[0].repairEvents, [
    {
      domain: 'example.com',
      query: 'example mouse weight',
      field_targets: ['weight_g'],
      provider: 'serpapi',
      reason: 'missing_field',
      source_url: 'https://example.com/spec',
    },
  ]);
  assert.equal(buildHypothesisContextCalls.length, 1);
  assert.deepEqual(buildHypothesisContextCalls[0].phase08FieldContexts, { second: true });
  assert.equal(hypothesisCalls.length, 1);
  assert.deepEqual(hypothesisCalls[0], {
    marker: 'hypothesis',
    hypothesisFollowupRoundsExecuted: 0,
    hypothesisFollowupSeededUrls: 0,
  });
  assert.deepEqual(stopCalls, ['stop']);
  assert.deepEqual(result, {
    runtimePauseAnnounced: false,
    artifactSequence: 5,
    phase08FieldContexts: { second: true },
    phase08PrimeRows: [{ batch: 2 }],
    llmSourcesUsed: 6,
    llmCandidatesAccepted: 7,
    terminalReason: '',
    hypothesisFollowupRoundsExecuted: 2,
    hypothesisFollowupSeededUrls: 5,
  });
});

test('runPlannerProcessingLifecycle stops on run budget exhaustion before repair or followup phases', async () => {
  const repairCalls = [];
  const hypothesisCalls = [];
  const stopCalls = [];

  const result = await runPlannerProcessingLifecycle({
    initialState: {
      runtimePauseAnnounced: false,
      artifactSequence: 1,
      phase08FieldContexts: {},
      phase08PrimeRows: [],
      llmSourcesUsed: 0,
      llmCandidatesAccepted: 0,
      terminalReason: '',
      hypothesisFollowupRoundsExecuted: 1,
      hypothesisFollowupSeededUrls: 2,
    },
    logger: {
      events: [
        {
          event: 'repair_query_enqueued',
          domain: 'example.com',
          query: 'example mouse weight',
        },
      ],
    },
    config: {
      searchEngines: 'serpapi',
      maxRunSeconds: 30,
    },
    startMs: 0,
    nowFn: () => 30_000,
    processPlannerQueueFn: async () => ({
      runtimePauseAnnounced: true,
      artifactSequence: 3,
      phase08FieldContexts: { after: true },
      phase08PrimeRows: [{ batch: 3 }],
      llmSourcesUsed: 4,
      llmCandidatesAccepted: 5,
      terminalReason: '',
    }),
    runRepairSearchPhaseFn: async (input) => {
      repairCalls.push(input);
    },
    runHypothesisFollowupsFn: async (input) => {
      hypothesisCalls.push(input);
      return {};
    },
    stopFetchersFn: async () => {
      stopCalls.push('stop');
    },
  });

  assert.deepEqual(repairCalls, []);
  assert.deepEqual(hypothesisCalls, []);
  assert.deepEqual(stopCalls, ['stop']);
  assert.equal(result.terminalReason, 'max_run_seconds_reached');
  assert.equal(result.artifactSequence, 3);
  assert.equal(result.hypothesisFollowupRoundsExecuted, 1);
  assert.equal(result.hypothesisFollowupSeededUrls, 2);
});

test('runPlannerProcessingLifecycle stops fetchers when planner processing throws', async () => {
  const stopCalls = [];

  await assert.rejects(
    runPlannerProcessingLifecycle({
      initialState: {
        terminalReason: '',
        hypothesisFollowupRoundsExecuted: 0,
        hypothesisFollowupSeededUrls: 0,
      },
      processPlannerQueueFn: async () => {
        throw new Error('planner failed');
      },
      stopFetchersFn: async () => {
        stopCalls.push('stop');
      },
    }),
    /planner failed/,
  );

  assert.deepEqual(stopCalls, ['stop']);
});

test('buildRunCompletedPayload builds canonical run_completed telemetry payload', () => {
  const payload = buildRunCompletedPayload({
    productId: 'mouse-product',
    runId: 'run_123',
    config: { runProfile: 'thorough' },
    runtimeMode: 'uber_aggressive',
    identityFingerprint: 'idfp',
    identityLockStatus: 'locked',
    dedupeMode: 'deterministic_v2',
    summary: {
      validated: true,
      validated_reason: 'ok',
      completeness_required: 0.95,
      coverage_overall: 0.9,
      hypothesis_queue: [{ id: 'h1' }, { id: 'h2' }],
      constraint_analysis: { contradiction_count: 1 },
    },
    confidence: 0.88,
    llmCandidatesAccepted: 4,
    llmCallCount: 12,
    llmCostUsd: 0.17,
    contribution: { llmFields: ['dpi', 'weight_g'] },
    llmEstimatedUsageCount: 5,
    llmRetryWithoutSchemaCount: 2,
    indexingHelperFlowEnabled: true,
    helperContext: {
      active_match: { id: 1 },
      supportive_matches: [{ id: 1 }, { id: 2 }],
    },
    helperFilledFields: ['dpi'],
    componentPriorFilledFields: ['sensor'],
    criticDecisions: { reject: [{ field_key: 'dpi' }] },
    llmValidatorDecisions: { accept: [{ field_key: 'dpi' }], reject: [{ field_key: 'weight_g' }] },
    phase08Extraction: {
      summary: {
        batch_count: 7,
        schema_fail_rate: 0.25,
        dangling_snippet_ref_rate: 0.1,
        min_refs_satisfied_rate: 0.75,
      },
    },
    trafficLight: { counts: { green: 8, yellow: 2, red: 1 } },
    resumeMode: 'auto',
    resumeMaxAgeHours: 48,
    resumeReextractEnabled: true,
    resumeReextractAfterHours: 24,
    resumeSeededPendingCount: 1,
    resumeSeededLlmRetryCount: 2,
    resumeSeededReextractCount: 3,
    resumePersistedPendingCount: 4,
    resumePersistedLlmRetryCount: 5,
    resumePersistedSuccessCount: 6,
    hypothesisFollowupRoundsExecuted: 2,
    hypothesisFollowupSeededUrls: 9,
    aggressiveExtraction: { enabled: true, stage: 'deep' },
    durationMs: 12345,
  });

  assert.equal(payload.productId, 'mouse-product');
  assert.equal(payload.run_profile, 'standard');
  assert.equal(payload.runtime_mode, 'uber_aggressive');
  assert.equal(payload.phase_cursor, 'completed');
  assert.equal(payload.llm_fields_filled_count, 2);
  assert.equal(payload.helper_active_match, true);
  assert.equal(payload.helper_supportive_matches, 2);
  assert.equal(payload.phase08_batch_count, 7);
  assert.equal(payload.traffic_green_count, 8);
  assert.equal(payload.hypothesis_queue_count, 2);
  assert.equal(payload.aggressive_enabled, true);
  assert.equal(payload.aggressive_stage, 'deep');
  assert.equal(payload.duration_ms, 12345);
});

test('buildRunCompletedPayload applies safe defaults for missing optional sections', () => {
  const payload = buildRunCompletedPayload({
    productId: 'mouse-product',
    runId: 'run_123',
    config: {},
    runtimeMode: 'balanced',
    identityFingerprint: 'idfp',
    identityLockStatus: 'unknown',
    dedupeMode: 'deterministic_v2',
    summary: {
      validated: false,
      validated_reason: 'none',
      completeness_required: 0,
      coverage_overall: 0,
      hypothesis_queue: null,
      constraint_analysis: {},
    },
    confidence: 0,
    llmCandidatesAccepted: 0,
    llmCallCount: 0,
    llmCostUsd: 0,
    contribution: {},
    llmEstimatedUsageCount: 0,
    llmRetryWithoutSchemaCount: 0,
    indexingHelperFlowEnabled: false,
    helperContext: {},
    helperFilledFields: null,
    componentPriorFilledFields: null,
    criticDecisions: {},
    llmValidatorDecisions: {},
    phase08Extraction: {},
    trafficLight: { counts: {} },
    resumeMode: 'off',
    resumeMaxAgeHours: 0,
    resumeReextractEnabled: false,
    resumeReextractAfterHours: 0,
    resumeSeededPendingCount: 0,
    resumeSeededLlmRetryCount: 0,
    resumeSeededReextractCount: 0,
    resumePersistedPendingCount: 0,
    resumePersistedLlmRetryCount: 0,
    resumePersistedSuccessCount: 0,
    hypothesisFollowupRoundsExecuted: 0,
    hypothesisFollowupSeededUrls: 0,
    aggressiveExtraction: null,
    durationMs: 0,
  });

  assert.equal(payload.run_profile, 'standard');
  assert.equal(payload.llm_fields_filled_count, 0);
  assert.equal(payload.helper_active_match, false);
  assert.equal(payload.helper_supportive_matches, 0);
  assert.equal(payload.helper_supportive_fields_filled, 0);
  assert.equal(payload.component_prior_fields_filled, 0);
  assert.equal(payload.critic_reject_count, 0);
  assert.equal(payload.llm_validator_accept_count, 0);
  assert.equal(payload.llm_validator_reject_count, 0);
  assert.equal(payload.phase08_batch_count, 0);
  assert.equal(payload.phase08_schema_fail_rate, 0);
  assert.equal(payload.phase08_dangling_ref_rate, 0);
  assert.equal(payload.phase08_min_refs_satisfied_rate, 0);
  assert.equal(payload.traffic_green_count, 0);
  assert.equal(payload.hypothesis_queue_count, 0);
  assert.equal(payload.aggressive_enabled, false);
  assert.equal(payload.aggressive_stage, 'disabled');
});

test('buildRunCompletedPayloadContext maps runProduct run_completed inputs to payload contract keys', () => {
  const context = buildRunCompletedPayloadContext({
    productId: 'mouse-1',
    runId: 'run-1',
    config: { runProfile: 'thorough' },
    runtimeMode: 'balanced',
    identityFingerprint: 'idfp',
    identityLockStatus: 'locked',
    dedupeMode: 'deterministic_v2',
    summary: { validated: true },
    confidence: 0.9,
    llmCandidatesAccepted: 3,
    llmCallCount: 5,
    llmCostUsd: 0.2,
    contribution: { llmFields: ['dpi'] },
    llmEstimatedUsageCount: 4,
    llmRetryWithoutSchemaCount: 1,
    indexingHelperFlowEnabled: true,
    helperContext: { active_match: {} },
    helperFilledFields: ['dpi'],
    componentPriorFilledFields: ['sensor'],
    criticDecisions: { reject: [] },
    llmValidatorDecisions: { accept: [], reject: [] },
    phase08Extraction: { summary: {} },
    trafficLight: { counts: { green: 1, yellow: 0, red: 0 } },
    resumeMode: 'auto',
    resumeMaxAgeHours: 48,
    resumeReextractEnabled: false,
    resumeReextractAfterHours: 24,
    resumeSeededPendingCount: 0,
    resumeSeededLlmRetryCount: 0,
    resumeSeededReextractCount: 0,
    resumePersistedPendingCount: 0,
    resumePersistedLlmRetryCount: 0,
    resumePersistedSuccessCount: 0,
    hypothesisFollowupRoundsExecuted: 0,
    hypothesisFollowupSeededUrls: 0,
    aggressiveExtraction: { enabled: false, stage: 'disabled' },
    durationMs: 1000,
  });

  assert.equal(context.productId, 'mouse-1');
  assert.equal(context.runId, 'run-1');
  assert.equal(context.dedupeMode, 'deterministic_v2');
  assert.equal(context.durationMs, 1000);
  assert.deepEqual(context.summary, { validated: true });
});

test('runProductCompletionLifecycle preserves publication and learning lifecycle ordering', async () => {
  const calls = [];
  const summary = { runId: 'run-1', ok: true };
  const normalized = { fields: { weight_g: '59' } };
  const provenance = { weight_g: [{ url: 'https://example.com/spec' }] };
  const identityReport = { status: 'ok' };
  const learningExportPhaseContext = { phase: 'learning-export' };
  const runCompletedPayload = { event: 'run.completed', runId: 'run-1' };
  const runResultPayload = { ok: true };

  const result = await runProductCompletionLifecycle({
    constrainedFinalizationConfig: {
      writeMarkdownSummary: true,
    },
    storage: { id: 'storage' },
    runArtifactsBase: 'runs/base',
    category: 'mouse',
    productId: 'product-1',
    runId: 'run-1',
    runtimeMode: 'aggressive',
    startMs: 10,
    summary,
    categoryConfig: { category: 'mouse' },
    sourceResults: [{ url: 'https://example.com/spec' }],
    normalized,
    provenance,
    needSet: { needs: [] },
    phase08Extraction: { summary: { batch_count: 1 } },
    phase07PrimeSources: { summary: { refs_selected_total: 2 } },
    config: { raw: true },
    logger: { id: 'logger' },
    identityFingerprint: 'brand:model',
    identityLockStatus: 'locked',
    dedupeMode: 'strict',
    confidence: 0.91,
    llmCandidatesAccepted: 3,
    llmCallCount: 4,
    llmCostUsd: 0.12,
    contribution: { llmFields: ['weight_g'] },
    llmEstimatedUsageCount: 5,
    llmRetryWithoutSchemaCount: 1,
    indexingHelperFlowEnabled: true,
    helperContext: { active: true },
    helperFilledFields: ['weight_g'],
    componentPriorFilledFields: ['shape'],
    criticDecisions: { accept: [] },
    llmValidatorDecisions: { enabled: false },
    trafficLight: { green: ['shape'] },
    resumeMode: 'resume',
    resumeMaxAgeHours: 24,
    resumeReextractEnabled: true,
    resumeReextractAfterHours: 48,
    resumeSeededPendingCount: 2,
    resumeSeededLlmRetryCount: 1,
    resumeSeededReextractCount: 1,
    resumePersistedPendingCount: 3,
    resumePersistedLlmRetryCount: 2,
    resumePersistedSuccessCount: 4,
    hypothesisFollowupRoundsExecuted: 2,
    hypothesisFollowupSeededUrls: ['https://seed.example.com'],
    aggressiveExtraction: { enabled: false },
    durationMs: 1234,
    fieldOrder: ['weight_g'],
    llmContext: { verification: { done: true } },
    identityReport,
    sourceIntelBrand: 'Logitech',
    constraintAnalysis: { conflicts: [] },
    job: { identityLock: { brand: 'Logitech' } },
    updateCategoryBrainFn: async (payload) => {
      calls.push(['updateCategoryBrainFn', payload]);
      return { updated: true };
    },
    updateComponentLibraryFn: async (payload) => {
      calls.push(['updateComponentLibraryFn', payload]);
      return payload;
    },
    runtimeFieldRulesEngine: { version: 'v1' },
    evaluateFieldLearningGatesFn: (payload) => {
      calls.push(['evaluateFieldLearningGatesFn', payload]);
      return { fields: ['weight_g'] };
    },
    emitLearningGateEventsFn: (payload) => {
      calls.push(['emitLearningGateEventsFn', payload]);
      return payload;
    },
    importSpecDbFn: async () => ({ SpecDb: class SpecDb {} }),
    UrlMemoryStoreClass: class UrlMemoryStore {},
    DomainFieldYieldStoreClass: class DomainFieldYieldStore {},
    FieldAnchorsStoreClass: class FieldAnchorsStore {},
    ComponentLexiconStoreClass: class ComponentLexiconStore {},
    populateLearningStoresFn: async (payload) => {
      calls.push(['populateLearningStoresFn', payload]);
      return payload;
    },
    learningProfile: { enabled: true },
    discoveryResult: { enabled: true },
    artifactsByHost: { 'example.com': {} },
    adapterArtifacts: { adapter: true },
    candidates: [{ field: 'weight_g' }],
    persistLearningProfileFn: async (payload) => {
      calls.push(['persistLearningProfileFn', payload]);
      return { profile: true };
    },
    exportRunArtifactsFn: async (payload) => {
      calls.push(['exportRunArtifactsFn', payload]);
      return { export: true };
    },
    writeFinalOutputsFn: async (payload) => {
      calls.push(['writeFinalOutputsFn', payload]);
      return { final: true };
    },
    writeProductReviewArtifactsFn: async (payload) => {
      calls.push(['writeProductReviewArtifactsFn', payload]);
      return payload;
    },
    writeCategoryReviewArtifactsFn: async (payload) => {
      calls.push(['writeCategoryReviewArtifactsFn', payload]);
      return payload;
    },
    runLearningExportPhaseFn: async (payload) => {
      calls.push(['runLearningExportPhaseFn', payload]);
      return {
        exportInfo: { key: 'export' },
        finalExport: { key: 'final' },
        learning: { key: 'learning' },
      };
    },
    finalizeRunLifecycleFn: async (payload) => {
      calls.push(['finalizeRunLifecycleFn', payload]);
    },
    frontierDb: { id: 'frontier' },
    fieldReasoning: [{ field: 'weight_g', reason: 'evidence' }],
    emitFieldDecisionEventsFn: (payload) => {
      calls.push(['emitFieldDecisionEventsFn', payload]);
      return payload;
    },
    writeSummaryMarkdownLLMFn: async (payload) => {
      calls.push(['writeSummaryMarkdownLLMFn', payload]);
      return '# summary';
    },
    buildMarkdownSummaryFn: (payload) => {
      calls.push(['buildMarkdownSummaryFn', payload]);
      return '# fallback';
    },
    tsvRowFromFieldsFn: (fieldOrderArg, fieldsArg) => {
      calls.push(['tsvRowFromFieldsFn', { fieldOrderArg, fieldsArg }]);
      return 'row-tsv';
    },
    buildIndexingSchemaPacketsFn: (payload) => {
      calls.push(['buildIndexingSchemaPacketsFn', payload]);
      return { packets: true };
    },
    resolveIndexingSchemaValidationFn: async (payload) => {
      calls.push(['resolveIndexingSchemaValidationFn', payload]);
      return { validation: true };
    },
    buildIndexingSchemaSummaryPayloadFn: (payload) => {
      calls.push(['buildIndexingSchemaSummaryPayloadFn', payload]);
      return { payload: true };
    },
    persistAnalysisArtifactsFn: async (payload) => {
      calls.push(['persistAnalysisArtifactsFn', payload]);
      return payload;
    },
    validateIndexingSchemaPacketsFn: (payload) => {
      calls.push(['validateIndexingSchemaPacketsFn', payload]);
      return { valid: true };
    },
    persistSourceIntelFn: async (payload) => {
      calls.push(['persistSourceIntelFn', payload]);
      return payload;
    },
    buildResearchArtifactsPhaseContextFn: (payload) => {
      calls.push(['buildResearchArtifactsPhaseContextFn', payload]);
      return { researchContext: payload };
    },
    applyResearchArtifactsContextFn: async (payload) => {
      calls.push(['applyResearchArtifactsContextFn', payload]);
    },
    buildAnalysisArtifactKeyPhaseContextFn: (payload) => {
      calls.push(['buildAnalysisArtifactKeyPhaseContextFn', payload]);
      return { analysisKeyPhaseContext: payload };
    },
    buildAnalysisArtifactKeyContextFn: (payload) => {
      calls.push(['buildAnalysisArtifactKeyContextFn', payload]);
      return {
        needSetRunKey: 'needset/run',
        needSetLatestKey: 'needset/latest',
        phase07RunKey: 'phase07/run',
        phase07LatestKey: 'phase07/latest',
        phase08RunKey: 'phase08/run',
        phase08LatestKey: 'phase08/latest',
        sourcePacketsRunKey: 'sources/run',
        sourcePacketsLatestKey: 'sources/latest',
        itemPacketRunKey: 'item/run',
        itemPacketLatestKey: 'item/latest',
        runMetaPacketRunKey: 'meta/run',
        runMetaPacketLatestKey: 'meta/latest',
      };
    },
    buildIndexingSchemaArtifactsPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildIndexingSchemaArtifactsPhaseCallsiteContextFn', payload]);
      return { schemaCallsite: payload };
    },
    buildIndexingSchemaArtifactsPhaseContextFn: (payload) => {
      calls.push(['buildIndexingSchemaArtifactsPhaseContextFn', payload]);
      return { schemaContext: payload };
    },
    runIndexingSchemaArtifactsPhaseFn: async (payload) => {
      calls.push(['runIndexingSchemaArtifactsPhaseFn', payload]);
      return { indexingSchemaPackets: { packets: ['schema'] } };
    },
    buildFinalizationTelemetryPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildFinalizationTelemetryPhaseCallsiteContextFn', payload]);
      return { telemetryCallsite: payload };
    },
    buildFinalizationTelemetryContextFn: (payload) => {
      calls.push(['buildFinalizationTelemetryContextFn', payload]);
      return { telemetryContext: payload };
    },
    runFinalizationTelemetryPhaseFn: (payload) => {
      calls.push(['runFinalizationTelemetryPhaseFn', payload]);
    },
    buildRunCompletedPayloadPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildRunCompletedPayloadPhaseCallsiteContextFn', payload]);
      return { runCompletedPayloadCallsite: payload };
    },
    buildRunCompletedPayloadContextFn: (payload) => {
      calls.push(['buildRunCompletedPayloadContextFn', payload]);
      return { runCompletedPayloadContext: payload };
    },
    buildRunCompletedPayloadFn: (payload) => {
      calls.push(['buildRunCompletedPayloadFn', payload]);
      return runCompletedPayload;
    },
    buildRunCompletedEventCallsiteContextFn: (payload) => {
      calls.push(['buildRunCompletedEventCallsiteContextFn', payload]);
      return { runCompletedEventCallsite: payload };
    },
    buildRunCompletedEventContextFn: (payload) => {
      calls.push(['buildRunCompletedEventContextFn', payload]);
      return { runCompletedEventContext: payload };
    },
    emitRunCompletedEventFn: (payload) => {
      calls.push(['emitRunCompletedEventFn', payload]);
    },
    buildSummaryArtifactsPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildSummaryArtifactsPhaseCallsiteContextFn', payload]);
      return { summaryArtifactsCallsite: payload };
    },
    buildSummaryArtifactsPhaseContextFn: (payload) => {
      calls.push(['buildSummaryArtifactsPhaseContextFn', payload]);
      return { summaryArtifactsContext: payload };
    },
    buildSummaryArtifactsContextFn: async (payload) => {
      calls.push(['buildSummaryArtifactsContextFn', payload]);
      return { rowTsv: 'row-tsv', markdownSummary: '# summary' };
    },
    buildIdentityReportPersistencePhaseCallsiteContextFn: (payload) => {
      calls.push(['buildIdentityReportPersistencePhaseCallsiteContextFn', payload]);
      return { identityReportCallsite: payload };
    },
    buildIdentityReportPersistenceContextFn: (payload) => {
      calls.push(['buildIdentityReportPersistenceContextFn', payload]);
      return { identityReportContext: payload };
    },
    runIdentityReportPersistencePhaseFn: async (payload) => {
      calls.push(['runIdentityReportPersistencePhaseFn', payload]);
    },
    buildSourceIntelFinalizationPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildSourceIntelFinalizationPhaseCallsiteContextFn', payload]);
      return { sourceIntelCallsite: payload };
    },
    buildSourceIntelFinalizationContextFn: (payload) => {
      calls.push(['buildSourceIntelFinalizationContextFn', payload]);
      return { sourceIntelContext: payload };
    },
    runSourceIntelFinalizationPhaseFn: async (payload) => {
      calls.push(['runSourceIntelFinalizationPhaseFn', payload]);
    },
    buildPostLearningUpdatesPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildPostLearningUpdatesPhaseCallsiteContextFn', payload]);
      return { postLearningCallsite: payload };
    },
    buildPostLearningUpdatesContextFn: (payload) => {
      calls.push(['buildPostLearningUpdatesContextFn', payload]);
      return { postLearningContext: payload };
    },
    runPostLearningUpdatesPhaseFn: async (payload) => {
      calls.push(['runPostLearningUpdatesPhaseFn', payload]);
      return { categoryBrain: { updated: true } };
    },
    buildLearningGatePhaseCallsiteContextFn: (payload) => {
      calls.push(['buildLearningGatePhaseCallsiteContextFn', payload]);
      return { learningGateCallsite: payload };
    },
    buildLearningGateContextFn: (payload) => {
      calls.push(['buildLearningGateContextFn', payload]);
      return { learningGateContext: payload };
    },
    runLearningGatePhaseFn: (payload) => {
      calls.push(['runLearningGatePhaseFn', payload]);
      return { learningAllowed: true };
    },
    buildSelfImproveLearningStoresPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildSelfImproveLearningStoresPhaseCallsiteContextFn', payload]);
      return { selfImproveCallsite: payload };
    },
    buildSelfImproveLearningStoresContextFn: (payload) => {
      calls.push(['buildSelfImproveLearningStoresContextFn', payload]);
      return { selfImproveContext: payload };
    },
    persistSelfImproveLearningStoresFn: async (payload) => {
      calls.push(['persistSelfImproveLearningStoresFn', payload]);
    },
    buildLearningExportPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildLearningExportPhaseCallsiteContextFn', payload]);
      return payload;
    },
    buildLearningExportPhaseContextFn: (payload) => {
      calls.push(['buildLearningExportPhaseContextFn', payload]);
      assert.equal(payload.markdownSummary, '# summary');
      assert.equal(payload.rowTsv, 'row-tsv');
      return learningExportPhaseContext;
    },
    buildTerminalLearningExportLifecyclePhaseCallsiteContextFn: (payload) => {
      calls.push(['buildTerminalLearningExportLifecyclePhaseCallsiteContextFn', payload]);
      return { terminalLifecycleCallsite: payload };
    },
    buildTerminalLearningExportLifecycleContextFn: (payload) => {
      calls.push(['buildTerminalLearningExportLifecycleContextFn', payload]);
      return { terminalLifecycleContext: payload };
    },
    runTerminalLearningExportLifecycleFn: async (payload) => {
      calls.push(['runTerminalLearningExportLifecycleFn', payload]);
      return {
        exportInfo: { key: 'export' },
        finalExport: { key: 'final' },
        learning: { key: 'learning' },
      };
    },
    buildRunResultPayloadPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildRunResultPayloadPhaseCallsiteContextFn', payload]);
      return { runResultCallsite: payload };
    },
    buildRunResultPayloadContextFn: (payload) => {
      calls.push(['buildRunResultPayloadContextFn', payload]);
      return { runResultContext: payload };
    },
    buildRunResultPayloadFn: (payload) => {
      calls.push(['buildRunResultPayloadFn', payload]);
      return runResultPayload;
    },
  });

  assert.equal(result, runResultPayload);

  assert.deepEqual(
    calls.map(([name]) => name),
    [
      'buildResearchArtifactsPhaseContextFn',
      'applyResearchArtifactsContextFn',
      'buildAnalysisArtifactKeyPhaseContextFn',
      'buildAnalysisArtifactKeyContextFn',
      'buildIndexingSchemaArtifactsPhaseCallsiteContextFn',
      'buildIndexingSchemaArtifactsPhaseContextFn',
      'runIndexingSchemaArtifactsPhaseFn',
      'buildFinalizationTelemetryPhaseCallsiteContextFn',
      'buildFinalizationTelemetryContextFn',
      'runFinalizationTelemetryPhaseFn',
      'buildRunCompletedPayloadPhaseCallsiteContextFn',
      'buildRunCompletedPayloadContextFn',
      'buildRunCompletedPayloadFn',
      'buildRunCompletedEventCallsiteContextFn',
      'buildRunCompletedEventContextFn',
      'emitRunCompletedEventFn',
      'buildSummaryArtifactsPhaseCallsiteContextFn',
      'buildSummaryArtifactsPhaseContextFn',
      'buildSummaryArtifactsContextFn',
      'buildIdentityReportPersistencePhaseCallsiteContextFn',
      'buildIdentityReportPersistenceContextFn',
      'runIdentityReportPersistencePhaseFn',
      'buildSourceIntelFinalizationPhaseCallsiteContextFn',
      'buildSourceIntelFinalizationContextFn',
      'runSourceIntelFinalizationPhaseFn',
      'buildPostLearningUpdatesPhaseCallsiteContextFn',
      'buildPostLearningUpdatesContextFn',
      'runPostLearningUpdatesPhaseFn',
      'buildLearningGatePhaseCallsiteContextFn',
      'buildLearningGateContextFn',
      'runLearningGatePhaseFn',
      'buildSelfImproveLearningStoresPhaseCallsiteContextFn',
      'buildSelfImproveLearningStoresContextFn',
      'persistSelfImproveLearningStoresFn',
      'buildLearningExportPhaseCallsiteContextFn',
      'buildLearningExportPhaseContextFn',
      'buildTerminalLearningExportLifecyclePhaseCallsiteContextFn',
      'buildTerminalLearningExportLifecycleContextFn',
      'runTerminalLearningExportLifecycleFn',
      'buildRunResultPayloadPhaseCallsiteContextFn',
      'buildRunResultPayloadContextFn',
      'buildRunResultPayloadFn',
    ],
  );

  const schemaCall = calls.find(([name]) => name === 'buildIndexingSchemaArtifactsPhaseCallsiteContextFn')[1];
  assert.deepEqual(schemaCall.keys, {
    needSetRunKey: 'needset/run',
    needSetLatestKey: 'needset/latest',
    phase07RunKey: 'phase07/run',
    phase07LatestKey: 'phase07/latest',
    phase08RunKey: 'phase08/run',
    phase08LatestKey: 'phase08/latest',
    sourcePacketsRunKey: 'sources/run',
    sourcePacketsLatestKey: 'sources/latest',
    itemPacketRunKey: 'item/run',
    itemPacketLatestKey: 'item/latest',
    runMetaPacketRunKey: 'meta/run',
    runMetaPacketLatestKey: 'meta/latest',
  });

  const summaryArtifactsCall = calls.find(([name]) => name === 'buildSummaryArtifactsPhaseCallsiteContextFn')[1];
  const completedEventCall = calls.find(([name]) => name === 'buildRunCompletedEventCallsiteContextFn')[1];
  assert.equal(completedEventCall.runCompletedPayload, runCompletedPayload);

  const terminalLifecycleCall = calls.find(([name]) => name === 'buildTerminalLearningExportLifecyclePhaseCallsiteContextFn')[1];
  assert.equal(terminalLifecycleCall.learningExportPhaseContext, learningExportPhaseContext);
  assert.equal(terminalLifecycleCall.finalizeRunLifecycleFn.name, 'finalizeRunLifecycleFn');
});

test('runProductCompletionLifecycle propagates failures before downstream publication work', async () => {
  const calls = [];

  await assert.rejects(
    runProductCompletionLifecycle({
      summary: { runId: 'run-1' },
      runArtifactsBase: 'runs/base',
      category: 'mouse',
      productId: 'product-1',
      runId: 'run-1',
      fieldOrder: [],
      normalized: { fields: {} },
      provenance: {},
      buildResearchArtifactsPhaseContextFn: (payload) => payload,
      applyResearchArtifactsContextFn: async () => {
        calls.push('applyResearchArtifactsContextFn');
      },
      buildAnalysisArtifactKeyPhaseContextFn: (payload) => payload,
      buildAnalysisArtifactKeyContextFn: () => ({
        needSetRunKey: 'needset/run',
        needSetLatestKey: 'needset/latest',
        phase07RunKey: 'phase07/run',
        phase07LatestKey: 'phase07/latest',
        phase08RunKey: 'phase08/run',
        phase08LatestKey: 'phase08/latest',
        sourcePacketsRunKey: 'sources/run',
        sourcePacketsLatestKey: 'sources/latest',
        itemPacketRunKey: 'item/run',
        itemPacketLatestKey: 'item/latest',
        runMetaPacketRunKey: 'meta/run',
        runMetaPacketLatestKey: 'meta/latest',
      }),
      buildIndexingSchemaArtifactsPhaseCallsiteContextFn: (payload) => payload,
      buildIndexingSchemaArtifactsPhaseContextFn: (payload) => payload,
      runIndexingSchemaArtifactsPhaseFn: async () => {
        calls.push('runIndexingSchemaArtifactsPhaseFn');
        throw new Error('schema failed');
      },
      buildRunCompletedPayloadPhaseCallsiteContextFn: (payload) => payload,
      buildRunCompletedPayloadContextFn: (payload) => payload,
      buildRunCompletedPayloadFn: () => {
        calls.push('buildRunCompletedPayloadFn');
      },
    }),
    /schema failed/,
  );

  assert.deepEqual(calls, [
    'applyResearchArtifactsContextFn',
    'runIndexingSchemaArtifactsPhaseFn',
  ]);
});

test('runProductFinalizationDerivation preserves derivation phase ordering and state threading', async () => {
  const calls = [];
  const result = await runProductFinalizationDerivation({
    adapterManager: { id: 'adapter-manager' },
    job: { identityLock: { brand: 'Logitech' } },
    runId: 'run-1',
    storage: { id: 'storage' },
    helperSupportiveSyntheticSources: [{ url: 'helper://supportive/one' }],
    adapterArtifacts: { adapter: true },
    sourceResults: [{ url: 'https://example.com/spec' }],
    anchors: { shape: 'symmetrical' },
    config: {
      llmWriteSummary: true,
    },
    productId: 'product-1',
    categoryConfig: { criticalFieldSet: new Set(['weight_g']) },
    fieldOrder: ['shape', 'weight_g'],
    category: 'mouse',
    runtimeFieldRulesEngine: { version: 'v1' },
    terminalReason: '',
    learnedConstraints: { shape: true },
    logger: { id: 'logger' },
    llmContext: { verification: { done: true } },
    roundContext: { round: 2 },
    discoveryResult: { enabled: true },
    artifactsByHost: { 'example.com': {} },
    requiredFields: ['shape'],
    targets: {
      targetCompleteness: 0.9,
      targetConfidence: 0.8,
    },
    startMs: 500,
    nowFn: () => 2000,
    sourceIntel: { data: { domains: {} } },
    identityLock: { family_model_count: 2, ambiguity_level: 'medium' },
    learnedFieldAvailability: { shape: 'high' },
    learnedFieldYield: { shape: 'high' },
    phase08BatchRows: [{ batch: 1 }],
    phase08FieldContexts: { shape: { context: true } },
    phase08PrimeRows: [{ field: 'shape' }],
    llmValidatorDecisions: { enabled: false },
    buildCandidateFieldMapFn: (payload) => payload,
    evaluateAnchorConflictsFn: (payload) => payload,
    evaluateSourceIdentityFn: (payload) => payload,
    evaluateIdentityGateFn: (payload) => payload,
    buildIdentityReportFn: (payload) => payload,
    bestIdentityFromSourcesFn: (payload) => payload,
    buildIdentityObjectFn: (payload) => payload,
    buildSourceSummaryFn: (payload) => payload,
    mergeAnchorConflictListsFn: (payload) => payload,
    executeConsensusPhaseFn: (payload) => payload,
    buildAbortedNormalizedFn: (payload) => payload,
    buildValidatedNormalizedFn: (payload) => payload,
    createEmptyProvenanceFn: (payload) => payload,
    selectAggressiveEvidencePackFn: (payload) => {
      calls.push(['selectAggressiveEvidencePackFn', payload]);
      return { pack: true };
    },
    aggregateTemporalSignalsFn: (payload) => payload,
    applyInferencePoliciesFn: (payload) => payload,
    computeCompletenessRequiredFn: (payload) => payload,
    computeCoverageOverallFn: (payload) => payload,
    computeConfidenceFn: (payload) => payload,
    evaluateValidationGateFn: (payload) => payload,
    aggregateEndpointSignalsFn: (payload) => payload,
    evaluateConstraintGraphFn: (payload) => payload,
    buildDedicatedSyntheticSourceIngestionContextFn: (payload) => {
      calls.push(['buildDedicatedSyntheticSourceIngestionContextFn', payload]);
      return payload;
    },
    runDedicatedSyntheticSourceIngestionPhaseFn: async (payload) => {
      calls.push(['runDedicatedSyntheticSourceIngestionPhaseFn', payload]);
    },
    buildIdentityConsensusPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildIdentityConsensusPhaseCallsiteContextFn', payload]);
      return payload;
    },
    buildIdentityConsensusContextFn: (payload) => {
      calls.push(['buildIdentityConsensusContextFn', payload]);
      return {
        identityGate: { validated: true, needsReview: false, reasonCodes: [], certainty: 0.92 },
        identityConfidence: 0.92,
        identityReport: { status: 'ok' },
        identity: { brand: 'Logitech', model: 'G Pro X Superlight 2' },
        sourceSummary: { sources: 1 },
        allAnchorConflicts: [{ severity: 'MAJOR' }],
        anchorMajorConflictsCount: 1,
        consensus: { agreementScore: 0.87, fields: { weight_g: '60' } },
      };
    },
    buildIdentityNormalizationPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildIdentityNormalizationPhaseCallsiteContextFn', payload]);
      return payload;
    },
    buildIdentityNormalizationContextFn: (payload) => {
      calls.push(['buildIdentityNormalizationContextFn', payload]);
      return {
        identityPublishThreshold: 0.8,
        identityAbort: false,
        identityProvisional: true,
        identityFull: false,
        normalized: { fields: { weight_g: '60' }, quality: {} },
        provenance: { weight_g: [{ url: 'https://example.com/spec' }] },
        candidates: [{ field: 'weight_g' }],
        fieldsBelowPassTarget: ['weight_g'],
        criticalFieldsBelowPassTarget: ['weight_g'],
        newValuesProposed: [{ field: 'weight_g', value: '60' }],
      };
    },
    runComponentPriorPhaseFn: async (payload) => {
      calls.push(['runComponentPriorPhaseFn', payload]);
      assert.deepEqual(payload.fieldsBelowPassTarget, ['weight_g']);
      return {
        componentPriorFilledFields: ['shape'],
        componentPriorMatches: ['shell'],
        fieldsBelowPassTarget: ['battery_life'],
        criticalFieldsBelowPassTarget: [],
      };
    },
    runDeterministicCriticPhaseFn: (payload) => {
      calls.push(['runDeterministicCriticPhaseFn', payload]);
      assert.deepEqual(payload.fieldsBelowPassTarget, ['battery_life']);
      return {
        criticDecisions: { accept: [{ field: 'shape' }] },
        fieldsBelowPassTarget: ['polling_hz'],
        criticalFieldsBelowPassTarget: [],
      };
    },
    runLlmValidatorPhaseFn: async (payload) => {
      calls.push(['runLlmValidatorPhaseFn', payload]);
      assert.equal(payload.identityProvisional, true);
      return {
        llmValidatorDecisions: { enabled: true, accept: [{ field: 'shape' }] },
        fieldsBelowPassTarget: ['sensor'],
        criticalFieldsBelowPassTarget: [],
      };
    },
    runInferencePolicyPhaseFn: (payload) => {
      calls.push(['runInferencePolicyPhaseFn', payload]);
      assert.deepEqual(payload.fieldsBelowPassTarget, ['sensor']);
      return {
        temporalEvidence: { hits: 2 },
        inferenceResult: { filled_fields: ['shape'] },
        fieldsBelowPassTarget: ['sensor'],
        criticalFieldsBelowPassTarget: [],
      };
    },
    runAggressiveExtractionPhaseFn: async (payload) => {
      calls.push(['runAggressiveExtractionPhaseFn', payload]);
      assert.deepEqual(payload.runtimeEvidencePack, { pack: true });
      return {
        aggressiveExtraction: { enabled: true },
        fieldsBelowPassTarget: ['dpi'],
        criticalFieldsBelowPassTarget: [],
      };
    },
    applyRuntimeGateAndCurationFn: async (payload) => {
      calls.push(['applyRuntimeGateAndCurationFn', payload]);
      assert.deepEqual(payload.runtimeEvidencePack, { pack: true });
      return {
        runtimeGateResult: { failures: [] },
        normalizedFields: { weight_g: '59' },
        fieldsBelowPassTarget: ['weight_g'],
        criticalFieldsBelowPassTarget: [],
        curationSuggestionResult: { appended_count: 1 },
      };
    },
    buildValidationGatePhaseCallsiteContextFn: (payload) => {
      calls.push(['buildValidationGatePhaseCallsiteContextFn', payload]);
      assert.deepEqual(payload.criticalFieldsBelowPassTarget, []);
      return payload;
    },
    buildValidationGateContextFn: (payload) => {
      calls.push(['buildValidationGateContextFn', payload]);
      return {
        completenessStats: { completenessRequired: 0.9 },
        coverageStats: { coverageOverall: 0.85 },
        confidence: 0.91,
        gate: { validated: true, validatedReason: 'validated' },
        publishable: true,
        publishBlockers: [],
      };
    },
    buildConstraintAnalysisPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildConstraintAnalysisPhaseCallsiteContextFn', payload]);
      return payload;
    },
    buildConstraintAnalysisContextFn: (payload) => {
      calls.push(['buildConstraintAnalysisContextFn', payload]);
      return {
        manufacturerSources: [{ url: 'https://example.com/spec' }],
        manufacturerMajorConflicts: 0,
        endpointMining: { endpoint_count: 3 },
        constraintAnalysis: { conflicts: [] },
      };
    },
    buildNeedsetReasoningPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildNeedsetReasoningPhaseCallsiteContextFn', payload]);
      return payload;
    },
    buildNeedsetReasoningContextFn: (payload) => {
      calls.push(['buildNeedsetReasoningContextFn', payload]);
      return {
        hypothesisQueue: [{ field: 'weight_g' }],
        fieldReasoning: { weight_g: { reason: 'missing' } },
        trafficLight: { yellow: ['weight_g'] },
        extractionGateOpen: true,
        needSet: { needs: [{ field_key: 'weight_g' }] },
      };
    },
    buildPhase07PrimeSourcesOptionsFn: (payload) => {
      calls.push(['buildPhase07PrimeSourcesOptionsFn', payload]);
      return { maxSources: 3 };
    },
    buildPhase07PrimeSourcesPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildPhase07PrimeSourcesPhaseCallsiteContextFn', payload]);
      return payload;
    },
    buildPhase07PrimeSourcesContextFn: (payload) => {
      calls.push(['buildPhase07PrimeSourcesContextFn', payload]);
      return {
        phase07PrimeSources: { summary: { refs_selected_total: 2 } },
      };
    },
    buildPhase08ExtractionPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildPhase08ExtractionPhaseCallsiteContextFn', payload]);
      return payload;
    },
    buildPhase08ExtractionContextFn: (payload) => {
      calls.push(['buildPhase08ExtractionContextFn', payload]);
      return {
        phase08SummaryFromBatches: { batch_count: 1 },
        phase08Extraction: { summary: { accepted_candidate_count: 3 } },
      };
    },
    buildFinalizationMetricsPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildFinalizationMetricsPhaseCallsiteContextFn', payload]);
      return payload;
    },
    buildFinalizationMetricsContextFn: (payload) => {
      calls.push(['buildFinalizationMetricsContextFn', payload]);
      return {
        parserHealthRows: [{ score: 1 }],
        parserHealthAverage: 0.44,
        fingerprintCount: 7,
        contribution: { llmFields: ['shape'] },
      };
    },
  });

  assert.deepEqual(
    calls.map(([name]) => name),
    [
      'buildDedicatedSyntheticSourceIngestionContextFn',
      'runDedicatedSyntheticSourceIngestionPhaseFn',
      'buildIdentityConsensusPhaseCallsiteContextFn',
      'buildIdentityConsensusContextFn',
      'buildIdentityNormalizationPhaseCallsiteContextFn',
      'buildIdentityNormalizationContextFn',
      'runComponentPriorPhaseFn',
      'runDeterministicCriticPhaseFn',
      'runLlmValidatorPhaseFn',
      'runInferencePolicyPhaseFn',
      'selectAggressiveEvidencePackFn',
      'runAggressiveExtractionPhaseFn',
      'applyRuntimeGateAndCurationFn',
      'buildValidationGatePhaseCallsiteContextFn',
      'buildValidationGateContextFn',
      'buildConstraintAnalysisPhaseCallsiteContextFn',
      'buildConstraintAnalysisContextFn',
      'buildNeedsetReasoningPhaseCallsiteContextFn',
      'buildNeedsetReasoningContextFn',
      'buildPhase07PrimeSourcesOptionsFn',
      'buildPhase07PrimeSourcesPhaseCallsiteContextFn',
      'buildPhase07PrimeSourcesContextFn',
      'buildPhase08ExtractionPhaseCallsiteContextFn',
      'buildPhase08ExtractionContextFn',
      'buildFinalizationMetricsPhaseCallsiteContextFn',
      'buildFinalizationMetricsContextFn',
    ],
  );

  assert.deepEqual(result.normalized.fields, { weight_g: '59' });
  assert.equal(result.confidence, 0.91);
  assert.equal(result.gate.validated, true);
  assert.equal(result.publishable, true);
  assert.deepEqual(result.componentPriorFilledFields, ['shape']);
  assert.deepEqual(result.componentPriorMatches, ['shell']);
  assert.deepEqual(result.criticDecisions, { accept: [{ field: 'shape' }] });
  assert.deepEqual(result.llmValidatorDecisions, { enabled: true, accept: [{ field: 'shape' }] });
  assert.deepEqual(result.runtimeEvidencePack, { pack: true });
  assert.deepEqual(result.phase07PrimeSources, { summary: { refs_selected_total: 2 } });
  assert.deepEqual(result.phase08Extraction, { summary: { accepted_candidate_count: 3 } });
  assert.equal(result.durationMs, 1500);
});

test('runProductFinalizationDerivation disables expensive finalization phases when max run budget is already reached', async () => {
  const calls = [];

  const result = await runProductFinalizationDerivation({
    job: {},
    runId: 'run-1',
    sourceResults: [],
    config: {
      llmWriteSummary: true,
    },
    categoryConfig: { criticalFieldSet: new Set() },
    terminalReason: 'max_run_seconds_reached',
    fieldOrder: [],
    llmValidatorDecisions: { enabled: false, prior: true },
    buildDedicatedSyntheticSourceIngestionContextFn: (payload) => payload,
    runDedicatedSyntheticSourceIngestionPhaseFn: async () => {},
    buildIdentityConsensusPhaseCallsiteContextFn: (payload) => payload,
    buildIdentityConsensusContextFn: () => ({
      identityGate: { validated: true, needsReview: false, reasonCodes: [] },
      identityConfidence: 0.92,
      identityReport: {},
      identity: {},
      sourceSummary: {},
      allAnchorConflicts: [],
      anchorMajorConflictsCount: 0,
      consensus: {},
    }),
    buildIdentityNormalizationPhaseCallsiteContextFn: (payload) => payload,
    buildIdentityNormalizationContextFn: () => ({
      identityPublishThreshold: 0.8,
      identityAbort: false,
      identityProvisional: false,
      identityFull: true,
      normalized: { fields: {}, quality: {} },
      provenance: {},
      candidates: [],
      fieldsBelowPassTarget: [],
      criticalFieldsBelowPassTarget: [],
      newValuesProposed: [],
    }),
    runComponentPriorPhaseFn: async () => ({
      componentPriorFilledFields: [],
      componentPriorMatches: [],
      fieldsBelowPassTarget: [],
      criticalFieldsBelowPassTarget: [],
    }),
    runDeterministicCriticPhaseFn: () => ({
      criticDecisions: {},
      fieldsBelowPassTarget: [],
      criticalFieldsBelowPassTarget: [],
    }),
    runLlmValidatorPhaseFn: async () => {
      calls.push('runLlmValidatorPhaseFn');
      return {};
    },
    runInferencePolicyPhaseFn: () => ({
      temporalEvidence: {},
      inferenceResult: {},
      fieldsBelowPassTarget: [],
      criticalFieldsBelowPassTarget: [],
    }),
    selectAggressiveEvidencePackFn: () => null,
    runAggressiveExtractionPhaseFn: async () => {
      calls.push('runAggressiveExtractionPhaseFn');
      return {};
    },
    applyRuntimeGateAndCurationFn: async () => ({
      runtimeGateResult: {},
      normalizedFields: {},
      fieldsBelowPassTarget: [],
      criticalFieldsBelowPassTarget: [],
      curationSuggestionResult: {},
    }),
    buildValidationGatePhaseCallsiteContextFn: (payload) => payload,
    buildValidationGateContextFn: () => ({
      completenessStats: {},
      coverageStats: {},
      confidence: 0.9,
      gate: { validated: true, validatedReason: 'validated' },
      publishable: true,
      publishBlockers: [],
    }),
    buildConstraintAnalysisPhaseCallsiteContextFn: (payload) => payload,
    buildConstraintAnalysisContextFn: () => ({
      manufacturerSources: [],
      manufacturerMajorConflicts: 0,
      endpointMining: {},
      constraintAnalysis: {},
    }),
    buildNeedsetReasoningPhaseCallsiteContextFn: (payload) => payload,
    buildNeedsetReasoningContextFn: () => ({
      hypothesisQueue: [],
      fieldReasoning: {},
      trafficLight: {},
      extractionGateOpen: true,
      needSet: {},
    }),
    buildPhase07PrimeSourcesOptionsFn: () => ({}),
    buildPhase07PrimeSourcesPhaseCallsiteContextFn: (payload) => payload,
    buildPhase07PrimeSourcesContextFn: () => ({
      phase07PrimeSources: {},
    }),
    buildPhase08ExtractionPhaseCallsiteContextFn: (payload) => payload,
    buildPhase08ExtractionContextFn: () => ({
      phase08SummaryFromBatches: {},
      phase08Extraction: {},
    }),
    buildFinalizationMetricsPhaseCallsiteContextFn: (payload) => payload,
    buildFinalizationMetricsContextFn: () => ({
      parserHealthRows: [],
      parserHealthAverage: 0,
      fingerprintCount: 0,
      contribution: {},
    }),
  });

  assert.deepEqual(calls, []);
  assert.deepEqual(result.llmValidatorDecisions, { enabled: false, prior: true });
  assert.equal(result.aggressiveExtraction, null);
  assert.equal(result.constrainedFinalizationConfig.llmWriteSummary, false);
});

test('runProductFinalizationDerivation uses seed schema4 from discoveryResult instead of calling LLM', async () => {
  const schema4Panel = {
    bundles: [{
      key: 'sensor_performance',
      label: 'Sensor & Performance',
      priority: 'core',
      phase: 'now',
      fields: [],
      queries: ['logitech g pro x superlight 2 sensor'],
    }],
    profile_influence: { manufacturer_html: 2, total_queries: 3 },
    deltas: [],
    round: 0,
  };
  const schema4Output = {
    schema_version: 'needset_planner_output.v2',
    panel: schema4Panel,
    search_plan_handoff: { queries: [{ q: 'logitech g pro x superlight 2 sensor', family: 'manufacturer_html' }] },
  };

  const result = await runProductFinalizationDerivation({
    job: { identityLock: { brand: 'Logitech' } },
    runId: 'run-1',
    sourceResults: [],
    config: {},
    productId: 'product-1',
    category: 'mouse',
    categoryConfig: { criticalFieldSet: new Set(), fieldGroupsData: { sensor_performance: {} } },
    fieldOrder: ['sensor'],
    llmValidatorDecisions: {},
    logger: { warn: () => {} },
    llmContext: {},
    discoveryResult: { enabled: true, seed_search_plan_output: schema4Output },
    buildDedicatedSyntheticSourceIngestionContextFn: (p) => p,
    runDedicatedSyntheticSourceIngestionPhaseFn: async () => {},
    buildIdentityConsensusPhaseCallsiteContextFn: (p) => p,
    buildIdentityConsensusContextFn: () => ({
      identityGate: { validated: true, reasonCodes: [] },
      identityConfidence: 0.9, identityReport: {}, identity: { brand: 'Logitech' },
      sourceSummary: {}, allAnchorConflicts: [], anchorMajorConflictsCount: 0, consensus: {},
    }),
    buildIdentityNormalizationPhaseCallsiteContextFn: (p) => p,
    buildIdentityNormalizationContextFn: () => ({
      identityPublishThreshold: 0.8, identityProvisional: false, identityFull: true,
      normalized: { fields: {} }, provenance: {}, candidates: [],
      fieldsBelowPassTarget: [], criticalFieldsBelowPassTarget: [], newValuesProposed: [],
    }),
    runComponentPriorPhaseFn: async () => ({ componentPriorFilledFields: [], componentPriorMatches: [], fieldsBelowPassTarget: [], criticalFieldsBelowPassTarget: [] }),
    runDeterministicCriticPhaseFn: () => ({ criticDecisions: {}, fieldsBelowPassTarget: [], criticalFieldsBelowPassTarget: [] }),
    runLlmValidatorPhaseFn: async () => ({ llmValidatorDecisions: {}, fieldsBelowPassTarget: [], criticalFieldsBelowPassTarget: [] }),
    runInferencePolicyPhaseFn: () => ({ temporalEvidence: {}, inferenceResult: {}, fieldsBelowPassTarget: [], criticalFieldsBelowPassTarget: [] }),
    selectAggressiveEvidencePackFn: () => null,
    runAggressiveExtractionPhaseFn: async () => ({ aggressiveExtraction: null, fieldsBelowPassTarget: [], criticalFieldsBelowPassTarget: [] }),
    applyRuntimeGateAndCurationFn: async () => ({ runtimeGateResult: {}, normalizedFields: {}, fieldsBelowPassTarget: [], criticalFieldsBelowPassTarget: [], curationSuggestionResult: {} }),
    buildValidationGatePhaseCallsiteContextFn: (p) => p,
    buildValidationGateContextFn: () => ({ completenessStats: {}, coverageStats: {}, confidence: 0.9, gate: { validated: true, validatedReason: 'ok' }, publishable: true, publishBlockers: [] }),
    buildConstraintAnalysisPhaseCallsiteContextFn: (p) => p,
    buildConstraintAnalysisContextFn: () => ({ manufacturerSources: [], manufacturerMajorConflicts: 0, endpointMining: {}, constraintAnalysis: {} }),
    buildNeedsetReasoningPhaseCallsiteContextFn: (p) => p,
    buildNeedsetReasoningContextFn: () => ({
      hypothesisQueue: [], fieldReasoning: {}, trafficLight: {},
      extractionGateOpen: true,
      needSet: { fields: [{ field_key: 'sensor', state: 'missing', required_level: 'critical' }], total_fields: 1 },
    }),
    buildPhase07PrimeSourcesOptionsFn: () => ({}),
    buildPhase07PrimeSourcesPhaseCallsiteContextFn: (p) => p,
    buildPhase07PrimeSourcesContextFn: () => ({ phase07PrimeSources: {} }),
    buildPhase08ExtractionPhaseCallsiteContextFn: (p) => p,
    buildPhase08ExtractionContextFn: () => ({ phase08Extraction: {} }),
    buildFinalizationMetricsPhaseCallsiteContextFn: (p) => p,
    buildFinalizationMetricsContextFn: () => ({ parserHealthRows: [], parserHealthAverage: 0, fingerprintCount: 0, contribution: {} }),
  });

  // needSet is enriched with seed Schema 4 panel data
  assert.deepEqual(result.needSet.bundles, schema4Panel.bundles);
  assert.deepEqual(result.needSet.profile_influence, schema4Panel.profile_influence);
  assert.equal(result.needSet.schema_version, 'needset_planner_output.v2');
  assert.equal(result.needSet.round, 0);

  // searchPlanOutput is the seed schema4 output (no LLM call in finalization)
  assert.deepEqual(result.searchPlanOutput, schema4Output);
});

test('buildRunProductFinalizationSummary captures runtime usage and builds the canonical run summary payload', () => {
  const calls = [];
  const summary = { runId: 'run-1', validated: true };
  const normalizeAmbiguityLevelFn = (payload) => payload;
  const isHelperSyntheticSourceFn = (payload) => payload;
  const buildTopEvidenceReferencesFn = (payload) => payload;

  const result = buildRunProductFinalizationSummary({
    llmRuntime: {
      getUsageState: () => {
        calls.push('getUsageState');
        return {
          llmCallCount: 6,
          llmCostUsd: 0.12,
          llmEstimatedUsageCount: 4,
          llmRetryWithoutSchemaCount: 1,
        };
      },
    },
    productId: 'product-1',
    runId: 'run-1',
    category: 'mouse',
    config: { runProfile: 'thorough' },
    runtimeMode: 'aggressive',
    identityFingerprint: 'brand:model',
    identityLockStatus: 'locked',
    dedupeMode: 'strict',
    gate: { validated: true },
    validatedReason: 'validated',
    confidence: 0.91,
    completenessStats: { completenessRequired: 0.88 },
    coverageStats: { coverageOverall: 0.84 },
    targets: { targetCompleteness: 0.9 },
    anchors: { shape: 'symmetrical' },
    allAnchorConflicts: [{ severity: 'MAJOR' }],
    anchorMajorConflictsCount: 1,
    identityConfidence: 0.92,
    identityGate: { validated: true },
    extractionGateOpen: true,
    identityLock: { family_model_count: 2 },
    publishable: true,
    publishBlockers: [],
    identityReport: { status: 'ok' },
    fieldsBelowPassTarget: ['weight_g'],
    criticalFieldsBelowPassTarget: [],
    newValuesProposed: [{ field: 'weight_g', value: '59' }],
    provenance: { weight_g: [{ url: 'https://example.com/spec' }] },
    sourceResults: [{ url: 'https://example.com/spec' }],
    discoveryResult: { enabled: true },
    indexingHelperFlowEnabled: true,
    helperContext: { active: true },
    helperSupportiveSyntheticSources: [{ url: 'helper://supportive/one' }],
    helperFilledFields: ['weight_g'],
    helperFilledByMethod: { supportive: 1 },
    helperMismatches: [{ field: 'dpi' }],
    componentPriorFilledFields: ['shape'],
    componentPriorMatches: ['shell'],
    criticDecisions: { accept: [] },
    llmValidatorDecisions: { enabled: false },
    runtimeFieldRulesEngine: { version: 'v1' },
    runtimeGateResult: { failures: [] },
    curationSuggestionResult: { appended_count: 1 },
    llmTargetFields: ['shape'],
    goldenExamples: [{ id: 1 }],
    llmCandidatesAccepted: 3,
    llmSourcesUsed: 2,
    contribution: { llmFields: ['shape'] },
    llmContext: { verification: { done: true } },
    aggressiveExtraction: { enabled: false },
    categoryConfig: { category: 'mouse' },
    fetcherMode: 'playwright',
    fetcherStartFallbackReason: null,
    indexingResumeKey: 'resume/key',
    resumeMode: 'resume',
    resumeMaxAgeHours: 24,
    previousResumeStateAgeHours: 2,
    resumeReextractEnabled: true,
    resumeReextractAfterHours: 48,
    resumeSeededPendingCount: 1,
    resumeSeededLlmRetryCount: 2,
    resumeSeededReextractCount: 3,
    resumePersistedPendingCount: 4,
    resumePersistedLlmRetryCount: 5,
    resumePersistedSuccessCount: 6,
    manufacturerSources: [{ url: 'https://example.com/spec' }],
    manufacturerMajorConflicts: 0,
    plannerStats: { pending: 2 },
    endpointMining: { endpoint_count: 3 },
    temporalEvidence: { hits: 1 },
    inferenceResult: { filled_fields: ['shape'] },
    hypothesisQueue: [{ field: 'shape' }],
    hypothesisFollowupRoundsExecuted: 1,
    hypothesisFollowupSeededUrls: ['https://seed.example.com'],
    constraintAnalysis: { conflicts: [] },
    fieldReasoning: { shape: { reason: 'anchored' } },
    trafficLight: { green: ['shape'] },
    needSet: { needs: [{ field_key: 'shape' }] },
    phase07PrimeSources: { summary: { refs_selected_total: 2 } },
    phase08Extraction: { summary: { accepted_candidate_count: 3 } },
    parserHealthRows: [{ score: 1 }],
    parserHealthAverage: 0.44,
    fingerprintCount: 7,
    durationMs: 1234,
    roundContext: { round: 2 },
    normalizeAmbiguityLevelFn,
    isHelperSyntheticSourceFn,
    buildTopEvidenceReferencesFn,
    buildRunSummaryPayloadPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildRunSummaryPayloadPhaseCallsiteContextFn', payload]);
      return payload;
    },
    buildRunSummaryPayloadContextFn: (payload) => {
      calls.push(['buildRunSummaryPayloadContextFn', payload]);
      return { summaryContext: payload };
    },
    buildRunSummaryPayloadFn: (payload) => {
      calls.push(['buildRunSummaryPayloadFn', payload]);
      return summary;
    },
  });

  assert.deepEqual(calls, [
    'getUsageState',
    ['buildRunSummaryPayloadPhaseCallsiteContextFn', {
      productId: 'product-1',
      runId: 'run-1',
      category: 'mouse',
      config: { runProfile: 'thorough' },
      runtimeMode: 'aggressive',
      identityFingerprint: 'brand:model',
      identityLockStatus: 'locked',
      dedupeMode: 'strict',
      gate: { validated: true },
      validatedReason: 'validated',
      confidence: 0.91,
      completenessStats: { completenessRequired: 0.88 },
      coverageStats: { coverageOverall: 0.84 },
      targets: { targetCompleteness: 0.9 },
      anchors: { shape: 'symmetrical' },
      allAnchorConflicts: [{ severity: 'MAJOR' }],
      anchorMajorConflictsCount: 1,
      identityConfidence: 0.92,
      identityGate: { validated: true },
      extractionGateOpen: true,
      identityLock: { family_model_count: 2 },
      publishable: true,
      publishBlockers: [],
      identityReport: { status: 'ok' },
      fieldsBelowPassTarget: ['weight_g'],
      criticalFieldsBelowPassTarget: [],
      newValuesProposed: [{ field: 'weight_g', value: '59' }],
      provenance: { weight_g: [{ url: 'https://example.com/spec' }] },
      sourceResults: [{ url: 'https://example.com/spec' }],
      discoveryResult: { enabled: true },
      indexingHelperFlowEnabled: true,
      helperContext: { active: true },
      helperSupportiveSyntheticSources: [{ url: 'helper://supportive/one' }],
      helperFilledFields: ['weight_g'],
      helperFilledByMethod: { supportive: 1 },
      helperMismatches: [{ field: 'dpi' }],
      componentPriorFilledFields: ['shape'],
      componentPriorMatches: ['shell'],
      criticDecisions: { accept: [] },
      llmValidatorDecisions: { enabled: false },
      runtimeFieldRulesEngine: { version: 'v1' },
      runtimeGateResult: { failures: [] },
      curationSuggestionResult: { appended_count: 1 },
      llmTargetFields: ['shape'],
      goldenExamples: [{ id: 1 }],
      llmCandidatesAccepted: 3,
      llmSourcesUsed: 2,
      contribution: { llmFields: ['shape'] },
      llmRetryWithoutSchemaCount: 1,
      llmEstimatedUsageCount: 4,
      llmContext: { verification: { done: true } },
      llmCallCount: 6,
      llmCostUsd: 0.12,
        aggressiveExtraction: { enabled: false },
      categoryConfig: { category: 'mouse' },
      fetcherMode: 'playwright',
      fetcherStartFallbackReason: null,
      indexingResumeKey: 'resume/key',
      resumeMode: 'resume',
      resumeMaxAgeHours: 24,
      previousResumeStateAgeHours: 2,
      resumeReextractEnabled: true,
      resumeReextractAfterHours: 48,
      resumeSeededPendingCount: 1,
      resumeSeededLlmRetryCount: 2,
      resumeSeededReextractCount: 3,
      resumePersistedPendingCount: 4,
      resumePersistedLlmRetryCount: 5,
      resumePersistedSuccessCount: 6,
      manufacturerSources: [{ url: 'https://example.com/spec' }],
      manufacturerMajorConflicts: 0,
      plannerStats: { pending: 2 },
      endpointMining: { endpoint_count: 3 },
      temporalEvidence: { hits: 1 },
      inferenceResult: { filled_fields: ['shape'] },
      hypothesisQueue: [{ field: 'shape' }],
      hypothesisFollowupRoundsExecuted: 1,
      hypothesisFollowupSeededUrls: ['https://seed.example.com'],
      constraintAnalysis: { conflicts: [] },
      fieldReasoning: { shape: { reason: 'anchored' } },
      trafficLight: { green: ['shape'] },
      needSet: { needs: [{ field_key: 'shape' }] },
      phase07PrimeSources: { summary: { refs_selected_total: 2 } },
      phase08Extraction: { summary: { accepted_candidate_count: 3 } },
      parserHealthRows: [{ score: 1 }],
      parserHealthAverage: 0.44,
      fingerprintCount: 7,
      durationMs: 1234,
      roundContext: { round: 2 },
      normalizeAmbiguityLevel: normalizeAmbiguityLevelFn,
      isHelperSyntheticSource: isHelperSyntheticSourceFn,
      buildTopEvidenceReferences: buildTopEvidenceReferencesFn,
    }],
    ['buildRunSummaryPayloadContextFn', {
      productId: 'product-1',
      runId: 'run-1',
      category: 'mouse',
      config: { runProfile: 'thorough' },
      runtimeMode: 'aggressive',
      identityFingerprint: 'brand:model',
      identityLockStatus: 'locked',
      dedupeMode: 'strict',
      gate: { validated: true },
      validatedReason: 'validated',
      confidence: 0.91,
      completenessStats: { completenessRequired: 0.88 },
      coverageStats: { coverageOverall: 0.84 },
      targets: { targetCompleteness: 0.9 },
      anchors: { shape: 'symmetrical' },
      allAnchorConflicts: [{ severity: 'MAJOR' }],
      anchorMajorConflictsCount: 1,
      identityConfidence: 0.92,
      identityGate: { validated: true },
      extractionGateOpen: true,
      identityLock: { family_model_count: 2 },
      publishable: true,
      publishBlockers: [],
      identityReport: { status: 'ok' },
      fieldsBelowPassTarget: ['weight_g'],
      criticalFieldsBelowPassTarget: [],
      newValuesProposed: [{ field: 'weight_g', value: '59' }],
      provenance: { weight_g: [{ url: 'https://example.com/spec' }] },
      sourceResults: [{ url: 'https://example.com/spec' }],
      discoveryResult: { enabled: true },
      indexingHelperFlowEnabled: true,
      helperContext: { active: true },
      helperSupportiveSyntheticSources: [{ url: 'helper://supportive/one' }],
      helperFilledFields: ['weight_g'],
      helperFilledByMethod: { supportive: 1 },
      helperMismatches: [{ field: 'dpi' }],
      componentPriorFilledFields: ['shape'],
      componentPriorMatches: ['shell'],
      criticDecisions: { accept: [] },
      llmValidatorDecisions: { enabled: false },
      runtimeFieldRulesEngine: { version: 'v1' },
      runtimeGateResult: { failures: [] },
      curationSuggestionResult: { appended_count: 1 },
      llmTargetFields: ['shape'],
      goldenExamples: [{ id: 1 }],
      llmCandidatesAccepted: 3,
      llmSourcesUsed: 2,
      contribution: { llmFields: ['shape'] },
      llmRetryWithoutSchemaCount: 1,
      llmEstimatedUsageCount: 4,
      llmContext: { verification: { done: true } },
      llmCallCount: 6,
      llmCostUsd: 0.12,
        aggressiveExtraction: { enabled: false },
      categoryConfig: { category: 'mouse' },
      fetcherMode: 'playwright',
      fetcherStartFallbackReason: null,
      indexingResumeKey: 'resume/key',
      resumeMode: 'resume',
      resumeMaxAgeHours: 24,
      previousResumeStateAgeHours: 2,
      resumeReextractEnabled: true,
      resumeReextractAfterHours: 48,
      resumeSeededPendingCount: 1,
      resumeSeededLlmRetryCount: 2,
      resumeSeededReextractCount: 3,
      resumePersistedPendingCount: 4,
      resumePersistedLlmRetryCount: 5,
      resumePersistedSuccessCount: 6,
      manufacturerSources: [{ url: 'https://example.com/spec' }],
      manufacturerMajorConflicts: 0,
      plannerStats: { pending: 2 },
      endpointMining: { endpoint_count: 3 },
      temporalEvidence: { hits: 1 },
      inferenceResult: { filled_fields: ['shape'] },
      hypothesisQueue: [{ field: 'shape' }],
      hypothesisFollowupRoundsExecuted: 1,
      hypothesisFollowupSeededUrls: ['https://seed.example.com'],
      constraintAnalysis: { conflicts: [] },
      fieldReasoning: { shape: { reason: 'anchored' } },
      trafficLight: { green: ['shape'] },
      needSet: { needs: [{ field_key: 'shape' }] },
      phase07PrimeSources: { summary: { refs_selected_total: 2 } },
      phase08Extraction: { summary: { accepted_candidate_count: 3 } },
      parserHealthRows: [{ score: 1 }],
      parserHealthAverage: 0.44,
      fingerprintCount: 7,
      durationMs: 1234,
      roundContext: { round: 2 },
      normalizeAmbiguityLevel: normalizeAmbiguityLevelFn,
      isHelperSyntheticSource: isHelperSyntheticSourceFn,
      buildTopEvidenceReferences: buildTopEvidenceReferencesFn,
    }],
    ['buildRunSummaryPayloadFn', {
      summaryContext: {
        productId: 'product-1',
        runId: 'run-1',
        category: 'mouse',
        config: { runProfile: 'thorough' },
        runtimeMode: 'aggressive',
        identityFingerprint: 'brand:model',
        identityLockStatus: 'locked',
        dedupeMode: 'strict',
        gate: { validated: true },
        validatedReason: 'validated',
        confidence: 0.91,
        completenessStats: { completenessRequired: 0.88 },
        coverageStats: { coverageOverall: 0.84 },
        targets: { targetCompleteness: 0.9 },
        anchors: { shape: 'symmetrical' },
        allAnchorConflicts: [{ severity: 'MAJOR' }],
        anchorMajorConflictsCount: 1,
        identityConfidence: 0.92,
        identityGate: { validated: true },
        extractionGateOpen: true,
        identityLock: { family_model_count: 2 },
        publishable: true,
        publishBlockers: [],
        identityReport: { status: 'ok' },
        fieldsBelowPassTarget: ['weight_g'],
        criticalFieldsBelowPassTarget: [],
        newValuesProposed: [{ field: 'weight_g', value: '59' }],
        provenance: { weight_g: [{ url: 'https://example.com/spec' }] },
        sourceResults: [{ url: 'https://example.com/spec' }],
        discoveryResult: { enabled: true },
        indexingHelperFlowEnabled: true,
        helperContext: { active: true },
        helperSupportiveSyntheticSources: [{ url: 'helper://supportive/one' }],
        helperFilledFields: ['weight_g'],
        helperFilledByMethod: { supportive: 1 },
        helperMismatches: [{ field: 'dpi' }],
        componentPriorFilledFields: ['shape'],
        componentPriorMatches: ['shell'],
        criticDecisions: { accept: [] },
        llmValidatorDecisions: { enabled: false },
        runtimeFieldRulesEngine: { version: 'v1' },
        runtimeGateResult: { failures: [] },
        curationSuggestionResult: { appended_count: 1 },
        llmTargetFields: ['shape'],
        goldenExamples: [{ id: 1 }],
        llmCandidatesAccepted: 3,
        llmSourcesUsed: 2,
        contribution: { llmFields: ['shape'] },
        llmRetryWithoutSchemaCount: 1,
        llmEstimatedUsageCount: 4,
        llmContext: { verification: { done: true } },
        llmCallCount: 6,
        llmCostUsd: 0.12,
            aggressiveExtraction: { enabled: false },
        categoryConfig: { category: 'mouse' },
        fetcherMode: 'playwright',
        fetcherStartFallbackReason: null,
        indexingResumeKey: 'resume/key',
        resumeMode: 'resume',
        resumeMaxAgeHours: 24,
        previousResumeStateAgeHours: 2,
        resumeReextractEnabled: true,
        resumeReextractAfterHours: 48,
        resumeSeededPendingCount: 1,
        resumeSeededLlmRetryCount: 2,
        resumeSeededReextractCount: 3,
        resumePersistedPendingCount: 4,
        resumePersistedLlmRetryCount: 5,
        resumePersistedSuccessCount: 6,
        manufacturerSources: [{ url: 'https://example.com/spec' }],
        manufacturerMajorConflicts: 0,
        plannerStats: { pending: 2 },
        endpointMining: { endpoint_count: 3 },
        temporalEvidence: { hits: 1 },
        inferenceResult: { filled_fields: ['shape'] },
        hypothesisQueue: [{ field: 'shape' }],
        hypothesisFollowupRoundsExecuted: 1,
        hypothesisFollowupSeededUrls: ['https://seed.example.com'],
        constraintAnalysis: { conflicts: [] },
        fieldReasoning: { shape: { reason: 'anchored' } },
        trafficLight: { green: ['shape'] },
        needSet: { needs: [{ field_key: 'shape' }] },
        phase07PrimeSources: { summary: { refs_selected_total: 2 } },
        phase08Extraction: { summary: { accepted_candidate_count: 3 } },
        parserHealthRows: [{ score: 1 }],
        parserHealthAverage: 0.44,
        fingerprintCount: 7,
        durationMs: 1234,
        roundContext: { round: 2 },
        normalizeAmbiguityLevel: normalizeAmbiguityLevelFn,
        isHelperSyntheticSource: isHelperSyntheticSourceFn,
        buildTopEvidenceReferences: buildTopEvidenceReferencesFn,
      },
    }],
  ]);

  assert.equal(result.summary, summary);
  assert.equal(result.llmCallCount, 6);
  assert.equal(result.llmCostUsd, 0.12);
  assert.equal(result.llmEstimatedUsageCount, 4);
  assert.equal(result.llmRetryWithoutSchemaCount, 1);
});

test('buildRunSummaryPayload assembles canonical run summary with stable helper/identity/reasoning sections', () => {
  const provenance = { shape: { confidence: 0.9 } };
  const sourceResults = [
    {
      role: 'manufacturer',
      identity: { match: true },
      url: 'https://example.com/spec',
      finalUrl: 'https://example.com/spec#final',
    },
    {
      role: 'manufacturer',
      identity: { match: false },
      url: 'helper://supportive/row',
    },
    {
      role: 'review',
      identity: { match: false },
      url: 'https://review.example.com/item',
    },
  ];

  const summary = buildRunSummaryPayload({
    productId: 'mouse-1',
    runId: 'run-1',
    category: 'mouse',
    config: {
      runProfile: 'thorough',
      fetchCandidateSources: true,
      llmApiKey: 'present',
      llmProvider: 'openai',
      llmModelExtract: 'gpt-4.1-mini',
      llmModelPlan: 'gpt-4.1-mini',
      llmModelValidate: 'gpt-4.1-mini',
      llmVerifyMode: true,
      categoryAuthorityEnabled: true,
      indexingCategoryAuthorityEnabled: true,
      categoryAuthorityRoot: 'category_authority',
      fieldRulesEngineEnforceEvidence: true,
      maxRunSeconds: 300,
      maxUrlsPerProduct: 50,
      maxPagesPerDomain: 8,
      endpointSignalLimit: 100,
      endpointSuggestionLimit: 20,
      endpointNetworkScanLimit: 10,
      hypothesisAutoFollowupRounds: 2,
      hypothesisFollowupUrlsPerRound: 12,
    },
    runtimeMode: 'uber_aggressive',
    identityFingerprint: 'brand:model',
    identityLockStatus: 'locked',
    dedupeMode: 'strict',
    gate: {
      validated: true,
      reasons: ['validated'],
      confidencePercent: 91,
      completenessRequiredPercent: 88,
      coverageOverallPercent: 84,
    },
    validatedReason: 'validated',
    confidence: 0.91,
    completenessStats: {
      completenessRequired: 0.88,
      requiredFields: ['shape', 'weight_g'],
      missingRequiredFields: ['weight_g'],
    },
    coverageStats: {
      coverageOverall: 0.84,
    },
    targets: {
      targetCompleteness: 0.9,
      targetConfidence: 0.8,
    },
    anchors: {
      shape: 'symmetrical',
    },
    allAnchorConflicts: [{ field: 'weight_g', severity: 'MINOR' }],
    anchorMajorConflictsCount: 1,
    identityConfidence: 0.93,
    identityGate: {
      validated: true,
      reasonCodes: ['identity_ok'],
      needsReview: false,
      contradictions: [{ source: 'aggregate', conflict: 'size_class_conflict' }],
      acceptedConflictContributors: [
        {
          url: 'https://example.com/spec',
          rootDomain: 'example.com',
          contributingConflicts: ['size_class_conflict'],
        },
      ],
      rejectedSiblingSources: [
        {
          url: 'https://review.example.com/viper-v3-hyperspeed',
          candidateModel: 'Viper V3 HyperSpeed',
          reasonCodes: ['model_mismatch'],
        },
      ],
      firstConflictTrigger: {
        source: 'aggregate',
        conflict: 'size_class_conflict',
        contributors: [{ url: 'https://example.com/spec' }],
      },
    },
    extractionGateOpen: true,
    identityLock: {
      family_model_count: 2,
      ambiguity_level: 'medium',
    },
    publishable: true,
    publishBlockers: [],
    identityReport: {
      status: 'ok',
      needs_review: false,
      reason_codes: ['identity_ok'],
      pages: [{}, {}],
      contradiction_count: 1,
      contradictions: [{ source: 'aggregate', conflict: 'size_class_conflict' }],
      accepted_exact_match_sources: [{ url: 'https://example.com/spec' }],
      accepted_conflict_contributors: [{ url: 'https://example.com/spec' }],
      rejected_sibling_sources: [
        {
          url: 'https://review.example.com/viper-v3-hyperspeed',
          candidate_model: 'Viper V3 HyperSpeed',
        },
      ],
      first_conflict_trigger: {
        source: 'aggregate',
        conflict: 'size_class_conflict',
        contributors: [{ url: 'https://example.com/spec' }],
      },
    },
    fieldsBelowPassTarget: ['weight_g'],
    criticalFieldsBelowPassTarget: ['weight_g'],
    newValuesProposed: [{ field: 'weight_g', value: 60 }],
    provenance,
    sourceResults,
    discoveryResult: {
      enabled: true,
      discoveryKey: 'disc/key',
      candidatesKey: 'cand/key',
      candidates: [{ url: 'https://x' }, { url: 'https://y' }],
      search_attempts: [{ provider: 'searxng' }],
      search_profile_key: 'profile/key',
      search_profile_run_key: 'profile/run/key',
      search_profile_latest_key: 'profile/latest/key',
    },
    indexingHelperFlowEnabled: true,
    helperContext: {
      active_match: {
        source: 'active_filtering',
        record_id: 17,
      },
      seed_urls: ['https://seed-1', 'https://seed-2'],
      stats: {
        active_total: 1,
        supportive_total: 3,
        supportive_file_count: 2,
        supportive_matched_count: 1,
      },
    },
    helperSupportiveSyntheticSources: [{ url: 'helper://supportive/one' }],
    helperFilledFields: ['weight_g'],
    helperFilledByMethod: { supportive: 1 },
    helperMismatches: [{ field: 'dpi' }, { field: 'polling_hz' }],
    componentPriorFilledFields: ['shape'],
    componentPriorMatches: ['base-shell'],
    criticDecisions: {
      accept: [{ field: 'shape' }],
      reject: [{ field: 'weight_g' }],
      unknown: [],
    },
    llmValidatorDecisions: {
      enabled: true,
      accept: [{ field: 'shape' }],
      reject: [],
      unknown: [{ field: 'weight_g' }],
    },
    runtimeFieldRulesEngine: { version: 'v1' },
    runtimeGateResult: {
      failures: [{ field: 'weight_g' }],
      warnings: [{ field: 'dpi' }],
      changes: [{ field: 'shape' }],
      curation_suggestions: [{ field: 'weight_g' }],
    },
    curationSuggestionResult: {
      appended_count: 1,
      total_count: 2,
      path: 'artifacts/curation.json',
    },
    llmTargetFields: ['shape', 'weight_g'],
    goldenExamples: [{ id: 1 }],
    llmCandidatesAccepted: 3,
    llmSourcesUsed: 2,
    contribution: {
      llmFields: ['shape'],
      componentFields: ['shell'],
    },
    llmRetryWithoutSchemaCount: 1,
    llmEstimatedUsageCount: 4,
    llmContext: {
      verification: {
        trigger: 'manual',
        done: true,
        report_key: 'verify/key',
      },
    },
    llmCallCount: 6,
    llmCostUsd: 0.123456789,
    aggressiveExtraction: {
      enabled: false,
      stage: 'disabled',
    },
    categoryConfig: {
      sources_override_key: 'source/override/key',
    },
    fetcherMode: 'playwright',
    fetcherStartFallbackReason: null,
    indexingResumeKey: 'resume/key',
    resumeMode: 'resume',
    resumeMaxAgeHours: 24,
    previousResumeStateAgeHours: 1.236,
    resumeReextractEnabled: true,
    resumeReextractAfterHours: 48,
    resumeSeededPendingCount: 5,
    resumeSeededLlmRetryCount: 2,
    resumeSeededReextractCount: 1,
    resumePersistedPendingCount: 4,
    resumePersistedLlmRetryCount: 2,
    resumePersistedSuccessCount: 3,
    manufacturerSources: sourceResults.filter((source) => source.role === 'manufacturer'),
    manufacturerMajorConflicts: 1,
    plannerStats: {
      pending: 3,
    },
    endpointMining: {
      endpoint_count: 5,
    },
    temporalEvidence: {
      hits: 12,
    },
    inferenceResult: {
      filled_fields: ['shape'],
    },
    hypothesisQueue: [{ field: 'shape', why: 'required' }],
    hypothesisFollowupRoundsExecuted: 2,
    hypothesisFollowupSeededUrls: ['https://seed-1'],
    constraintAnalysis: {
      conflicts: [],
    },
    fieldReasoning: {
      shape: { reason: 'anchored' },
    },
    trafficLight: {
      green: ['shape'],
      yellow: ['weight_g'],
      red: [],
    },
    needSet: {
      needset_size: 2,
      total_fields: 5,
      reason_counts: { required: 1 },
      required_level_counts: { critical: 1 },
      identity_lock_state: 'locked',
      identity_audit_rows: [{ id: 1 }],
      needs: [{ field_key: 'shape' }, { field_key: 'weight_g' }],
      generated_at: '2026-03-06T00:00:00.000Z',
    },
    phase07PrimeSources: {
      summary: {
        fields_attempted: 2,
        fields_with_hits: 2,
        fields_satisfied_min_refs: 1,
        fields_unsatisfied_min_refs: 1,
        refs_selected_total: 5,
        distinct_sources_selected: 3,
        avg_hits_per_field: 2.5,
      },
      generated_at: '2026-03-06T00:00:01.000Z',
    },
    phase08Extraction: {
      summary: {
        batch_count: 2,
        batch_error_count: 0,
        schema_fail_rate: 0,
        raw_candidate_count: 20,
        accepted_candidate_count: 10,
        dangling_snippet_ref_count: 1,
        dangling_snippet_ref_rate: 0.1,
        evidence_policy_violation_count: 0,
        evidence_policy_violation_rate: 0,
        min_refs_satisfied_count: 8,
        min_refs_total: 10,
        min_refs_satisfied_rate: 0.8,
      },
      validator: {
        context_field_count: 4,
        prime_source_rows: 3,
      },
      generated_at: '2026-03-06T00:00:02.000Z',
    },
    parserHealthRows: [{ score: 1 }],
    parserHealthAverage: 0.44,
    fingerprintCount: 7,
    durationMs: 1234,
    roundContext: {},
    normalizeAmbiguityLevelFn: (value) => {
      assert.equal(value, 'medium');
      return 'medium-normalized';
    },
    isHelperSyntheticSourceFn: (source) => String(source?.url || '').startsWith('helper://'),
    buildTopEvidenceReferencesFn: (provenanceArg, limit) => {
      assert.equal(provenanceArg, provenance);
      assert.equal(limit, 100);
      return [{ field: 'shape', refs: 2 }];
    },
    nowIsoFn: () => '2026-03-06T00:00:03.000Z',
  });

  assert.equal(summary.productId, 'mouse-1');
  assert.equal(summary.identity_ambiguity.ambiguity_level, 'medium-normalized');
  assert.equal(summary.manufacturer_research.attempted_sources, 2);
  assert.equal(summary.manufacturer_research.identity_matched_sources, 1);
  assert.equal(summary.identity_report.contradiction_count, 1);
  assert.equal(summary.identity_report.contradictions?.[0]?.conflict, 'size_class_conflict');
  assert.equal(summary.identity_report.accepted_exact_match_sources?.length, 1);
  assert.equal(summary.identity_report.accepted_conflict_contributors?.length, 1);
  assert.equal(summary.identity_report.rejected_sibling_sources?.[0]?.candidate_model, 'Viper V3 HyperSpeed');
  assert.equal(summary.identity_report.first_conflict_trigger?.conflict, 'size_class_conflict');
  assert.equal(summary.urls_fetched.includes('https://example.com/spec#final'), true);
  assert.equal(summary.urls_fetched.includes('https://review.example.com/item'), true);
  assert.equal(
    summary.urls_fetched.some((url) => String(url).startsWith('helper://')),
    false,
  );
  assert.equal(summary.llm.cost_usd_run, 0.12345679);
  assert.deepEqual(summary.top_evidence_references, [{ field: 'shape', refs: 2 }]);
  assert.equal(summary.generated_at, '2026-03-06T00:00:03.000Z');
});

test('buildRunSummaryPayload falls back to legacy helper root and excludes helper urls from fetched output', () => {
  const summary = buildRunSummaryPayload({
    productId: 'mouse-2',
    runId: 'run-2',
    category: 'mouse',
    config: {
      fetchCandidateSources: false,
      categoryAuthorityEnabled: true,
      indexingCategoryAuthorityEnabled: true,
      helperSupportiveFillMissing: true,
    },
    runtimeMode: 'production',
    gate: {
      validated: false,
      reasons: ['missing_fields'],
      confidencePercent: 30,
      completenessRequiredPercent: 20,
      coverageOverallPercent: 10,
    },
    validatedReason: 'missing_fields',
    completenessStats: {
      completenessRequired: 0.2,
      requiredFields: [],
      missingRequiredFields: [],
    },
    coverageStats: {
      coverageOverall: 0.1,
    },
    legacyRootFallback: 'legacy-helper-root',
    indexingHelperFlowEnabled: true,
    helperContext: {
      active_match: null,
      seed_urls: ['https://seed.example.com'],
      stats: {
        active_total: 0,
        supportive_total: 2,
        supportive_file_count: 1,
        supportive_matched_count: 1,
      },
    },
    helperSupportiveSyntheticSources: [
      { url: 'helper://supportive/one' },
      { url: 'helper://supportive/two' },
    ],
    helperFilledFields: ['weight_g'],
    helperFilledByMethod: { supportive: 1 },
    helperMismatches: [],
    sourceResults: [
      { url: 'helper://supportive/one', finalUrl: 'helper://supportive/one', identity: { match: false } },
      { url: 'https://example.com/spec', finalUrl: 'https://example.com/spec?utm_source=test', identity: { match: true } },
      { url: 'https://example.com/spec', finalUrl: 'https://example.com/spec?utm_source=test', identity: { match: true } },
      { url: 'https://review.example.com/item', identity: { match: false } },
    ],
    identityGate: { validated: false },
    identityLock: {},
    identityReport: {},
    fieldsBelowPassTarget: [],
    criticalFieldsBelowPassTarget: [],
    newValuesProposed: [],
    provenance: {},
    discoveryResult: {},
    criticDecisions: {},
    llmValidatorDecisions: {},
    runtimeGateResult: {},
    curationSuggestionResult: {},
    contribution: {},
    llmContext: {},
    aggressiveExtraction: {},
    categoryConfig: {},
    manufacturerSources: [],
    plannerStats: {},
    endpointMining: {},
    temporalEvidence: {},
    inferenceResult: {},
    hypothesisQueue: [],
    constraintAnalysis: {},
    fieldReasoning: {},
    trafficLight: {},
    needSet: {},
    phase07PrimeSources: {},
    phase08Extraction: {},
    normalizeAmbiguityLevelFn: () => '',
    isHelperSyntheticSourceFn: (source) => String(source?.url || '').startsWith('helper://'),
    buildTopEvidenceReferencesFn: () => [],
    nowIsoFn: () => '2026-03-06T00:00:04.000Z',
  });

  assert.equal(summary.category_authority.root, 'legacy-helper-root');
  assert.equal(summary.category_authority.supportive_synthetic_sources_used, 2);
  assert.equal(summary.category_authority.supportive_fill_missing_enabled, true);
  assert.deepEqual(summary.urls_fetched, [
    'https://example.com/spec?utm_source=test',
    'https://review.example.com/item',
  ]);
});

test('buildRunSummaryPayload preserves disabled llm metadata and rounds numeric summary fields', () => {
  const summary = buildRunSummaryPayload({
    productId: 'mouse-3',
    runId: 'run-3',
    category: 'mouse',
    config: {
      llmProvider: 'openai',
      fieldRulesEngineEnforceEvidence: false,
    },
    gate: {
      validated: true,
      reasons: [],
      confidencePercent: 55.55,
      completenessRequiredPercent: 44.44,
      coverageOverallPercent: 33.33,
    },
    validatedReason: 'validated',
    completenessStats: {
      completenessRequired: 0.4444,
      requiredFields: [],
      missingRequiredFields: [],
    },
    coverageStats: {
      coverageOverall: 0.3333,
    },
    previousResumeStateAgeHours: 1.236,
    parserHealthAverage: 0.123456789,
    llmCostUsd: 0.987654321,
    sourceResults: [],
    identityGate: {},
    identityLock: {},
    identityReport: {},
    fieldsBelowPassTarget: [],
    criticalFieldsBelowPassTarget: [],
    newValuesProposed: [],
    provenance: {},
    discoveryResult: {},
    helperContext: {},
    criticDecisions: {},
    llmValidatorDecisions: {},
    runtimeGateResult: {},
    curationSuggestionResult: {},
    contribution: {},
    llmContext: {},
    aggressiveExtraction: {},
    categoryConfig: {},
    manufacturerSources: [],
    plannerStats: {},
    endpointMining: {},
    temporalEvidence: {},
    inferenceResult: {},
    hypothesisQueue: [],
    constraintAnalysis: {},
    fieldReasoning: {},
    trafficLight: {},
    needSet: {},
    phase07PrimeSources: {},
    phase08Extraction: {},
    normalizeAmbiguityLevelFn: () => '',
    isHelperSyntheticSourceFn: () => false,
    buildTopEvidenceReferencesFn: () => [],
    nowIsoFn: () => '2026-03-06T00:00:05.000Z',
  });

  assert.equal(summary.llm.enabled, false);
  assert.equal(typeof summary.llm.model_extract, 'string');
  assert.equal(summary.llm.model_extract.length > 0, true);
  assert.equal(typeof summary.llm.model_plan, 'string');
  assert.equal(summary.llm.model_plan.length > 0, true);
  assert.equal(typeof summary.llm.model_validate, 'string');
  assert.equal(summary.llm.model_validate.length > 0, true);
  assert.equal(summary.llm.cost_usd_run, 0.98765432);
  assert.equal(summary.indexing_resume.state_age_hours, 1.24);
  assert.equal(summary.parser_health.average_health_score, 0.123457);
  assert.equal(summary.round_context, null);
  assert.equal(summary.generated_at, '2026-03-06T00:00:05.000Z');
});

test('buildRunSummaryPayloadContext maps runProduct summary inputs to payload contract keys', () => {
  const normalizeAmbiguityLevel = () => 'normalized';
  const isHelperSyntheticSource = () => false;
  const buildTopEvidenceReferences = () => [];
  const nowIso = () => '2026-03-06T00:00:00.000Z';

  const context = buildRunSummaryPayloadContext({
    productId: 'mouse-1',
    runId: 'run-1',
    category: 'mouse',
    config: { runProfile: 'thorough' },
    runtimeMode: 'balanced',
    identityFingerprint: 'brand:model',
    identityLockStatus: 'locked',
    dedupeMode: 'deterministic_v2',
    gate: { validated: true },
    validatedReason: 'validated',
    confidence: 0.9,
    completenessStats: { completenessRequired: 0.8 },
    coverageStats: { coverageOverall: 0.7 },
    targets: { targetConfidence: 0.8 },
    anchors: { shape: 'ergonomic' },
    allAnchorConflicts: [],
    anchorMajorConflictsCount: 0,
    identityConfidence: 0.92,
    identityGate: { validated: true },
    extractionGateOpen: true,
    identityLock: { ambiguity_level: 'low' },
    publishable: true,
    publishBlockers: [],
    identityReport: { status: 'ok' },
    fieldsBelowPassTarget: ['weight_g'],
    criticalFieldsBelowPassTarget: ['weight_g'],
    newValuesProposed: [],
    provenance: { shape: { confidence: 0.9 } },
    sourceResults: [{ identity: { match: true }, url: 'https://example.com' }],
    discoveryResult: { enabled: true, candidates: [] },
    indexingHelperFlowEnabled: true,
    helperContext: { stats: { active_total: 1 } },
    helperSupportiveSyntheticSources: [],
    helperFilledFields: ['shape'],
    helperFilledByMethod: { supportive: 1 },
    helperMismatches: [],
    componentPriorFilledFields: ['shape'],
    componentPriorMatches: ['base-shell'],
    criticDecisions: { accept: [] },
    llmValidatorDecisions: { enabled: false },
    runtimeFieldRulesEngine: { version: 'v1' },
    runtimeGateResult: { failures: [] },
    curationSuggestionResult: { appended_count: 0 },
    llmTargetFields: ['shape'],
    goldenExamples: [],
    llmCandidatesAccepted: 1,
    llmSourcesUsed: 1,
    contribution: { llmFields: ['shape'] },
    llmRetryWithoutSchemaCount: 0,
    llmEstimatedUsageCount: 1,
    llmContext: { verification: { done: false } },
    llmCallCount: 1,
    llmCostUsd: 0.01,
    aggressiveExtraction: { enabled: false },
    categoryConfig: { sources_override_key: null },
    fetcherMode: 'playwright',
    fetcherStartFallbackReason: null,
    indexingResumeKey: 'resume/key',
    resumeMode: 'auto',
    resumeMaxAgeHours: 24,
    previousResumeStateAgeHours: 1.5,
    resumeReextractEnabled: false,
    resumeReextractAfterHours: 48,
    resumeSeededPendingCount: 0,
    resumeSeededLlmRetryCount: 0,
    resumeSeededReextractCount: 0,
    resumePersistedPendingCount: 0,
    resumePersistedLlmRetryCount: 0,
    resumePersistedSuccessCount: 0,
    manufacturerSources: [],
    manufacturerMajorConflicts: 0,
    plannerStats: { pending: 3 },
    endpointMining: { endpoint_count: 1 },
    temporalEvidence: { hits: 0 },
    inferenceResult: { filled_fields: [] },
    hypothesisQueue: [],
    hypothesisFollowupRoundsExecuted: 0,
    hypothesisFollowupSeededUrls: [],
    constraintAnalysis: { conflicts: [] },
    fieldReasoning: { shape: { reason: 'anchor' } },
    trafficLight: { green: ['shape'] },
    needSet: { needset_size: 1 },
    phase07PrimeSources: { summary: { fields_attempted: 1 } },
    phase08Extraction: { summary: { batch_count: 1 } },
    parserHealthRows: [{ score: 1 }],
    parserHealthAverage: 1,
    fingerprintCount: 1,
    durationMs: 1000,
    roundContext: {},
    normalizeAmbiguityLevel,
    isHelperSyntheticSource,
    buildTopEvidenceReferences,
    nowIso,
  });

  assert.equal(context.productId, 'mouse-1');
  assert.equal(context.runId, 'run-1');
  assert.equal(context.dedupeMode, 'deterministic_v2');
  assert.equal(context.hypothesisFollowupRoundsExecuted, 0);
  assert.deepEqual(context.plannerStats, { pending: 3 });
  assert.equal(context.normalizeAmbiguityLevelFn, normalizeAmbiguityLevel);
  assert.equal(context.isHelperSyntheticSourceFn, isHelperSyntheticSource);
  assert.equal(context.buildTopEvidenceReferencesFn, buildTopEvidenceReferences);
  assert.equal(context.nowIsoFn, nowIso);
});

test('bootstrapRunEventIndexing captures knob snapshot and records source/query index events through logger.onEvent', () => {
  const previousEvents = [];
  const mkdirCalls = [];
  const knobSnapshots = [];
  const urlVisits = [];
  const queryResults = [];
  const logger = {
    onEvent(row) {
      previousEvents.push(row);
    },
  };

  bootstrapRunEventIndexing({
    logger,
    category: 'mouse',
    productId: 'mouse-product',
    runId: 'run-123',
    env: { INDEXLAB_TEST: '1' },
    manifestDefaults: { runtime: true },
    defaultIndexLabRootFn: () => 'C:/idx-root',
    joinPathFn: (...parts) => parts.join('/'),
    mkdirSyncFn: (dirPath, options) => {
      mkdirCalls.push({ dirPath, options });
    },
    captureKnobSnapshotFn: (env, defaults) => ({ env, defaults, captured: true }),
    recordKnobSnapshotFn: (snapshot, filePath) => {
      knobSnapshots.push({ snapshot, filePath });
    },
    recordUrlVisitFn: (payload, filePath) => {
      urlVisits.push({ payload, filePath });
    },
    recordQueryResultFn: (payload, filePath) => {
      queryResults.push({ payload, filePath });
    },
  });

  logger.onEvent({
    event: 'source_processed',
    url: 'https://example.com/spec',
    host: 'example.com',
    tier: 'tier1',
    content_type: 'text/html',
    candidates: [
      { field: 'weight_g' },
      { field: 'weight_g' },
      { field: 'shape' },
      { field: '' },
    ],
    outcome: 'ok',
  });
  logger.onEvent({
    event: 'discovery_query_completed',
    query: 'example mouse weight',
    provider: 'serpapi',
    result_count: 7,
  });

  assert.deepEqual(knobSnapshots, [
    {
      snapshot: {
        env: { INDEXLAB_TEST: '1' },
        defaults: { runtime: true },
        captured: true,
      },
      filePath: 'C:/idx-root/mouse/knob-snapshots.ndjson',
    },
  ]);
  assert.deepEqual(urlVisits, [
    {
      payload: {
        url: 'https://example.com/spec',
        host: 'example.com',
        tier: 'tier1',
        doc_kind: 'text/html',
        fields_filled: ['weight_g', 'shape'],
        fetch_success: true,
        run_id: 'run-123',
      },
      filePath: 'C:/idx-root/mouse/url-index.ndjson',
    },
  ]);
  assert.deepEqual(queryResults, [
    {
      payload: {
        query: 'example mouse weight',
        provider: 'serpapi',
        result_count: 7,
        field_yield: null,
        run_id: 'run-123',
        category: 'mouse',
        product_id: 'mouse-product',
      },
      filePath: 'C:/idx-root/mouse/query-index.ndjson',
    },
  ]);
  assert.deepEqual(previousEvents, [
    {
      event: 'source_processed',
      url: 'https://example.com/spec',
      host: 'example.com',
      tier: 'tier1',
      content_type: 'text/html',
      candidates: [
        { field: 'weight_g' },
        { field: 'weight_g' },
        { field: 'shape' },
        { field: '' },
      ],
      outcome: 'ok',
    },
    {
      event: 'discovery_query_completed',
      query: 'example mouse weight',
      provider: 'serpapi',
      result_count: 7,
    },
  ]);
  assert.deepEqual(mkdirCalls, [
    { dirPath: 'C:/idx-root/mouse', options: { recursive: true } },
    { dirPath: 'C:/idx-root/mouse', options: { recursive: true } },
    { dirPath: 'C:/idx-root/mouse', options: { recursive: true } },
  ]);
});

test('bootstrapRunEventIndexing swallows knob and event index failures', () => {
  const logger = {
    onEvent() {
      throw new Error('previous handler failed');
    },
  };

  assert.doesNotThrow(() => {
    bootstrapRunEventIndexing({
      logger,
      category: 'mouse',
      productId: 'mouse-product',
      runId: 'run-123',
      defaultIndexLabRootFn: () => 'C:/idx-root',
      joinPathFn: (...parts) => parts.join('/'),
      mkdirSyncFn: () => {
        throw new Error('mkdir failed');
      },
      captureKnobSnapshotFn: () => {
        throw new Error('snapshot failed');
      },
      recordKnobSnapshotFn: () => {
        throw new Error('record snapshot failed');
      },
      recordUrlVisitFn: () => {
        throw new Error('record url failed');
      },
      recordQueryResultFn: () => {
        throw new Error('record query failed');
      },
    });

    logger.onEvent({
      event: 'source_processed',
      url: 'https://example.com/spec',
    });
    logger.onEvent({
      event: 'discovery_query_completed',
      query: 'example mouse weight',
    });
  });
});

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

test('runSourceIntelFinalizationPhase delegates source-intel persistence and stamps summary payload', async () => {
  const calls = [];
  const summary = {};
  const expectedIntelResult = {
    domainStatsKey: 'runs/r1/domain_stats.json',
    promotionSuggestionsKey: 'runs/r1/promotion_suggestions.json',
    expansionPlanKey: 'runs/r1/expansion_plan.json',
    brandExpansionPlanCount: 3,
  };

  const result = await runSourceIntelFinalizationPhase({
    storage: { id: 'storage' },
    config: { enableIntel: true },
    category: 'mouse',
    productId: 'mouse-product',
    brand: 'Logitech',
    sourceResults: [{ url: 'https://example.com' }],
    provenance: { dpi: [{ url: 'https://example.com' }] },
    categoryConfig: { category: 'mouse' },
    constraintAnalysis: { conflicts: [] },
    summary,
    persistSourceIntelFn: async (payload) => {
      calls.push(payload);
      return expectedIntelResult;
    },
  });

  assert.deepEqual(calls, [{
    storage: { id: 'storage' },
    config: { enableIntel: true },
    category: 'mouse',
    productId: 'mouse-product',
    brand: 'Logitech',
    sourceResults: [{ url: 'https://example.com' }],
    provenance: { dpi: [{ url: 'https://example.com' }] },
    categoryConfig: { category: 'mouse' },
    constraintAnalysis: { conflicts: [] },
  }]);
  assert.deepEqual(summary.source_intel, {
    domain_stats_key: 'runs/r1/domain_stats.json',
    promotion_suggestions_key: 'runs/r1/promotion_suggestions.json',
    expansion_plan_key: 'runs/r1/expansion_plan.json',
    brand_expansion_plan_count: 3,
  });
  assert.equal(result, expectedIntelResult);
});

test('buildSummaryArtifactsContext computes rowTsv and leaves markdown empty when summary writing is disabled', async () => {
  const llmCalls = [];
  const markdownCalls = [];
  const tsvCalls = [];

  const result = await buildSummaryArtifactsContext({
    config: { writeMarkdownSummary: false, llmWriteSummary: true },
    fieldOrder: ['dpi'],
    normalized: { fields: { dpi: 32000 } },
    provenance: { dpi: [] },
    summary: { confidence: 0.9 },
    logger: { info: () => {} },
    llmContext: { id: 'llm' },
    writeSummaryMarkdownLLMFn: async (payload) => {
      llmCalls.push(payload);
      return 'llm-markdown';
    },
    buildMarkdownSummaryFn: (payload) => {
      markdownCalls.push(payload);
      return 'fallback-markdown';
    },
    tsvRowFromFieldsFn: (fieldOrder, fields) => {
      tsvCalls.push({ fieldOrder, fields });
      return 'row-tsv';
    },
  });

  assert.equal(result.rowTsv, 'row-tsv');
  assert.equal(result.markdownSummary, '');
  assert.equal(llmCalls.length, 0);
  assert.equal(markdownCalls.length, 0);
  assert.deepEqual(tsvCalls, [{ fieldOrder: ['dpi'], fields: { dpi: 32000 } }]);
});

test('buildSummaryArtifactsContext uses llm summary and falls back to deterministic markdown when llm returns empty', async () => {
  const llmCalls = [];
  const markdownCalls = [];

  const result = await buildSummaryArtifactsContext({
    config: { writeMarkdownSummary: true, llmWriteSummary: true },
    fieldOrder: ['dpi'],
    normalized: { fields: { dpi: 32000 } },
    provenance: { dpi: [{ source: 'a' }] },
    summary: { confidence: 0.9 },
    logger: { info: () => {} },
    llmContext: { id: 'llm' },
    writeSummaryMarkdownLLMFn: async (payload) => {
      llmCalls.push(payload);
      return '';
    },
    buildMarkdownSummaryFn: (payload) => {
      markdownCalls.push(payload);
      return 'fallback-markdown';
    },
    tsvRowFromFieldsFn: () => 'row-tsv',
  });

  assert.equal(result.rowTsv, 'row-tsv');
  assert.equal(result.markdownSummary, 'fallback-markdown');
  assert.equal(llmCalls.length, 1);
  assert.equal(markdownCalls.length, 1);
});

test('runTerminalLearningExportLifecycle runs learning export then finalize lifecycle with canonical payloads', async () => {
  const exportCalls = [];
  const finalizeCalls = [];
  const learningExportPhaseContext = { phase: 'learning-export' };
  const expectedExport = {
    exportInfo: { key: 'info' },
    finalExport: { key: 'final' },
    learning: { key: 'learning' },
  };
  const logger = { id: 'logger' };
  const frontierDb = { id: 'frontier' };
  const emitFieldDecisionEventsFn = () => {};

  const result = await runTerminalLearningExportLifecycle({
    learningExportPhaseContext,
    runLearningExportPhaseFn: async (payload) => {
      exportCalls.push(payload);
      return expectedExport;
    },
    finalizeRunLifecycleFn: async (payload) => {
      finalizeCalls.push(payload);
    },
    logger,
    frontierDb,
    fieldOrder: ['weight_g'],
    normalized: { fields: { weight_g: '59' } },
    provenance: { weight_g: [{ url: 'a' }] },
    fieldReasoning: [{ field: 'weight_g' }],
    trafficLight: { score: 0.9 },
    emitFieldDecisionEventsFn,
  });

  assert.deepEqual(exportCalls, [learningExportPhaseContext]);
  assert.deepEqual(finalizeCalls, [{
    logger,
    frontierDb,
    fieldOrder: ['weight_g'],
    normalized: { fields: { weight_g: '59' } },
    provenance: { weight_g: [{ url: 'a' }] },
    fieldReasoning: [{ field: 'weight_g' }],
    trafficLight: { score: 0.9 },
    emitFieldDecisionEventsFn,
  }]);
  assert.deepEqual(result, expectedExport);
});
