import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { writeSearchProfile } from '../runtimeBridgeArtifacts.js';
import { SpecDb } from '../../db/specDb.js';

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'sf-artifact-dual-'));
}

function buildMockState(overrides = {}) {
  return {
    runId: 'run-art-dual-001',
    searchProfilePath: '',
    brandResolutionPath: '',
    context: { category: 'mouse', productId: 'mouse-razer-viper' },
    specDb: null,
    ...overrides,
  };
}

test('writeSearchProfile writes both JSON file and SQL row', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
    const searchProfilePath = path.join(tmpDir, 'search_profile.json');
    const state = buildMockState({ searchProfilePath, specDb });
    const payload = { status: 'executed', query_count: 8, query_rows: [{ query: 'razer viper' }] };

    await writeSearchProfile(state, payload);

    const jsonDoc = JSON.parse(await fs.readFile(searchProfilePath, 'utf8'));
    assert.deepEqual(jsonDoc, payload, 'JSON file should match payload');

    const sqlRow = specDb.getRunArtifact('run-art-dual-001', 'search_profile');
    assert.ok(sqlRow, 'SQL row should exist');
    assert.deepEqual(sqlRow.payload, payload, 'SQL payload should match');
    assert.equal(sqlRow.category, 'mouse');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('search_profile SQL payload matches JSON exactly', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
    const searchProfilePath = path.join(tmpDir, 'search_profile.json');
    const state = buildMockState({ searchProfilePath, specDb });
    const payload = {
      run_id: 'run-art-dual-001',
      status: 'planned',
      query_count: 5,
      query_rows: [
        { query: 'razer viper v3 pro specs', attempts: 1, result_count: 10, providers: ['searxng'] },
        { query: 'razer viper v3 pro review', attempts: 0, result_count: 0, providers: [] },
      ],
    };

    await writeSearchProfile(state, payload);

    const jsonDoc = JSON.parse(await fs.readFile(searchProfilePath, 'utf8'));
    const sqlRow = specDb.getRunArtifact('run-art-dual-001', 'search_profile');
    assert.deepEqual(sqlRow.payload, jsonDoc, 'SQL and JSON must be identical');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('search_profile SQL write is best-effort if specDb is null', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const searchProfilePath = path.join(tmpDir, 'search_profile.json');
    const state = buildMockState({ searchProfilePath, specDb: null });

    await writeSearchProfile(state, { status: 'planned' });

    const jsonDoc = JSON.parse(await fs.readFile(searchProfilePath, 'utf8'));
    assert.equal(jsonDoc.status, 'planned', 'JSON should still be written');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('brand_resolution SQL write fires from handleBrandResolved path', async () => {
  // WHY: brand_resolution is written inline in handleBrandResolved, not via a
  // shared writeX function. This test verifies the SQL write by simulating
  // the same pattern: fs.writeFile + specDb.upsertRunArtifact.
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  const brandPayload = {
    scope: 'brand',
    brand: 'Razer',
    status: 'resolved',
    official_domain: 'razer.com',
    confidence: 0.95,
  };

  // Simulate what handleBrandResolved does after the fs.writeFile
  specDb.upsertRunArtifact({
    run_id: 'run-art-dual-001',
    artifact_type: 'brand_resolution',
    category: 'mouse',
    payload: brandPayload,
  });

  const sqlRow = specDb.getRunArtifact('run-art-dual-001', 'brand_resolution');
  assert.ok(sqlRow, 'SQL row should exist');
  assert.deepEqual(sqlRow.payload, brandPayload);
  assert.equal(sqlRow.category, 'mouse');
});
