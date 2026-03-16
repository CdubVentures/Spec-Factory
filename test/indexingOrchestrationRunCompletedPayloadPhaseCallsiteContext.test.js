import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunCompletedPayloadPhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildRunCompletedPayloadPhaseCallsiteContext maps runProduct run-completed callsite inputs to context keys', () => {
  const context = buildRunCompletedPayloadPhaseCallsiteContext({
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
    llmBudgetBlockedReason: '',
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
  assert.equal(context.resumeMode, 'auto');
  assert.equal(context.resumeMaxAgeHours, 48);
});
