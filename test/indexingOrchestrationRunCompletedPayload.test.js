import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunCompletedPayload } from '../src/features/indexing/orchestration/index.js';

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
    llmBudgetBlockedReason: '',
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
    llmBudgetBlockedReason: 'budget',
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
  assert.equal(payload.llm_budget_blocked_reason, 'budget');
});
