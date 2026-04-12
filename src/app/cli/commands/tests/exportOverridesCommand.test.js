import test from 'node:test';
import assert from 'node:assert/strict';

import { createExportOverridesCommand } from '../exportOverridesCommand.js';

function createMockSpecDb() {
  return {
    close() {},
  };
}

function createHarness(overrides = {}) {
  const mockSpecDb = overrides.specDb || createMockSpecDb();
  return createExportOverridesCommand({
    withSpecDb: async (_config, _category, fn) => {
      try { return await fn(mockSpecDb); } finally { try { mockSpecDb?.close(); } catch { /* */ } }
    },
    ...overrides,
  });
}

test('export-overrides requires --category', async () => {
  const cmd = createHarness();
  await assert.rejects(
    cmd({}, {}, { _: [] }),
    /category/i,
  );
});

test('export-overrides returns empty products array (Phase 1b stub)', async () => {
  const cmd = createHarness();
  const result = await cmd({}, {}, { category: 'mouse', _: [] });
  assert.equal(result.command, 'export-overrides');
  assert.equal(result.category, 'mouse');
  assert.equal(result.products.length, 0);
});

// ── migrate-overrides tests ─��────────────────────────────────────────────────

import { createMigrateOverridesCommand } from '../exportOverridesCommand.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

function createMigrationHarness(overrides = {}) {
  const mockSpecDb = overrides.specDb || createMockSpecDb();
  return createMigrateOverridesCommand({
    withSpecDb: async (_config, _category, fn) => {
      try { return await fn(mockSpecDb); } finally { try { mockSpecDb?.close(); } catch { /* */ } }
    },
  });
}

test('migrate-overrides requires --category', async () => {
  const cmd = createMigrationHarness();
  await assert.rejects(
    cmd({}, {}, { _: [] }),
    /category/i,
  );
});

test('migrate-overrides writes empty v2 envelope (Phase 1b stub)', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'migrate-test-'));
  try {
    const cmd = createMigrationHarness();
    const config = { categoryAuthorityRoot: tmpDir };
    const result = await cmd(config, {}, { category: 'mouse', _: [] });

    assert.equal(result.command, 'migrate-overrides');
    assert.equal(result.migrated_count, 0);

    const filePath = path.join(tmpDir, 'mouse', '_overrides', 'overrides.json');
    const raw = await fs.readFile(filePath, 'utf8');
    const envelope = JSON.parse(raw);
    assert.equal(envelope.version, 2);
    assert.equal(envelope.category, 'mouse');
    assert.ok(envelope.updated_at);
    assert.deepEqual(envelope.products, {});
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
