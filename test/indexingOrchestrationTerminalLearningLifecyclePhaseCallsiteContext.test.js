import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTerminalLearningExportLifecyclePhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildTerminalLearningExportLifecyclePhaseCallsiteContext maps runProduct terminal lifecycle callsite inputs to context keys', () => {
  const learningExportPhaseContext = { id: 'phase' };
  const runLearningExportPhase = async () => ({});
  const finalizeRunLifecycle = async () => {};
  const logger = { id: 'logger' };
  const frontierDb = { id: 'frontier' };
  const emitFieldDecisionEvents = () => {};

  const context = buildTerminalLearningExportLifecyclePhaseCallsiteContext({
    learningExportPhaseContext,
    runLearningExportPhase,
    finalizeRunLifecycle,
    logger,
    frontierDb,
    fieldOrder: ['dpi'],
    normalized: { fields: { dpi: '32000' } },
    provenance: { dpi: [{ source: 'a' }] },
    fieldReasoning: [{ field: 'dpi' }],
    trafficLight: { score: 0.95 },
    emitFieldDecisionEvents,
  });

  assert.equal(context.learningExportPhaseContext, learningExportPhaseContext);
  assert.equal(context.runLearningExportPhase, runLearningExportPhase);
  assert.equal(context.finalizeRunLifecycle, finalizeRunLifecycle);
  assert.equal(context.logger, logger);
  assert.equal(context.frontierDb, frontierDb);
  assert.deepEqual(context.fieldOrder, ['dpi']);
  assert.deepEqual(context.normalized, { fields: { dpi: '32000' } });
  assert.deepEqual(context.provenance, { dpi: [{ source: 'a' }] });
  assert.deepEqual(context.fieldReasoning, [{ field: 'dpi' }]);
  assert.deepEqual(context.trafficLight, { score: 0.95 });
  assert.equal(context.emitFieldDecisionEvents, emitFieldDecisionEvents);
});
