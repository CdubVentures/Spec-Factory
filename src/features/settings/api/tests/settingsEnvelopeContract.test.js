import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

import { registerConfigRoutes } from '../configRoutes.js';
import { AppDb } from '../../../../db/appDb.js';

/**
 * Contract: Every settings PUT handler must return the standard envelope:
 *   { ok: boolean, applied: object, snapshot: object, rejected: object }
 *
 * `rejected` may be empty `{}` but must always be present.
 * `snapshot` must reflect the full post-persist state.
 * `applied` must contain only the keys that were actually written.
 */

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

function assertEnvelope(body, label) {
  assert.equal(typeof body.ok, 'boolean', `${label}: ok must be boolean`);
  assert.ok(
    body.applied !== undefined && typeof body.applied === 'object' && !Array.isArray(body.applied),
    `${label}: applied must be a plain object`,
  );
  assert.ok(
    body.snapshot !== undefined && typeof body.snapshot === 'object' && !Array.isArray(body.snapshot),
    `${label}: snapshot must be a plain object`,
  );
  assert.ok(
    body.rejected !== undefined && typeof body.rejected === 'object' && !Array.isArray(body.rejected),
    `${label}: rejected must be a plain object`,
  );
}

// --- Runtime settings envelope ---

test('runtime-settings PUT returns standard envelope with ok, applied, snapshot, rejected', async (t) => {
  const helperRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'envelope-runtime-'));
  t.after(() => fs.rm(helperRoot, { recursive: true, force: true }));
  const appDb = new AppDb({ dbPath: ':memory:' });
  t.after(() => appDb.close());
  const handler = registerConfigRoutes(makeCtx({
    config: { categoryAuthorityRoot: helperRoot },
    HELPER_ROOT: helperRoot,
    appDb,
    readJsonBody: async () => ({ domainClassifierUrlCap: 25 }),
  }));

  const result = await handler(['runtime-settings'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(result.status, 200);
  assertEnvelope(result.body, 'runtime');
  assert.equal(result.body.applied.domainClassifierUrlCap, 25);
});

test('runtime-settings PUT with unknown keys includes them in rejected', async (t) => {
  const helperRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'envelope-runtime-unk-'));
  t.after(() => fs.rm(helperRoot, { recursive: true, force: true }));
  const appDb = new AppDb({ dbPath: ':memory:' });
  t.after(() => appDb.close());
  const handler = registerConfigRoutes(makeCtx({
    config: { categoryAuthorityRoot: helperRoot },
    HELPER_ROOT: helperRoot,
    appDb,
    readJsonBody: async () => ({ domainClassifierUrlCap: 25, __bogusKey__: 'test' }),
  }));

  const result = await handler(['runtime-settings'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(result.status, 200);
  assertEnvelope(result.body, 'runtime-unknown');
  assert.equal(result.body.rejected.__bogusKey__, 'unknown_key');
});

// --- UI settings envelope ---

test('ui-settings PUT returns standard envelope with ok, applied, snapshot, rejected', async (t) => {
  const helperRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'envelope-ui-'));
  t.after(() => fs.rm(helperRoot, { recursive: true, force: true }));
  const appDb = new AppDb({ dbPath: ':memory:' });
  t.after(() => appDb.close());
  const handler = registerConfigRoutes(makeCtx({
    config: { categoryAuthorityRoot: helperRoot },
    HELPER_ROOT: helperRoot,
    appDb,
    readJsonBody: async () => ({ runtimeAutoSaveEnabled: false }),
  }));

  const result = await handler(['ui-settings'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(result.status, 200);
  assertEnvelope(result.body, 'ui');
  assert.equal(result.body.applied.runtimeAutoSaveEnabled, false);
});

test('ui-settings PUT with unknown keys includes them in rejected', async (t) => {
  const helperRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'envelope-ui-unk-'));
  t.after(() => fs.rm(helperRoot, { recursive: true, force: true }));
  const appDb = new AppDb({ dbPath: ':memory:' });
  t.after(() => appDb.close());
  const handler = registerConfigRoutes(makeCtx({
    config: { categoryAuthorityRoot: helperRoot },
    HELPER_ROOT: helperRoot,
    appDb,
    readJsonBody: async () => ({ runtimeAutoSaveEnabled: true, hackerField: 'pwned' }),
  }));

  const result = await handler(['ui-settings'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(result.status, 200);
  assertEnvelope(result.body, 'ui-unknown');
  assert.equal(result.body.rejected.hackerField, 'unknown_key');
});

