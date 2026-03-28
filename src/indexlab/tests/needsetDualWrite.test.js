import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { writeNeedSet } from '../runtimeBridgeArtifacts.js';
import { SpecDb } from '../../db/specDb.js';

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'sf-needset-'));
}

function buildMockState(overrides = {}) {
  return {
    runId: 'run-ns-001',
    needSetPath: '',
    context: { category: 'mouse', productId: 'mouse-razer-viper' },
    specDb: null,
    ...overrides,
  };
}

test('writeNeedSet default writes SQL only — no JSON file created', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
    const needSetPath = path.join(tmpDir, 'needset.json');
    const state = buildMockState({ needSetPath, specDb });

    await writeNeedSet(state, { total_fields: 12 });

    const jsonExists = await fs.stat(needSetPath).then(() => true).catch(() => false);
    assert.equal(jsonExists, false, 'needset.json should NOT be created by default');

    const sqlRow = specDb.getRunArtifact('run-ns-001', 'needset');
    assert.ok(sqlRow, 'SQL row should exist');
    assert.equal(sqlRow.payload.total_fields, 12);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('SQL write is best-effort — no crash if specDb is null', async () => {
  const state = buildMockState({ specDb: null });
  await writeNeedSet(state, { total_fields: 5 });
  // Should not throw
});
