import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCompileProcessCompletion } from '../compileProcessCompletion.js';

test('compile completion invalidates caches, syncs SpecDb, and emits completion event', async () => {
  const sessionInvalidations = [];
  const rulesInvalidations = [];
  const syncCalls = [];
  const emitted = [];

  const result = await handleCompileProcessCompletion({
    exitCode: 0,
    cliArgs: ['category-compile', '--category', 'mouse', '--local'],
    sessionCache: {
      invalidateSessionCache: (category) => sessionInvalidations.push(category),
    },
    invalidateFieldRulesCache: (category) => rulesInvalidations.push(category),
    syncSpecDbForCategory: async ({ category }) => {
      syncCalls.push(category);
      return {
        category,
        components_seeded: 12,
        list_values_seeded: 9,
        specdb_sync_version: 7,
        specdb_sync_updated_at: '2026-02-23T12:00:00.000Z',
      };
    },
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
  });

  assert.equal(result.category, 'mouse');
  assert.deepEqual(sessionInvalidations, ['mouse']);
  assert.deepEqual(rulesInvalidations, ['mouse']);
  assert.deepEqual(syncCalls, ['mouse']);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].channel, 'data-change');
  assert.equal(emitted[0].payload.type, 'data-change');
  assert.equal(emitted[0].payload.event, 'process-completed');
  assert.equal(emitted[0].payload.category, 'mouse');
  assert.equal(emitted[0].payload.meta.specDbSync.ok, true);
  assert.equal(emitted[0].payload.version.specdb_sync_version, 7);
  assert.equal(emitted[0].payload.version.updated_at, '2026-02-23T12:00:00.000Z');
});

test('compile completion still emits completion event when SpecDb sync fails', async () => {
  const emitted = [];
  const result = await handleCompileProcessCompletion({
    exitCode: 0,
    cliArgs: ['category-compile', '--category', 'mouse', '--local'],
    sessionCache: { invalidateSessionCache: () => {} },
    invalidateFieldRulesCache: () => {},
    syncSpecDbForCategory: async () => {
      throw new Error('seed_failed');
    },
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
    logError: () => {},
  });

  assert.equal(result.category, 'mouse');
  assert.equal(result.specDbSync.ok, false);
  assert.equal(result.specDbSync.error, 'seed_failed');
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].payload.type, 'data-change');
  assert.equal(emitted[0].payload.event, 'process-completed');
  assert.equal(emitted[0].payload.meta.specDbSync.ok, false);
  assert.equal(emitted[0].payload.meta.specDbSync.error, 'seed_failed');
  assert.equal(emitted[0].payload.version.specdb_sync_version, null);
});

test('compile completion treats compile-rules as compile command for SpecDb sync', async () => {
  const syncCalls = [];
  await handleCompileProcessCompletion({
    exitCode: 0,
    cliArgs: ['compile-rules', '--category', 'mouse', '--local'],
    sessionCache: { invalidateSessionCache: () => {} },
    invalidateFieldRulesCache: () => {},
    syncSpecDbForCategory: async ({ category }) => {
      syncCalls.push(category);
      return { specdb_sync_version: 1 };
    },
    broadcastWs: () => {},
  });
  assert.deepEqual(syncCalls, ['mouse']);
});
