import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createCrawlSession } from '../crawlSession.js';
import { resolveVideoFilePath } from '../../indexing/api/runtimeOpsVideoHelpers.js';

// WHY: Integration test verifying the postPageCloseHook saves videos
// as {workerId}.webm directly — no manifest, no UUID guessing.

describe('video recording end-to-end integration', () => {
  const runId = `test-video-e2e-${Date.now()}`;
  const videoDir = path.join(os.tmpdir(), 'spec-factory-crawl-videos', runId);

  afterEach(() => {
    fs.rmSync(videoDir, { recursive: true, force: true });
  });

  it('resolveVideoFilePath returns null when no video dir exists', () => {
    assert.equal(resolveVideoFilePath('nonexistent-run-xyz', 'fetch-1'), null);
  });

  it('resolveVideoFilePath finds direct {workerId}.webm files', () => {
    fs.mkdirSync(videoDir, { recursive: true });
    fs.writeFileSync(path.join(videoDir, 'fetch-1.webm'), 'fake-video');

    const resolved = resolveVideoFilePath(runId, 'fetch-1');
    assert.ok(resolved, 'should resolve');
    assert.ok(resolved.endsWith('fetch-1.webm'));
    assert.ok(fs.existsSync(resolved));
  });

  it('resolveVideoFilePath falls back to manifest.json for legacy runs', () => {
    fs.mkdirSync(videoDir, { recursive: true });
    fs.writeFileSync(path.join(videoDir, 'abc123.webm'), 'legacy-video');
    fs.writeFileSync(
      path.join(videoDir, 'manifest.json'),
      JSON.stringify({ 'fetch-1': 'abc123.webm' }),
    );

    const resolved = resolveVideoFilePath(runId, 'fetch-1');
    assert.ok(resolved);
    assert.ok(resolved.endsWith('abc123.webm'));
  });

  it('videoPath field is included in crawl results', async () => {
    const session = createCrawlSession({
      settings: { crawlVideoRecordingEnabled: true, runId },
      plugins: [],
      _crawlerFactory: (config) => ({
        async run(requests) {
          for (const request of requests) {
            const page = {
              async content() { return '<html><body><h1>Test</h1></body></html>'; },
              async title() { return 'Test'; },
              url() { return request.url; },
              viewportSize() { return { width: 1280, height: 720 }; },
              async screenshot() { return Buffer.from('fake'); },
              async addInitScript() {},
              async evaluate() { return 0; },
              async waitForTimeout() {},
              async $(sel) { return null; },
              video() { return { path() { return Promise.resolve(''); } }; },
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

    const result = await session.processUrl('http://example.com');
    assert.equal(typeof result.videoPath, 'string');
  });
});
