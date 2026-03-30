import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { registerConfigRoutes } from '../configRoutes.js';
import { AppDb } from '../../../../db/appDb.js';

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function makeCtx(overrides = {}) {
  const base = {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    config: {},
    toInt,
    collectLlmModels: () => [],
    llmProviderFromModel: () => '',
    resolvePricingForModel: () => ({}),
    resolveTokenProfileForModel: () => ({}),
    resolveLlmRoleDefaults: () => ({}),
    resolveLlmKnobDefaults: () => ({}),
    llmRoutingSnapshot: () => ({}),
    buildLlmMetrics: async () => ({}),
    buildIndexingDomainChecklist: async () => ({}),
    buildReviewMetrics: async () => ({}),
    getSpecDb: () => null,
    storage: {},
    OUTPUT_ROOT: 'out',
    broadcastWs: () => {},
    HELPER_ROOT: path.resolve('category_authority'),
  };
  return { ...base, ...overrides };
}

test('ui-settings GET returns durable autosave defaults', async (t) => {
  const appDb = new AppDb({ dbPath: ':memory:' });
  t.after(() => appDb.close());
  const handler = registerConfigRoutes(makeCtx({ appDb }));

  const result = await handler(['ui-settings'], new URLSearchParams(), 'GET', {}, {});
  assert.equal(result.status, 200);
  assert.equal(result.body.studioAutoSaveAllEnabled, false);
  assert.equal(result.body.studioAutoSaveEnabled, true);
  assert.equal(result.body.studioAutoSaveMapEnabled, true);
  assert.equal(result.body.runtimeAutoSaveEnabled, true);
});

test('ui-settings PUT persists autosave toggles and emits settings data-change', async (t) => {
  const appDb = new AppDb({ dbPath: ':memory:' });
  t.after(() => appDb.close());
  const emitted = [];
  const handler = registerConfigRoutes(makeCtx({
    appDb,
    readJsonBody: async () => ({
      studioAutoSaveAllEnabled: true,
      studioAutoSaveEnabled: false,
      studioAutoSaveMapEnabled: false,
      runtimeAutoSaveEnabled: false,
      unknownKeyShouldBeIgnored: true,
    }),
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
  }));

  const putResult = await handler(['ui-settings'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(putResult.status, 200);
  assert.equal(putResult.body.ok, true);
  assert.equal(putResult.body.snapshot.studioAutoSaveAllEnabled, true);
  assert.equal(putResult.body.snapshot.studioAutoSaveEnabled, true);
  assert.equal(putResult.body.snapshot.studioAutoSaveMapEnabled, true);
  assert.equal(putResult.body.snapshot.runtimeAutoSaveEnabled, false);
  assert.equal(putResult.body.applied.studioAutoSaveEnabled, true);
  assert.equal(putResult.body.applied.studioAutoSaveMapEnabled, true);
  assert.equal(putResult.body.rejected.unknownKeyShouldBeIgnored, 'unknown_key');

  const getResult = await handler(['ui-settings'], new URLSearchParams(), 'GET', {}, {});
  assert.equal(getResult.status, 200);
  assert.equal(getResult.body.studioAutoSaveAllEnabled, true);
  assert.equal(getResult.body.runtimeAutoSaveEnabled, false);

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].channel, 'data-change');
  assert.equal(emitted[0].payload.event, 'user-settings-updated');
  assert.equal(emitted[0].payload.meta?.section, 'ui');

  // WHY: Verify persistence round-trip via SQL (appDb) instead of JSON file
  const uiRows = appDb.getSection('ui');
  const uiMap = Object.fromEntries(uiRows.map((r) => [r.key, r.value]));
  assert.equal(uiMap.studioAutoSaveAllEnabled, 'true');
  assert.equal(uiMap.runtimeAutoSaveEnabled, 'false');
});

test('ui-settings PUT keeps field-studio-map autosave independent from key navigator autosave when auto-save-all is off', async (t) => {
  const appDb = new AppDb({ dbPath: ':memory:' });
  t.after(() => appDb.close());
  const handler = registerConfigRoutes(makeCtx({
    appDb,
    readJsonBody: async () => ({
      studioAutoSaveAllEnabled: false,
      studioAutoSaveEnabled: false,
      studioAutoSaveMapEnabled: true,
      runtimeAutoSaveEnabled: true,
    }),
  }));

  const putResult = await handler(['ui-settings'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(putResult.status, 200);
  assert.equal(putResult.body.snapshot.studioAutoSaveAllEnabled, false);
  assert.equal(putResult.body.snapshot.studioAutoSaveMapEnabled, true);
  assert.equal(putResult.body.snapshot.studioAutoSaveEnabled, false);
  assert.equal(putResult.body.applied.studioAutoSaveMapEnabled, true);
  assert.equal(putResult.body.applied.studioAutoSaveEnabled, false);

  const getResult = await handler(['ui-settings'], new URLSearchParams(), 'GET', {}, {});
  assert.equal(getResult.status, 200);
  assert.equal(getResult.body.studioAutoSaveMapEnabled, true);
  assert.equal(getResult.body.studioAutoSaveEnabled, false);
});
