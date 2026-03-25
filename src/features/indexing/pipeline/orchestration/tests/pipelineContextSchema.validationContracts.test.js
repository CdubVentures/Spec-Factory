import test from 'node:test';
import assert from 'node:assert/strict';

import { validatePipelineCheckpoint } from '../pipelineContextSchema.js';
import { makeSeed } from './fixtures/pipelineContextSchemaFixtures.js';

test('validatePipelineCheckpoint returns valid data without warning on success', () => {
  const warnings = [];
  const logger = { warn: (name, data) => warnings.push({ name, data }) };

  const result = validatePipelineCheckpoint('seed', makeSeed(), logger);
  assert.equal(result.valid, true);
  assert.equal(result.errors, undefined);
  assert.equal(warnings.length, 0);
});

test('validatePipelineCheckpoint returns errors and logs once on warn-mode failure', () => {
  const warnings = [];
  const logger = { warn: (name, data) => warnings.push({ name, data }) };

  const result = validatePipelineCheckpoint(
    'seed',
    {},
    logger,
    { pipelineSchemaEnforcementMode: 'warn' },
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors[0].path);
  assert.ok(result.errors[0].message);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].name, 'pipeline_context_validation_failed');
  assert.equal(warnings[0].data.checkpoint, 'seed');
  assert.ok(warnings[0].data.error_count > 0);
});

test('validatePipelineCheckpoint reports unknown checkpoints', () => {
  const result = validatePipelineCheckpoint('nonexistent', {});
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].message, 'Unknown checkpoint: nonexistent');
});

test('validatePipelineCheckpoint throws in enforce mode for invalid data', () => {
  assert.throws(
    () => validatePipelineCheckpoint(
      'seed',
      {},
      null,
      { pipelineSchemaEnforcementMode: 'enforce' },
    ),
    (error) => error.message.includes('Pipeline schema validation failed at seed'),
  );
});

test('validatePipelineCheckpoint skips validation in off mode', () => {
  const result = validatePipelineCheckpoint(
    'seed',
    {},
    null,
    { pipelineSchemaEnforcementMode: 'off' },
  );
  assert.equal(result.valid, true);
  assert.equal(result.errors, undefined);
});
