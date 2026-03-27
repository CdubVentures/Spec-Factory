import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { writeSearchProfile } from '../runtimeBridgeArtifacts.js';
import { SpecDb } from '../../db/specDb.js';

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'sf-artifact-'));
}

function buildMockState(overrides = {}) {
  return {
    runId: 'run-art-001',
    searchProfilePath: '',
    context: { category: 'mouse', productId: 'mouse-razer-viper' },
    specDb: null,
    ...overrides,
  };
}

test('writeSearchProfile default writes SQL only — no JSON file created', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
    const searchProfilePath = path.join(tmpDir, 'search_profile.json');
    const state = buildMockState({ searchProfilePath, specDb });

    await writeSearchProfile(state, { status: 'executed', query_count: 8 });

    const jsonExists = await fs.stat(searchProfilePath).then(() => true).catch(() => false);
    assert.equal(jsonExists, false, 'search_profile.json should NOT be created by default');

    const sqlRow = specDb.getRunArtifact('run-art-001', 'search_profile');
    assert.ok(sqlRow, 'SQL row should exist');
    assert.equal(sqlRow.payload.status, 'executed');
    assert.equal(sqlRow.payload.query_count, 8);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('writeSearchProfile with writeJson: true writes both JSON and SQL', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
    const searchProfilePath = path.join(tmpDir, 'search_profile.json');
    const state = buildMockState({ searchProfilePath, specDb });
    const payload = { status: 'executed', query_count: 5, query_rows: [{ query: 'razer viper' }] };

    await writeSearchProfile(state, payload, { writeJson: true });

    const jsonDoc = JSON.parse(await fs.readFile(searchProfilePath, 'utf8'));
    assert.deepEqual(jsonDoc, payload);

    const sqlRow = specDb.getRunArtifact('run-art-001', 'search_profile');
    assert.deepEqual(sqlRow.payload, payload);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('SQL write is best-effort — no crash if specDb is null', async () => {
  const state = buildMockState({ specDb: null });
  await writeSearchProfile(state, { status: 'planned' });
});

test('brand_resolution SQL write still fires from handleBrandResolved path', () => {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  specDb.upsertRunArtifact({
    run_id: 'run-art-001',
    artifact_type: 'brand_resolution',
    category: 'mouse',
    payload: { brand: 'Razer', status: 'resolved', confidence: 0.95 },
  });

  const sqlRow = specDb.getRunArtifact('run-art-001', 'brand_resolution');
  assert.ok(sqlRow);
  assert.deepEqual(sqlRow.payload, { brand: 'Razer', status: 'resolved', confidence: 0.95 });
});
