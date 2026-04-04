import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStorage } from '../../core/storage/storage.js';
import { SpecDb } from '../../db/specDb.js';
import { ingestCsvFile } from '../csvIngestor.js';

const HEX_PID_RE = /^mouse-[a-f0-9]{8}$/;

test('ingestCsvFile parses rows, creates product jobs, and updates queue state', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-ingest-'));
  const localInputRoot = path.join(tempRoot, 'fixtures');
  const localOutputRoot = path.join(tempRoot, 'out');
  const importsRoot = path.join(tempRoot, 'imports');
  const incomingDir = path.join(importsRoot, 'mouse', 'incoming');
  await fs.mkdir(incomingDir, { recursive: true });

  const csvPath = path.join(incomingDir, 'batch.csv');
  await fs.writeFile(
    csvPath,
    [
      'brand,base_model,variant,seed_urls,anchors_json,requirements_json',
      '"Logitech","G Pro X Superlight 2","Wireless","https://logitechg.com/specs","{""connection"":""wireless""}","{""targetConfidence"":0.9}"'
    ].join('\n'),
    'utf8'
  );

  const config = {
    localMode: true,
    localInputRoot,
    localOutputRoot,
    importsRoot
  };
  const storage = createStorage(config);
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });

  try {
    const result = await ingestCsvFile({
      storage,
      config,
      category: 'mouse',
      csvPath,
      importsRoot,
      specDb,
    });

    assert.equal(result.skipped, false);
    assert.equal(result.job_count, 1);
    assert.match(result.jobs[0].productId, HEX_PID_RE);

    const pid = result.jobs[0].productId;
    // Return shape is slim: { productId, s3key } — full job data stays internal
    assert.equal(result.jobs[0].s3key, '');
    assert.ok(pid.length > 0);

    const processedDir = path.join(importsRoot, 'mouse', 'processed');
    const processedFiles = await fs.readdir(processedDir);
    assert.equal(processedFiles.length, 1);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('ingestCsvFile rejects model-only rows without base_model', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-ingest-'));
  const localInputRoot = path.join(tempRoot, 'fixtures');
  const localOutputRoot = path.join(tempRoot, 'out');
  const importsRoot = path.join(tempRoot, 'imports');
  const incomingDir = path.join(importsRoot, 'mouse', 'incoming');
  await fs.mkdir(incomingDir, { recursive: true });

  const csvPath = path.join(incomingDir, 'batch.csv');
  await fs.writeFile(
    csvPath,
    [
      'brand,model,variant,seed_urls',
      '"Logitech","G Pro X Superlight 2","Wireless","https://logitechg.com/specs"'
    ].join('\n'),
    'utf8'
  );

  const config = {
    localMode: true,
    localInputRoot,
    localOutputRoot,
    importsRoot
  };
  const storage = createStorage(config);
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });

  try {
    const result = await ingestCsvFile({
      storage,
      config,
      category: 'mouse',
      csvPath,
      importsRoot,
      specDb,
    });

    assert.equal(result.job_count, 0);
    assert.deepEqual(result.invalid_rows, [
      { row: 2, reason: 'missing_brand_or_base_model' },
    ]);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
