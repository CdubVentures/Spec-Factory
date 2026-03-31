import test from 'node:test';
import assert from 'node:assert/strict';

import { registerConfigRoutes } from '../configRoutes.js';
import {
  getSettingsPersistenceCountersSnapshot,
  resetSettingsPersistenceCounters,
} from '../../../../observability/settingsPersistenceCounters.js';
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
  };
  return { ...base, ...overrides };
}

test('runtime-settings PUT returns error when persistence writes fail', async () => {
  resetSettingsPersistenceCounters();
  // WHY: Trigger SQL write failure by closing the appDb after handler init.
  const appDb = new AppDb({ dbPath: ':memory:' });
  const config = {
    domainClassifierUrlCap: 50,
  };
  const handler = registerConfigRoutes(makeCtx({
    config,
    appDb,
    readJsonBody: async () => ({
      domainClassifierUrlCap: 25,
    }),
  }));
  appDb.close();

  const result = await handler(['runtime-settings'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(result.status, 500);
  assert.equal(result.body?.ok, false);
  assert.equal(result.body?.error, 'runtime_settings_persist_failed');
  assert.equal(config.domainClassifierUrlCap, 50, 'runtime config should roll back when persistence fails');
  const counters = getSettingsPersistenceCountersSnapshot();
  assert.equal(counters.writes.by_target['runtime-settings-route']?.failed_total, 1);
});

test('runtime-settings PUT records success telemetry when persistence succeeds', async () => {
  resetSettingsPersistenceCounters();
  const appDb = new AppDb({ dbPath: ':memory:' });
  const config = {
    domainClassifierUrlCap: 50,
  };
  const handler = registerConfigRoutes(makeCtx({
    HELPER_ROOT: 'category_authority',
    config,
    appDb,
    readJsonBody: async () => ({
      domainClassifierUrlCap: 25,
    }),
  }));

  const result = await handler(['runtime-settings'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(result.status, 200);
  assert.equal(result.body?.ok, true);
  assert.equal(config.domainClassifierUrlCap, 25);
  const counters = getSettingsPersistenceCountersSnapshot();
  assert.equal(counters.writes.by_target['runtime-settings-route']?.success_total, 1);
  appDb.close();
});
