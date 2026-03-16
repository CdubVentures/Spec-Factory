import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCortexSidecarContext } from '../src/features/indexing/orchestration/index.js';

test('buildCortexSidecarContext returns disabled defaults when cortex is disabled', async () => {
  const calls = {
    createClient: 0,
  };

  const result = await buildCortexSidecarContext({
    config: { cortexEnabled: false },
    confidence: 0.72,
    criticalFieldsBelowPassTarget: ['weight_g'],
    anchorMajorConflictsCount: 1,
    constraintAnalysis: { contradictionCount: 2 },
    completenessStats: { missingRequiredFields: ['battery_life'] },
    logger: { warn: () => {} },
    createCortexClientFn: () => {
      calls.createClient += 1;
      return { runPass: async () => ({}) };
    },
  });

  assert.equal(calls.createClient, 0);
  assert.deepEqual(result, {
    enabled: false,
    attempted: false,
    mode: 'disabled',
    fallback_to_non_sidecar: true,
    fallback_reason: 'sidecar_disabled',
    deep_task_count: 0,
  });
});

test('buildCortexSidecarContext maps sidecar result and preserves task/context payloads', async () => {
  const calls = {
    createClient: 0,
    runPass: 0,
  };
  let capturedArgs = null;

  const result = await buildCortexSidecarContext({
    config: { cortexEnabled: true },
    confidence: 0.86,
    criticalFieldsBelowPassTarget: ['weight_g', 'connectivity'],
    anchorMajorConflictsCount: 2,
    constraintAnalysis: { contradictionCount: 1 },
    completenessStats: { missingRequiredFields: ['battery_life'] },
    logger: { warn: () => {} },
    createCortexClientFn: (args) => {
      calls.createClient += 1;
      assert.equal(args.config.cortexEnabled, true);
      return {
        runPass: async (runArgs) => {
          calls.runPass += 1;
          capturedArgs = runArgs;
          return {
            mode: 'sidecar',
            fallback_to_non_sidecar: false,
            fallback_reason: null,
            plan: { deep_task_count: 3 },
          };
        },
      };
    },
  });

  assert.equal(calls.createClient, 1);
  assert.equal(calls.runPass, 1);
  assert.equal(Array.isArray(capturedArgs.tasks), true);
  assert.equal(capturedArgs.tasks.length, 3);
  assert.deepEqual(capturedArgs.tasks.map((task) => task.id), [
    'evidence-audit',
    'conflict-triage',
    'critical-gap-fill',
  ]);
  assert.equal(capturedArgs.tasks[0].payload.critical_fields_below_pass_target.length, 2);
  assert.equal(capturedArgs.tasks[1].payload.anchor_major_conflicts_count, 2);
  assert.equal(capturedArgs.tasks[1].payload.contradiction_count, 1);
  assert.equal(capturedArgs.tasks[2].payload.missing_required_fields.length, 1);
  assert.equal(capturedArgs.context.confidence, 0.86);
  assert.equal(capturedArgs.context.critical_conflicts_remain, true);
  assert.equal(capturedArgs.context.critical_gaps_remain, true);
  assert.equal(capturedArgs.context.evidence_audit_failed_on_critical, false);

  assert.deepEqual(result, {
    enabled: true,
    attempted: true,
    mode: 'sidecar',
    fallback_to_non_sidecar: false,
    fallback_reason: null,
    deep_task_count: 3,
  });
});

test('buildCortexSidecarContext logs and returns fallback contract on sidecar failure', async () => {
  const warnings = [];

  const result = await buildCortexSidecarContext({
    config: { cortexEnabled: true },
    confidence: 0.4,
    criticalFieldsBelowPassTarget: [],
    anchorMajorConflictsCount: 0,
    constraintAnalysis: { contradictionCount: 0 },
    completenessStats: { missingRequiredFields: [] },
    logger: {
      warn: (event, payload) => {
        warnings.push({ event, payload });
      },
    },
    createCortexClientFn: () => ({
      runPass: async () => {
        throw new Error('sidecar unavailable');
      },
    }),
  });

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].event, 'cortex_sidecar_failed');
  assert.equal(warnings[0].payload.message, 'sidecar unavailable');
  assert.deepEqual(result, {
    enabled: true,
    attempted: true,
    mode: 'fallback',
    fallback_to_non_sidecar: true,
    fallback_reason: 'sidecar_execution_error',
    deep_task_count: 0,
  });
});
