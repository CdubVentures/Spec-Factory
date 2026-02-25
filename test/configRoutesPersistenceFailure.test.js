import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { registerConfigRoutes } from '../src/api/routes/configRoutes.js';

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
    runDataStorageState: {
      enabled: false,
      destinationType: 'local',
      localDirectory: '',
      s3Region: 'us-east-2',
      s3Bucket: '',
      s3Prefix: 'spec-factory-runs',
      s3AccessKeyId: '',
      s3SecretAccessKey: '',
      s3SessionToken: '',
      updatedAt: null,
    },
  };
  return { ...base, ...overrides };
}

async function makeInvalidHelperRoot() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-invalid-helper-root-'));
  const helperRootFile = path.join(tempRoot, 'helper-root-file.txt');
  await fs.writeFile(helperRootFile, 'not-a-directory', 'utf8');
  return helperRootFile;
}

test('runtime-settings PUT returns error when persistence writes fail', async () => {
  const helperRootFile = await makeInvalidHelperRoot();
  const config = {
    concurrency: 4,
  };
  const handler = registerConfigRoutes(makeCtx({
    HELPER_ROOT: helperRootFile,
    config,
    readJsonBody: async () => ({
      fetchConcurrency: 5,
    }),
  }));

  const result = await handler(['runtime-settings'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(result.status, 500);
  assert.equal(result.body?.ok, false);
  assert.equal(result.body?.error, 'runtime_settings_persist_failed');
  assert.equal(config.concurrency, 4, 'runtime config should roll back when persistence fails');
});

test('convergence-settings PUT returns error when persistence writes fail', async () => {
  const helperRootFile = await makeInvalidHelperRoot();
  const config = {
    convergenceMaxRounds: 3,
  };
  const handler = registerConfigRoutes(makeCtx({
    HELPER_ROOT: helperRootFile,
    config,
    readJsonBody: async () => ({
      convergenceMaxRounds: 7,
    }),
  }));

  const result = await handler(['convergence-settings'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(result.status, 500);
  assert.equal(result.body?.ok, false);
  assert.equal(result.body?.error, 'convergence_settings_persist_failed');
  assert.equal(config.convergenceMaxRounds, 3, 'convergence config should roll back when persistence fails');
});

test('storage-settings PUT returns error when persistence writes fail', async () => {
  const helperRootFile = await makeInvalidHelperRoot();
  const localDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-storage-ok-local-'));
  const runDataStorageState = {
    enabled: false,
    destinationType: 'local',
    localDirectory,
    s3Region: 'us-east-2',
    s3Bucket: '',
    s3Prefix: 'spec-factory-runs',
    s3AccessKeyId: '',
    s3SecretAccessKey: '',
    s3SessionToken: '',
    updatedAt: null,
  };
  const handler = registerConfigRoutes(makeCtx({
    HELPER_ROOT: helperRootFile,
    runDataStorageState,
    readJsonBody: async () => ({
      enabled: true,
      destinationType: 'local',
      localDirectory,
    }),
  }));

  const result = await handler(['storage-settings'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(result.status, 500);
  assert.equal(result.body?.ok, false);
  assert.equal(result.body?.error, 'storage_settings_persist_failed');
  assert.equal(runDataStorageState.enabled, false, 'storage state should roll back when persistence fails');
});
