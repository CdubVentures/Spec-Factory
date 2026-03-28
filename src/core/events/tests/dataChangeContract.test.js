import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDataChangePayload,
  dataChangeMatchesCategory,
  emitDataChange,
  isDataChangePayload,
} from '../dataChangeContract.js';

test('createDataChangePayload builds canonical data-change shape', () => {
  const payload = createDataChangePayload({
    event: 'field-studio-map-saved',
    category: ' Mouse ',
    entities: {
      productIds: [' mouse-razer-viper ', ''],
      fieldKeys: [' dpi ', ''],
    },
  });

  assert.equal(payload.type, 'data-change');
  assert.equal(payload.event, 'field-studio-map-saved');
  assert.equal(payload.category, 'mouse');
  assert.deepEqual(payload.categories, ['mouse']);
  assert.deepEqual(payload.domains, ['studio', 'mapping', 'review-layout']);
  assert.deepEqual(payload.entities.productIds, ['mouse-razer-viper']);
  assert.deepEqual(payload.entities.fieldKeys, ['dpi']);
  assert.deepEqual(payload.version, {
    map_hash: null,
    compiled_hash: null,
    specdb_sync_version: null,
    updated_at: null,
  });
  assert.ok(typeof payload.ts === 'string' && payload.ts.length > 0);
  assert.equal(isDataChangePayload(payload), true);
});

test('createDataChangePayload maps storage update events to storage/settings domains', () => {
  const payload = createDataChangePayload({
    event: 'storage-settings-updated',
  });

  assert.equal(payload.type, 'data-change');
  assert.equal(payload.event, 'storage-settings-updated');
  assert.deepEqual(payload.domains, ['storage', 'settings']);
});

test('emitDataChange broadcasts canonical payload', () => {
  const emitted = [];
  const payload = emitDataChange({
    broadcastWs: (channel, data) => emitted.push({ channel, data }),
    event: 'queue-retry',
    category: 'mouse',
    entities: { productIds: ['mouse-razer-viper'] },
  });

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].channel, 'data-change');
  assert.deepEqual(emitted[0].data, payload);
  assert.equal(payload.event, 'queue-retry');
  assert.deepEqual(payload.domains, ['queue']);
  assert.deepEqual(payload.entities.productIds, ['mouse-razer-viper']);
});

test('isDataChangePayload rejects invalid payloads', () => {
  assert.equal(isDataChangePayload(null), false);
  assert.equal(isDataChangePayload({}), false);
  assert.equal(isDataChangePayload({ type: 'data-change', event: '', category: '', categories: [], domains: [] }), false);
});

test('createDataChangePayload infers category token from categories list when category is omitted', () => {
  const payload = createDataChangePayload({
    event: 'brand-rename',
    categories: ['Mouse', 'Keyboard', 'mouse'],
  });

  assert.equal(payload.category, 'all');
  assert.deepEqual(payload.categories, ['mouse', 'keyboard']);
  assert.equal(isDataChangePayload(payload), true);
});

test('emitDataChange skips broadcast for invalid payloads', () => {
  const emitted = [];
  const payload = emitDataChange({
    broadcastWs: (channel, data) => emitted.push({ channel, data }),
    event: '',
    category: 'mouse',
  });

  assert.equal(payload, null);
  assert.equal(emitted.length, 0);
});

test('dataChangeMatchesCategory respects scoped categories list under global category', () => {
  const payload = createDataChangePayload({
    event: 'brand-rename',
    category: 'all',
    categories: ['mouse', 'keyboard'],
  });

  assert.equal(dataChangeMatchesCategory(payload, 'mouse'), true);
  assert.equal(dataChangeMatchesCategory(payload, 'keyboard'), true);
  assert.equal(dataChangeMatchesCategory(payload, 'monitor'), false);
});
