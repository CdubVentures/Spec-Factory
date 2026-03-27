import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { writeNeedSet } from '../runtimeBridgeArtifacts.js';
import { SpecDb } from '../../db/specDb.js';

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'sf-needset-dual-'));
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

test('writeNeedSet writes both JSON file and SQL row', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
    const needSetPath = path.join(tmpDir, 'needset.json');
    const state = buildMockState({ needSetPath, specDb });
    const payload = { total_fields: 12, summary: 'test', fields: [{ field_key: 'weight' }] };

    await writeNeedSet(state, payload);

    const jsonDoc = JSON.parse(await fs.readFile(needSetPath, 'utf8'));
    assert.deepEqual(jsonDoc, payload, 'JSON file should match payload');

    const sqlRow = specDb.getRunArtifact('run-ns-001', 'needset');
    assert.ok(sqlRow, 'SQL row should exist');
    assert.deepEqual(sqlRow.payload, payload, 'SQL payload should match');
    assert.equal(sqlRow.category, 'mouse');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('JSON and SQL payloads match exactly', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
    const needSetPath = path.join(tmpDir, 'needset.json');
    const state = buildMockState({ needSetPath, specDb });
    const payload = {
      run_id: 'run-ns-001',
      category: 'mouse',
      product_id: 'mouse-razer-viper',
      total_fields: 60,
      generated_at: '2026-03-26T10:00:00.000Z',
      summary: { total: 60, resolved: 35 },
      fields: [{ field_key: 'weight', state: 'missing', need_score: 0.85 }],
    };

    await writeNeedSet(state, payload);

    const jsonDoc = JSON.parse(await fs.readFile(needSetPath, 'utf8'));
    const sqlRow = specDb.getRunArtifact('run-ns-001', 'needset');
    assert.deepEqual(sqlRow.payload, jsonDoc, 'SQL and JSON must be identical');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('SQL write is best-effort — JSON still written if specDb is null', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const needSetPath = path.join(tmpDir, 'needset.json');
    const state = buildMockState({ needSetPath, specDb: null });

    await writeNeedSet(state, { total_fields: 5 });

    const jsonDoc = JSON.parse(await fs.readFile(needSetPath, 'utf8'));
    assert.equal(jsonDoc.total_fields, 5, 'JSON should still be written');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
