import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCrawlSession } from '../crawlSession.js';
import {
  createCrawlerFactoryDouble,
} from './factories/crawlTestDoubles.js';

describe('createCrawlSession video recording', () => {
  it('includes videoPath in result when crawlVideoRecordingEnabled is true and runId is present', async () => {
    const crawler = createCrawlerFactoryDouble();
    const session = createCrawlSession({
      settings: { crawlVideoRecordingEnabled: true, runId: 'run-vid-1', crawlVideoRecordingSize: '1280x720' },
      plugins: [],
      _crawlerFactory: crawler.factory,
    });

    const result = await session.processUrl('http://example.com');
    assert.equal(typeof result.videoPath, 'string', 'result should have videoPath field');
  });

  it('returns empty videoPath when crawlVideoRecordingEnabled is false', async () => {
    const crawler = createCrawlerFactoryDouble();
    const session = createCrawlSession({
      settings: { crawlVideoRecordingEnabled: false, runId: 'run-vid-2' },
      plugins: [],
      _crawlerFactory: crawler.factory,
    });

    const result = await session.processUrl('http://example.com');
    assert.equal(result.videoPath, '', 'videoPath should be empty when disabled');
  });

  it('returns empty videoPath when runId is missing', async () => {
    const crawler = createCrawlerFactoryDouble();
    const session = createCrawlSession({
      settings: { crawlVideoRecordingEnabled: true },
      plugins: [],
      _crawlerFactory: crawler.factory,
    });

    const result = await session.processUrl('http://example.com');
    assert.equal(result.videoPath, '', 'videoPath should be empty without runId');
  });

  it('handles page.video() returning null gracefully', async () => {
    const crawler = createCrawlerFactoryDouble();
    // Override the page double to return null for video()
    const session = createCrawlSession({
      settings: { crawlVideoRecordingEnabled: true, runId: 'run-vid-3' },
      plugins: [],
      _crawlerFactory: (config) => {
        const inner = crawler.factory(config);
        return {
          ...inner,
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
                // WHY: Simulates a page where video recording was not configured
                video() { return null; },
              };
              await config.requestHandler({
                page,
                request: { url: request.url, uniqueKey: request.uniqueKey },
                response: { status: () => 200, headers: () => ({}) },
              });
            }
          },
          async teardown() {},
        };
      },
    });

    const result = await session.processUrl('http://example.com');
    assert.equal(result.videoPath, '', 'videoPath should be empty when page.video() returns null');
  });

  it('includes videoPath in processBatch results', async () => {
    const crawler = createCrawlerFactoryDouble();
    const session = createCrawlSession({
      settings: { crawlVideoRecordingEnabled: true, runId: 'run-vid-4' },
      plugins: [],
      _crawlerFactory: crawler.factory,
    });

    const settled = await session.processBatch(['http://a.com', 'http://b.com']);
    for (const entry of settled) {
      assert.equal(entry.status, 'fulfilled');
      assert.equal(typeof entry.value.videoPath, 'string', 'batch result should have videoPath');
    }
  });
});
