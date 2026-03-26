import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createCrawlSession } from '../crawlSession.js';
import { resolveVideoFilePath } from '../../indexing/api/runtimeOpsVideoHelpers.js';

// WHY: Integration test that verifies the full chain:
// 1. crawlSession snapshots videoDir before c.run()
// 2. Playwright creates UUID .webm files during c.run()
// 3. writeVideoManifest() diffs the directory, writes manifest.json
// 4. resolveVideoFilePath() reads manifest and finds the correct file

describe('video recording end-to-end integration', () => {
  const runId = `test-video-e2e-${Date.now()}`;
  const videoDir = path.join(os.tmpdir(), 'spec-factory-crawl-videos', runId);

  afterEach(() => {
    fs.rmSync(videoDir, { recursive: true, force: true });
  });

  function buildFakeCrawlerFactory({ fileCreator }) {
    return (config) => ({
      async run(requests) {
        for (const request of requests) {
          const page = {
            async content() { return '<html></html>'; },
            async title() { return 'Test'; },
            url() { return request.url; },
            viewportSize() { return { width: 1280, height: 720 }; },
            async screenshot() { return Buffer.from('fake'); },
            async addInitScript() {},
            async evaluate() { return 0; },
            async waitForTimeout() {},
            async $(sel) { return null; },
            // WHY: Return truthy so videoPathMap tracks this worker
            video() { return { path() { return Promise.resolve(''); } }; },
          };
          await config.requestHandler({
            page,
            request: { url: request.url, uniqueKey: request.uniqueKey },
            response: { status: () => 200, headers: () => ({}) },
          });
        }
        // WHY: Simulate Playwright writing .webm files during c.run()
        // (after all requestHandlers complete, before c.run() returns).
        // This is when the browser contexts close and videos are finalized.
        if (fileCreator) fileCreator();
      },
      async teardown() {},
    });
  }

  it('snapshot-diff creates manifest that resolveVideoFilePath can read', async () => {
    const fakeUuid = 'abc123def456';
    const fakeVideoFile = path.join(videoDir, `${fakeUuid}.webm`);

    const session = createCrawlSession({
      settings: { crawlVideoRecordingEnabled: true, runId, crawlVideoRecordingSize: '1280x720' },
      plugins: [],
      _crawlerFactory: buildFakeCrawlerFactory({
        fileCreator: () => {
          fs.mkdirSync(videoDir, { recursive: true });
          fs.writeFileSync(fakeVideoFile, 'fake-webm-video-content');
        },
      }),
    });

    const result = await session.processUrl('http://example.com');
    assert.equal(typeof result.videoPath, 'string');

    const manifestPath = path.join(videoDir, 'manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json should exist');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const workerId = result.workerId;
    assert.ok(manifest[workerId], `manifest should have entry for ${workerId}`);
    assert.equal(manifest[workerId], `${fakeUuid}.webm`);

    const resolved = resolveVideoFilePath(runId, workerId);
    assert.ok(resolved, 'resolveVideoFilePath should return a path');
    assert.ok(fs.existsSync(resolved), 'resolved path should exist');
  });

  it('resolveVideoFilePath returns null when no manifest exists', () => {
    assert.equal(resolveVideoFilePath('nonexistent-run-e2e-xyz', 'fetch-1'), null);
  });

  it('multiple workers in a single batch get correct mappings', async () => {
    const uuids = ['uuid-aaa', 'uuid-bbb', 'uuid-ccc'];

    const session = createCrawlSession({
      settings: { crawlVideoRecordingEnabled: true, runId, crawlVideoRecordingSize: '640x480' },
      plugins: [],
      _crawlerFactory: buildFakeCrawlerFactory({
        fileCreator: () => {
          fs.mkdirSync(videoDir, { recursive: true });
          // WHY: Create files with increasing mtime so sort-by-time matches worker order
          for (let i = 0; i < uuids.length; i++) {
            const filePath = path.join(videoDir, `${uuids[i]}.webm`);
            fs.writeFileSync(filePath, `video-${uuids[i]}`);
            // Set mtime to ensure deterministic ordering
            const mtime = new Date(Date.now() + i * 1000);
            fs.utimesSync(filePath, mtime, mtime);
          }
        },
      }),
    });

    const settled = await session.processBatch(['http://a.com', 'http://b.com', 'http://c.com']);

    const manifestPath = path.join(videoDir, 'manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json should exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.equal(Object.keys(manifest).length, 3, 'manifest should have 3 entries');

    for (const entry of settled) {
      assert.equal(entry.status, 'fulfilled');
      const wid = entry.value.workerId;
      assert.ok(manifest[wid], `manifest should have entry for ${wid}`);
      const resolved = resolveVideoFilePath(runId, wid);
      assert.ok(resolved, `resolveVideoFilePath should find ${wid}`);
      assert.ok(fs.existsSync(resolved), `video file should exist for ${wid}`);
    }
  });

  it('multiple batches accumulate in manifest', async () => {
    let batchNum = 0;
    const session = createCrawlSession({
      settings: { crawlVideoRecordingEnabled: true, runId },
      plugins: [],
      _crawlerFactory: buildFakeCrawlerFactory({
        fileCreator: () => {
          batchNum++;
          fs.mkdirSync(videoDir, { recursive: true });
          fs.writeFileSync(path.join(videoDir, `batch${batchNum}.webm`), `video-batch${batchNum}`);
        },
      }),
    });

    await session.processUrl('http://first.com');
    await session.processUrl('http://second.com');

    const manifestPath = path.join(videoDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.equal(Object.keys(manifest).length, 2, 'manifest should have both entries');
    assert.ok(manifest['fetch-1'], 'first worker should be in manifest');
    assert.ok(manifest['fetch-2'], 'second worker should be in manifest');
  });
});
