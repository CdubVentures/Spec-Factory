import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { SpecDb } from '../../../db/specDb.js';
import { rebuildMediaIndexesFromDisk } from '../rebuildMediaIndexes.js';

function urlHash8(url) {
  return createHash('sha256').update(String(url || '')).digest('hex').slice(0, 8);
}

function sampleCheckpoint({ runId = 'run-001', category = 'mouse', productId = 'mouse-abc', sources = [] } = {}) {
  return {
    schema_version: 3,
    checkpoint_type: 'crawl',
    created_at: '2026-04-01T04:30:00.000Z',
    run: { run_id: runId, category, product_id: productId, status: 'completed', duration_ms: 5000 },
    artifacts: { screenshot_dir: 'screenshots', video_dir: 'video' },
    sources,
  };
}

function sampleSource({ url, workerId = 'fetch-1', contentHash = '' } = {}) {
  return {
    url,
    final_url: url,
    status: 200,
    success: true,
    blocked: false,
    block_reason: null,
    worker_id: workerId,
    content_hash: contentHash || createHash('sha256').update(url).digest('hex'),
    html_file: `${createHash('sha256').update(url).digest('hex').slice(0, 12)}.html.gz`,
    screenshot_count: 1,
    video_file: `${workerId}.webm`,
    timeout_rescued: false,
    fetch_error: null,
  };
}

async function makeTempRunDir() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'media-rebuild-'));
  const runDir = path.join(tempRoot, 'run-001');
  await fs.mkdir(path.join(runDir, 'screenshots'), { recursive: true });
  await fs.mkdir(path.join(runDir, 'video'), { recursive: true });
  return { tempRoot, runDir };
}

function makeSpecDb() {
  return new SpecDb({ dbPath: ':memory:', category: 'mouse' });
}

// WHY: Write a tiny JPEG stub so the file is scannable and has nonzero size.
async function writeStubFile(filePath) {
  await fs.writeFile(filePath, Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
}

test('screenshots scanned and inserted with correct source metadata', async () => {
  const { tempRoot, runDir } = await makeTempRunDir();
  const specDb = makeSpecDb();

  const url = 'https://example.com/product';
  const hash8 = urlHash8(url);
  const source = sampleSource({ url, workerId: 'fetch-1' });
  const cp = sampleCheckpoint({ sources: [source] });

  const filename = `screenshot-fetch-1-${hash8}-00-page.jpg`;
  await writeStubFile(path.join(runDir, 'screenshots', filename));

  const result = await rebuildMediaIndexesFromDisk({ specDb, runDir, checkpoint: cp });
  assert.equal(result.screenshots_seeded, 1);

  const rows = specDb.getScreenshotsByProduct('mouse-abc');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_url, url);
  assert.equal(rows[0].selector, 'page');
  assert.equal(rows[0].format, 'jpg');
  assert.equal(rows[0].run_id, 'run-001');

  specDb.close();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('videos scanned and inserted with correct source metadata', async () => {
  const { tempRoot, runDir } = await makeTempRunDir();
  const specDb = makeSpecDb();

  const url = 'https://example.com/product';
  const source = sampleSource({ url, workerId: 'fetch-1' });
  const cp = sampleCheckpoint({ sources: [source] });

  await writeStubFile(path.join(runDir, 'video', 'fetch-1.webm'));

  const result = await rebuildMediaIndexesFromDisk({ specDb, runDir, checkpoint: cp });
  assert.equal(result.videos_seeded, 1);

  const rows = specDb.getVideosByProduct('mouse-abc');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_url, url);
  assert.equal(rows[0].worker_id, 'fetch-1');
  assert.equal(rows[0].format, 'webm');

  specDb.close();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('worker_id maps to correct source when multiple sources exist', async () => {
  const { tempRoot, runDir } = await makeTempRunDir();
  const specDb = makeSpecDb();

  const url1 = 'https://example.com/page-a';
  const url2 = 'https://example.com/page-b';
  const src1 = sampleSource({ url: url1, workerId: 'fetch-1' });
  const src2 = sampleSource({ url: url2, workerId: 'fetch-2' });
  const cp = sampleCheckpoint({ sources: [src1, src2] });

  await writeStubFile(path.join(runDir, 'screenshots', `screenshot-fetch-1-${urlHash8(url1)}-00-page.jpg`));
  await writeStubFile(path.join(runDir, 'screenshots', `screenshot-fetch-2-${urlHash8(url2)}-00-page.jpg`));

  const result = await rebuildMediaIndexesFromDisk({ specDb, runDir, checkpoint: cp });
  assert.equal(result.screenshots_seeded, 2);

  const rows = specDb.getScreenshotsByProduct('mouse-abc');
  const urls = rows.map((r) => r.source_url).sort();
  assert.deepStrictEqual(urls, [url1, url2].sort());

  specDb.close();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('urlHash8 disambiguates when multiple sources share a worker_id', async () => {
  const { tempRoot, runDir } = await makeTempRunDir();
  const specDb = makeSpecDb();

  const url1 = 'https://example.com/first';
  const url2 = 'https://example.com/second';
  const src1 = sampleSource({ url: url1, workerId: 'fetch-1' });
  const src2 = sampleSource({ url: url2, workerId: 'fetch-1' });
  const cp = sampleCheckpoint({ sources: [src1, src2] });

  await writeStubFile(path.join(runDir, 'screenshots', `screenshot-fetch-1-${urlHash8(url1)}-00-page.jpg`));
  await writeStubFile(path.join(runDir, 'screenshots', `screenshot-fetch-1-${urlHash8(url2)}-00-crop.jpg`));

  const result = await rebuildMediaIndexesFromDisk({ specDb, runDir, checkpoint: cp });
  assert.equal(result.screenshots_seeded, 2);

  const rows = specDb.getScreenshotsByProduct('mouse-abc');
  const urlSet = new Set(rows.map((r) => r.source_url));
  assert.ok(urlSet.has(url1), 'first URL should be mapped');
  assert.ok(urlSet.has(url2), 'second URL should be mapped');

  specDb.close();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('empty screenshot dir returns 0', async () => {
  const { tempRoot, runDir } = await makeTempRunDir();
  const specDb = makeSpecDb();
  const cp = sampleCheckpoint({ sources: [sampleSource({ url: 'https://example.com' })] });

  const result = await rebuildMediaIndexesFromDisk({ specDb, runDir, checkpoint: cp });
  assert.equal(result.screenshots_seeded, 0);
  assert.equal(result.videos_seeded, 0);

  specDb.close();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('missing screenshot dir returns 0 without throwing', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'media-no-dir-'));
  const runDir = path.join(tempRoot, 'run-empty');
  await fs.mkdir(runDir, { recursive: true });
  // No screenshots/ or video/ subdirs
  const specDb = makeSpecDb();
  const cp = sampleCheckpoint();

  const result = await rebuildMediaIndexesFromDisk({ specDb, runDir, checkpoint: cp });
  assert.equal(result.screenshots_seeded, 0);
  assert.equal(result.videos_seeded, 0);

  specDb.close();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('non-matching filenames are skipped', async () => {
  const { tempRoot, runDir } = await makeTempRunDir();
  const specDb = makeSpecDb();
  const cp = sampleCheckpoint({ sources: [sampleSource({ url: 'https://example.com' })] });

  await writeStubFile(path.join(runDir, 'screenshots', 'random-file.txt'));
  await writeStubFile(path.join(runDir, 'screenshots', 'not-a-screenshot.jpg'));
  await writeStubFile(path.join(runDir, 'video', 'not-a-video.mp4'));

  const result = await rebuildMediaIndexesFromDisk({ specDb, runDir, checkpoint: cp });
  assert.equal(result.screenshots_seeded, 0);
  assert.equal(result.videos_seeded, 0);

  specDb.close();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('checkpoint with no sources returns zeros', async () => {
  const { tempRoot, runDir } = await makeTempRunDir();
  const specDb = makeSpecDb();
  const cp = sampleCheckpoint({ sources: [] });

  await writeStubFile(path.join(runDir, 'screenshots', 'screenshot-fetch-1-abcd1234-00-page.jpg'));

  const result = await rebuildMediaIndexesFromDisk({ specDb, runDir, checkpoint: cp });
  assert.equal(result.screenshots_seeded, 0, 'no source to map to — should skip');

  specDb.close();
  await fs.rm(tempRoot, { recursive: true, force: true });
});
