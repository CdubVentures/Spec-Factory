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

test('ui-settings GET returns durable autosave defaults', async (t) => {
  const helperRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-ui-settings-defaults-'));
  t.after(async () => {
    await fs.rm(helperRoot, { recursive: true, force: true });
  });
  const handler = registerConfigRoutes(makeCtx({
    config: { categoryAuthorityRoot: helperRoot },
    HELPER_ROOT: helperRoot,
  }));

  const result = await handler(['ui-settings'], new URLSearchParams(), 'GET', {}, {});
  assert.equal(result.status, 200);
  assert.equal(result.body.studioAutoSaveAllEnabled, false);
  assert.equal(result.body.studioAutoSaveEnabled, true);
  assert.equal(result.body.studioAutoSaveMapEnabled, true);
  assert.equal(result.body.runtimeAutoSaveEnabled, true);
  assert.equal(result.body.storageAutoSaveEnabled, false);
});

test('ui-settings PUT persists autosave toggles and emits settings data-change', async (t) => {
  const helperRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-ui-settings-save-'));
  t.after(async () => {
    await fs.rm(helperRoot, { recursive: true, force: true });
  });
  const emitted = [];
  const handler = registerConfigRoutes(makeCtx({
    config: { categoryAuthorityRoot: helperRoot },
    HELPER_ROOT: helperRoot,
    readJsonBody: async () => ({
      studioAutoSaveAllEnabled: true,
      studioAutoSaveEnabled: false,
      studioAutoSaveMapEnabled: false,
      runtimeAutoSaveEnabled: false,
      storageAutoSaveEnabled: true,
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
  assert.equal(putResult.body.snapshot.storageAutoSaveEnabled, true);
  assert.equal(putResult.body.applied.studioAutoSaveEnabled, true);
  assert.equal(putResult.body.applied.studioAutoSaveMapEnabled, true);
  assert.equal(putResult.body.rejected.unknownKeyShouldBeIgnored, 'unknown_key');

  const getResult = await handler(['ui-settings'], new URLSearchParams(), 'GET', {}, {});
  assert.equal(getResult.status, 200);
  assert.equal(getResult.body.studioAutoSaveAllEnabled, true);
  assert.equal(getResult.body.storageAutoSaveEnabled, true);
  assert.equal(getResult.body.runtimeAutoSaveEnabled, false);

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].channel, 'data-change');
  assert.equal(emitted[0].payload.event, 'user-settings-updated');
  assert.equal(emitted[0].payload.meta?.section, 'ui');

  const userSettingsPath = path.join(helperRoot, '_runtime', 'user-settings.json');
  const raw = await fs.readFile(userSettingsPath, 'utf8');
  const saved = JSON.parse(raw);
  assert.equal(saved.ui.studioAutoSaveAllEnabled, true);
  assert.equal(saved.ui.studioAutoSaveEnabled, true);
  assert.equal(saved.ui.studioAutoSaveMapEnabled, true);
  assert.equal(saved.ui.storageAutoSaveEnabled, true);
  assert.equal(saved.ui.runtimeAutoSaveEnabled, false);
});

test('ui-settings PUT keeps field-studio-map autosave independent from key navigator autosave when auto-save-all is off', async (t) => {
  const helperRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-ui-settings-shared-autosave-'));
  t.after(async () => {
    await fs.rm(helperRoot, { recursive: true, force: true });
  });
  const handler = registerConfigRoutes(makeCtx({
    config: { categoryAuthorityRoot: helperRoot },
    HELPER_ROOT: helperRoot,
    readJsonBody: async () => ({
      studioAutoSaveAllEnabled: false,
      studioAutoSaveEnabled: false,
      studioAutoSaveMapEnabled: true,
      runtimeAutoSaveEnabled: true,
      storageAutoSaveEnabled: false,
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
