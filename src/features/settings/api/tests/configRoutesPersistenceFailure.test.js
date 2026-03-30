import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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
    runDataStorageState: {
      enabled: false,
      destinationType: 'local',
      localDirectory: '',
      awsRegion: 'us-east-2',
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

async function makeHelperRoot() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-valid-helper-root-'));
  await fs.mkdir(path.join(tempRoot, '_runtime'), { recursive: true });
  return tempRoot;
}

test('runtime-settings PUT returns error when persistence writes fail', async () => {
  resetSettingsPersistenceCounters();
  const helperRootFile = await makeInvalidHelperRoot();
  const config = {
    domainClassifierUrlCap: 50,
  };
  const handler = registerConfigRoutes(makeCtx({
    HELPER_ROOT: helperRootFile,
    config,
    readJsonBody: async () => ({
      domainClassifierUrlCap: 25,
    }),
  }));

  const result = await handler(['runtime-settings'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(result.status, 500);
  assert.equal(result.body?.ok, false);
  assert.equal(result.body?.error, 'runtime_settings_persist_failed');
  assert.equal(config.domainClassifierUrlCap, 50, 'runtime config should roll back when persistence fails');
  const counters = getSettingsPersistenceCountersSnapshot();
  assert.equal(counters.writes.by_target['runtime-settings-route']?.failed_total, 1);
});

test('storage-settings PUT returns error when persistence writes fail', async () => {
  resetSettingsPersistenceCounters();
  const helperRootFile = await makeInvalidHelperRoot();
  const localDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-storage-ok-local-'));
  const runDataStorageState = {
    enabled: false,
    destinationType: 'local',
    localDirectory,
    awsRegion: 'us-east-2',
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
  const counters = getSettingsPersistenceCountersSnapshot();
  assert.equal(counters.writes.by_target['storage-settings-route']?.failed_total, 1);
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
