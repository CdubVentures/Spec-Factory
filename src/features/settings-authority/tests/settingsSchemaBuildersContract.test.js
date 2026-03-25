import test from 'node:test';
import assert from 'node:assert/strict';

import {
  schemaForSettingType,
  sectionSchemaFromTypeMap,
  buildUserSettingsSnapshotSchema,
} from '../settingsSchemaBuilders.js';

test('schemaForSettingType maps type tokens to Ajv-ready schema fragments', () => {
  assert.deepEqual(schemaForSettingType('integer'), { type: 'integer' });
  assert.deepEqual(schemaForSettingType('number'), { type: 'number' });
  assert.deepEqual(schemaForSettingType('boolean'), { type: 'boolean' });
  assert.deepEqual(schemaForSettingType('string'), { type: 'string' });
  assert.deepEqual(schemaForSettingType('string_or_null'), {
    anyOf: [{ type: 'string' }, { type: 'null' }],
  });
  assert.deepEqual(schemaForSettingType('object'), {
    type: 'object',
    additionalProperties: true,
  });
  assert.deepEqual(schemaForSettingType('unknown-token'), {});
});

test('sectionSchemaFromTypeMap returns a strict object schema from a type map', () => {
  assert.deepEqual(sectionSchemaFromTypeMap({
    alpha: 'integer',
    beta: 'string_or_null',
  }), {
    type: 'object',
    properties: {
      alpha: { type: 'integer' },
      beta: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    },
    additionalProperties: false,
  });
});

test('buildUserSettingsSnapshotSchema composes section schemas and required envelopes', () => {
  const schema = buildUserSettingsSnapshotSchema({
    settingsDocumentSchemaVersion: 7,
    runtimeSettingsValueTypes: { r: 'integer' },
    storageSettingsValueTypes: { s: 'string' },
    uiSettingsValueTypes: { u: 'boolean' },
  });

  assert.equal(schema.type, 'object');
  assert.deepEqual(schema.required, [
    'schemaVersion',
    'runtime',
    'convergence',
    'storage',
    'studio',
    'ui',
  ]);
  assert.deepEqual(schema.properties.schemaVersion, {
    type: 'integer',
    const: 7,
  });
  assert.deepEqual(schema.properties.runtime, {
    type: 'object',
    properties: { r: { type: 'integer' } },
    additionalProperties: false,
  });
  assert.deepEqual(schema.properties.convergence, {
    type: 'object',
    properties: {},
    additionalProperties: false,
  });
  assert.deepEqual(schema.properties.storage, {
    type: 'object',
    properties: { s: { type: 'string' } },
    additionalProperties: false,
  });
  assert.deepEqual(schema.properties.ui, {
    type: 'object',
    properties: { u: { type: 'boolean' } },
    additionalProperties: false,
  });
});
