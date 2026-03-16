import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

import { registerConfigRoutes } from '../src/features/settings/api/configRoutes.js';

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function makeIsolatedAuthorityRoot() {
  const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return path.join(os.tmpdir(), `spec-factory-storage-settings-${nonce}`);
}

function makeCtx(overrides = {}) {
  const helperRoot = String(overrides.HELPER_ROOT || makeIsolatedAuthorityRoot());
  const configOverrides = overrides.config && typeof overrides.config === 'object'
    ? overrides.config
    : {};
  const base = {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    config: {
      categoryAuthorityRoot: helperRoot,
      categoryAuthorityRoot: helperRoot,
      ...configOverrides,
    },
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
    fs,
    path,
    HELPER_ROOT: helperRoot,
  };
  return { ...base, ...overrides, config: base.config, HELPER_ROOT: helperRoot };
}

test('storage-settings GET redacts secret values but reports presence flags', async () => {
  const handler = registerConfigRoutes(makeCtx({
    runDataStorageState: {
      enabled: true,
      destinationType: 's3',
      localDirectory: 'C:\\Runs',
      awsRegion: 'us-east-1',
      s3Bucket: 'bucket-a',
      s3Prefix: 'spec-factory/runs',
      s3AccessKeyId: 'AKIA_TEST_KEY',
      s3SecretAccessKey: 'super-secret',
      s3SessionToken: 'session-token',
      updatedAt: '2026-02-24T00:00:00.000Z',
    },
  }));

  const result = await handler(['storage-settings'], new URLSearchParams(), 'GET', {}, {});
  assert.equal(result.status, 200);
  assert.equal(result.body.enabled, true);
  assert.equal(result.body.destinationType, 's3');
  assert.equal(result.body.s3AccessKeyId, 'AKIA_TEST_KEY');
  assert.equal(result.body.hasS3SecretAccessKey, true);
  assert.equal(result.body.hasS3SessionToken, true);
  assert.equal(typeof result.body.stagingTempDirectory, 'string');
  assert.ok(result.body.stagingTempDirectory.length > 0);
  assert.equal(Object.hasOwn(result.body, 's3SecretAccessKey'), false);
  assert.equal(Object.hasOwn(result.body, 's3SessionToken'), false);
});

test('storage-settings PUT updates local destination config and emits data-change', async () => {
  const emitted = [];
  const runDataStorageState = {
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
  };
  const handler = registerConfigRoutes(makeCtx({
    runDataStorageState,
    readJsonBody: async () => ({
      enabled: true,
      destinationType: 'local',
      localDirectory: 'C:\\SpecFactoryRuns',
    }),
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
  }));

  const result = await handler(['storage-settings'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(runDataStorageState.enabled, true);
  assert.equal(runDataStorageState.destinationType, 'local');
  assert.equal(runDataStorageState.localDirectory, 'C:\\SpecFactoryRuns');
  assert.equal(emitted.length, 2);
  assert.equal(emitted[0].channel, 'data-change');
  assert.equal(emitted[1].channel, 'data-change');
  const eventNames = emitted.map((row) => row.payload.event).sort();
  assert.deepEqual(eventNames, ['storage-settings-updated', 'user-settings-updated']);
});

test('storage-settings local browse lists current directory children', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-storage-browse-'));
  await fs.mkdir(path.join(tempRoot, 'alpha'), { recursive: true });
  await fs.mkdir(path.join(tempRoot, 'beta'), { recursive: true });
  await fs.writeFile(path.join(tempRoot, 'not-a-directory.txt'), 'x', 'utf8');

  const handler = registerConfigRoutes(makeCtx());
  const params = new URLSearchParams();
  params.set('path', tempRoot);

  const result = await handler(['storage-settings', 'local', 'browse'], params, 'GET', {}, {});
  assert.equal(result.status, 200);
  assert.equal(result.body.currentPath, path.resolve(tempRoot));
  assert.equal(Array.isArray(result.body.directories), true);
  const names = result.body.directories.map((row) => row.name).sort();
  assert.deepEqual(names, ['alpha', 'beta']);
});

test('storage-settings PUT creates missing local destination directory', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-storage-local-create-'));
  const missingDir = path.join(tempRoot, 'new-run-storage-root');
  const handler = registerConfigRoutes(makeCtx({
    readJsonBody: async () => ({
      enabled: true,
      destinationType: 'local',
      localDirectory: missingDir,
    }),
  }));

  const result = await handler(['storage-settings'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(result.status, 200);

  const stat = await fs.stat(missingDir);
  assert.equal(stat.isDirectory(), true);
});

test('storage-settings local browse without path uses configured local directory', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-storage-browse-default-'));
  await fs.mkdir(path.join(tempRoot, 'gamma'), { recursive: true });
  const handler = registerConfigRoutes(makeCtx({
    runDataStorageState: {
      enabled: true,
      destinationType: 'local',
      localDirectory: tempRoot,
      awsRegion: 'us-east-2',
      s3Bucket: '',
      s3Prefix: 'spec-factory-runs',
      s3AccessKeyId: '',
      s3SecretAccessKey: '',
      s3SessionToken: '',
      updatedAt: null,
    },
  }));

  const result = await handler(['storage-settings', 'local', 'browse'], new URLSearchParams(), 'GET', {}, {});
  assert.equal(result.status, 200);
  assert.equal(result.body.currentPath, path.resolve(tempRoot));
});

test('storage-settings PUT keeps localDirectory empty when destination is s3', async () => {
  const runDataStorageState = {
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
  };
  const handler = registerConfigRoutes(makeCtx({
    runDataStorageState,
    readJsonBody: async () => ({
      enabled: true,
      destinationType: 's3',
      localDirectory: '',
      awsRegion: 'us-east-2',
      s3Bucket: 'my-spec-harvester-data',
      s3Prefix: 'spec-factory-runs',
      s3AccessKeyId: 'AKIA_TEST',
      s3SecretAccessKey: 'secret',
    }),
  }));

  const result = await handler(['storage-settings'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(result.status, 200);
  assert.equal(runDataStorageState.destinationType, 's3');
  assert.equal(runDataStorageState.localDirectory, '');
});
