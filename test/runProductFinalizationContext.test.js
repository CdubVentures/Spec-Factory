import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRunProductFinalizationContext } from '../src/pipeline/seams/buildRunProductFinalizationContext.js';

test('buildRunProductFinalizationContext maps runProduct runtime state into finalization pipeline context', () => {
  const plannerStats = { pending: 4 };
  const bootstrapState = {
    adapterManager: { id: 'adapter-manager' },
    job: { productId: 'mouse-1' },
    helperSupportiveSyntheticSources: [{ url: 'helper://supportive/one' }],
    adapterArtifacts: [{ id: 'artifact-1' }],
    sourceResults: [{ url: 'https://example.com/spec' }],
    anchors: { shape: 'ergonomic' },
    categoryConfig: { category: 'mouse' },
    fieldOrder: ['dpi'],
    runtimeFieldRulesEngine: { id: 'field-rules-engine' },
    learnedConstraints: { dpi: {} },
    llmContext: { enabled: true },
    discoveryResult: { seeded: true },
    artifactsByHost: { 'example.com': {} },
    requiredFields: ['dpi'],
    targets: { targetConfidence: 0.9 },
    sourceIntel: { data: {} },
    learnedFieldAvailability: { dpi: 'known' },
    learnedFieldYield: { dpi: 2 },
    phase08BatchRows: [{ id: 1 }],
    phase08FieldContexts: { dpi: { source_count: 1 } },
    phase08PrimeRows: [{ field: 'dpi' }],
    llmValidatorDecisions: { enabled: false },
    llmRuntime: { getUsageState: () => ({ llmCallCount: 1 }) },
    llmTargetFields: ['dpi'],
    goldenExamples: [{ id: 1 }],
    llmCandidatesAccepted: 3,
    llmSourcesUsed: 2,
    fetcherMode: 'http',
    fetcherStartFallbackReason: 'http_fallback',
    indexingResumeKey: 'resume/key',
    resumeMode: 'auto',
    resumeMaxAgeHours: 24,
    previousResumeStateAgeHours: 1.5,
    resumeReextractEnabled: true,
    resumeReextractAfterHours: 48,
    resumeSeededPendingCount: 1,
    resumeSeededLlmRetryCount: 2,
    resumeSeededReextractCount: 3,
    learningProfile: { id: 'learning-profile' },
    planner: {
      getStats() {
        return plannerStats;
      },
    },
  };

  const result = buildRunProductFinalizationContext({
    bootstrapState,
    storage: { id: 'storage' },
    config: { runProfile: 'thorough' },
    runId: 'run-1',
    productId: 'mouse-1',
    category: 'mouse',
    terminalReason: 'completed',
    logger: { id: 'logger' },
    roundContext: { round: 2 },
    startMs: 100,
    runtimeMode: 'production',
    identityLock: { ambiguity_level: 'low' },
    identityFingerprint: 'brand:model',
    identityLockStatus: 'locked',
    helperContext: { enabled: false },
    helperFilledFields: ['dpi'],
    helperFilledByMethod: { supportive: 1 },
    helperMismatches: [],
    hypothesisFollowupRoundsExecuted: 4,
    hypothesisFollowupSeededUrls: 5,
    resumePersistedPendingCount: 6,
    resumePersistedLlmRetryCount: 7,
    resumePersistedSuccessCount: 8,
    runArtifactsBase: 'runs/base',
    frontierDb: { id: 'frontier-db' },
    uberOrchestrator: { id: 'uber-orchestrator' },
    previousFinalSpec: { validated: true },
  });

  assert.equal(result.runId, 'run-1');
  assert.equal(result.productId, 'mouse-1');
  assert.equal(result.category, 'mouse');
  assert.equal(result.storage.id, 'storage');
  assert.equal(result.adapterManager.id, 'adapter-manager');
  assert.deepEqual(result.requiredFields, ['dpi']);
  assert.equal(result.terminalReason, 'completed');
  assert.equal(result.runtimeMode, 'production');
  assert.equal(result.identityFingerprint, 'brand:model');
  assert.equal(result.identityLockStatus, 'locked');
  assert.deepEqual(result.helperFilledFields, ['dpi']);
  assert.deepEqual(result.plannerStats, plannerStats);
  assert.equal(result.resumePersistedPendingCount, 6);
  assert.equal(result.resumePersistedLlmRetryCount, 7);
  assert.equal(result.resumePersistedSuccessCount, 8);
  assert.equal(result.runArtifactsBase, 'runs/base');
  assert.equal(result.frontierDb.id, 'frontier-db');
  assert.equal(result.uberOrchestrator.id, 'uber-orchestrator');
  assert.deepEqual(result.previousFinalSpec, { validated: true });
});
