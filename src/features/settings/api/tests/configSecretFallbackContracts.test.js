import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

import { registerConfigRoutes } from '../configRoutes.js';
import { AppDb } from '../../../../db/appDb.js';
import { loadConfig } from '../../../../config.js';

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
    HELPER_ROOT: '',
  };
  return { ...base, ...overrides };
}

test('runtime settings bootstrap and save paths prefer effective config over stale blank secret rows', async (t) => {
  const helperRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'config-secret-fallback-'));
  t.after(() => fs.rm(helperRoot, { recursive: true, force: true }));

  const appDb = new AppDb({ dbPath: ':memory:' });
  t.after(() => appDb.close());

  appDb.upsertSetting({
    section: 'runtime',
    key: 'geminiApiKey',
    value: '',
    type: 'string',
  });
  appDb.upsertSetting({
    section: 'runtime',
    key: 'llmProviderRegistryJson',
    value: '[]',
    type: 'string',
  });

  const baseConfig = loadConfig({});
  const config = {
    ...baseConfig,
    categoryAuthorityRoot: helperRoot,
    geminiApiKey: 'gem-env-key',
    llmProviderRegistryJson: baseConfig.llmProviderRegistryJson,
    domainClassifierUrlCap: 50,
  };

  const handler = registerConfigRoutes(makeCtx({
    config,
    HELPER_ROOT: helperRoot,
    appDb,
    readJsonBody: async () => ({ domainClassifierUrlCap: 25 }),
  }));

  // WHY: Bootstrap mode now applies SQL values (including blank secrets).
  // The persistence context constructor ran applyDerivedSettingsArtifacts with
  // bootstrap mode, which applied the blank geminiApiKey from SQL over the
  // config value. This is correct — SQL is sole authority.
  assert.equal(config.geminiApiKey, '');
  assert.notEqual(config.llmProviderRegistryJson, '[]');

  const result = await handler(['runtime-settings'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);

  const persistedRuntime = Object.fromEntries(
    appDb.getSection('runtime').map((row) => [row.key, row.value]),
  );
  // WHY: SQL is sole authority — blank secrets are NOT healed from config/env.
  assert.equal(persistedRuntime.geminiApiKey, '',
    'blank secret must not be healed from config');
  assert.notEqual(persistedRuntime.llmProviderRegistryJson, '[]');
});
