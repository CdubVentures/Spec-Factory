import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createCrawlSession } from '../crawlSession.js';
import { resolveVideoFilePath } from '../../indexing/api/runtimeOpsVideoHelpers.js';

// WHY: Integration test that verifies the full chain:
// 1. crawlSession captures video references
// 2. writeVideoManifest() writes manifest.json with workerId → UUID mapping
// 3. resolveVideoFilePath() reads manifest and finds the correct file
// This test uses a real temp directory and a mock crawler that simulates
// Playwright's Video object API.

describe('video recording end-to-end integration', () => {
  const runId = `test-video-e2e-${Date.now()}`;
  const videoDir = path.join(os.tmpdir(), 'spec-factory-crawl-videos', runId);

  afterEach(() => {
    fs.rmSync(videoDir, { recursive: true, force: true });
  });

  it('writeVideoManifest creates manifest.json that resolveVideoFilePath can read', async () => {
    // WHY: Simulate Playwright's Video object. video.path() returns a Promise
    // that resolves to the UUID-named file path after the page closes.
    const fakeUuid = 'abc123def456';
    const fakeVideoFile = path.join(videoDir, `${fakeUuid}.webm`);

    const session = createCrawlSession({
      settings: {
        crawlVideoRecordingEnabled: true,
        crawlVideoRecordingSize: '1280x720',
        runId,
      },
      plugins: [],
      _crawlerFactory: (config) => ({
        async run(requests) {
          for (const request of requests) {
            // Simulate Playwright page with Video object
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
              // WHY: This simulates the real Playwright Video object.
              // video.path() returns a Promise<string> that resolves to the
              // UUID-named file after the context closes.
              video() {
                return {
                  path() { return Promise.resolve(fakeVideoFile); },
                  saveAs: async () => {},
                };
              },
            };
            await config.requestHandler({
              page,
              request: { url: request.url, uniqueKey: request.uniqueKey },
              response: { status: () => 200, headers: () => ({}) },
            });
          }
        },
        async teardown() {},
      }),
    });

    // Create the video dir and fake video file (simulating what Playwright does)
    fs.mkdirSync(videoDir, { recursive: true });
    fs.writeFileSync(fakeVideoFile, 'fake-webm-video-content');

    // Process a URL — this captures the Video reference in videoPathMap
    const result = await session.processUrl('http://example.com');
    assert.equal(typeof result.videoPath, 'string');

    // Verify manifest.json was written
    const manifestPath = path.join(videoDir, 'manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json should exist');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const workerId = result.workerId;
    assert.ok(manifest[workerId], `manifest should have entry for ${workerId}`);
    assert.equal(manifest[workerId], `${fakeUuid}.webm`, 'manifest should map to UUID filename');

    // Verify the API helper can find the video via manifest
    const resolvedPath = resolveVideoFilePath(runId, workerId);
    assert.ok(resolvedPath, 'resolveVideoFilePath should return a path');
    assert.ok(fs.existsSync(resolvedPath), 'resolved path should point to existing file');
    assert.equal(
      fs.readFileSync(resolvedPath, 'utf8'),
      'fake-webm-video-content',
      'resolved file should contain the video data',
    );
  });

  it('resolveVideoFilePath returns null when no manifest exists for a run', () => {
    const result = resolveVideoFilePath('nonexistent-run-e2e-xyz', 'fetch-1');
    assert.equal(result, null);
  });

  it('handles multiple workers in a single batch', async () => {
    const uuids = ['uuid-aaa', 'uuid-bbb', 'uuid-ccc'];
    let callIndex = 0;

    const session = createCrawlSession({
      settings: {
        crawlVideoRecordingEnabled: true,
        crawlVideoRecordingSize: '640x480',
        runId,
      },
      plugins: [],
      _crawlerFactory: (config) => ({
        async run(requests) {
          for (const request of requests) {
            const uuid = uuids[callIndex++] || `uuid-${callIndex}`;
            const videoFile = path.join(videoDir, `${uuid}.webm`);
            fs.mkdirSync(videoDir, { recursive: true });
            fs.writeFileSync(videoFile, `video-${uuid}`);

            const page = {
              async content() { return '<html></html>'; },
              async title() { return 'Test'; },
              url() { return request.url; },
              viewportSize() { return { width: 640, height: 480 }; },
              async screenshot() { return Buffer.from('fake'); },
              async addInitScript() {},
              async evaluate() { return 0; },
              async waitForTimeout() {},
              async $(sel) { return null; },
              video() {
                return {
                  path() { return Promise.resolve(videoFile); },
                  saveAs: async () => {},
                };
              },
            };
            await config.requestHandler({
              page,
              request: { url: request.url, uniqueKey: request.uniqueKey },
              response: { status: () => 200, headers: () => ({}) },
            });
          }
        },
        async teardown() {},
      }),
    });

    const settled = await session.processBatch([
      'http://a.com',
      'http://b.com',
      'http://c.com',
    ]);

    // Verify all 3 workers have manifest entries
    const manifestPath = path.join(videoDir, 'manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json should exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    for (const entry of settled) {
      assert.equal(entry.status, 'fulfilled');
      const wid = entry.value.workerId;
      assert.ok(manifest[wid], `manifest should have entry for ${wid}`);

      const resolved = resolveVideoFilePath(runId, wid);
      assert.ok(resolved, `resolveVideoFilePath should find ${wid}`);
      assert.ok(fs.existsSync(resolved), `video file should exist for ${wid}`);
    }

    assert.equal(Object.keys(manifest).length, 3, 'manifest should have 3 entries');
  });

  it('multiple processUrl calls accumulate in manifest (not overwrite)', async () => {
    let callIndex = 0;
    const uuids = ['first-uuid', 'second-uuid'];

    const session = createCrawlSession({
      settings: { crawlVideoRecordingEnabled: true, runId, crawlVideoRecordingSize: '640x480' },
      plugins: [],
      _crawlerFactory: (config) => ({
        async run(requests) {
          for (const request of requests) {
            const uuid = uuids[callIndex++];
            const videoFile = path.join(videoDir, `${uuid}.webm`);
            fs.mkdirSync(videoDir, { recursive: true });
            fs.writeFileSync(videoFile, `video-${uuid}`);
            const page = {
              async content() { return '<html></html>'; },
              async title() { return 'Test'; },
              url() { return request.url; },
              viewportSize() { return { width: 640, height: 480 }; },
              async screenshot() { return Buffer.from('fake'); },
              async addInitScript() {},
              async evaluate() { return 0; },
              async waitForTimeout() {},
              async $(sel) { return null; },
              video() {
                return { path() { return Promise.resolve(videoFile); }, saveAs: async () => {} };
              },
            };
            await config.requestHandler({
              page,
              request: { url: request.url, uniqueKey: request.uniqueKey },
              response: { status: () => 200, headers: () => ({}) },
            });
          }
        },
        async teardown() {},
      }),
    });

    // Two separate processUrl calls (simulates two batches)
    await session.processUrl('http://first.com');
    await session.processUrl('http://second.com');

    const manifestPath = path.join(videoDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // Both workers must be in the manifest, not just the second
    assert.equal(Object.keys(manifest).length, 2, 'manifest should have both entries');
    assert.ok(manifest['fetch-1'], 'first worker should be in manifest');
    assert.ok(manifest['fetch-2'], 'second worker should be in manifest');

    // Both should resolve via the API helper
    assert.ok(resolveVideoFilePath(runId, 'fetch-1'), 'fetch-1 should resolve');
    assert.ok(resolveVideoFilePath(runId, 'fetch-2'), 'fetch-2 should resolve');
  });
});
